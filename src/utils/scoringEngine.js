const SCORE_WEIGHTS = {
  formAccuracy: 0.25,
  rangeAchievement: 0.25,
  temporalControl: 0.15,
  forceDexterity: 0.2,
  compensationSymptom: 0.15,
}

const TARGET_RANGE_RATIOS = {
  'ring-thumb': 0.75,
  'ring-palm': 0.55,
  'closed-fist': 0.6,
}

const TARGET_HOLD_MS = 600
const TARGET_TIME_TO_TARGET_MS = 1500
const JITTER_REFERENCE = 0.25

export function calculateSessionScores({
  exerciseId,
  calibrationData,
  sessionMetrics,
  targetReps,
  targetSets,
  completedReps,
  completedSets,
  painBefore,
  painAfter,
}) {
  const metrics = normalizeMetrics(sessionMetrics)
  const targetRepsTotal = Math.max(1, targetReps * targetSets)
  const attemptedReps = Math.max(metrics.attemptedReps, completedReps, 1)
  const validReps = Math.max(metrics.validReps, completedReps)
  const flags = ['Force is not directly measured in webcam-only mode.']
  const rangeScoresByRep = getRangeScoresByRep(exerciseId, calibrationData, metrics)

  const validRepRate = clamp01(validReps / attemptedReps)
  const trackingGoodRate = clamp01(metrics.goodTrackingFrames / Math.max(1, metrics.totalFrames))
  const sequenceAccuracy = clamp01(
    metrics.correctStateTransitions / Math.max(1, metrics.totalStateTransitions),
  )
  const wrongOrientationRate = metrics.wrongOrientationFrames / Math.max(1, metrics.totalFrames)
  const outsideBoxRate = metrics.outsideGuideBoxFrames / Math.max(1, metrics.totalFrames)
  const wrongHandRepeated = metrics.wrongHandFrames >= 5
  let formAccuracy =
    100 * (0.45 * validRepRate + 0.35 * sequenceAccuracy + 0.2 * trackingGoodRate)

  if (wrongOrientationRate > 0.15) {
    formAccuracy -= 10
    flags.push('Wrong orientation occurred often.')
  }

  if (outsideBoxRate > 0.15) {
    formAccuracy -= 10
    flags.push('Hand moved outside the guide box often.')
  }

  if (wrongHandRepeated) {
    formAccuracy -= 10
    flags.push('Wrong selected hand was detected repeatedly.')
  }

  formAccuracy = clampScore(formAccuracy)

  const rangeAchievement = rangeScoresByRep.length
    ? clampScore(average(rangeScoresByRep))
    : clampScore(100 * (completedReps / targetRepsTotal))

  const holdAccuracy = averageOrFallback(
    metrics.holdDurationsMs.map((holdDuration) =>
      clamp01(holdDuration / (metrics.targetHoldMs || TARGET_HOLD_MS)),
    ),
    completedReps > 0 ? 1 : 0,
  )
  const completionRate = clamp01(completedReps / targetRepsTotal)
  const repConsistency = clamp01(1 - coefficientOfVariation(metrics.repDurationsMs))
  const fatigueScore = getFatigueScore(rangeScoresByRep)
  const temporalControl = clampScore(
    100 *
      (0.3 * holdAccuracy + 0.3 * completionRate + 0.25 * repConsistency + 0.15 * fatigueScore),
  )

  const contactSuccessRate = clamp01(metrics.targetContactSuccesses / attemptedReps)
  const timeToTargetScore = getTimeToTargetScore(metrics.timeToTargetMs)
  const releaseQuality = clamp01(
    metrics.releaseSuccesses / Math.max(1, metrics.targetContactSuccesses),
  )
  const smoothnessScore = getSmoothnessScore(metrics.jitterScoresByRep)
  const dexterityFallback = clamp01(completedReps / targetRepsTotal)
  const forceDexterity = clampScore(
    100 *
      (0.35 * (Number.isFinite(contactSuccessRate) ? contactSuccessRate : dexterityFallback) +
        0.25 * timeToTargetScore +
        0.2 * releaseQuality +
        0.2 * smoothnessScore),
  )

  const badTrackingRate = metrics.badTrackingFrames / Math.max(1, metrics.totalFrames)
  const unstableRate = metrics.unstableFrames / Math.max(1, metrics.totalFrames)
  const movementSafetyScore = clampScore(
    100 * (1 - (0.4 * wrongOrientationRate + 0.3 * outsideBoxRate + 0.3 * badTrackingRate)),
  )
  let painPenalty = 0

  if (painBefore === null || painAfter === null) {
    flags.push('Symptom score uses movement-only estimate because pain was not entered.')
  } else {
    const painRise = painAfter - painBefore

    if (painAfter > 3) {
      painPenalty += 10
    }

    if (painRise > 1) {
      painPenalty += 15
      flags.push('Pain increased during the session.')
    }

    if (painAfter >= 7) {
      flags.push('High pain reported — stop and consult a clinician.')
    }
  }

  if (badTrackingRate > 0.2 || unstableRate > 0.15) {
    flags.push('Tracking quality was low for part of the session.')
  }

  const compensationSymptom = clampScore(movementSafetyScore - painPenalty)
  const finalScore = clampScore(
    SCORE_WEIGHTS.formAccuracy * formAccuracy +
      SCORE_WEIGHTS.rangeAchievement * rangeAchievement +
      SCORE_WEIGHTS.temporalControl * temporalControl +
      SCORE_WEIGHTS.forceDexterity * forceDexterity +
      SCORE_WEIGHTS.compensationSymptom * compensationSymptom,
  )

  return {
    formAccuracy,
    rangeAchievement,
    temporalControl,
    forceDexterity,
    compensationSymptom,
    finalScore,
    interpretation: getInterpretation(finalScore),
    flags,
    parameterDetails: {
      formAccuracy: {
        label: 'Movement Form Accuracy',
        explanation: 'How consistently the movement followed the expected sequence.',
        suggestion:
          formAccuracy < 70
            ? 'Focus on completing the correct movement sequence.'
            : 'Keep using the same controlled movement pattern.',
      },
      rangeAchievement: {
        label: 'Range Achievement',
        explanation: 'How close each valid rep came to the target range for this exercise.',
        suggestion:
          rangeAchievement < 70
            ? 'Move closer to the target position without forcing pain.'
            : 'Keep reaching the target position with control.',
      },
      temporalControl: {
        label: 'Temporal Control and Endurance',
        explanation: 'How well reps matched the intended rhythm, hold, and completion goal.',
        suggestion:
          temporalControl < 70
            ? 'Try slower, steadier repetitions.'
            : 'Keep the same steady rhythm across the set.',
      },
      forceDexterity: {
        label: 'Dexterity Output Proxy',
        explanation: 'A webcam-only proxy for clean target contact and controlled release.',
        suggestion:
          forceDexterity < 70
            ? 'Focus on clean target contact and controlled release.'
            : 'Keep the contact and release smooth.',
      },
      compensationSymptom: {
        label: 'Compensation and Symptom Control',
        explanation: 'How well the hand stayed in reliable tracking conditions and symptom limits.',
        suggestion:
          compensationSymptom < 70
            ? 'Keep the palm facing the camera and stay inside the guide box.'
            : 'Keep the hand centered and stop if symptoms increase.',
      },
    },
    debug: {
      completedSets,
      movementSafetyScore,
      rangeScoresByRep,
      trackingGoodRate,
      validRepRate,
      sequenceAccuracy,
    },
  }
}

function normalizeMetrics(metrics = {}) {
  return {
    totalFrames: metrics.totalFrames ?? 0,
    goodTrackingFrames: metrics.goodTrackingFrames ?? 0,
    badTrackingFrames: metrics.badTrackingFrames ?? 0,
    wrongOrientationFrames: metrics.wrongOrientationFrames ?? 0,
    wrongHandFrames: metrics.wrongHandFrames ?? 0,
    outsideGuideBoxFrames: metrics.outsideGuideBoxFrames ?? 0,
    unstableFrames: metrics.unstableFrames ?? 0,
    attemptedReps: metrics.attemptedReps ?? 0,
    validReps: metrics.validReps ?? 0,
    invalidReps: metrics.invalidReps ?? 0,
    correctStateTransitions: metrics.correctStateTransitions ?? 0,
    totalStateTransitions: metrics.totalStateTransitions ?? 0,
    repDurationsMs: metrics.repDurationsMs ?? [],
    holdDurationsMs: metrics.holdDurationsMs ?? [],
    timeToTargetMs: metrics.timeToTargetMs ?? [],
    releaseSuccesses: metrics.releaseSuccesses ?? 0,
    targetContactSuccesses: metrics.targetContactSuccesses ?? 0,
    minTargetDistances: metrics.minTargetDistances ?? [],
    rangeScoresByRep: metrics.rangeScoresByRep ?? [],
    jitterScoresByRep: metrics.jitterScoresByRep ?? [],
    targetHoldMs: metrics.targetHoldMs ?? TARGET_HOLD_MS,
  }
}

function getRangeScoresByRep(exerciseId, calibrationData = {}, metrics) {
  if (metrics.rangeScoresByRep.length) {
    return metrics.rangeScoresByRep.map(clampScore)
  }

  const baseline = getExerciseBaseline(exerciseId, calibrationData)
  const targetRatio = TARGET_RANGE_RATIOS[exerciseId] ?? 0.6

  if (!Number.isFinite(baseline) || baseline <= 0) {
    return []
  }

  return metrics.minTargetDistances
    .filter((distance) => Number.isFinite(distance))
    .map((minDistance) => {
      const rangeRatio = 1 - minDistance / baseline
      return clamp01(rangeRatio / targetRatio) * 100
    })
}

function getExerciseBaseline(exerciseId, calibrationData = {}) {
  if (exerciseId === 'ring-thumb') {
    return calibrationData.openThumbRingDistance
  }

  if (exerciseId === 'ring-palm') {
    return calibrationData.openRingPalmDistance ?? calibrationData.openRingToPalmDistance
  }

  if (exerciseId === 'closed-fist') {
    return (
      calibrationData.openAvgFingertipPalmDistance ??
      calibrationData.openAverageFingerToPalmDistance
    )
  }

  return null
}

function getTimeToTargetScore(timeToTargetMs) {
  if (!timeToTargetMs.length) {
    return 1
  }

  const averageTimeToTarget = average(timeToTargetMs)
  const normalizedError = Math.abs(averageTimeToTarget - TARGET_TIME_TO_TARGET_MS) /
    TARGET_TIME_TO_TARGET_MS

  return clamp01(1 - normalizedError)
}

function getSmoothnessScore(jitterScoresByRep) {
  if (!jitterScoresByRep.length) {
    return 1
  }

  return clamp01(1 - average(jitterScoresByRep) / JITTER_REFERENCE)
}

function getFatigueScore(rangeScoresByRep) {
  if (rangeScoresByRep.length < 2) {
    return 1
  }

  const midpoint = Math.ceil(rangeScoresByRep.length / 2)
  const firstHalfAvg = average(rangeScoresByRep.slice(0, midpoint)) / 100
  const secondHalfAvg = average(rangeScoresByRep.slice(midpoint)) / 100

  return clamp01(1 - Math.max(0, firstHalfAvg - secondHalfAvg))
}

function coefficientOfVariation(values) {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0)

  if (validValues.length < 2) {
    return 0
  }

  const mean = average(validValues)
  const variance =
    validValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / validValues.length

  return Math.sqrt(variance) / mean
}

function averageOrFallback(values, fallback) {
  const validValues = values.filter(Number.isFinite)
  return validValues.length ? average(validValues) : fallback
}

function average(values) {
  const validValues = values.filter(Number.isFinite)

  if (!validValues.length) {
    return 0
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length
}

function clampScore(value) {
  return Math.round(clamp(value, 0, 100))
}

function clamp01(value) {
  return clamp(value, 0, 1)
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function getInterpretation(score) {
  if (score < 50) {
    return 'Needs attention'
  }

  if (score < 70) {
    return 'Developing'
  }

  if (score < 85) {
    return 'Good'
  }

  return 'Strong'
}

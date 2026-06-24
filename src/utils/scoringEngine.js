import { calculateSessionPerformanceIndex } from './sessionMetric.js'

const SCORE_WEIGHTS = {
  targetPose: 0.2,
  rangeOfMotion: 0.3,
  fingerIsolation: 0.15,
  movementSmoothness: 0.2,
  repConsistency: 0.15,
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
  let targetPose =
    100 * (0.45 * validRepRate + 0.35 * sequenceAccuracy + 0.2 * trackingGoodRate)

  if (wrongOrientationRate > 0.15) {
    targetPose -= 10
    flags.push('Wrong orientation occurred often.')
  }

  if (outsideBoxRate > 0.15) {
    targetPose -= 10
    flags.push('Hand moved outside the guide box often.')
  }

  if (metrics.wrongHandFrames >= 5) {
    targetPose -= 10
    flags.push('Wrong selected hand was detected repeatedly.')
  }

  targetPose = clampScore(targetPose)

  const rangeOfMotion = rangeScoresByRep.length
    ? clampScore(average(rangeScoresByRep))
    : clampScore(100 * (completedReps / targetRepsTotal))
  const holdAccuracy = averageOrFallback(
    metrics.holdDurationsMs.map((holdDuration) =>
      clamp01(holdDuration / (metrics.targetHoldMs || TARGET_HOLD_MS)),
    ),
    completedReps > 0 ? 1 : 0,
  )
  const completionRate = clamp01(completedReps / targetRepsTotal)
  const repConsistencyComponent = clamp01(1 - coefficientOfVariation(metrics.repDurationsMs))
  const fatigueScore = getFatigueScore(rangeScoresByRep)
  const temporalControl = clampScore(
    100 *
      (0.3 * holdAccuracy +
        0.3 * completionRate +
        0.25 * repConsistencyComponent +
        0.15 * fatigueScore),
  )

  const contactSuccessRate = clamp01(metrics.targetContactSuccesses / attemptedReps)
  const timeToTargetScore = getTimeToTargetScore(metrics.timeToTargetMs)
  const releaseQuality = clamp01(
    metrics.releaseSuccesses / Math.max(1, metrics.targetContactSuccesses),
  )
  const smoothnessComponent = getSmoothnessScore(metrics.jitterScoresByRep)
  const dexterityFallback = clamp01(completedReps / targetRepsTotal)
  const fingerIsolation = clampScore(
    100 *
      (0.35 * (Number.isFinite(contactSuccessRate) ? contactSuccessRate : dexterityFallback) +
        0.25 * timeToTargetScore +
        0.2 * releaseQuality +
        0.2 * smoothnessComponent),
  )
  const movementSmoothness = clampScore(100 * smoothnessComponent)
  const repConsistency = clampScore(100 * repConsistencyComponent)

  const badTrackingRate = metrics.badTrackingFrames / Math.max(1, metrics.totalFrames)
  const unstableRate = metrics.unstableFrames / Math.max(1, metrics.totalFrames)
  const trackingQuality = clampScore(
    100 * (1 - (0.4 * wrongOrientationRate + 0.3 * outsideBoxRate + 0.3 * badTrackingRate)),
  )

  if (badTrackingRate > 0.2 || unstableRate > 0.15) {
    flags.push('Tracking quality was low for part of the session.')
  }

  const sectionScores = {
    targetPose,
    rangeOfMotion,
    fingerIsolation,
    movementSmoothness,
    repConsistency,
  }
  const finalScore = clampScore(
    Object.entries(SCORE_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + weight * sectionScores[key],
      0,
    ),
  )
  const ospi = calculateSessionPerformanceIndex({
    successfulReps: validReps,
    targetReps: targetRepsTotal,
    sessionMetrics: {
      ...metrics,
      rangeScore: rangeOfMotion,
      timingScore: temporalControl,
      consistencyScore: repConsistency,
    },
    sectionScores,
    calibrationBaseline: getExerciseBaseline(exerciseId, calibrationData),
  })

  return {
    ...sectionScores,
    formAccuracy: targetPose,
    rangeAchievement: rangeOfMotion,
    temporalControl,
    forceDexterity: fingerIsolation,
    trackingQuality,
    sectionScores,
    finalScore,
    totalScore: finalScore,
    ospi,
    interpretation: getInterpretation(finalScore),
    flags,
    parameterDetails: {
      targetPose: {
        label: 'Target Pose',
        explanation: 'How consistently the movement followed the expected pose sequence.',
        suggestion:
          targetPose < 70
            ? 'Focus on completing the expected movement sequence.'
            : 'Keep using the same controlled movement pattern.',
      },
      rangeOfMotion: {
        label: 'Range of Motion',
        explanation: 'How close each valid rep came to the target movement range.',
        suggestion:
          rangeOfMotion < 70
            ? 'Move closer to the target position while staying comfortable.'
            : 'Keep reaching the target position with control.',
      },
      fingerIsolation: {
        label: 'Finger Isolation',
        explanation: 'A webcam-based estimate of clean target contact and controlled release.',
        suggestion:
          fingerIsolation < 70
            ? 'Focus on clean target contact and controlled release.'
            : 'Keep the contact and release smooth.',
      },
      movementSmoothness: {
        label: 'Movement Smoothness',
        explanation: 'How steady the tracked hand movement was during completed repetitions.',
        suggestion:
          movementSmoothness < 70
            ? 'Try slower, steadier repetitions.'
            : 'Keep the same smooth movement pattern.',
      },
      repConsistency: {
        label: 'Rep Consistency',
        explanation: 'How consistent the timing was from one completed repetition to the next.',
        suggestion:
          repConsistency < 70
            ? 'Aim for a more even rhythm between repetitions.'
            : 'Keep the same steady rhythm across the set.',
      },
    },
    debug: {
      completedSets,
      trackingQuality,
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
    validReps: metrics.validReps ?? metrics.successfulReps ?? 0,
    invalidReps: metrics.invalidReps ?? metrics.failedReps ?? 0,
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
    medianHoldMs: metrics.medianHoldMs,
    medianRepCycleMs: metrics.medianRepCycleMs,
    repCycleCv: metrics.repCycleCv,
    trackingQualityMean: metrics.trackingQualityMean,
    trackingWarningRate: metrics.trackingWarningRate,
    fingertipPalmP10: metrics.fingertipPalmP10,
    fingertipPalmP50: metrics.fingertipPalmP50,
    fingertipPalmP90: metrics.fingertipPalmP90,
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
    .filter(Number.isFinite)
    .map((minDistance) => clamp01((1 - minDistance / baseline) / targetRatio) * 100)
}

function getExerciseBaseline(exerciseId, calibrationData = {}) {
  if (exerciseId === 'ring-thumb') {
    return calibrationData?.openThumbRingDistance
  }

  if (exerciseId === 'ring-palm') {
    return calibrationData?.openRingPalmDistance ?? calibrationData?.openRingToPalmDistance
  }

  if (exerciseId === 'closed-fist') {
    return (
      calibrationData?.openAvgFingertipPalmDistance ??
      calibrationData?.openAverageFingerToPalmDistance
    )
  }

  return null
}

function getTimeToTargetScore(timeToTargetMs) {
  if (!timeToTargetMs.length) {
    return 1
  }

  const normalizedError =
    Math.abs(average(timeToTargetMs) - TARGET_TIME_TO_TARGET_MS) / TARGET_TIME_TO_TARGET_MS
  return clamp01(1 - normalizedError)
}

function getSmoothnessScore(jitterScoresByRep) {
  return jitterScoresByRep.length
    ? clamp01(1 - average(jitterScoresByRep) / JITTER_REFERENCE)
    : 1
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
  return validValues.length
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : 0
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
  if (score < 50) return 'Needs attention'
  if (score < 70) return 'Developing'
  if (score < 85) return 'Good'
  return 'Strong'
}

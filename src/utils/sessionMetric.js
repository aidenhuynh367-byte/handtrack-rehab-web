export const OSPI_VERSION = 'ospi-v1'

const QUALITY_WEIGHTS = {
  targetPose: 0.2,
  rangeOfMotion: 0.3,
  fingerIsolation: 0.15,
  movementSmoothness: 0.2,
  repConsistency: 0.15,
}

export function calculateSessionPerformanceIndex({
  successfulReps = 0,
  targetReps = 0,
  sessionMetrics = {},
  sectionScores = {},
  calibrationBaseline,
} = {}) {
  const fallbackComponents = []
  const completion = clamp(successfulReps / Math.max(1, targetReps), 0, 1)

  const fingertipPalmP90 = finiteValue(sessionMetrics.fingertipPalmP90)
  const fingertipPalmP10 = finiteValue(sessionMetrics.fingertipPalmP10)
  const baseline = finiteValue(
    sessionMetrics.calibrationBaseline ?? calibrationBaseline,
  )
  let amplitude

  if (fingertipPalmP90 !== null && fingertipPalmP10 !== null && baseline !== null) {
    amplitude = clamp(
      (fingertipPalmP90 - fingertipPalmP10) / Math.max(0.3 * baseline, 0.2),
      0,
      1,
    )
  } else {
    amplitude = scoreToComponent(
      firstFinite(
        sessionMetrics.rangeScore,
        sectionScores.rangeOfMotion,
        sectionScores.rangeAchievement,
      ),
      completion,
    )
    fallbackComponents.push('amplitude')
  }

  const medianHoldMs = firstFinite(
    sessionMetrics.medianHoldMs,
    median(sessionMetrics.holdDurationsMs),
  )
  let holdControl

  if (medianHoldMs !== null) {
    holdControl = clamp(1 - Math.abs(medianHoldMs - 600) / 300, 0, 1)
  } else {
    holdControl = scoreToComponent(
      firstFinite(sessionMetrics.timingScore, sectionScores.temporalControl),
      completion,
    )
    fallbackComponents.push('holdControl')
  }

  const repCycleCv = firstFinite(
    sessionMetrics.repCycleCv,
    coefficientOfVariation(sessionMetrics.repDurationsMs),
  )
  let consistency

  if (successfulReps < 3) {
    consistency = 0.5
    fallbackComponents.push('consistency')
  } else if (repCycleCv !== null) {
    consistency = clamp(1 - repCycleCv / 0.35, 0, 1)
  } else {
    consistency = scoreToComponent(
      firstFinite(sessionMetrics.consistencyScore, sectionScores.repConsistency),
      completion,
    )
    fallbackComponents.push('consistency')
  }

  const qualityEntries = Object.entries(QUALITY_WEIGHTS).map(([key, weight]) => {
    const aliases = {
      targetPose: ['formAccuracy'],
      rangeOfMotion: ['rangeAchievement'],
      fingerIsolation: ['forceDexterity'],
      movementSmoothness: ['smoothnessScore'],
      repConsistency: ['consistencyScore', 'temporalControl'],
    }
    const value = firstFinite(
      sectionScores[key],
      ...aliases[key].map((alias) => sectionScores[alias]),
    )

    return { weight, value }
  })
  const availableQualityWeight = qualityEntries.reduce(
    (sum, item) => sum + (item.value === null ? 0 : item.weight),
    0,
  )
  const quality =
    availableQualityWeight > 0
      ? clamp(
          qualityEntries.reduce(
            (sum, item) =>
              sum + (item.value === null ? 0 : item.weight * scoreToComponent(item.value, 0)),
            0,
          ) / availableQualityWeight,
          0,
          1,
        )
      : completion

  if (availableQualityWeight < 1) {
    fallbackComponents.push('quality')
  }

  const trackingQualityMean = firstFinite(
    sessionMetrics.trackingQualityMean,
    trackingRate(sessionMetrics),
  )
  let trackingAdjustment = 1

  if (trackingQualityMean === null) {
    fallbackComponents.push('trackingAdjustment')
  } else {
    // tracking quality lowers confidence instead of pretending the score is perfect
    const normalizedTracking =
      trackingQualityMean > 1 ? trackingQualityMean / 100 : trackingQualityMean
    trackingAdjustment = clamp(normalizedTracking, 0.6, 1)
  }

  // keeps the score automatic for the user
  const score = Math.round(
    100 *
      trackingAdjustment *
      (0.3 * completion +
        0.2 * amplitude +
        0.15 * holdControl +
        0.1 * consistency +
        0.25 * quality),
  )
  const confidence =
    successfulReps < 3 ||
    fallbackComponents.includes('trackingAdjustment') ||
    fallbackComponents.length >= 2
      ? 'reduced'
      : 'full'

  return {
    score: clamp(score, 0, 100),
    components: {
      completion: roundComponent(completion),
      amplitude: roundComponent(amplitude),
      holdControl: roundComponent(holdControl),
      consistency: roundComponent(consistency),
      quality: roundComponent(quality),
      trackingAdjustment: roundComponent(trackingAdjustment),
    },
    confidence,
    version: OSPI_VERSION,
  }
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function scoreToComponent(value, fallback) {
  if (!Number.isFinite(value)) {
    return clamp(fallback, 0, 1)
  }

  return clamp(value > 1 ? value / 100 : value, 0, 1)
}

function trackingRate(metrics) {
  if (!Number.isFinite(metrics.totalFrames) || metrics.totalFrames <= 0) {
    return null
  }

  return clamp((metrics.goodTrackingFrames ?? 0) / metrics.totalFrames, 0, 1)
}

function coefficientOfVariation(values) {
  const validValues = Array.isArray(values)
    ? values.filter((value) => Number.isFinite(value) && value > 0)
    : []

  if (validValues.length < 2) {
    return null
  }

  const mean = validValues.reduce((sum, value) => sum + value, 0) / validValues.length
  const variance =
    validValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    validValues.length

  return Math.sqrt(variance) / mean
}

function median(values) {
  const validValues = Array.isArray(values)
    ? values.filter(Number.isFinite).sort((a, b) => a - b)
    : []

  if (!validValues.length) {
    return null
  }

  const midpoint = Math.floor(validValues.length / 2)
  return validValues.length % 2
    ? validValues[midpoint]
    : (validValues[midpoint - 1] + validValues[midpoint]) / 2
}

function finiteValue(value) {
  return Number.isFinite(value) ? value : null
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null
}

function roundComponent(value) {
  return Math.round(value * 1000) / 1000
}

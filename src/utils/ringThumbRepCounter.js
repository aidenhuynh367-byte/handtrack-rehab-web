import { LANDMARKS, distance, getPalmScale } from './handGeometry.js'
import { createCycleRepCounter } from './repCounterCore.js'
import { TARGET_FRAME_REQUIREMENT } from './trackingQuality.js'

export const TOUCH_THRESHOLD = 0.35
export const RELEASE_THRESHOLD = 0.55
export const HOLD_TIME_MS = 600
export const TARGET_RANGE_RATIO = 0.75

export function createRingThumbRepCounter(targetReps, targetSets, calibration) {
  const touchThreshold = calibration?.openThumbRingDistance
    ? Math.min(TOUCH_THRESHOLD, calibration.openThumbRingDistance * 0.35)
    : TOUCH_THRESHOLD
  const releaseThreshold = calibration?.openThumbRingDistance
    ? Math.max(RELEASE_THRESHOLD, calibration.openThumbRingDistance * 0.65)
    : RELEASE_THRESHOLD

  return createCycleRepCounter({
    targetReps,
    targetSets,
    initialPhase: 'Separated',
    activePhase: 'Touch',
    holdPhase: 'Hold',
    completePhase: 'Set complete',
    activeInstruction: 'Touch ring finger to thumb',
    holdInstruction: 'Hold the touch',
    releaseInstruction: 'Release back to open',
    holdTimeMs: HOLD_TIME_MS,
    targetFrameRequirement: TARGET_FRAME_REQUIREMENT,
    getMeasurement: getNormalizedRingThumbDistance,
    isActive: (measurement) => measurement <= touchThreshold,
    isReleased: (measurement) => measurement >= releaseThreshold,
    getRangeScore: (minDistance) =>
      getRangeScore(minDistance, calibration?.openThumbRingDistance, TARGET_RANGE_RATIO),
  })
}

function getNormalizedRingThumbDistance(landmarks) {
  const touchDistance = distance(landmarks[LANDMARKS.thumbTip], landmarks[LANDMARKS.ringTip])
  const scale = getPalmScale(landmarks)

  return touchDistance / scale
}

function getRangeScore(minDistance, baseline, targetRangeRatio) {
  if (!Number.isFinite(minDistance) || !Number.isFinite(baseline) || baseline <= 0) {
    return 0
  }

  const rangeRatio = 1 - minDistance / baseline
  return Math.round(Math.min(1, Math.max(0, rangeRatio / targetRangeRatio)) * 100)
}

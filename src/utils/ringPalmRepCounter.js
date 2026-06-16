import { LANDMARKS, distance, getPalmCenter, getPalmScale } from './handGeometry.js'
import { createCycleRepCounter } from './repCounterCore.js'
import { TARGET_FRAME_REQUIREMENT } from './trackingQuality.js'

export const PALM_TOUCH_THRESHOLD = 0.55
export const PALM_RELEASE_THRESHOLD = 0.8
export const HOLD_TIME_MS = 600
export const TARGET_RANGE_RATIO = 0.55

export function createRingPalmRepCounter(targetReps, targetSets, calibration) {
  const palmTouchThreshold = calibration?.openRingToPalmDistance
    ? Math.min(PALM_TOUCH_THRESHOLD, calibration.openRingToPalmDistance * 0.55)
    : PALM_TOUCH_THRESHOLD
  const palmReleaseThreshold = calibration?.openRingToPalmDistance
    ? Math.max(PALM_RELEASE_THRESHOLD, calibration.openRingToPalmDistance * 0.72)
    : PALM_RELEASE_THRESHOLD

  return createCycleRepCounter({
    targetReps,
    targetSets,
    initialPhase: 'Extended',
    activePhase: 'Palm touch',
    holdPhase: 'Hold',
    completePhase: 'Set complete',
    activeInstruction: 'Bend ring finger toward palm',
    holdInstruction: 'Hold ring finger near palm',
    releaseInstruction: 'Straighten ring finger again',
    holdTimeMs: HOLD_TIME_MS,
    targetFrameRequirement: TARGET_FRAME_REQUIREMENT,
    getMeasurement: getRingToPalmDistance,
    isActive: (measurement) => measurement <= palmTouchThreshold,
    isReleased: (measurement) => measurement >= palmReleaseThreshold,
    getRangeScore: (minDistance) =>
      getRangeScore(
        minDistance,
        calibration?.openRingPalmDistance ?? calibration?.openRingToPalmDistance,
        TARGET_RANGE_RATIO,
      ),
  })
}

function getRingToPalmDistance(landmarks) {
  const palmCenter = getPalmCenter(landmarks)
  const palmScale = getPalmScale(landmarks)

  return distance(landmarks[LANDMARKS.ringTip], palmCenter) / palmScale
}

function getRangeScore(minDistance, baseline, targetRangeRatio) {
  if (!Number.isFinite(minDistance) || !Number.isFinite(baseline) || baseline <= 0) {
    return 0
  }

  const rangeRatio = 1 - minDistance / baseline
  return Math.round(Math.min(1, Math.max(0, rangeRatio / targetRangeRatio)) * 100)
}

import { LANDMARKS, distance, getPalmCenter, getPalmScale } from './handGeometry.js'
import { createCycleRepCounter } from './repCounterCore.js'
import { TARGET_FRAME_REQUIREMENT } from './trackingQuality.js'

export const FIST_CLOSED_THRESHOLD = 0.75
export const FIST_OPEN_THRESHOLD = 1.05
export const HOLD_TIME_MS = 600
export const TARGET_RANGE_RATIO = 0.6

const FINGER_TIPS = [
  LANDMARKS.indexTip,
  LANDMARKS.middleTip,
  LANDMARKS.ringTip,
  LANDMARKS.pinkyTip,
]

export function createClosedFistRepCounter(targetReps, targetSets, calibration) {
  const fistClosedThreshold = calibration?.openAverageFingerToPalmDistance
    ? Math.min(FIST_CLOSED_THRESHOLD, calibration.openAverageFingerToPalmDistance * 0.55)
    : FIST_CLOSED_THRESHOLD
  const fistOpenThreshold = calibration?.openAverageFingerToPalmDistance
    ? Math.max(FIST_OPEN_THRESHOLD, calibration.openAverageFingerToPalmDistance * 0.78)
    : FIST_OPEN_THRESHOLD

  return createCycleRepCounter({
    targetReps,
    targetSets,
    initialPhase: 'Open hand',
    activePhase: 'Closed fist',
    holdPhase: 'Hold',
    completePhase: 'Set complete',
    activeInstruction: 'Bend fingers into a closed fist',
    holdInstruction: 'Hold the closed fist',
    releaseInstruction: 'Open hand again',
    holdTimeMs: HOLD_TIME_MS,
    targetFrameRequirement: TARGET_FRAME_REQUIREMENT,
    getMeasurement: getAverageFingerToPalmDistance,
    isActive: (measurement) => measurement <= fistClosedThreshold,
    isReleased: (measurement) => measurement >= fistOpenThreshold,
    getRangeScore: (minDistance) =>
      getRangeScore(
        minDistance,
        calibration?.openAvgFingertipPalmDistance ??
          calibration?.openAverageFingerToPalmDistance,
        TARGET_RANGE_RATIO,
      ),
  })
}

function getAverageFingerToPalmDistance(landmarks) {
  const palmCenter = getPalmCenter(landmarks)
  const palmScale = getPalmScale(landmarks)
  const totalDistance = FINGER_TIPS.reduce(
    (sum, landmarkIndex) => sum + distance(landmarks[landmarkIndex], palmCenter),
    0,
  )

  return totalDistance / FINGER_TIPS.length / palmScale
}

function getRangeScore(minDistance, baseline, targetRangeRatio) {
  if (!Number.isFinite(minDistance) || !Number.isFinite(baseline) || baseline <= 0) {
    return 0
  }

  const rangeRatio = 1 - minDistance / baseline
  return Math.round(Math.min(1, Math.max(0, rangeRatio / targetRangeRatio)) * 100)
}

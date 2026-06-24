import { LANDMARKS, distance, getPalmCenter, getPalmScale } from './handGeometry.js'
import { createCycleRepCounter } from './repCounterCore.js'
import { TARGET_FRAME_REQUIREMENT } from './trackingQuality.js'

export const FIST_CLOSED_THRESHOLD = 0.75
export const FIST_OPEN_THRESHOLD = 0.95
export const HOLD_TIME_MS = 600
export const TARGET_RANGE_RATIO = 0.6
export const OPEN_AVERAGE_RATIO = 0.68
export const OPEN_FINGER_RATIO = 0.65
export const OPEN_FINGER_REQUIREMENT = 3

const FINGER_TIPS = {
  index: LANDMARKS.indexTip,
  middle: LANDMARKS.middleTip,
  ring: LANDMARKS.ringTip,
  pinky: LANDMARKS.pinkyTip,
}

export function createClosedFistRepCounter(targetReps, targetSets, calibration) {
  const openAverageBaseline =
    calibration?.openAvgFingertipPalmDistance ??
    calibration?.openAverageFingerToPalmDistance
  const openFingerBaselines = calibration?.openFingerToPalmDistances
  // uses the user's own calibration instead of a fixed hand size
  const fistClosedThreshold = openAverageBaseline
    ? Math.min(FIST_CLOSED_THRESHOLD, openAverageBaseline * 0.55)
    : FIST_CLOSED_THRESHOLD
  const fistOpenThreshold = openAverageBaseline
    ? openAverageBaseline * OPEN_AVERAGE_RATIO
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
    isReleased: (measurement, landmarks) =>
      isOpenHand(landmarks, measurement, fistOpenThreshold, openFingerBaselines),
    // early release just asks the user to try the hold again
    countEarlyReleaseAsInvalid: false,
    earlyReleaseInstruction: 'Close fist and hold a little longer',
    // keeps this only for closed fist debugging
    getDebugState: (landmarks, measurement) => ({
      closedThreshold: fistClosedThreshold,
      openThreshold: fistOpenThreshold,
      isActive: measurement <= fistClosedThreshold,
      isReleased: isOpenHand(
        landmarks,
        measurement,
        fistOpenThreshold,
        openFingerBaselines,
      ),
      openFingerCount: countOpenFingers(landmarks, openFingerBaselines),
    }),
    getRangeScore: (minDistance) =>
      getRangeScore(
        minDistance,
        openAverageBaseline,
        TARGET_RANGE_RATIO,
      ),
  })
}

function getAverageFingerToPalmDistance(landmarks) {
  const palmCenter = getPalmCenter(landmarks)
  const palmScale = getPalmScale(landmarks)
  const distances = getFingerToPalmDistances(landmarks, palmCenter, palmScale)

  return average(Object.values(distances))
}

function isOpenHand(landmarks, measurement, openThreshold, openFingerBaselines) {
  // avoids one bent finger failing the rep
  return (
    measurement >= openThreshold ||
    countOpenFingers(landmarks, openFingerBaselines) >= OPEN_FINGER_REQUIREMENT
  )
}

function countOpenFingers(landmarks, openFingerBaselines) {
  if (!landmarks?.length || !hasValidFingerBaselines(openFingerBaselines)) {
    return 0
  }

  const palmCenter = getPalmCenter(landmarks)
  const palmScale = getPalmScale(landmarks)

  if (!palmCenter || !Number.isFinite(palmScale) || palmScale <= 0) {
    return 0
  }

  const distances = getFingerToPalmDistances(landmarks, palmCenter, palmScale)

  // checks if enough fingers opened compared with calibration
  return Object.keys(FINGER_TIPS).filter(
    (finger) => distances[finger] >= openFingerBaselines[finger] * OPEN_FINGER_RATIO,
  ).length
}

function getFingerToPalmDistances(landmarks, palmCenter, palmScale) {
  return Object.fromEntries(
    Object.entries(FINGER_TIPS).map(([finger, landmarkIndex]) => [
      finger,
      distance(landmarks[landmarkIndex], palmCenter) / palmScale,
    ]),
  )
}

function hasValidFingerBaselines(baselines) {
  return Object.keys(FINGER_TIPS).every(
    (finger) => Number.isFinite(baselines?.[finger]) && baselines[finger] > 0,
  )
}

function average(values) {
  const validValues = values.filter(Number.isFinite)
  return validValues.length
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : Number.NaN
}

function getRangeScore(minDistance, baseline, targetRangeRatio) {
  if (!Number.isFinite(minDistance) || !Number.isFinite(baseline) || baseline <= 0) {
    return 0
  }

  const rangeRatio = 1 - minDistance / baseline
  return Math.round(Math.min(1, Math.max(0, rangeRatio / targetRangeRatio)) * 100)
}

import { LANDMARKS, distance, getPalmCenter, getPalmScale } from './handGeometry.js'

export const STABLE_FRAME_REQUIREMENT = 5
export const TARGET_FRAME_REQUIREMENT = 5
export const LANDMARK_JITTER_THRESHOLD = 0.25
export const CALIBRATION_DURATION_MS = 5000
export const GUIDE_BOX = {
  minX: 0.16,
  maxX: 0.84,
  minY: 0.08,
  maxY: 0.92,
}

const SMOOTHING_PREVIOUS_WEIGHT = 0.7
const SMOOTHING_CURRENT_WEIGHT = 0.3
const FINGER_TIPS = [
  LANDMARKS.indexTip,
  LANDMARKS.middleTip,
  LANDMARKS.ringTip,
  LANDMARKS.pinkyTip,
]

export function smoothLandmarks(currentLandmarks, previousLandmarks) {
  if (!previousLandmarks || previousLandmarks.length !== currentLandmarks?.length) {
    return cloneLandmarks(currentLandmarks)
  }

  return currentLandmarks.map((current, index) => {
    const previous = previousLandmarks[index]

    return {
      x: previous.x * SMOOTHING_PREVIOUS_WEIGHT + current.x * SMOOTHING_CURRENT_WEIGHT,
      y: previous.y * SMOOTHING_PREVIOUS_WEIGHT + current.y * SMOOTHING_CURRENT_WEIGHT,
      z:
        (previous.z ?? 0) * SMOOTHING_PREVIOUS_WEIGHT +
        (current.z ?? 0) * SMOOTHING_CURRENT_WEIGHT,
    }
  })
}

export function estimateLandmarkStability(currentLandmarks, previousLandmarks) {
  if (!currentLandmarks || !previousLandmarks || currentLandmarks.length !== previousLandmarks.length) {
    return {
      stable: false,
      score: Number.POSITIVE_INFINITY,
    }
  }

  const palmScale = getPalmScale(currentLandmarks)

  if (!Number.isFinite(palmScale) || palmScale <= 0) {
    return {
      stable: false,
      score: Number.POSITIVE_INFINITY,
    }
  }

  const totalMovement = currentLandmarks.reduce(
    (sum, landmark, index) => sum + distance(landmark, previousLandmarks[index]),
    0,
  )
  const score = totalMovement / currentLandmarks.length / palmScale

  return {
    stable: score <= LANDMARK_JITTER_THRESHOLD,
    score,
  }
}

export function createStabilityTracker() {
  return {
    stableFrames: 0,
    lastScore: null,
  }
}

export function updateStabilityTracker(tracker, isStable, score) {
  tracker.stableFrames = isStable ? tracker.stableFrames + 1 : 0
  tracker.lastScore = score

  return tracker.stableFrames >= STABLE_FRAME_REQUIREMENT
}

export function resetStabilityTracker(tracker) {
  tracker.stableFrames = 0
  tracker.lastScore = null
}

export function isHandInsideGuideBox(landmarks) {
  if (!landmarks?.length) {
    return false
  }

  return landmarks.every(
    (landmark) =>
      landmark.x >= GUIDE_BOX.minX &&
      landmark.x <= GUIDE_BOX.maxX &&
      landmark.y >= GUIDE_BOX.minY &&
      landmark.y <= GUIDE_BOX.maxY,
  )
}

export function getOpenHandMetrics(landmarks) {
  const palmCenter = getPalmCenter(landmarks)
  const palmScale = getPalmScale(landmarks)

  if (!palmCenter || !Number.isFinite(palmScale) || palmScale <= 0) {
    return null
  }

  const thumbRingDistance =
    distance(landmarks[LANDMARKS.thumbTip], landmarks[LANDMARKS.ringTip]) / palmScale
  const ringToPalmDistance = distance(landmarks[LANDMARKS.ringTip], palmCenter) / palmScale
  const averageFingerToPalmDistance =
    FINGER_TIPS.reduce((sum, index) => sum + distance(landmarks[index], palmCenter), 0) /
    FINGER_TIPS.length /
    palmScale

  return {
    palmScale,
    palmCenter,
    openThumbRingDistance: thumbRingDistance,
    openRingToPalmDistance: ringToPalmDistance,
    openAverageFingerToPalmDistance: averageFingerToPalmDistance,
  }
}

export function createCalibrationAccumulator() {
  return {
    samples: [],
    stabilityScores: [],
  }
}

export function addCalibrationSample(accumulator, landmarks, stabilityScore, orientationLabel) {
  const metrics = getOpenHandMetrics(landmarks)

  if (!metrics) {
    return
  }

  accumulator.samples.push({
    ...metrics,
    orientationLabel,
  })
  accumulator.stabilityScores.push(stabilityScore)
}

export function summarizeCalibration(accumulator) {
  const { samples, stabilityScores } = accumulator

  if (samples.length === 0) {
    return null
  }

  return {
    palmScale: average(samples.map((sample) => sample.palmScale)),
    palmCenter: averagePointValues(samples.map((sample) => sample.palmCenter)),
    openThumbRingDistance: average(samples.map((sample) => sample.openThumbRingDistance)),
    openRingToPalmDistance: average(samples.map((sample) => sample.openRingToPalmDistance)),
    openAverageFingerToPalmDistance: average(
      samples.map((sample) => sample.openAverageFingerToPalmDistance),
    ),
    palmOrientationBaseline: samples[samples.length - 1]?.orientationLabel ?? 'Palm',
    landmarkJitterScore: average(stabilityScores),
    sampleCount: samples.length,
  }
}

function cloneLandmarks(landmarks) {
  return landmarks?.map((landmark) => ({
    x: landmark.x,
    y: landmark.y,
    z: landmark.z ?? 0,
  }))
}

function average(values) {
  const validValues = values.filter(Number.isFinite)

  if (validValues.length === 0) {
    return null
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length
}

function averagePointValues(points) {
  const validPoints = points.filter(Boolean)

  if (validPoints.length === 0) {
    return null
  }

  return validPoints.reduce(
    (center, point) => ({
      x: center.x + point.x / validPoints.length,
      y: center.y + point.y / validPoints.length,
      z: center.z + (point.z ?? 0) / validPoints.length,
    }),
    { x: 0, y: 0, z: 0 },
  )
}

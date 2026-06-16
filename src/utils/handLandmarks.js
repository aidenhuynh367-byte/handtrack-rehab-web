import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { getPalmScale } from './handGeometry.js'

export const PALM_ORIENTATION_THRESHOLD = 0.02
export const ORIENTATION_SMOOTHING_FRAMES = 5
export const INVERT_PALM_ORIENTATION = false
export const SIDEWAYS_WIDTH_RATIO_MIN = 0.32
export const MCP_X_SPREAD_MIN = 0.08
export const TIP_X_SPREAD_MIN = 0.11
export const SIDEWAYS_DEPTH_DIFF_MAX = 0.28

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MIN_HANDEDNESS_SCORE = 0.55
const MIN_HAND_SCALE = 0.04
const PALM_POINTS = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleMcp: 9,
  middleTip: 12,
  ringMcp: 13,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyTip: 20,
}
const FINGERTIP_POINTS = [
  PALM_POINTS.thumbTip,
  PALM_POINTS.indexTip,
  PALM_POINTS.middleTip,
  PALM_POINTS.ringTip,
  PALM_POINTS.pinkyTip,
]

export async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL)

  try {
    return await createLandmarkerWithDelegate(vision, 'GPU')
  } catch {
    return createLandmarkerWithDelegate(vision, 'CPU')
  }
}

export function createPalmOrientationTracker() {
  return {
    consecutiveValid: 0,
    consecutiveInvalid: 0,
    smoothedStatus: 'unknown',
  }
}

export function resetPalmOrientationTracker(tracker) {
  if (!tracker) {
    return
  }

  tracker.consecutiveValid = 0
  tracker.consecutiveInvalid = 0
  tracker.smoothedStatus = 'unknown'
}

export function getSelectedHandAnalysis(result, selectedHand, options = {}) {
  const { orientationTracker, requirePalmOrientation } = normalizeOptions(options)
  const landmarks = result?.landmarks ?? []

  if (landmarks.length === 0) {
    resetPalmOrientationTracker(orientationTracker)
    return {
      ok: false,
      status: 'No hand detected',
      instruction: `Show your ${selectedHand.toLowerCase()} hand in the camera`,
      orientationLabel: 'Unknown',
    }
  }

  const candidates = landmarks.map((handLandmarks, index) => {
    const handedness = result.handedness?.[index]?.[0]
    return {
      index,
      landmarks: handLandmarks,
      handednessLabel: handedness?.categoryName ?? 'Unknown',
      handednessScore: handedness?.score ?? 0,
    }
  })

  const selected = candidates.find((candidate) => candidate.handednessLabel === selectedHand)

  if (!selected) {
    resetPalmOrientationTracker(orientationTracker)
    return {
      ok: false,
      status: 'Wrong hand detected',
      instruction: `Use your ${selectedHand.toLowerCase()} hand`,
      detectedHand: candidates.map((candidate) => candidate.handednessLabel).join(', '),
      orientationLabel: 'Unknown',
    }
  }

  const worldLandmarks = result.worldLandmarks?.[selected.index]
  const orientationFeatures = getOrientationFeatures(selected.landmarks, worldLandmarks)
  const orientationStatus = getSmoothedHandOrientationStatus(
    orientationTracker,
    selected.landmarks,
    worldLandmarks,
    selected.handednessLabel,
  )

  if (requirePalmOrientation && orientationStatus !== 'palm') {
    return {
      ok: false,
      status: 'Wrong orientation',
      instruction: 'Warning: face your palm toward the camera',
      selectedIndex: selected.index,
      landmarks: selected.landmarks,
      worldLandmarks,
      orientationFeatures,
      orientationLabel: getOrientationLabel(orientationStatus),
    }
  }

  const handScale = getPalmScale(selected.landmarks)

  if (
    selected.handednessScore < MIN_HANDEDNESS_SCORE ||
    handScale < MIN_HAND_SCALE ||
    !Number.isFinite(handScale)
  ) {
    return {
      ok: false,
      status: 'Tracking unstable',
      instruction: 'Hold your hand steady in view',
      selectedIndex: selected.index,
      landmarks: selected.landmarks,
      worldLandmarks,
      orientationFeatures,
      orientationLabel: getOrientationLabel(orientationStatus),
    }
  }

  return {
    ok: true,
    status: 'Good',
    instruction: '',
    selectedIndex: selected.index,
    landmarks: selected.landmarks,
    worldLandmarks,
    orientationFeatures,
    handednessScore: selected.handednessScore,
    orientationLabel: getOrientationLabel(orientationStatus),
  }
}

function normalizeOptions(options) {
  if (!options || typeof options !== 'object' || 'consecutiveValid' in options) {
    return {
      orientationTracker: options,
      requirePalmOrientation: true,
    }
  }

  return {
    orientationTracker: options.orientationTracker,
    requirePalmOrientation: options.requirePalmOrientation ?? true,
  }
}

export function getOrientationFeatures(landmarks, worldLandmarks) {
  const featureLandmarks = worldLandmarks ?? landmarks
  const wrist = featureLandmarks?.[PALM_POINTS.wrist]
  const indexMcp = featureLandmarks?.[PALM_POINTS.indexMcp]
  const middleMcp = featureLandmarks?.[PALM_POINTS.middleMcp]
  const pinkyMcp = featureLandmarks?.[PALM_POINTS.pinkyMcp]
  const screenWrist = landmarks?.[PALM_POINTS.wrist]
  const screenIndexMcp = landmarks?.[PALM_POINTS.indexMcp]
  const screenMiddleMcp = landmarks?.[PALM_POINTS.middleMcp]
  const screenRingMcp = landmarks?.[PALM_POINTS.ringMcp]
  const screenPinkyMcp = landmarks?.[PALM_POINTS.pinkyMcp]
  const screenThumbTip = landmarks?.[PALM_POINTS.thumbTip]
  const screenIndexTip = landmarks?.[PALM_POINTS.indexTip]
  const screenMiddleTip = landmarks?.[PALM_POINTS.middleTip]
  const screenRingTip = landmarks?.[PALM_POINTS.ringTip]
  const screenPinkyTip = landmarks?.[PALM_POINTS.pinkyTip]

  if (
    !wrist ||
    !indexMcp ||
    !middleMcp ||
    !pinkyMcp ||
    !screenWrist ||
    !screenIndexMcp ||
    !screenMiddleMcp ||
    !screenRingMcp ||
    !screenPinkyMcp ||
    !screenThumbTip ||
    !screenIndexTip ||
    !screenMiddleTip ||
    !screenRingTip ||
    !screenPinkyTip
  ) {
    return null
  }

  const indexVector = subtractPoints(indexMcp, wrist)
  const pinkyVector = subtractPoints(pinkyMcp, wrist)
  const normal = crossProduct(indexVector, pinkyVector)
  const normalScale = vectorLength(indexVector) * vectorLength(pinkyVector)
  const handedPalmNormalZ =
    Number.isFinite(normal.z) && normalScale > 0 ? normal.z / normalScale : null
  const palmWidth = distance2d(screenIndexMcp, screenPinkyMcp)
  const palmHeight = distance2d(screenWrist, screenMiddleMcp)
  const palmWidthRatio = palmWidth / palmHeight
  const handHeight = distance2d(screenWrist, screenMiddleTip)
  const mcpXSpread =
    Math.max(screenIndexMcp.x, screenMiddleMcp.x, screenRingMcp.x, screenPinkyMcp.x) -
    Math.min(screenIndexMcp.x, screenMiddleMcp.x, screenRingMcp.x, screenPinkyMcp.x)
  const mcpXSpreadRatio = mcpXSpread / handHeight
  const tipXSpread =
    Math.max(
      screenThumbTip.x,
      screenIndexTip.x,
      screenMiddleTip.x,
      screenRingTip.x,
      screenPinkyTip.x,
    ) -
    Math.min(
      screenThumbTip.x,
      screenIndexTip.x,
      screenMiddleTip.x,
      screenRingTip.x,
      screenPinkyTip.x,
    )
  const tipXSpreadRatio = tipXSpread / handHeight
  const palmScale = vectorLength(subtractPoints(middleMcp, wrist))
  const depthDiff =
    palmScale > 0 ? Math.abs((indexMcp.z ?? 0) - (pinkyMcp.z ?? 0)) / palmScale : null
  const overlapScore = estimateOverlapScore(landmarks, handHeight)

  return {
    palmNormalZ: handedPalmNormalZ,
    palmWidth,
    palmHeight,
    palmWidthRatio,
    mcpXSpread,
    mcpXSpreadRatio,
    tipXSpread,
    tipXSpreadRatio,
    depthDiff,
    overlapScore,
  }
}

export function getHandOrientationStatus(landmarks, worldLandmarks, handedness) {
  const features = getOrientationFeatures(landmarks, worldLandmarks)

  if (!features) {
    return 'unknown'
  }

  if (hasCompressed2dHandShape(features)) {
    return 'sideways'
  }

  if (isDepthTiltedHand(features)) {
    return 'sideways'
  }

  const palmBackStatus = getPalmBackOrientationStatus(features, landmarks, handedness)

  if (palmBackStatus !== 'unknown') {
    return palmBackStatus
  }

  // If palm/back is ambiguous, only the 2D visible hand shape can rescue the
  // frame. It cannot override a clear back-of-hand result above.
  if (hasClearPalmFacingShape(features)) {
    return 'palm'
  }

  return 'unknown'
}

function getPalmBackOrientationStatus(features, landmarks, handedness) {
  if (!Number.isFinite(features.palmNormalZ)) {
    return 'unknown'
  }

  if (Math.abs(features.palmNormalZ) <= PALM_ORIENTATION_THRESHOLD) {
    const fallbackPalmFacing = getLandmarkOrderFallback(
      landmarks?.[PALM_POINTS.indexMcp],
      landmarks?.[PALM_POINTS.middleMcp],
      landmarks?.[PALM_POINTS.pinkyMcp],
      handedness,
    )
    return getPalmBackStatus(fallbackPalmFacing)
  }

  const handednessSign = handedness === 'Left' ? -1 : 1
  const orientationScore = features.palmNormalZ * handednessSign
  const rawPalmFacing = orientationScore < -PALM_ORIENTATION_THRESHOLD

  return getPalmBackStatus(rawPalmFacing)
}

export function isPalmFacingCamera(landmarks, handedness, worldLandmarks = null) {
  const status = getHandOrientationStatus(landmarks, worldLandmarks, handedness)

  if (status === 'unknown') {
    return null
  }

  return status === 'palm'
}

function getSmoothedHandOrientationStatus(tracker, landmarks, worldLandmarks, handedness) {
  const orientationStatus = getHandOrientationStatus(landmarks, worldLandmarks, handedness)
  const isPalm = orientationStatus === 'palm'

  if (!tracker) {
    return orientationStatus
  }

  if (isPalm) {
    tracker.consecutiveValid += 1
    tracker.consecutiveInvalid = 0

    if (tracker.consecutiveValid >= ORIENTATION_SMOOTHING_FRAMES) {
      tracker.smoothedStatus = 'palm'
    }
  } else {
    tracker.consecutiveInvalid += 1
    tracker.consecutiveValid = 0

    if (tracker.consecutiveInvalid >= ORIENTATION_SMOOTHING_FRAMES) {
      tracker.smoothedStatus = orientationStatus
    }
  }

  if (!isPalm) {
    return tracker.consecutiveInvalid >= ORIENTATION_SMOOTHING_FRAMES
      ? tracker.smoothedStatus
      : 'unknown'
  }

  return tracker.consecutiveValid >= ORIENTATION_SMOOTHING_FRAMES
    ? 'palm'
    : tracker.smoothedStatus
}

function hasCompressed2dHandShape(features) {
  if (
    !Number.isFinite(features.palmWidthRatio) ||
    !Number.isFinite(features.mcpXSpreadRatio) ||
    !Number.isFinite(features.tipXSpreadRatio)
  ) {
    return true
  }

  return (
    features.palmWidthRatio < SIDEWAYS_WIDTH_RATIO_MIN ||
    features.mcpXSpreadRatio < MCP_X_SPREAD_MIN ||
    features.tipXSpreadRatio < TIP_X_SPREAD_MIN ||
    features.overlapScore >= 3
  )
}

function isDepthTiltedHand(features) {
  return Number.isFinite(features.depthDiff) && features.depthDiff > SIDEWAYS_DEPTH_DIFF_MAX
}

function hasClearPalmFacingShape(features) {
  return (
    features.palmWidthRatio >= SIDEWAYS_WIDTH_RATIO_MIN &&
    features.mcpXSpreadRatio >= MCP_X_SPREAD_MIN &&
    features.tipXSpreadRatio >= TIP_X_SPREAD_MIN
  )
}

function getPalmBackStatus(rawPalmFacing) {
  if (rawPalmFacing === null) {
    return 'unknown'
  }

  const palmFacing = INVERT_PALM_ORIENTATION ? !rawPalmFacing : rawPalmFacing
  return palmFacing ? 'palm' : 'back'
}

function subtractPoints(pointA, pointB) {
  return {
    x: pointA.x - pointB.x,
    y: pointA.y - pointB.y,
    z: (pointA.z ?? 0) - (pointB.z ?? 0),
  }
}

function crossProduct(vectorA, vectorB) {
  return {
    x: vectorA.y * vectorB.z - vectorA.z * vectorB.y,
    y: vectorA.z * vectorB.x - vectorA.x * vectorB.z,
    z: vectorA.x * vectorB.y - vectorA.y * vectorB.x,
  }
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function getLandmarkOrderFallback(indexMcp, middleMcp, pinkyMcp, handedness) {
  if (!indexMcp || !middleMcp || !pinkyMcp) {
    return null
  }

  const indexToPinky = pinkyMcp.x - indexMcp.x
  const middleCentered =
    middleMcp.x > Math.min(indexMcp.x, pinkyMcp.x) &&
    middleMcp.x < Math.max(indexMcp.x, pinkyMcp.x)

  if (!middleCentered || Math.abs(indexToPinky) < PALM_ORIENTATION_THRESHOLD) {
    return null
  }

  return handedness === 'Left' ? indexToPinky > 0 : indexToPinky < 0
}

function estimateOverlapScore(landmarks, handHeight) {
  if (!Number.isFinite(handHeight) || handHeight <= 0) {
    return Number.POSITIVE_INFINITY
  }

  const fingertipXs = FINGERTIP_POINTS.map((index) => landmarks[index]?.x).filter(Number.isFinite)

  if (fingertipXs.length < FINGERTIP_POINTS.length) {
    return Number.POSITIVE_INFINITY
  }

  const fingertipSpread = Math.max(...fingertipXs) - Math.min(...fingertipXs)
  return fingertipSpread / handHeight < MCP_X_SPREAD_MIN ? 3 : 0
}

function distance2d(pointA, pointB) {
  if (!pointA || !pointB) {
    return Number.NaN
  }

  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
}

function getOrientationLabel(status) {
  if (status === 'palm') {
    return 'Palm'
  }

  if (status === 'back') {
    return 'Back'
  }

  if (status === 'sideways') {
    return 'Sideways'
  }

  return 'Unknown'
}

function createLandmarkerWithDelegate(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  })
}

export function drawHandLandmarks(canvas, result, selectedIndex) {
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)

  const hands = result?.landmarks ?? []
  hands.forEach((landmarks, index) => {
    const isSelected = index === selectedIndex
    drawConnections(context, landmarks, isSelected)
    drawPoints(context, landmarks, isSelected)
  })
}

export function resizeCanvasToVideo(canvas, video) {
  const width = video.videoWidth
  const height = video.videoHeight

  if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width
    canvas.height = height
  }
}

function drawConnections(context, landmarks, isSelected) {
  context.lineWidth = isSelected ? 4 : 2
  context.strokeStyle = isSelected ? '#42e58f' : 'rgba(255, 255, 255, 0.55)'

  HandLandmarker.HAND_CONNECTIONS.forEach(({ start, end }) => {
    const from = landmarks[start]
    const to = landmarks[end]
    context.beginPath()
    context.moveTo(from.x * context.canvas.width, from.y * context.canvas.height)
    context.lineTo(to.x * context.canvas.width, to.y * context.canvas.height)
    context.stroke()
  })
}

function drawPoints(context, landmarks, isSelected) {
  context.fillStyle = isSelected ? '#f7fff9' : 'rgba(255, 255, 255, 0.8)'

  landmarks.forEach((landmark, index) => {
    const radius = isSelected && index % 4 === 0 ? 6 : 4
    context.beginPath()
    context.arc(
      landmark.x * context.canvas.width,
      landmark.y * context.canvas.height,
      radius,
      0,
      Math.PI * 2,
    )
    context.fill()
  })
}

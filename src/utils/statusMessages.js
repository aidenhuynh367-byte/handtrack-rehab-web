export function getPriorityStatusMessage({
  status,
  selectedHand,
  insideGuideBox,
  trackingStable,
  analysisInstruction,
  counterInstruction,
  fallbackInstruction,
}) {
  // shows the clearest problem first
  if (status === 'No hand detected' || status === 'Hand not detected') {
    return 'No hand detected'
  }

  if (status === 'Wrong hand detected') {
    return `Wrong hand detected: use your ${selectedHand.toLowerCase()} hand`
  }

  // orientation should beat the box warning
  if (status === 'Wrong orientation') {
    return 'Wrong orientation: face your palm toward the camera'
  }

  if (
    status === 'Unstable' ||
    status === 'Tracking unstable' ||
    (status === 'Good' && trackingStable === false)
  ) {
    return 'Tracking unstable: hold your hand steady'
  }

  // box warning only shows if orientation is fine
  if (status === 'Outside guide box' || (status === 'Good' && insideGuideBox === false)) {
    return 'Place your hand inside the box'
  }

  // shared by every exercise
  if (status === 'Good') {
    return counterInstruction || analysisInstruction || fallbackInstruction || 'Tracking ready'
  }

  return analysisInstruction || fallbackInstruction || status
}

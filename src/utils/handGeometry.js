export const LANDMARKS = {
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

export function distance(pointA, pointB) {
  if (!pointA || !pointB) {
    return Number.NaN
  }

  const dx = pointA.x - pointB.x
  const dy = pointA.y - pointB.y
  const dz = (pointA.z ?? 0) - (pointB.z ?? 0)
  return Math.hypot(dx, dy, dz)
}

export function averagePoint(points) {
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

export function getPalmCenter(landmarks) {
  return averagePoint([
    landmarks[LANDMARKS.wrist],
    landmarks[LANDMARKS.indexMcp],
    landmarks[LANDMARKS.middleMcp],
    landmarks[LANDMARKS.ringMcp],
    landmarks[LANDMARKS.pinkyMcp],
  ])
}

export function getPalmScale(landmarks) {
  return distance(landmarks[LANDMARKS.wrist], landmarks[LANDMARKS.middleMcp])
}

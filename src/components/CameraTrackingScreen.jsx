import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPalmOrientationTracker,
  createHandLandmarker,
  drawHandLandmarks,
  getSelectedHandAnalysis,
  resizeCanvasToVideo,
} from '../utils/handLandmarks.js'
import {
  createStabilityTracker,
  estimateLandmarkStability,
  isHandInsideGuideBox,
  resetStabilityTracker,
  smoothLandmarks,
  updateStabilityTracker,
} from '../utils/trackingQuality.js'
import { getPriorityStatusMessage } from '../utils/statusMessages.js'

const INITIAL_HUD = {
  phase: 'Ready',
  trackingStatus: 'Starting camera',
  instruction: 'Allow camera access',
  measurement: null,
  orientationLabel: 'Unknown',
  orientationFeatures: null,
  trackingStable: false,
  insideGuideBox: false,
}

function CameraTrackingScreen({
  exercise,
  selectedHand,
  targetReps,
  targetSets,
  calibration,
  onBack,
  onComplete,
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const animationRef = useRef(null)
  const orientationTrackerRef = useRef(createPalmOrientationTracker())
  const stabilityTrackerRef = useRef(createStabilityTracker())
  const previousRawLandmarksRef = useRef(null)
  const smoothedLandmarksRef = useRef(null)
  const sessionMetricsRef = useRef(createFrameMetrics())
  const currentRepJitterSamplesRef = useRef([])
  const counter = useMemo(
    () => exercise.createCounter(targetReps, targetSets, calibration),
    [calibration, exercise, targetReps, targetSets],
  )
  const startedAtRef = useRef(0)
  const lastHudUpdateRef = useRef(0)

  const [hud, setHud] = useState(() => ({
    ...INITIAL_HUD,
    phase: counter.phase,
    instruction: counter.instruction,
  }))
  const [cameraAspectRatio, setCameraAspectRatio] = useState('4 / 3')
  const [cameraError, setCameraError] = useState('')
  const [counterState, setCounterState] = useState(() => counter.getState())

  const publishHud = useCallback((nextHud, force = false) => {
    const now = performance.now()

    if (!force && now - lastHudUpdateRef.current < 120) {
      return
    }

    lastHudUpdateRef.current = now
    setHud(nextHud)
  }, [])

  useEffect(() => {
    let isActive = true

    async function startTracking() {
      startedAtRef.current = Date.now()
      setCameraError('')
      sessionMetricsRef.current = createFrameMetrics()
      currentRepJitterSamplesRef.current = []
      publishHud(
        {
          phase: counter.phase,
          trackingStatus: 'Loading hand tracker',
          instruction: 'Preparing MediaPipe',
          measurement: null,
          orientationLabel: 'Unknown',
          orientationFeatures: null,
          trackingStable: false,
          insideGuideBox: false,
        },
        true,
      )

      try {
        const landmarker = await createHandLandmarker()

        if (!isActive) {
          landmarker.close()
          return
        }

        landmarkerRef.current = landmarker

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (!isActive) {
          stopStream(stream)
          landmarker.close()
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        await video.play()

        publishHud(
          {
            phase: counter.phase,
            trackingStatus: 'Looking for hand',
            instruction: `Show your ${selectedHand.toLowerCase()} hand in the camera`,
            measurement: null,
            orientationLabel: 'Unknown',
            orientationFeatures: null,
            trackingStable: false,
            insideGuideBox: false,
          },
          true,
        )
        animationRef.current = window.requestAnimationFrame(processFrame)
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : 'Camera setup failed')
        publishHud(
          {
            phase: 'Paused',
            trackingStatus: 'Camera unavailable',
            instruction: 'Camera access is required for tracking',
            measurement: null,
            orientationLabel: 'Unknown',
            orientationFeatures: null,
            trackingStable: false,
            insideGuideBox: false,
          },
          true,
        )
      }
    }

    function processFrame() {
      if (!isActive) {
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const landmarker = landmarkerRef.current

      if (!video || !canvas || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        animationRef.current = window.requestAnimationFrame(processFrame)
        return
      }

      resizeCanvasToVideo(canvas, video)
      const result = landmarker.detectForVideo(video, performance.now())
      const currentCounterState = counter.getState()
      const analysis = getSelectedHandAnalysis(result, selectedHand, {
        orientationTracker: orientationTrackerRef.current,
        requirePalmOrientation: currentCounterState.isStartPhase,
      })
      const handInsideGuideBox = Boolean(
        analysis.landmarks && isHandInsideGuideBox(analysis.landmarks),
      )
      drawHandLandmarks(canvas, result, analysis.selectedIndex)

      if (currentCounterState.setComplete) {
        setCounterState(currentCounterState)
        publishHud({
          phase: currentCounterState.phase,
          trackingStatus: currentCounterState.complete ? 'Complete' : 'Paused between sets',
          instruction: currentCounterState.instruction,
          measurement: null,
          orientationLabel: 'Palm',
          orientationFeatures: null,
          trackingStable: true,
          insideGuideBox: handInsideGuideBox,
        })
        animationRef.current = window.requestAnimationFrame(processFrame)
        return
      }

      if (analysis.status !== 'Good') {
        recordFrameStatus(sessionMetricsRef.current, analysis.status)
        resetStabilityTracker(stabilityTrackerRef.current)
        previousRawLandmarksRef.current = null
        smoothedLandmarksRef.current = null
        currentRepJitterSamplesRef.current = []
        counter.reset({ keepProgress: true })
        const pausedCounterState = counter.getState()
        setCounterState(pausedCounterState)
        publishHud({
          phase: pausedCounterState.phase,
          trackingStatus: analysis.status,
          instruction: analysis.instruction,
          measurement: pausedCounterState.measurement,
          orientationLabel: analysis.orientationLabel ?? 'Unknown',
          orientationFeatures: analysis.orientationFeatures,
          trackingStable: false,
          insideGuideBox: handInsideGuideBox,
        })
        animationRef.current = window.requestAnimationFrame(processFrame)
        return
      }

      if (!handInsideGuideBox) {
        recordFrameStatus(sessionMetricsRef.current, 'Outside guide box')
        resetStabilityTracker(stabilityTrackerRef.current)
        previousRawLandmarksRef.current = null
        smoothedLandmarksRef.current = null
        currentRepJitterSamplesRef.current = []
        counter.reset({ keepProgress: true })
        const pausedCounterState = counter.getState()
        setCounterState(pausedCounterState)
        publishHud({
          phase: pausedCounterState.phase,
          trackingStatus: 'Outside guide box',
          instruction: 'Move your hand inside the guide box',
          measurement: pausedCounterState.measurement,
          orientationLabel: analysis.orientationLabel ?? 'Palm',
          orientationFeatures: analysis.orientationFeatures,
          trackingStable: false,
          insideGuideBox: false,
        })
        animationRef.current = window.requestAnimationFrame(processFrame)
        return
      }

      const stability = estimateLandmarkStability(
        analysis.landmarks,
        previousRawLandmarksRef.current,
      )
      previousRawLandmarksRef.current = analysis.landmarks
      const trackingStable = updateStabilityTracker(
        stabilityTrackerRef.current,
        stability.stable,
        stability.score,
      )
      const smoothedLandmarks = smoothLandmarks(analysis.landmarks, smoothedLandmarksRef.current)
      smoothedLandmarksRef.current = smoothedLandmarks

      if (!trackingStable) {
        recordFrameStatus(sessionMetricsRef.current, 'Unstable')
        counter.reset({ keepProgress: true })
        currentRepJitterSamplesRef.current = []
        const pausedCounterState = counter.getState()
        setCounterState(pausedCounterState)
        publishHud({
          phase: pausedCounterState.phase,
          trackingStatus: 'Unstable',
          instruction: 'Hold your hand steady in view',
          measurement: pausedCounterState.measurement,
          orientationLabel: analysis.orientationLabel ?? 'Palm',
          orientationFeatures: analysis.orientationFeatures,
          trackingStable: false,
          insideGuideBox: true,
        })
        animationRef.current = window.requestAnimationFrame(processFrame)
        return
      }

      recordFrameStatus(sessionMetricsRef.current, 'Good')
      currentRepJitterSamplesRef.current.push(stability.score)
      const nextCounterState = counter.update(smoothedLandmarks, performance.now())

      if (nextCounterState.justCounted) {
        sessionMetricsRef.current.jitterScoresByRep.push(average(currentRepJitterSamplesRef.current))
        currentRepJitterSamplesRef.current = []
      }

      setCounterState(nextCounterState)

      if (nextCounterState.complete) {
        const durationMs = Date.now() - startedAtRef.current
        onComplete({
          completedReps: nextCounterState.repsCompleted,
          completedSets: nextCounterState.setsCompleted,
          durationMs,
          sessionMetrics: mergeSessionMetrics(
            sessionMetricsRef.current,
            nextCounterState.sessionMetrics,
            durationMs,
          ),
        })
        return
      }

      publishHud({
        phase: nextCounterState.phase,
        trackingStatus: analysis.status,
        instruction: nextCounterState.instruction,
        measurement: nextCounterState.measurement,
        orientationLabel: analysis.orientationLabel ?? 'Palm',
        orientationFeatures: analysis.orientationFeatures,
        trackingStable: true,
        insideGuideBox: true,
      })
      animationRef.current = window.requestAnimationFrame(processFrame)
    }

    startTracking()

    return () => {
      isActive = false

      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current)
      }

      stopStream(streamRef.current)
      landmarkerRef.current?.close()
    }
  }, [counter, onComplete, publishHud, selectedHand])

  const startNextSet = () => {
    counter.startNextSet()
    const nextCounterState = counter.getState()
    setCounterState(nextCounterState)
    publishHud(
      {
        phase: nextCounterState.phase,
        trackingStatus: 'Looking for hand',
        instruction: `Show your ${selectedHand.toLowerCase()} hand in the camera`,
        measurement: null,
        orientationLabel: 'Unknown',
        orientationFeatures: null,
        trackingStable: false,
        insideGuideBox: false,
      },
      true,
    )
  }

  const activeSet = counterState.setComplete
    ? Math.max(1, counterState.setsCompleted)
    : counterState.setsCompleted + 1
  const progress = Math.min(100, Math.round((counterState.repsInSet / targetReps) * 100))
  const hasOrientationWarning = hud.trackingStatus === 'Wrong orientation'
  const cameraOverlayMessage = getPriorityStatusMessage({
    status: hud.trackingStatus,
    selectedHand,
    insideGuideBox: hud.insideGuideBox,
    trackingStable: hud.trackingStable,
    analysisInstruction: hud.instruction,
    counterInstruction: counterState.instruction,
    fallbackInstruction: hud.trackingStatus,
  })
  const updateCameraAspectRatio = () => {
    const video = videoRef.current

    if (video?.videoWidth && video?.videoHeight) {
      setCameraAspectRatio(`${video.videoWidth} / ${video.videoHeight}`)
    }
  }

  return (
    <section className="tracking-screen">
      <div className="camera-layout">
        <div className="camera-panel">
          <div
            className={`camera-stage camera-frame ${hasOrientationWarning ? 'orientation-warning' : ''}`}
            style={{ '--camera-aspect-ratio': cameraAspectRatio }}
          >
            {/* keeps video and landmarks aligned */}
            <video
              ref={videoRef}
              className="camera-video"
              playsInline
              muted
              onLoadedMetadata={updateCameraAspectRatio}
              onResize={updateCameraAspectRatio}
            />
            <canvas ref={canvasRef} className="landmark-canvas" />
            <div className="guide-box" aria-hidden="true" />
            {hasOrientationWarning && (
              <div className="orientation-warning-banner">
                Warning: face your palm toward the camera
              </div>
            )}
            <div className="camera-overlay">
              <span>{cameraOverlayMessage}</span>
            </div>
          </div>
          {cameraError && <p className="error-message">{cameraError}</p>}
        </div>

        <aside className="tracking-hud" aria-live="polite">
          <div className="hud-topline">
            <span className="section-kicker">Camera tracking</span>
            <span className="status-dot" aria-hidden="true" />
          </div>
          <h2>{hud.instruction}</h2>

          <div className="hud-grid">
            <HudMetric label="Exercise" value={exercise.name} />
            <HudMetric label="Hand" value={selectedHand} />
            <HudMetric label="Reps" value={`${counterState.repsInSet} / ${targetReps}`} />
            <HudMetric label="Sets" value={`${Math.min(activeSet, targetSets)} / ${targetSets}`} />
            <HudMetric label="Phase" value={hud.phase} />
            <HudMetric label="Tracking" value={hud.trackingStatus} />
            {exercise.id !== 'closed-fist' && (
              <>
                <HudMetric label="Orientation" value={hud.orientationLabel} isSmall />
                <HudMetric
                  label="palmWidthRatio"
                  value={formatDebugValue(hud.orientationFeatures?.palmWidthRatio)}
                  isSmall
                />
                <HudMetric
                  label="mcpXSpreadRatio"
                  value={formatDebugValue(hud.orientationFeatures?.mcpXSpreadRatio)}
                  isSmall
                />
                <HudMetric
                  label="tipXSpreadRatio"
                  value={formatDebugValue(hud.orientationFeatures?.tipXSpreadRatio)}
                  isSmall
                />
              </>
            )}
          </div>

          <div className="progress-block">
            <div className="progress-copy">
              <span>Set progress</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track" aria-label="Set progress">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          {exercise.id !== 'closed-fist' && hud.measurement !== null && (
            <p className="distance-readout">Normalized measure: {hud.measurement.toFixed(2)}</p>
          )}

          {exercise.id === 'closed-fist' && (
            <div className="closed-fist-debug" aria-label="Closed fist debug values">
              <span className="metric-label">Closed fist debug</span>
              {/* only show the debug values useful for users */}
              <div className="hud-grid closed-fist-debug-grid">
                <HudMetric label="Phase" value={counterState.phase} isSmall />
                <HudMetric
                  label="Stable tracking"
                  value={formatDebugBoolean(hud.trackingStable)}
                  isSmall
                />
                <HudMetric
                  label="Inside guide box"
                  value={formatDebugBoolean(hud.insideGuideBox)}
                  isSmall
                />
              </div>
            </div>
          )}

          <div className="nav-buttons hud-actions">
            <button className="secondary-button" type="button" onClick={onBack}>
              Back
            </button>
            {counterState.setComplete && !counterState.complete && (
              <button className="primary-button" type="button" onClick={startNextSet}>
                Start Next Set
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

function HudMetric({ label, value, isSmall = false }) {
  return (
    <div className={`hud-metric ${isSmall ? 'is-small' : ''}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatDebugValue(value) {
  return Number.isFinite(value) ? value.toFixed(2) : 'n/a'
}

function formatDebugBoolean(value) {
  return value ? 'Yes' : 'No'
}

function createFrameMetrics() {
  return {
    totalFrames: 0,
    goodTrackingFrames: 0,
    badTrackingFrames: 0,
    wrongOrientationFrames: 0,
    wrongHandFrames: 0,
    outsideGuideBoxFrames: 0,
    unstableFrames: 0,
    jitterScoresByRep: [],
  }
}

function recordFrameStatus(metrics, status) {
  metrics.totalFrames += 1

  if (status === 'Good') {
    metrics.goodTrackingFrames += 1
    return
  }

  metrics.badTrackingFrames += 1

  if (status === 'Wrong orientation') {
    metrics.wrongOrientationFrames += 1
  }

  if (status === 'Wrong hand detected') {
    metrics.wrongHandFrames += 1
  }

  if (status === 'Outside guide box') {
    metrics.outsideGuideBoxFrames += 1
  }

  if (status === 'Unstable' || status === 'Tracking unstable') {
    metrics.unstableFrames += 1
  }
}

function mergeSessionMetrics(frameMetrics, repMetrics = {}, durationMs = 0) {
  const repDurationsMs = repMetrics.repDurationsMs ?? []
  const holdDurationsMs = repMetrics.holdDurationsMs ?? []
  const totalFrames = frameMetrics.totalFrames ?? 0

  return {
    ...frameMetrics,
    ...repMetrics,
    successfulReps: repMetrics.validReps ?? 0,
    failedReps: repMetrics.invalidReps ?? 0,
    durationSeconds: Math.max(0, Math.round(durationMs / 1000)),
    medianHoldMs: median(holdDurationsMs),
    medianRepCycleMs: median(repDurationsMs),
    repCycleCv: coefficientOfVariation(repDurationsMs),
    trackingQualityMean:
      totalFrames > 0 ? (frameMetrics.goodTrackingFrames ?? 0) / totalFrames : null,
    trackingWarningRate:
      totalFrames > 0 ? (frameMetrics.badTrackingFrames ?? 0) / totalFrames : null,
    jitterScoresByRep: [
      ...(repMetrics.jitterScoresByRep ?? []),
      ...frameMetrics.jitterScoresByRep.filter(Number.isFinite),
    ],
  }
}

function average(values) {
  const validValues = values.filter(Number.isFinite)

  if (!validValues.length) {
    return 0
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length
}

function median(values) {
  const validValues = values.filter(Number.isFinite).sort((a, b) => a - b)

  if (!validValues.length) {
    return null
  }

  const midpoint = Math.floor(validValues.length / 2)
  return validValues.length % 2
    ? validValues[midpoint]
    : (validValues[midpoint - 1] + validValues[midpoint]) / 2
}

function coefficientOfVariation(values) {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0)

  if (validValues.length < 2) {
    return null
  }

  const mean = average(validValues)
  const variance =
    validValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    validValues.length

  return Math.sqrt(variance) / mean
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

export default CameraTrackingScreen

import { useEffect, useRef, useState } from 'react'
import {
  createHandLandmarker,
  createPalmOrientationTracker,
  drawHandLandmarks,
  getSelectedHandAnalysis,
  resizeCanvasToVideo,
} from '../utils/handLandmarks.js'
import {
  CALIBRATION_DURATION_MS,
  addCalibrationSample,
  createCalibrationAccumulator,
  createStabilityTracker,
  estimateLandmarkStability,
  isHandInsideGuideBox,
  resetStabilityTracker,
  smoothLandmarks,
  summarizeCalibration,
  updateStabilityTracker,
} from '../utils/trackingQuality.js'

const MIN_CALIBRATION_SAMPLES = 8

const INITIAL_STATUS = {
  handDetected: false,
  correctHand: false,
  insideGuideBox: false,
  trackingStable: false,
  palmFacingCamera: false,
}

function HandSetupCheckScreen({ selectedHand, onBack, onComplete }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const animationRef = useRef(null)
  const orientationTrackerRef = useRef(createPalmOrientationTracker())
  const stabilityTrackerRef = useRef(createStabilityTracker())
  const previousRawLandmarksRef = useRef(null)
  const smoothedLandmarksRef = useRef(null)
  const accumulatorRef = useRef(createCalibrationAccumulator())
  const countdownStartedAtRef = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(5)
  const [status, setStatus] = useState(INITIAL_STATUS)
  const [trackingStatus, setTrackingStatus] = useState('Hand not detected')
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let isActive = true

    async function startCalibration() {
      setFailed(false)
      setSecondsLeft(5)
      setStatus(INITIAL_STATUS)
      setTrackingStatus('Hand not detected')
      setIsCalibrating(false)
      countdownStartedAtRef.current = null
      accumulatorRef.current = createCalibrationAccumulator()
      orientationTrackerRef.current = createPalmOrientationTracker()
      stabilityTrackerRef.current = createStabilityTracker()
      previousRawLandmarksRef.current = null
      smoothedLandmarksRef.current = null

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
        animationRef.current = window.requestAnimationFrame(processFrame)
      } catch {
        setFailed(true)
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
      const analysis = getSelectedHandAnalysis(result, selectedHand, {
        orientationTracker: orientationTrackerRef.current,
      })
      drawHandLandmarks(canvas, result, analysis.selectedIndex)

      const handDetected = analysis.status !== 'No hand detected'
      const correctHand = handDetected && analysis.status !== 'Wrong hand detected'
      const insideGuideBox = Boolean(analysis.landmarks && isHandInsideGuideBox(analysis.landmarks))
      let trackingStable = false
      let currentTrackingStatus

      if (analysis.status === 'Good' && insideGuideBox) {
        const stability = estimateLandmarkStability(
          analysis.landmarks,
          previousRawLandmarksRef.current,
        )
        previousRawLandmarksRef.current = analysis.landmarks
        trackingStable = updateStabilityTracker(
          stabilityTrackerRef.current,
          stability.stable,
          stability.score,
        )

        const smoothedLandmarks = smoothLandmarks(analysis.landmarks, smoothedLandmarksRef.current)
        smoothedLandmarksRef.current = smoothedLandmarks

        if (trackingStable) {
          currentTrackingStatus = analysis.status === 'Good' ? 'Good' : analysis.status
        } else {
          currentTrackingStatus = 'Unstable'
        }

        if (trackingStable && currentTrackingStatus === 'Good') {
          if (!countdownStartedAtRef.current) {
            countdownStartedAtRef.current = Date.now()
            accumulatorRef.current = createCalibrationAccumulator()
          }

          const elapsedCalibrationMs = Date.now() - countdownStartedAtRef.current
          const remainingSeconds = Math.max(
            0,
            Math.ceil((CALIBRATION_DURATION_MS - elapsedCalibrationMs) / 1000),
          )

          setSecondsLeft(remainingSeconds)
          addCalibrationSample(
            accumulatorRef.current,
            smoothedLandmarks,
            stability.score,
            analysis.orientationLabel,
          )

          if (elapsedCalibrationMs >= CALIBRATION_DURATION_MS) {
            const calibration = summarizeCalibration(accumulatorRef.current)

            if (calibration && calibration.sampleCount >= MIN_CALIBRATION_SAMPLES) {
              onComplete(calibration)
            } else {
              setFailed(true)
              setIsCalibrating(false)
            }

            return
          }
        }
      } else {
        currentTrackingStatus =
          analysis.status === 'Good' && !insideGuideBox ? 'Outside guide box' : analysis.status
        resetStabilityTracker(stabilityTrackerRef.current)
        previousRawLandmarksRef.current = null
        smoothedLandmarksRef.current = null
      }

      if (currentTrackingStatus !== 'Good') {
        countdownStartedAtRef.current = null
        accumulatorRef.current = createCalibrationAccumulator()
        setSecondsLeft(5)
      }

      setStatus({
        handDetected,
        correctHand,
        insideGuideBox,
        trackingStable,
        palmFacingCamera: analysis.orientationLabel === 'Palm',
      })
      setTrackingStatus(currentTrackingStatus)
      setIsCalibrating(currentTrackingStatus === 'Good')

      animationRef.current = window.requestAnimationFrame(processFrame)
    }

    startCalibration()

    return () => {
      isActive = false

      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current)
      }

      stopStream(streamRef.current)
      landmarkerRef.current?.close()
    }
  }, [attempt, onComplete, selectedHand])

  const tryAgain = () => {
    setAttempt((current) => current + 1)
  }

  const setupHasWarning =
    trackingStatus === 'Wrong orientation' ||
    trackingStatus === 'Outside guide box' ||
    trackingStatus === 'Unstable'

  return (
    <section className="screen setup-check-screen">
      <div className="setup-check-copy">
        <p className="section-kicker">Pre-exercise calibration</p>
        <h2>Hand Setup Check</h2>
        <p className="setup-check-primary-instruction">
          {isCalibrating
            ? 'Hold steady — calibrating'
            : 'Place your hand inside the box with your palm facing the camera'}
        </p>
        {isCalibrating ? (
          <p className="setup-check-helper">Keep your palm facing the camera</p>
        ) : trackingStatus !== 'Hand not detected' ? (
          <p className="setup-check-helper">Setup paused — fix hand position</p>
        ) : (
          <p className="setup-check-helper">Place your hand inside the box</p>
        )}
        <ol className="setup-check-steps">
          <li>Place your hand inside the box</li>
          <li>Face your palm toward the camera</li>
          <li>Open your hand fully</li>
          <li>Hold your hand steady</li>
        </ol>
      </div>

      <div className="setup-check-layout">
        <div className={`camera-panel ${failed ? 'calibration-failed' : ''}`}>
          <div className={`camera-stage camera-frame ${setupHasWarning ? 'orientation-warning' : ''}`}>
            <video ref={videoRef} className="camera-video" playsInline muted />
            <canvas ref={canvasRef} className="landmark-canvas" />
            <div className="guide-box" aria-hidden="true" />
            {setupHasWarning && (
              <div className="orientation-warning-banner">
                {trackingStatus === 'Wrong orientation'
                  ? 'Warning: face your palm toward the camera'
                  : 'Setup paused — fix hand position'}
              </div>
            )}
            <div className="camera-overlay">
              <span>{isCalibrating ? `Calibrating: ${secondsLeft}` : 'Place your hand inside the box'}</span>
            </div>
          </div>
        </div>

        <aside className="setup-check-status">
          <h3>Live status</h3>
          <StatusRow label="Hand detected" active={status.handDetected} />
          <StatusRow label="Correct hand" active={status.correctHand} />
          <StatusRow label="Inside guide box" active={status.insideGuideBox} />
          <StatusRow label="Tracking stable" active={status.trackingStable} />
          <StatusRow label="Palm facing camera" active={status.palmFacingCamera} />

          {failed && (
            <div className="calibration-message">
              <p>Tracking setup failed. Improve lighting, move hand into the box, and try again.</p>
              <button className="primary-button" type="button" onClick={tryAgain}>
                Try Again
              </button>
            </div>
          )}

          <button className="secondary-button" type="button" onClick={onBack}>
            Back
          </button>
        </aside>
      </div>
    </section>
  )
}

function StatusRow({ label, active }) {
  return (
    <div className={`setup-status-row ${active ? 'is-good' : ''}`}>
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  )
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

export default HandSetupCheckScreen

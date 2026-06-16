import { useEffect, useState } from 'react'
import ImageWithFallback from './ImageWithFallback.jsx'

const DEMO_SECONDS = 7

function DemoScreen({ exercise, selectedHand, targetReps, targetSets, onBack, onComplete }) {
  const [secondsLeft, setSecondsLeft] = useState(DEMO_SECONDS)

  useEffect(() => {
    const startedAt = Date.now()
    const intervalId = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
      const nextSeconds = Math.max(0, DEMO_SECONDS - elapsedSeconds)
      setSecondsLeft(nextSeconds)

      if (nextSeconds === 0) {
        window.clearInterval(intervalId)
        onComplete()
      }
    }, 200)

    return () => window.clearInterval(intervalId)
  }, [onComplete])

  return (
    <section className="screen demo-screen">
      <div className="demo-heading">
        <div>
          <p className="section-kicker">Demonstration</p>
          <h2>{exercise.name}</h2>
        </div>
        <div className="countdown" aria-label={`${secondsLeft} seconds until tracking starts`}>
          {secondsLeft}
        </div>
      </div>

      <div className="demo-plan">
        <span>{selectedHand} hand</span>
        <span>{targetReps} reps</span>
        <span>{targetSets} sets</span>
      </div>

      <div className="demo-images">
        <figure className="demo-figure">
          <figcaption>Start</figcaption>
          <ImageWithFallback
            className="demo-image"
            alt="Open hand starting position"
            fallbackLabel="Start image missing"
            sources={exercise.demoImages.start}
          />
        </figure>
        <figure className="demo-figure">
          <figcaption>Target</figcaption>
          <ImageWithFallback
            className="demo-image"
            alt={exercise.targetAlt}
            fallbackLabel="Target image missing"
            sources={exercise.demoImages.target}
          />
        </figure>
      </div>

      <ol className="demo-steps">
        {exercise.demoSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="nav-buttons">
        <button className="secondary-button" type="button" onClick={onBack}>
          Back
        </button>
        <button className="primary-button" type="button" onClick={onComplete}>
          Start Tracking
        </button>
      </div>
    </section>
  )
}

export default DemoScreen

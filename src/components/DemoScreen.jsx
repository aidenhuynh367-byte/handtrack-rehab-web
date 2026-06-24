import ImageWithFallback from './ImageWithFallback.jsx'

function DemoScreen({ exercise, selectedHand, targetReps, targetSets, onBack, onComplete }) {
  return (
    <section className="screen demo-screen">
      <div className="demo-heading">
        <div>
          <p className="section-kicker">Demonstration</p>
          <h2>{exercise.name}</h2>
        </div>
      </div>

      <div className="demo-plan">
        <span>{selectedHand} hand</span>
        <span>{targetReps} reps</span>
        <span>{targetSets} sets</span>
      </div>

      <div className="demo-readiness">
        <p>Review the movement instructions before starting.</p>
        <p>Click Next when you are ready to begin.</p>
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
          Next
        </button>
      </div>
    </section>
  )
}

export default DemoScreen

const SCORE_CARDS = [
  {
    key: 'targetPose',
    label: 'Target Pose',
    explanation: 'How accurately you reached the required hand position.',
  },
  {
    key: 'rangeOfMotion',
    label: 'Range Control',
    explanation: 'How completely you moved through the exercise range.',
  },
  {
    key: 'movementSmoothness',
    label: 'Movement Control',
    explanation: 'How smooth and stable your movement was.',
  },
  {
    key: 'fingerIsolation',
    label: 'Finger Isolation',
    explanation:
      'How well the correct finger moved without extra unwanted movement.',
  },
  {
    key: 'repConsistency',
    label: 'Rep Consistency',
    explanation: 'How repeatable your reps were across the session.',
  },
  {
    key: 'averageScore',
    label: 'Average Score',
    explanation: 'Overall average of the five movement scores.',
  },
]

function CurrentSessionResult({ report }) {
  // shows the session they just finished
  return (
    <section className="current-session-section" aria-label="Current Session Result">
      <div className="current-session-heading">
        <div>
          <p className="section-kicker">Just completed</p>
          <h2>Current Session Result</h2>
        </div>
        {report && (
          <p className="current-session-meta">
            {report.exerciseName} · {report.selectedHand} hand
          </p>
        )}
      </div>

      {report ? (
        <div className="current-session-grid">
          {SCORE_CARDS.map(({ key, label, explanation }) => (
            <article
              className={`current-score-card ${
                key === 'averageScore' ? 'is-average' : ''
              }`}
              key={key}
            >
              <span className="metric-label">{label}</span>
              <strong>{formatScore(report[key])}</strong>
              <p>{explanation}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="current-session-empty">
          Complete a session to see your current result here.
        </p>
      )}
    </section>
  )
}

function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)} / 100` : '—'
}

export default CurrentSessionResult

import { useEffect, useMemo, useState } from 'react'
import CameraTrackingScreen from './components/CameraTrackingScreen.jsx'
import DemoScreen from './components/DemoScreen.jsx'
import HandSetupCheckScreen from './components/HandSetupCheckScreen.jsx'
import { calculateSessionScores } from './utils/scoringEngine.js'
import { EXERCISES, getExerciseById } from './utils/exercises.js'
import './App.css'

const DEFAULT_PLAN = {
  exerciseId: 'ring-thumb',
  selectedHand: 'Right',
  targetReps: 8,
  targetSets: 2,
  painBefore: null,
}

function App() {
  const [screen, setScreen] = useState('welcome')
  const [plan, setPlan] = useState(DEFAULT_PLAN)
  const [summary, setSummary] = useState(null)
  const [calibration, setCalibration] = useState(null)
  const exercise = getExerciseById(plan.exerciseId)

  const completeSession = (sessionSummary) => {
    setSummary({
      ...sessionSummary,
      completedAt: new Date().toISOString(),
      reportId: `session-${Date.now()}`,
    })
    setScreen('summary')
  }

  const restart = () => {
    setSummary(null)
    setCalibration(null)
    setScreen('welcome')
  }

  const completeSetupCheck = (setupCalibration) => {
    setCalibration({
      ...setupCalibration,
      openRingPalmDistance: setupCalibration.openRingToPalmDistance,
      openAvgFingertipPalmDistance: setupCalibration.openAverageFingerToPalmDistance,
      selectedHand: plan.selectedHand,
      createdAt: new Date().toISOString(),
      trackingQualityBaseline: setupCalibration.landmarkJitterScore,
      orientationStatusBaseline: setupCalibration.palmOrientationBaseline,
      handInsideGuideBoxBaseline: true,
    })
    setScreen('demo')
  }

  return (
    <main className="app-shell">
      <div className="app-header" aria-label="HandTrack Rehab">
        <div>
          <p className="app-brand">HandTrack Rehab</p>
        </div>
        <div className="header-meta">
          <span className="status-pill">Prototype</span>
          <span className="maker-credit">Made by Aiden H</span>
        </div>
      </div>

      {screen === 'welcome' && <WelcomeScreen onStart={() => setScreen('exercise')} />}

      {screen === 'exercise' && (
        <ExerciseChoiceScreen
          exerciseId={plan.exerciseId}
          onSelect={(exerciseId) => {
            setCalibration(null)
            setPlan((current) => ({ ...current, exerciseId }))
          }}
          onBack={() => setScreen('welcome')}
          onNext={() => setScreen('hand')}
        />
      )}

      {screen === 'hand' && (
        <HandChoiceScreen
          selectedHand={plan.selectedHand}
          onSelect={(selectedHand) => {
            setCalibration(null)
            setPlan((current) => ({ ...current, selectedHand }))
          }}
          onBack={() => setScreen('exercise')}
          onNext={() => setScreen('dose')}
        />
      )}

      {screen === 'dose' && (
        <DoseScreen
          targetReps={plan.targetReps}
          targetSets={plan.targetSets}
          painBefore={plan.painBefore}
          onChange={(dose) => setPlan((current) => ({ ...current, ...dose }))}
          onPainBeforeChange={(painBefore) => setPlan((current) => ({ ...current, painBefore }))}
          onBack={() => setScreen('hand')}
          onNext={() => setScreen('setup-check')}
        />
      )}

      {screen === 'setup-check' && (
        <HandSetupCheckScreen
          selectedHand={plan.selectedHand}
          onBack={() => setScreen('dose')}
          onComplete={completeSetupCheck}
        />
      )}

      {screen === 'demo' && (
        <DemoScreen
          exercise={exercise}
          selectedHand={plan.selectedHand}
          targetReps={plan.targetReps}
          targetSets={plan.targetSets}
          onBack={() => setScreen('setup-check')}
          onComplete={() => setScreen('tracking')}
        />
      )}

      {screen === 'tracking' && (
        <CameraTrackingScreen
          exercise={exercise}
          selectedHand={plan.selectedHand}
          targetReps={plan.targetReps}
          targetSets={plan.targetSets}
          calibration={calibration}
          onBack={() => setScreen('demo')}
          onComplete={completeSession}
        />
      )}

      {screen === 'summary' && (
        <SummaryScreen
          exercise={exercise}
          selectedHand={plan.selectedHand}
          targetReps={plan.targetReps}
          targetSets={plan.targetSets}
          painBefore={plan.painBefore}
          calibration={calibration}
          summary={summary}
          onRestart={restart}
        />
      )}
    </main>
  )
}

function WelcomeScreen({ onStart }) {
  return (
    <section className="screen intro-screen">
      <div className="intro-copy">
        <p className="section-kicker">Guided hand exercise</p>
        <h2>Practice controlled hand movements with live tracking.</h2>
        <p>
          This prototype uses browser hand tracking to count clean repetitions
          only after the target position, brief hold, and release.
        </p>
      </div>
      <div className="exercise-card">
        <div>
          <span className="metric-label">Exercises</span>
          <strong>3 guided movements</strong>
        </div>
        <div>
          <span className="metric-label">Tracking</span>
          <strong>MediaPipe HandLandmarker</strong>
        </div>
      </div>
      <button className="primary-button wide-button" type="button" onClick={onStart}>
        Start Setup
      </button>
    </section>
  )
}

function ExerciseChoiceScreen({ exerciseId, onSelect, onBack, onNext }) {
  return (
    <section className="screen setup-screen exercise-choice-screen">
      <div>
        <p className="section-kicker">Step 1 of 3</p>
        <h2>Choose an exercise.</h2>
      </div>
      <div className="exercise-list" role="group" aria-label="Choose exercise">
        {EXERCISES.map((exercise, index) => (
          <button
            className={`exercise-choice ${exerciseId === exercise.id ? 'is-selected' : ''}`}
            type="button"
            key={exercise.id}
            onClick={() => onSelect(exercise.id)}
          >
            <span>{index + 1}</span>
            <strong>{exercise.name}</strong>
            <small>{exercise.description}</small>
          </button>
        ))}
      </div>
      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </section>
  )
}

function HandChoiceScreen({ selectedHand, onSelect, onBack, onNext }) {
  return (
    <section className="screen setup-screen">
      <div>
        <p className="section-kicker">Step 2 of 3</p>
        <h2>Choose the hand to track.</h2>
      </div>
      <div className="segmented-grid" role="group" aria-label="Choose hand">
        {['Left', 'Right'].map((hand) => (
          <button
            className={`choice-button ${selectedHand === hand ? 'is-selected' : ''}`}
            type="button"
            key={hand}
            onClick={() => onSelect(hand)}
          >
            {hand}
          </button>
        ))}
      </div>
      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </section>
  )
}

function DoseScreen({
  targetReps,
  targetSets,
  painBefore,
  onChange,
  onPainBeforeChange,
  onBack,
  onNext,
}) {
  const setNumber = (key, value) => {
    onChange({ [key]: Number(value) })
  }

  return (
    <section className="screen setup-screen">
      <div>
        <p className="section-kicker">Step 3 of 3</p>
        <h2>Choose reps and sets.</h2>
      </div>
      <div className="dose-grid">
        <Stepper
          label="Reps per set"
          value={targetReps}
          min={1}
          max={20}
          onChange={(value) => setNumber('targetReps', value)}
        />
        <Stepper
          label="Sets"
          value={targetSets}
          min={1}
          max={5}
          onChange={(value) => setNumber('targetSets', value)}
        />
      </div>
      <PainInput
        label="Pain before exercise"
        value={painBefore}
        onChange={onPainBeforeChange}
        helper="Optional 0-10 self-report. Leave blank to skip."
      />
      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Show Demo" />
    </section>
  )
}

function PainInput({ label, value, onChange, helper }) {
  const inputValue = value ?? ''

  return (
    <label className="pain-input-card">
      <span className="metric-label">{label}</span>
      <input
        type="number"
        min="0"
        max="10"
        step="1"
        value={inputValue}
        placeholder="Optional"
        onChange={(event) => onChange(parsePainValue(event.target.value))}
      />
      <small>{helper}</small>
    </label>
  )
}

function Stepper({ label, value, min, max, onChange }) {
  const decrease = () => onChange(Math.max(min, value - 1))
  const increase = () => onChange(Math.min(max, value + 1))

  return (
    <div className="stepper">
      <span className="metric-label">{label}</span>
      <div className="stepper-row">
        <button type="button" onClick={decrease} aria-label={`Decrease ${label}`}>
          -
        </button>
        <strong>{value}</strong>
        <button type="button" onClick={increase} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  )
}

function NavigationButtons({ onBack, onNext, nextLabel }) {
  return (
    <div className="nav-buttons">
      <button className="secondary-button" type="button" onClick={onBack}>
        Back
      </button>
      <button className="primary-button" type="button" onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  )
}

function SummaryScreen({
  exercise,
  selectedHand,
  targetReps,
  targetSets,
  painBefore,
  calibration,
  summary,
  onRestart,
}) {
  const [painAfter, setPainAfter] = useState(null)
  const completedReps = summary?.completedReps ?? targetReps * targetSets
  const completedSets = summary?.completedSets ?? targetSets
  const durationSeconds = Math.max(1, Math.round((summary?.durationMs ?? 0) / 1000))
  const scoreReport = useMemo(
    () =>
      calculateSessionScores({
        exerciseId: exercise.id,
        calibrationData: calibration,
        sessionMetrics: summary?.sessionMetrics,
        targetReps,
        targetSets,
        completedReps,
        completedSets,
        painBefore,
        painAfter,
      }),
    [
      calibration,
      completedReps,
      completedSets,
      exercise.id,
      painAfter,
      painBefore,
      summary?.sessionMetrics,
      targetReps,
      targetSets,
    ],
  )
  const storedReport = useMemo(
    () => ({
      id: summary?.reportId,
      dateTime: summary?.completedAt,
      exerciseName: exercise.name,
      selectedHand,
      targetReps,
      targetSets,
      completedReps,
      completedSets,
      scores: {
        formAccuracy: scoreReport.formAccuracy,
        rangeAchievement: scoreReport.rangeAchievement,
        temporalControl: scoreReport.temporalControl,
        forceDexterity: scoreReport.forceDexterity,
        compensationSymptom: scoreReport.compensationSymptom,
      },
      finalScore: scoreReport.finalScore,
      painBefore,
      painAfter,
      flags: scoreReport.flags,
      calibrationSnapshot: calibration,
    }),
    [
      calibration,
      completedReps,
      completedSets,
      exercise.name,
      painAfter,
      painBefore,
      scoreReport,
      selectedHand,
      summary?.completedAt,
      summary?.reportId,
      targetReps,
      targetSets,
    ],
  )

  useEffect(() => {
    saveScoreReport(storedReport)
  }, [storedReport])

  return (
    <section className="screen summary-screen">
      <div>
        <p className="section-kicker">Session complete</p>
        <h2>{exercise.name}</h2>
      </div>
      <div className="summary-grid">
        <SummaryMetric label="Exercise" value={exercise.name} />
        <SummaryMetric label="Hand" value={selectedHand} />
        <SummaryMetric label="Reps" value={`${completedReps} / ${targetReps * targetSets}`} />
        <SummaryMetric label="Sets" value={`${completedSets} / ${targetSets}`} />
        <SummaryMetric label="Time" value={`${durationSeconds}s`} />
      </div>
      <PainInput
        label="Pain after exercise"
        value={painAfter}
        onChange={setPainAfter}
        helper="Optional 0-10 self-report. Leave blank to use movement-only symptom estimate."
      />
      <ScoreReport report={scoreReport} />
      <button className="primary-button wide-button" type="button" onClick={onRestart}>
        Start Again
      </button>
    </section>
  )
}

function ScoreReport({ report }) {
  const parameters = [
    ['formAccuracy', report.formAccuracy],
    ['rangeAchievement', report.rangeAchievement],
    ['temporalControl', report.temporalControl],
    ['forceDexterity', report.forceDexterity],
    ['compensationSymptom', report.compensationSymptom],
  ]

  return (
    <section className="score-report" aria-label="Session Score Report">
      <div className="score-report-heading">
        <div>
          <p className="section-kicker">Session Score Report</p>
          <h3>Prototype movement score</h3>
          <p>This prototype score is not medically validated.</p>
        </div>
        <div className="final-score">
          <span>Final Score</span>
          <strong>{report.finalScore} / 100</strong>
          <small>{report.interpretation}</small>
        </div>
      </div>

      <div className="score-card-grid">
        {parameters.map(([key, score]) => {
          const detail = report.parameterDetails[key]

          return (
            <article className="score-card" key={key}>
              <div>
                <span className="metric-label">{detail.label}</span>
                <strong>{score} / 100</strong>
              </div>
              <p>{detail.explanation}</p>
              <small>{detail.suggestion}</small>
            </article>
          )
        })}
      </div>

      {report.flags.length > 0 && (
        <div className="score-flags">
          <span className="metric-label">Flags</span>
          <ul>
            {report.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function parsePainValue(value) {
  if (value === '') {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return null
  }

  return Math.min(10, Math.max(0, parsedValue))
}

function saveScoreReport(report) {
  if (!report.id || typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem('handtrackRehabLastScoreReport', JSON.stringify(report))

  const history = readScoreHistory()
  const existingIndex = history.findIndex((item) => item.id === report.id)
  const nextHistory =
    existingIndex >= 0
      ? history.map((item, index) => (index === existingIndex ? report : item))
      : [...history, report]

  window.localStorage.setItem(
    'handtrackRehabScoreReports',
    JSON.stringify(nextHistory.slice(-20)),
  )
}

function readScoreHistory() {
  try {
    const parsedHistory = JSON.parse(window.localStorage.getItem('handtrackRehabScoreReports'))
    return Array.isArray(parsedHistory) ? parsedHistory : []
  } catch {
    return []
  }
}

function SummaryMetric({ label, value }) {
  return (
    <div className="summary-metric">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App

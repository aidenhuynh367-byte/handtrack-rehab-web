import { useState } from 'react'
import AuthScreen from './components/AuthScreen.jsx'
import CameraTrackingScreen from './components/CameraTrackingScreen.jsx'
import CurrentSessionResult from './components/CurrentSessionResult.jsx'
import DemoScreen from './components/DemoScreen.jsx'
import HandSetupCheckScreen from './components/HandSetupCheckScreen.jsx'
import ProfileSetupScreen from './components/ProfileSetupScreen.jsx'
import ReportsDashboard from './components/ReportsDashboard.jsx'
import { saveSessionReport } from './firebase/sessionReports.js'
import { calculateSessionScores } from './utils/scoringEngine.js'
import { EXERCISES, getExerciseById } from './utils/exercises.js'
import './App.css'

const DEFAULT_PLAN = {
  exerciseId: 'ring-thumb',
  selectedHand: 'Right',
  targetReps: 8,
  targetSets: 2,
}

function App() {
  const [screen, setScreen] = useState('welcome')
  const [plan, setPlan] = useState(DEFAULT_PLAN)
  const [calibration, setCalibration] = useState(null)
  const [sessionAccess, setSessionAccess] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [profileMode, setProfileMode] = useState('initial')
  const [profileReturnScreen, setProfileReturnScreen] = useState('exercise')
  const [reportSaveError, setReportSaveError] = useState('')
  const [currentSessionResult, setCurrentSessionResult] = useState(null)
  const exercise = getExerciseById(plan.exerciseId)
  const isSignedIn = sessionAccess?.mode === 'google' && sessionAccess.user

  const completeSession = async (sessionSummary) => {
    const completedSummary = {
      ...sessionSummary,
      completedAt: new Date().toISOString(),
      reportId: `session-${Date.now()}`,
    }
    const scoreReport = calculateSessionScores({
      exerciseId: exercise.id,
      calibrationData: calibration,
      sessionMetrics: completedSummary.sessionMetrics,
      targetReps: plan.targetReps,
      targetSets: plan.targetSets,
      completedReps: completedSummary.completedReps,
      completedSets: completedSummary.completedSets,
    })
    const scores = scoreReport.sectionScores
    const averageScore = Math.round(
      Object.values(scores).reduce((sum, score) => sum + score, 0) /
        Object.values(scores).length,
    )
    const displayReport = {
      exerciseName: exercise.name,
      exerciseId: exercise.id,
      selectedHand: plan.selectedHand,
      targetReps: plan.targetReps,
      targetSets: plan.targetSets,
      completedReps: completedSummary.completedReps,
      completedSets: completedSummary.completedSets,
      ...scores,
      averageScore,
    }

    // the current result should not depend on Firestore reloading
    setCurrentSessionResult(displayReport)

    if (!isSignedIn) {
      // guests only see the current result
      setScreen('summary')
      return
    }

    setReportSaveError('')
    setScreen('saving-report')

    try {
      // only signed-in users get saved progress
      await saveSessionReport(sessionAccess.user.uid, displayReport)
    } catch {
      setReportSaveError('This session could not be saved. Your older reports are still available.')
    }

    setScreen('reports')
  }

  const startNewSession = () => {
    setCalibration(null)
    setReportSaveError('')
    setCurrentSessionResult(null)
    setScreen('exercise')
  }

  const editProfile = (returnScreen = screen) => {
    setProfileMode('edit')
    setProfileReturnScreen(returnScreen)
    setScreen('profile')
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
          {isSignedIn &&
            !['welcome', 'auth', 'profile', 'reports', 'saving-report'].includes(screen) && (
            <button
              className="header-profile-button"
              type="button"
              onClick={() => editProfile()}
            >
              Edit Profile
            </button>
          )}
          <span className="status-pill">Prototype</span>
          <span className="maker-credit">Made by Aiden H</span>
        </div>
      </div>

      {screen === 'welcome' && <WelcomeScreen onStart={() => setScreen('auth')} />}

      {/* login happens after the intro page so users know what the app is first */}
      {screen === 'auth' && (
        <AuthScreen
          onBack={() => setScreen('welcome')}
          onGoogleComplete={(user, profile) => {
            setSessionAccess({ mode: 'google', user })
            setUserProfile(profile)

            if (profile.profileSetupSeen) {
              setScreen('exercise')
            } else {
              setProfileMode('initial')
              setProfileReturnScreen('exercise')
              setScreen('profile')
            }
          }}
          onGuestContinue={() => {
            setSessionAccess({ mode: 'guest', user: null })
            setUserProfile(null)
            setScreen('exercise')
          }}
        />
      )}

      {screen === 'profile' && isSignedIn && (
        <ProfileSetupScreen
          user={sessionAccess.user}
          profile={userProfile}
          isEditing={profileMode === 'edit'}
          onComplete={(profile) => {
            setUserProfile(profile)
            setScreen(profileReturnScreen)
          }}
          onCancel={() => setScreen(profileReturnScreen)}
        />
      )}

      {screen === 'exercise' && (
        <ExerciseChoiceScreen
          exerciseId={plan.exerciseId}
          onSelect={(exerciseId) => {
            setCalibration(null)
            setPlan((current) => ({ ...current, exerciseId }))
          }}
          onBack={() => setScreen('auth')}
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
          onChange={(dose) => setPlan((current) => ({ ...current, ...dose }))}
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
        <GuestSessionResultScreen
          currentSession={currentSessionResult}
          onStartSession={startNewSession}
        />
      )}

      {screen === 'saving-report' && <SavingReportScreen />}

      {screen === 'reports' && isSignedIn && (
        <ReportsDashboard
          user={sessionAccess.user}
          currentSession={currentSessionResult}
          saveError={reportSaveError}
          onEditProfile={() => editProfile('reports')}
          onStartSession={startNewSession}
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
        Start Session
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
  onChange,
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
      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Show Demo" />
    </section>
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

function GuestSessionResultScreen({ currentSession, onStartSession }) {
  return (
    <section className="screen guest-result-screen">
      {/* guests only see the current result */}
      <CurrentSessionResult report={currentSession} />
      <button className="primary-button wide-button" type="button" onClick={onStartSession}>
        Start New Session
      </button>
    </section>
  )
}

function SavingReportScreen() {
  return (
    <section className="screen saving-report-screen" aria-live="polite">
      <div className="auth-card">
        <p className="section-kicker">Saving progress</p>
        <h2>Saving your session report…</h2>
        <p>Your five score results are being added to your account.</p>
      </div>
    </section>
  )
}

export default App

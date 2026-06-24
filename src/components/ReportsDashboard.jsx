import { useEffect, useState } from 'react'
import {
  deleteAllSessionReports,
  getSessionReports,
} from '../firebase/sessionReports.js'
import CurrentSessionResult from './CurrentSessionResult.jsx'

const SCORE_COLUMNS = [
  ['targetPose', 'Target Pose'],
  ['rangeOfMotion', 'Range Control'],
  ['movementSmoothness', 'Movement Control'],
  ['fingerIsolation', 'Finger Isolation'],
  ['repConsistency', 'Rep Consistency'],
]

function ReportsDashboard({
  user,
  currentSession,
  saveError = '',
  onEditProfile,
  onStartSession,
}) {
  const [reports, setReports] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isActive = true

    getSessionReports(user.uid)
      .then((savedReports) => {
        if (isActive) {
          setReports(savedReports)
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage('Saved sessions could not be loaded. Please try again.')
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [user.uid])

  const deleteReports = async () => {
    const confirmed = window.confirm(
      'Delete all saved session reports? Your profile will be kept.',
    )

    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    setErrorMessage('')

    try {
      await deleteAllSessionReports(user.uid)
      setReports([])
    } catch {
      setErrorMessage('The reports could not be deleted. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className="screen reports-screen">
      <div className="reports-heading">
        <div>
          <p className="section-kicker">Saved progress</p>
          <h2>Session reports</h2>
          <p>{user.displayName ? `${user.displayName}'s sessions` : 'Your saved sessions'}</p>
        </div>
        <div className="reports-actions">
          <button className="secondary-button" type="button" onClick={onEditProfile}>
            Edit Profile
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={deleteReports}
            disabled={isDeleting || reports.length === 0}
          >
            {isDeleting ? 'Deleting…' : 'Delete All Reports'}
          </button>
        </div>
      </div>

      {saveError && (
        <p className="reports-notice error-message" role="alert">
          {saveError}
        </p>
      )}
      {errorMessage && (
        <p className="reports-notice error-message" role="alert">
          {errorMessage}
        </p>
      )}

      {/* the current result should not depend on Firestore reloading */}
      <CurrentSessionResult report={currentSession} />

      <section className="all-time-reports-section" aria-label="All-Time Session Reports">
        <div className="all-time-reports-heading">
          <p className="section-kicker">Saved history</p>
          <h2>All-Time Session Reports</h2>
        </div>

        {/* saved history stays below the current result */}
        <div className="reports-table-wrap">
          {isLoading ? (
            <p className="reports-empty">Loading saved sessions…</p>
          ) : reports.length === 0 ? (
            <p className="reports-empty">No saved sessions yet.</p>
          ) : (
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Exercise</th>
                  <th>Hand</th>
                  {SCORE_COLUMNS.map(([, label]) => (
                    <th key={label}>{label}</th>
                  ))}
                  <th>Average Score</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>{formatReportDate(report.createdAt)}</td>
                    <td>{report.exerciseName}</td>
                    <td>{report.selectedHand}</td>
                    {SCORE_COLUMNS.map(([key]) => (
                      <td key={key}>{formatScore(report[key])}</td>
                    ))}
                    <td className="average-score-cell">
                      {formatScore(report.averageScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <button className="primary-button wide-button" type="button" onClick={onStartSession}>
        Start New Session
      </button>
    </section>
  )
}

function formatReportDate(value) {
  let date

  if (typeof value?.toDate === 'function') {
    date = value.toDate()
  } else if (Number.isFinite(value?.seconds)) {
    date = new Date(value.seconds * 1000)
  } else {
    date = new Date(value)
  }

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatScore(value) {
  return Number.isFinite(value) ? `${Math.round(value)}` : '—'
}

export default ReportsDashboard

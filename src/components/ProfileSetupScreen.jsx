import { useState } from 'react'
import { markProfileSetupSeen, saveUserProfile } from '../firebase/userProfile.js'

const PROFILE_FIELDS = [
  {
    key: 'injuredHand',
    label: 'Injured hand',
    options: ['Left', 'Right', 'Both', 'Not sure'],
  },
  {
    key: 'dominantHand',
    label: 'Dominant hand',
    options: ['Left', 'Right', 'Ambidextrous', 'Not sure'],
  },
  {
    key: 'ageRange',
    label: 'Age range',
    options: ['Under 13', '13–17', '18–29', '30–49', '50–64', '65+'],
  },
  {
    key: 'injuryType',
    label: 'Injury type',
    options: [
      'Finger dislocation',
      'Ligament sprain',
      'Finger fracture',
      'Jammed finger',
      'Unsure',
      'Other',
    ],
  },
  {
    key: 'injuredFinger',
    label: 'Injured finger',
    options: ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky', 'Multiple', 'Not sure'],
  },
]

const EMPTY_PROFILE = Object.fromEntries(PROFILE_FIELDS.map(({ key }) => [key, '']))

function ProfileSetupScreen({
  user,
  profile,
  isEditing = false,
  onComplete,
  onCancel,
}) {
  const [formData, setFormData] = useState(() => ({
    ...EMPTY_PROFILE,
    ...Object.fromEntries(
      PROFILE_FIELDS.map(({ key }) => [key, profile?.[key] ?? '']),
    ),
  }))
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const saveProfile = async () => {
    setIsSaving(true)
    setErrorMessage('')

    try {
      const profileCompleted = Object.values(formData).some(Boolean)
      const nextProfile = {
        ...formData,
        profileSetupSeen: true,
        profileCompleted,
      }

      await saveUserProfile(user.uid, nextProfile)
      onComplete({
        ...profile,
        ...nextProfile,
      })
    } catch {
      setErrorMessage('Your profile could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const skipProfile = async () => {
    setIsSaving(true)
    setErrorMessage('')

    try {
      await markProfileSetupSeen(user.uid)
      onComplete({
        ...profile,
        profileSetupSeen: true,
        profileCompleted: false,
      })
    } catch {
      setErrorMessage('Profile setup could not be skipped. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="screen profile-screen">
      <div className="profile-heading">
        <p className="section-kicker">{isEditing ? 'User profile' : 'Optional setup'}</p>
        <h2>{isEditing ? 'Edit your profile' : 'Tell us a little about your hand'}</h2>
        <p>
          These details are optional and give context to future progress reports.
        </p>
      </div>

      <div className="profile-form">
        {PROFILE_FIELDS.map(({ key, label, options }) => (
          <label className="profile-field" key={key}>
            <span>{label}</span>
            <select
              value={formData[key]}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
              disabled={isSaving}
            >
              <option value="">Select an option</option>
              {options.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {errorMessage && (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="profile-actions">
        <button
          className="primary-button"
          type="button"
          onClick={saveProfile}
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save and Continue'}
        </button>
        {isEditing ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={skipProfile}
            disabled={isSaving}
          >
            Skip for Now
          </button>
        )}
      </div>
    </section>
  )
}

export default ProfileSetupScreen

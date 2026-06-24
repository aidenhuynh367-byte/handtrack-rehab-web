import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { serverTimestamp } from 'firebase/firestore'
import { auth, googleProvider } from '../firebase/firebase.js'
import { getUserProfile, saveUserProfile } from '../firebase/userProfile.js'

function AuthScreen({ onBack, onGoogleComplete, onGuestContinue }) {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const signInWithGoogle = async () => {
    setIsSigningIn(true)
    setErrorMessage('')

    try {
      const credential = await signInWithPopup(auth, googleProvider)
      const { user } = credential
      const existingProfile = await getUserProfile(user.uid)
      const loginProfile = {
        displayName: user.displayName ?? '',
        email: user.email ?? '',
        lastLoginAt: serverTimestamp(),
      }

      if (!existingProfile) {
        // creates the user profile the first time they log in
        loginProfile.createdAt = serverTimestamp()
        loginProfile.profileSetupSeen = false
        loginProfile.profileCompleted = false
      }

      // signed-in users can save progress later
      await saveUserProfile(user.uid, loginProfile)
      onGoogleComplete(user, {
        ...existingProfile,
        displayName: loginProfile.displayName,
        email: loginProfile.email,
        profileSetupSeen: existingProfile?.profileSetupSeen ?? false,
        profileCompleted: existingProfile?.profileCompleted ?? false,
      })
    } catch {
      setErrorMessage('Google sign-in did not complete. Please try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  const continueAsGuest = () => {
    // guest mode keeps testing easy
    onGuestContinue()
  }

  return (
    <section className="screen auth-screen">
      <div className="auth-card">
        <div className="auth-copy">
          <p className="section-kicker">Session access</p>
          <h2>Start your session</h2>
          <p>
            Sign in to save progress across devices, or continue as guest for this device
            only.
          </p>
        </div>

        <div className="auth-actions">
          <button
            className="primary-button"
            type="button"
            onClick={signInWithGoogle}
            disabled={isSigningIn}
          >
            {isSigningIn ? 'Signing in…' : 'Sign in with Google'}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={continueAsGuest}
            disabled={isSigningIn}
          >
            Continue as Guest
          </button>
        </div>

        <small className="auth-note">Guest progress is saved only on this device.</small>
        {errorMessage && (
          <p className="auth-error" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          className="auth-back-button"
          type="button"
          onClick={onBack}
          disabled={isSigningIn}
        >
          Back
        </button>
      </div>
    </section>
  )
}

export default AuthScreen

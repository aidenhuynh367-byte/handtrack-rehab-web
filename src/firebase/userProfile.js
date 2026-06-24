import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'

export async function getUserProfile(uid) {
  const profileSnapshot = await getDoc(doc(db, 'users', uid))

  if (!profileSnapshot.exists()) {
    return null
  }

  return {
    id: profileSnapshot.id,
    ...profileSnapshot.data(),
  }
}

export async function saveUserProfile(uid, profileData) {
  // profile is optional, but it gives context to the scores
  await setDoc(doc(db, 'users', uid), profileData, { merge: true })
}

export async function markProfileSetupSeen(uid) {
  await saveUserProfile(uid, {
    profileSetupSeen: true,
    profileCompleted: false,
  })
}

import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'

export async function saveSessionReport(uid, report) {
  // saves just the score table, not raw movement data
  const reportReference = await addDoc(collection(db, 'users', uid, 'sessions'), {
    createdAt: serverTimestamp(),
    exerciseName: report.exerciseName,
    exerciseId: report.exerciseId,
    selectedHand: report.selectedHand,
    targetReps: report.targetReps,
    targetSets: report.targetSets,
    completedReps: report.completedReps,
    completedSets: report.completedSets,
    targetPose: report.targetPose,
    rangeOfMotion: report.rangeOfMotion,
    movementSmoothness: report.movementSmoothness,
    fingerIsolation: report.fingerIsolation,
    repConsistency: report.repConsistency,
    averageScore: report.averageScore,
  })

  return reportReference.id
}

export async function getSessionReports(uid) {
  // latest session should show first
  const reportsQuery = query(
    collection(db, 'users', uid, 'sessions'),
    orderBy('createdAt', 'desc'),
  )
  const reportsSnapshot = await getDocs(reportsQuery)

  return reportsSnapshot.docs.map((reportDocument) => ({
    id: reportDocument.id,
    ...reportDocument.data(),
  }))
}

export async function deleteAllSessionReports(uid) {
  const reportsSnapshot = await getDocs(collection(db, 'users', uid, 'sessions'))
  const reports = reportsSnapshot.docs

  // delete reports but keep the profile
  for (let startIndex = 0; startIndex < reports.length; startIndex += 500) {
    const batch = writeBatch(db)

    reports.slice(startIndex, startIndex + 500).forEach((reportDocument) => {
      batch.delete(reportDocument.ref)
    })

    await batch.commit()
  }
}

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCa7R9SwQYLNhXY39JzVUF_nBqY-qpM93E",
  authDomain: "handtrack-rehab-web-97a23.firebaseapp.com",
  databaseURL: "https://handtrack-rehab-web-97a23-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "handtrack-rehab-web-97a23",
  storageBucket: "handtrack-rehab-web-97a23.firebasestorage.app",
  messagingSenderId: "890286959840",
  appId: "1:890286959840:web:e1885b910616fdf9167485"
}

// connects this React app to my Firebase project
const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
// used for Google login
export const googleProvider = new GoogleAuthProvider()
// used later for user progress reports
export const db = getFirestore(app)

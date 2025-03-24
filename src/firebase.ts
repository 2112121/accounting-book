// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User,
  GoogleAuthProvider,
  signInWithPopup,
  updatePassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail
} from "firebase/auth";
import { getFirestore, Timestamp } from "firebase/firestore";
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCLzpIyLP_x8JxoAbiCk-CzM3FI3h4a0wk",
  authDomain: "accounting-book-8c886.firebaseapp.com",
  databaseURL: "https://accounting-book-8c886-default-rtdb.firebaseio.com",
  projectId: "accounting-book-8c886",
  storageBucket: "accounting-book-8c886.firebasestorage.app",
  messagingSenderId: "490570054241",
  appId: "1:490570054241:web:050a55fc5205aeb0af0820",
  measurementId: "G-JWV3TVMCWC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const storage = getStorage(app);
const analytics = getAnalytics(app);

export { 
  app, 
  auth, 
  db, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  googleProvider,
  signInWithPopup,
  updatePassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  storage,
  Timestamp,
  fetchSignInMethodsForEmail,
  analytics
};
export type { User }; 
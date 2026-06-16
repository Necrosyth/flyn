import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Firebase configuration using values found in .env.local
// Hardcoding these temporarily to bypass Cloudflare Pages build-time variable propagation issues
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "flyn-94396.firebaseapp.com",
  projectId: "flyn-94396",
  storageBucket: "flyn-94396.firebasestorage.app",
  messagingSenderId: "1490951220",
  appId: "1:1490951220:web:38dc020a093f537fa63e61",
  measurementId: "G-728KK3LCXM"
};

const hasFirebaseConfig = true; // Hardcoded to true as we are providing values directly

// Avoid re-initialization in HMR
export const firebaseApp: FirebaseApp | null = getApps().length 
  ? getApps()[0] 
  : (hasFirebaseConfig ? initializeApp(firebaseConfig) : null);

export const auth: Auth | null = (firebaseApp && hasFirebaseConfig) ? getAuth(firebaseApp) : null;

// Lazily initialize Firestore to avoid "Service firestore is not available" error
let firestoreInstance: Firestore | null = null;
export const getDb = (): Firestore | null => {
  if (firestoreInstance) return firestoreInstance;
  if (firebaseApp && hasFirebaseConfig) {
    try {
      firestoreInstance = getFirestore(firebaseApp);
      return firestoreInstance;
    } catch (error) {
      console.error("Failed to initialize Firestore:", error);
      return null;
    }
  }
  return null;
};

export const db = getDb();

// Initialize Firebase Storage
let storageInstance: FirebaseStorage | null = null;
export const getStorageInstance = (): FirebaseStorage | null => {
  if (storageInstance) return storageInstance;
  if (firebaseApp && hasFirebaseConfig) {
    try {
      storageInstance = getStorage(firebaseApp);
      return storageInstance;
    } catch (error) {
      console.error("Failed to initialize Firebase Storage:", error);
      return null;
    }
  }
  return null;
};

export const storage = getStorageInstance();

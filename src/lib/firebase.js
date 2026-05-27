import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyDoP5eRUm2QfI4fdxQ4cbQJHW8ZSUIiV7Y',
  authDomain: 'atsu-project.firebaseapp.com',
  projectId: 'atsu-project',
  storageBucket: 'atsu-project.firebasestorage.app',
  messagingSenderId: '1050035718460',
  appId: '1:1050035718460:web:5e6088420530ba35e2f639',
  measurementId: 'G-LRWCNBS008',
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || fallbackFirebaseConfig.measurementId,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseEnabled = missing.length === 0;
export const firebaseMissingVars = missing;

export const firebaseApp = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth = firebaseEnabled ? getAuth(firebaseApp) : null;
export const googleProvider = firebaseEnabled ? new GoogleAuthProvider() : null;
export const db = firebaseEnabled ? getFirestore(firebaseApp) : null;
export const storage = firebaseEnabled ? getStorage(firebaseApp) : null;

if (firebaseEnabled && typeof window !== 'undefined') {
  isSupported().then((ok) => {
    if (ok) getAnalytics(firebaseApp);
  }).catch(() => {
    // Analytics not available (e.g. blocked/unsupported runtime)
  });
} else if (!firebaseEnabled && typeof window !== 'undefined') {
  // Do not crash the app if env vars are missing in a deployment.
  console.error(`Missing Firebase env vars: ${firebaseMissingVars.join(', ')}`);
}

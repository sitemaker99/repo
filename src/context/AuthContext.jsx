import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider, firebaseEnabled, firebaseMissingVars } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setLoading(false);
      return () => {};
    }
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        try {
          const { getDoc, doc } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase');
          if (db) {
            const userDoc = await getDoc(doc(db, 'users', nextUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              Object.assign(nextUser, data);
              if (data.anilistToken) {
                localStorage.setItem('anilist_token', data.anilistToken);
              }
            }
          }
        } catch (error) {
          console.error("Error fetching user doc:", error);
        }
      }
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    available: firebaseEnabled,
    missingVars: firebaseMissingVars,
    isAuthenticated: !!user,
    loginWithEmail: async (email, password) => {
      if (!auth) throw new Error('Firebase auth is not configured.');
      return signInWithEmailAndPassword(auth, email, password);
    },
    signupWithEmail: async (email, password, displayName) => {
      if (!auth) throw new Error('Firebase auth is not configured.');
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName?.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      return cred;
    },
    loginWithGoogle: async () => {
      if (!auth || !googleProvider) throw new Error('Google auth is not configured.');
      return signInWithPopup(auth, googleProvider);
    },
    logout: async () => {
      if (!auth) return;
      return signOut(auth);
    },
    resetPassword: async (email) => {
      if (!auth) throw new Error('Firebase auth is not configured.');
      return sendPasswordResetEmail(auth, email);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

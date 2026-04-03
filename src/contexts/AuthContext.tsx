'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase-client';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Handle redirect result on page load
  useEffect(() => {
    getRedirectResult(auth).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          const res = await fetch('/api/auth/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: fbUser.displayName,
              email: fbUser.email,
              avatar: fbUser.photoURL,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          }
        } catch (error) {
          console.error('Failed to sync user:', error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      // Use redirect on production (avoids COOP popup issues on Vercel)
      // Use popup locally for faster dev experience
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        await signInWithPopup(auth, googleProvider);
      } else {
        await signInWithRedirect(auth, googleProvider);
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setFirebaseUser(null);
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!firebaseUser) return null;
    return firebaseUser.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{ user, firebaseUser, loading, signInWithGoogle, signOut, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

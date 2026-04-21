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
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// PERF-05: sessionStorage cache for returning-user short-circuit.
// Tab-scoped (auto-clears on close), 24h TTL, keyed by Firebase UID.
const CACHE_KEY = 'frame_cached_user';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedUserEnvelope {
  uid: string;
  cachedAt: number;
  user: User;
}

function readCachedUser(uid: string): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedUserEnvelope>;
    if (!parsed || typeof parsed.uid !== 'string' || typeof parsed.cachedAt !== 'number' || !parsed.user) {
      return null;
    }
    if (parsed.uid !== uid) return null;
    if (Date.now() - parsed.cachedAt >= CACHE_TTL_MS) return null;
    return parsed.user as User;
  } catch {
    return null;
  }
}

function writeCachedUser(uid: string, user: User) {
  if (typeof window === 'undefined') return;
  try {
    const envelope: CachedUserEnvelope = { uid, cachedAt: Date.now(), user };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
  } catch {}
}

function clearCachedUser() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

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
        // PERF-05: try sessionStorage first. If we have a fresh cached user
        // for this UID, paint immediately and refresh in the background.
        const cached = readCachedUser(fbUser.uid);
        if (cached) {
          setUser(cached);
          setLoading(false);
          // Background refresh — don't block the critical path.
          (async () => {
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
                writeCachedUser(fbUser.uid, data.user);
              } else {
                // Server rejected the session (suspended, revoked, etc).
                // Clear cache and sign out so we don't keep a stale shell.
                const data = await res.json().catch(() => ({} as { error?: string }));
                clearCachedUser();
                try { await firebaseSignOut(auth); } catch {}
                setFirebaseUser(null);
                setUser(null);
                toast.error(data.error || 'Your account is not authorized.');
              }
            } catch (error) {
              // Background refresh failure is non-fatal — the cached user is
              // still valid for the tab session. Log and move on.
              console.warn('Background session refresh failed:', error);
            }
          })();
          return;
        }

        // Cache miss — existing await flow.
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
            writeCachedUser(fbUser.uid, data.user);
          } else {
            // Server refused to establish a session (unauthorized account,
            // suspended, etc). Sign out of Firebase so we don't leave a
            // dangling auth state that would loop on reload.
            const data = await res.json().catch(() => ({} as { error?: string }));
            clearCachedUser();
            await firebaseSignOut(auth);
            setFirebaseUser(null);
            setUser(null);
            toast.error(data.error || 'Your account is not authorized.');
          }
        } catch (error) {
          console.error('Failed to sync user:', error);
          // Network or unexpected error — don't leave a half-authenticated
          // Firebase session lying around.
          clearCachedUser();
          try { await firebaseSignOut(auth); } catch {}
          setFirebaseUser(null);
          setUser(null);
        }
      } else {
        clearCachedUser();
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    clearCachedUser();
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

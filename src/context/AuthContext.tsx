import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  createUserWithEmailAndPassword,
  googleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from '../lib/firebase';
import { apiFetch } from '../lib/api';

export interface AccountProfile {
  targetExam: string;
  targetScore: string;
  examDate: string | null;
  weeklyHours: number;
  nativeLanguage: string;
  bio: string;
  notificationPrefsJson?: {
    email: boolean;
    inApp: boolean;
    studyReminders: boolean;
    aiCompleted: boolean;
  };
}

export interface AccountUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: 'super_admin' | 'admin' | 'org_owner' | 'teacher' | 'team_manager' | 'student';
  organizationId: number | null;
  emailVerified: boolean;
}

export interface NotificationItem {
  id: number;
  category: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface ActiveSubscription {
  subscription: {
    id: number;
    billingCycle: string;
    status: string;
    provider: string;
    currentPeriodEnd: string;
  };
  plan: {
    id: number;
    code: string;
    name: string;
    monthlyPriceUsd: number;
    limitsJson: { dailyPractice: number; dailyAiScoring: number; fullMocksPerMonth: number; seats: number };
  };
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  account: AccountUser | null;
  profile: AccountProfile | null;
  subscription: ActiveSubscription | null;
  notifications: NotificationItem[];
  loading: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  refreshAccount: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [subscription, setSubscription] = useState<ActiveSubscription | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('lexiscore-theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      window.localStorage.setItem('lexiscore-theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('lexiscore-theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!auth.currentUser) {
      setAccount(null);
      setProfile(null);
      setSubscription(null);
      setNotifications([]);
      return;
    }
    try {
      const data = await apiFetch<{
        user: AccountUser;
        profile: AccountProfile | null;
        subscription: ActiveSubscription | null;
        notifications: NotificationItem[];
      }>('/api/me', { requireToken: true });
      setAccount(data.user);
      setProfile(data.profile);
      setSubscription(data.subscription);
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error('Failed to sync account with PostgreSQL:', err);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await refreshAccount();
      } else {
        setAccount(null);
        setProfile(null);
        setSubscription(null);
        setNotifications([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [refreshAccount]);

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleAuthProvider);
    await refreshAccount();
  }, [refreshAccount]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailAndPassword(auth, email, password);
      await refreshAccount();
    },
    [refreshAccount]
  );

  const registerWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (cred.user && name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // Non-blocking verification dispatch
      }
      await refreshAccount();
    },
    [refreshAccount]
  );

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setAccount(null);
    setProfile(null);
    setSubscription(null);
    setNotifications([]);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST', requireToken: true });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        account,
        profile,
        subscription,
        notifications,
        loading,
        darkMode,
        toggleDarkMode,
        refreshAccount,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        logout,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

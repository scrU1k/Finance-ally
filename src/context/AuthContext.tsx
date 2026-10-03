import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { UserProfile, CurrencyCode } from '../types';
import { getStoredUserProfile, createInitialUser, verifyUserPassword, saveUserProfile, changeUserPassword, recoverAppPassword } from '../services/auth';
import { initializeGlobalRecoveryKey, hasGlobalRecoveryKey } from '../services/recoveryService';
import { setAccountCreatedAt } from '../services/localAutoBackupService';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const LOCKOUT_KEY = 'fa_login_lockout';
const LOCKOUT_SEC_KEY = 'fa_login_lockout_sec';
const LOCKOUT_TIERS_MS = [30_000, 120_000, 600_000, 1_800_000]; // 30s, 2m, 10m, 30m

interface LockoutState {
  attempts: number;
  lockedUntil: number; // epoch ms, 0 = not locked
}

function getLockout(): LockoutState {
  try {
    const raw1 = localStorage.getItem(LOCKOUT_KEY);
    const raw2 = sessionStorage.getItem(LOCKOUT_SEC_KEY);
    const s1: LockoutState = raw1 ? JSON.parse(raw1) : { attempts: 0, lockedUntil: 0 };
    const s2: LockoutState = raw2 ? JSON.parse(raw2) : { attempts: 0, lockedUntil: 0 };
    return {
      attempts: Math.max(s1.attempts || 0, s2.attempts || 0),
      lockedUntil: Math.max(s1.lockedUntil || 0, s2.lockedUntil || 0),
    };
  } catch { /* */ }
  return { attempts: 0, lockedUntil: 0 };
}

function saveLockout(state: LockoutState) {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(LOCKOUT_KEY, serialized);
    sessionStorage.setItem(LOCKOUT_SEC_KEY, serialized);
  } catch {}
}

function clearLockout() {
  try {
    localStorage.removeItem(LOCKOUT_KEY);
    sessionStorage.removeItem(LOCKOUT_SEC_KEY);
  } catch {}
}

function computeLockedUntil(attempts: number): number {
  // Lock kicks in after 5 failed attempts
  if (attempts < 5) return 0;
  const tierIndex = Math.min(Math.floor((attempts - 5) / 1), LOCKOUT_TIERS_MS.length - 1);
  return Date.now() + LOCKOUT_TIERS_MS[tierIndex];
}

interface AuthContextType {
  user: UserProfile | null;
  isUnlocked: boolean;
  needsOnboarding: boolean;
  lockoutUntil: number; // epoch ms — 0 means not locked
  failedAttempts: number;
  login: (p: string) => Promise<boolean>;
  logout: () => void;
  onboard: (username: string, password: string, baseCurrency: CurrencyCode) => Promise<void>;
  updateUserCurrency: (currency: CurrencyCode) => void;
  updateUsername: (username: string) => void;
  toggleRequirePassword: (enabled: boolean) => void;
  changePassword: (newPassword: string) => Promise<boolean>;
  recoverPassword: (recoveryKey: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Module-level flag to suppress auto-locking when system dialogs (file pickers/share sheets) are active
let isSystemPickerActive = false;
let systemPickerTimeout: any = null;

export function suppressLockForSystemPicker() {
  isSystemPickerActive = true;
  if (systemPickerTimeout) clearTimeout(systemPickerTimeout);
  systemPickerTimeout = setTimeout(() => {
    isSystemPickerActive = false;
  }, 120_000); // 2-minute safety window for picking files or using share dialogs
}

export function resetSystemPickerBypass() {
  isSystemPickerActive = false;
  if (systemPickerTimeout) clearTimeout(systemPickerTimeout);
}

const INACTIVITY_AUTO_LOCK_MS = 180_000; // 3-minute inactivity threshold for auto-locking
const LAST_ACTIVITY_KEY = 'fa_last_activity_time';
const LAST_BACKGROUND_KEY = 'fa_last_background_time';
const SESSION_UNLOCKED_KEY = 'fa_session_unlocked';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUserProfile());
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(() => !getStoredUserProfile());
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const existing = getStoredUserProfile();
    if (!existing) return false;
    // Password protection is required by default unless explicitly disabled
    if (existing.requirePassword === false) return true;

    // Check if the current in-memory process session was previously unlocked
    const isSessionActive = sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';
    if (!isSessionActive) {
      return false; // Cold start / process killed from RAM -> prompt password
    }

    // App is still in memory: verify whether the 3-minute grace period has elapsed
    const now = Date.now();
    try {
      const bgRaw = localStorage.getItem(LAST_BACKGROUND_KEY);
      if (bgRaw) {
        const bgTime = parseInt(bgRaw, 10);
        if (now - bgTime >= INACTIVITY_AUTO_LOCK_MS) {
          sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
          return false;
        }
      }
      const actRaw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
      if (actRaw) {
        const actTime = parseInt(actRaw, 10);
        if (now - actTime >= INACTIVITY_AUTO_LOCK_MS) {
          sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
          return false;
        }
      }
    } catch {}

    // Process is still in memory and within the 3-minute inactivity window -> remain logged in
    return true;
  });

  // Lockout state — initialize from persisted storage
  const [lockoutState, setLockoutState] = useState<LockoutState>(() => getLockout());

  // Ref tracking last user interaction timestamp in foreground
  const lastActivityRef = useRef<number>(Date.now());

  // Inactivity auto-lock and background/foreground handler
  useEffect(() => {
    // Update activity timestamp on user interaction
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      try {
        sessionStorage.setItem(LAST_ACTIVITY_KEY, lastActivityRef.current.toString());
      } catch {}
    };

    // User interaction listeners
    window.addEventListener('pointerdown', updateActivity, { passive: true });
    window.addEventListener('keydown', updateActivity, { passive: true });
    window.addEventListener('touchstart', updateActivity, { passive: true });
    window.addEventListener('scroll', updateActivity, { passive: true });
    window.addEventListener('wheel', updateActivity, { passive: true });

    // Handle backgrounding
    const handleBackground = () => {
      if (isSystemPickerActive) return;
      const now = Date.now();
      lastActivityRef.current = now;
      try {
        localStorage.setItem(LAST_BACKGROUND_KEY, now.toString());
      } catch {}
    };

    // Handle returning to foreground
    const handleForeground = () => {
      if (isSystemPickerActive) {
        try {
          localStorage.removeItem(LAST_BACKGROUND_KEY);
        } catch {}
        return;
      }

      const stored = getStoredUserProfile();
      if (!stored || stored.requirePassword === false) {
        try {
          localStorage.removeItem(LAST_BACKGROUND_KEY);
        } catch {}
        return;
      }

      const now = Date.now();
      let shouldLock = false;

      // Check time spent in background
      try {
        const bgRaw = localStorage.getItem(LAST_BACKGROUND_KEY);
        if (bgRaw) {
          const bgTime = parseInt(bgRaw, 10);
          if (now - bgTime >= INACTIVITY_AUTO_LOCK_MS) {
            shouldLock = true;
          }
        }
      } catch {}

      // Also check time since last user activity
      if (now - lastActivityRef.current >= INACTIVITY_AUTO_LOCK_MS) {
        shouldLock = true;
      }

      try {
        localStorage.removeItem(LAST_BACKGROUND_KEY);
      } catch {}

      if (shouldLock) {
        try {
          sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
        } catch {}
        setIsUnlocked(false);
      } else {
        lastActivityRef.current = now;
      }
    };

    // 1. Capacitor Native App Lifecycle Listener (Android / iOS)
    let appStateListener: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          handleBackground();
        } else {
          handleForeground();
        }
      }).then(handle => {
        appStateListener = handle;
      }).catch(err => {
        console.warn('Failed to register Capacitor appStateChange listener:', err);
      });
    }

    // 2. Web / Browser Visibility Change Listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleBackground();
      } else if (document.visibilityState === 'visible') {
        handleForeground();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Foreground Inactivity Auto-Lock Timer (Checks every 4 seconds)
    const inactivityInterval = setInterval(() => {
      if (isSystemPickerActive) return;
      const stored = getStoredUserProfile();
      if (!stored || stored.requirePassword === false) return;

      const idle = Date.now() - lastActivityRef.current;
      if (idle >= INACTIVITY_AUTO_LOCK_MS) {
        try {
          sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
        } catch {}
        setIsUnlocked(false);
      }
    }, 4000);

    return () => {
      window.removeEventListener('pointerdown', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      window.removeEventListener('wheel', updateActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(inactivityInterval);
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, []);

  const login = async (password: string): Promise<boolean> => {
    // Check if currently locked out
    const now = Date.now();
    if (lockoutState.lockedUntil > now) {
      return false; // Still locked
    }

    const success = await verifyUserPassword(password);

    if (success) {
      setIsUnlocked(true);
      lastActivityRef.current = Date.now();
      try {
        sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
        sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
        localStorage.removeItem(LAST_BACKGROUND_KEY);
      } catch {}
      // Clear lockout on success
      clearLockout();
      setLockoutState({ attempts: 0, lockedUntil: 0 });
    } else {
      const newAttempts = lockoutState.attempts + 1;
      const lockedUntil = computeLockedUntil(newAttempts);
      const newState = { attempts: newAttempts, lockedUntil };
      saveLockout(newState);
      setLockoutState(newState);

      // Exponential backoff delay on consecutive failures (e.g., 400ms, 800ms, 1600ms, max 3000ms)
      const penaltyMs = Math.min(400 * Math.pow(2, Math.min(newAttempts - 1, 3)), 3000);
      await new Promise(resolve => setTimeout(resolve, penaltyMs));
    }

    return success;
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    } catch {}
    setIsUnlocked(false);
  };

  const onboard = async (username: string, password: string, baseCurrency: CurrencyCode) => {
    const newUser = await createInitialUser(username, password, baseCurrency);
    await initializeGlobalRecoveryKey(username);
    setAccountCreatedAt(Date.now());
    setUser(newUser);
    setNeedsOnboarding(false);
    try {
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      localStorage.removeItem(LAST_BACKGROUND_KEY);
    } catch {}
    setIsUnlocked(true);
  };

  const updateUserCurrency = (currency: CurrencyCode) => {
    if (user) {
      const updated = { ...user, baseCurrency: currency };
      setUser(updated);
      saveUserProfile(updated);
    }
  };

  const updateUsername = (username: string) => {
    if (user) {
      const clean = username.trim() || 'My Account';
      const updated = { ...user, username: clean };
      setUser(updated);
      saveUserProfile(updated);
    }
  };

  const toggleRequirePassword = (enabled: boolean) => {
    if (user) {
      const updated = { ...user, requirePassword: enabled };
      setUser(updated);
      saveUserProfile(updated);
      try {
        if (enabled) {
          sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
        } else {
          sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
        }
      } catch {}
      setIsUnlocked(!enabled);
    }
  };

  const changePassword = async (newPassword: string): Promise<boolean> => {
    const ok = await changeUserPassword(newPassword);
    if (ok) {
      const existing = getStoredUserProfile();
      if (existing) setUser(existing);
    }
    return ok;
  };

  const recoverPassword = async (recoveryKey: string, newPassword: string): Promise<boolean> => {
    const ok = await recoverAppPassword(recoveryKey, newPassword);
    if (ok) {
      clearLockout();
      setLockoutState({ attempts: 0, lockedUntil: 0 });
      const existing = getStoredUserProfile();
      if (existing) setUser(existing);
      setIsUnlocked(true);
    }
    return ok;
  };

  return (
    <AuthContext.Provider value={{ user, isUnlocked, needsOnboarding, lockoutUntil: lockoutState.lockedUntil, failedAttempts: lockoutState.attempts, login, logout, onboard, updateUserCurrency, updateUsername, toggleRequirePassword, changePassword, recoverPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

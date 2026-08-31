import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, CurrencyCode } from '../types';
import { getStoredUserProfile, createInitialUser, verifyUserPassword, saveUserProfile, changeUserPassword } from '../services/auth';
import { setAccountCreatedAt } from '../services/localAutoBackupService';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const LOCKOUT_KEY = 'fa_login_lockout';
const LOCKOUT_TIERS_MS = [30_000, 120_000, 600_000, 1_800_000]; // 30s, 2m, 10m, 30m

interface LockoutState {
  attempts: number;
  lockedUntil: number; // epoch ms, 0 = not locked
}

function getLockout(): LockoutState {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return { attempts: 0, lockedUntil: 0 };
}

function saveLockout(state: LockoutState) {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
}

function clearLockout() {
  localStorage.removeItem(LOCKOUT_KEY);
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

const BACKGROUND_LOCK_GRACE_PERIOD_MS = 180_000; // 3-minute grace period for switching apps in memory
let lastBackgroundTimestamp: number | null = null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUserProfile());
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(() => !getStoredUserProfile());
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const existing = getStoredUserProfile();
    if (!existing) return false;
    // Password protection is required by default unless explicitly disabled
    return existing.requirePassword === false;
  });

  // Lockout state — initialize from persisted storage
  const [lockoutState, setLockoutState] = useState<LockoutState>(() => getLockout());

  // Listen for App Background / Foreground events (Capacitor native & Web visibilitychange)
  useEffect(() => {
    const handleBackground = () => {
      if (isSystemPickerActive) return;
      lastBackgroundTimestamp = Date.now();
    };

    const handleForeground = () => {
      if (isSystemPickerActive) {
        lastBackgroundTimestamp = null;
        return;
      }

      const stored = getStoredUserProfile();
      if (!stored || stored.requirePassword === false) {
        lastBackgroundTimestamp = null;
        return;
      }

      if (lastBackgroundTimestamp !== null) {
        const elapsed = Date.now() - lastBackgroundTimestamp;
        // Lock only if minimized for 3 minutes (180,000 ms) or longer
        if (elapsed >= BACKGROUND_LOCK_GRACE_PERIOD_MS) {
          setIsUnlocked(false);
        }
        lastBackgroundTimestamp = null;
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

    return () => {
      if (appStateListener) {
        appStateListener.remove();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      // Clear lockout on success
      clearLockout();
      setLockoutState({ attempts: 0, lockedUntil: 0 });
    } else {
      const newAttempts = lockoutState.attempts + 1;
      const lockedUntil = computeLockedUntil(newAttempts);
      const newState = { attempts: newAttempts, lockedUntil };
      saveLockout(newState);
      setLockoutState(newState);
    }

    return success;
  };

  const logout = () => {
    setIsUnlocked(false);
  };

  const onboard = async (username: string, password: string, baseCurrency: CurrencyCode) => {
    const newUser = await createInitialUser(username, password, baseCurrency);
    setAccountCreatedAt(Date.now());
    setUser(newUser);
    setNeedsOnboarding(false);
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

  return (
    <AuthContext.Provider value={{ user, isUnlocked, needsOnboarding, lockoutUntil: lockoutState.lockedUntil, failedAttempts: lockoutState.attempts, login, logout, onboard, updateUserCurrency, updateUsername, toggleRequirePassword, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

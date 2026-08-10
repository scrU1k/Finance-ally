import React, { createContext, useContext, useState } from 'react';
import { UserProfile, CurrencyCode } from '../types';
import { getStoredUserProfile, createInitialUser, verifyUserPassword, saveUserProfile, changeUserPassword } from '../services/auth';
import { setAccountCreatedAt } from '../services/localAutoBackupService';

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
  toggleRequirePassword: (enabled: boolean) => void;
  changePassword: (newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUserProfile());
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(() => !getStoredUserProfile());
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const existing = getStoredUserProfile();
    if (!existing) return false;
    return existing.requirePassword !== true;
  });

  // Lockout state — initialize from persisted storage
  const [lockoutState, setLockoutState] = useState<LockoutState>(() => getLockout());

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
    <AuthContext.Provider value={{ user, isUnlocked, needsOnboarding, lockoutUntil: lockoutState.lockedUntil, failedAttempts: lockoutState.attempts, login, logout, onboard, updateUserCurrency, toggleRequirePassword, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

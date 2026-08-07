import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, CurrencyCode } from '../types';
import { getStoredUserProfile, createInitialUser, verifyUserPassword, saveUserProfile, changeUserPassword } from '../services/auth';

interface AuthContextType {
  user: UserProfile | null;
  isUnlocked: boolean;
  needsOnboarding: boolean;
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
    return existing ? (existing.requirePassword === false) : false;
  });

  // Keep a small effect to listen for any external changes if needed, but synchronous setup prevents flashing.
  useEffect(() => {
    const existing = getStoredUserProfile();
    if (!existing) {
      setNeedsOnboarding(true);
    } else {
      setUser(existing);
      setNeedsOnboarding(false);
    }
  }, []);

  const login = async (password: string): Promise<boolean> => {
    const success = await verifyUserPassword(password);
    if (success) {
      setIsUnlocked(true);
    }
    return success;
  };

  const logout = () => {
    setIsUnlocked(false);
  };

  const onboard = async (username: string, password: string, baseCurrency: CurrencyCode) => {
    const newUser = await createInitialUser(username, password, baseCurrency);
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
      if (!enabled) setIsUnlocked(true);
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
    <AuthContext.Provider value={{ user, isUnlocked, needsOnboarding, login, logout, onboard, updateUserCurrency, toggleRequirePassword, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

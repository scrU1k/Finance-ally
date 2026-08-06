import { UserProfile, CurrencyCode } from '../types';

const USER_KEY = 'fa_user_profile';
const SALT = 'FinanceAllyLocalSalt2026';

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getStoredUserProfile(): UserProfile | null {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export async function createInitialUser(username: string, password: string, baseCurrency: CurrencyCode): Promise<UserProfile> {
  const passwordHash = await hashPassword(password);
  const profile: UserProfile = {
    username,
    passwordHash,
    baseCurrency,
    theme: 'dotgui-dark',
    fontFamily: 'geist',
    monthlyBudget: 3000,
    isUnlocked: true,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
  return profile;
}

export async function verifyUserPassword(password: string): Promise<boolean> {
  const profile = getStoredUserProfile();
  if (!profile) return false;
  const hash = await hashPassword(password);
  return hash === profile.passwordHash;
}

export async function changeUserPassword(newPassword: string): Promise<boolean> {
  const profile = getStoredUserProfile();
  if (!profile) return false;
  const hash = await hashPassword(newPassword);
  profile.passwordHash = hash;
  saveUserProfile(profile);
  return true;
}

export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
}

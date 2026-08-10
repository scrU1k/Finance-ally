import { UserProfile, CurrencyCode } from '../types';

const USER_KEY = 'fa_user_profile';

// Generate new PBKDF2 hash and random salt
async function createPasswordHashAndSalt(password: string): Promise<{ hash: string, salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
  const saltBase64 = btoa(String.fromCharCode(...salt));
  
  return { hash: hashBase64, salt: saltBase64 };
}

// Verify against an existing PBKDF2 salt
async function verifyPasswordWithSalt(password: string, storedHash: string, storedSaltBase64: string): Promise<boolean> {
  const salt = Uint8Array.from(atob(storedSaltBase64), c => c.charCodeAt(0));
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
  return hashBase64 === storedHash;
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
  const { hash: passwordHash, salt: passwordSalt } = await createPasswordHashAndSalt(password);
  
  const profile: UserProfile = {
    username,
    passwordHash,
    passwordSalt,
    baseCurrency,
    theme: 'dotgui-dark',
    fontFamily: 'geist',
    monthlyBudget: 3000,
    requirePassword: true,
    isUnlocked: true,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
  return profile;
}

export async function verifyUserPassword(password: string): Promise<boolean> {
  const profile = getStoredUserProfile();
  if (!profile) return false;
  
  if (profile.passwordSalt) {
    return await verifyPasswordWithSalt(password, profile.passwordHash, profile.passwordSalt);
  }
  
  return false;
}

export async function changeUserPassword(newPassword: string): Promise<boolean> {
  const profile = getStoredUserProfile();
  if (!profile) return false;
  
  const { hash: newHash, salt: newSalt } = await createPasswordHashAndSalt(newPassword);
  profile.passwordHash = newHash;
  profile.passwordSalt = newSalt;
  saveUserProfile(profile);
  return true;
}

export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
}

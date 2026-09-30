import { UserProfile, CurrencyCode } from '../types';
import { openDatabase } from './db';
import { hashPasswordArgon2id } from './kdfService';

const USER_KEY = 'fa_user_profile';

// Generate new Argon2id hash and random salt
async function createPasswordHashAndSalt(password: string): Promise<{ hash: string, salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasswordArgon2id(password, salt);
  const saltBase64 = btoa(String.fromCharCode(...salt));
  return { hash, salt: saltBase64 };
}

// Legacy PBKDF2 verification for seamless profile migration
async function verifyLegacyPbkdf2Password(password: string, storedHash: string, storedSaltBase64: string): Promise<boolean> {
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
    kdf: 'argon2id',
  };
  saveUserProfile(profile);
  return profile;
}

export async function verifyUserPassword(password: string): Promise<boolean> {
  const profile = getStoredUserProfile();
  if (!profile || !profile.passwordSalt) return false;

  const salt = Uint8Array.from(atob(profile.passwordSalt), c => c.charCodeAt(0));

  // Modern Argon2id verification
  if (profile.kdf === 'argon2id') {
    const computedHash = await hashPasswordArgon2id(password, salt);
    return computedHash === profile.passwordHash;
  }

  // Legacy PBKDF2 path + Seamless auto-upgrade to Argon2id
  const isLegacyValid = await verifyLegacyPbkdf2Password(password, profile.passwordHash, profile.passwordSalt);
  if (isLegacyValid) {
    // Automatically upgrade this user profile to Argon2id
    const { hash: newHash, salt: newSalt } = await createPasswordHashAndSalt(password);
    profile.passwordHash = newHash;
    profile.passwordSalt = newSalt;
    profile.kdf = 'argon2id';
    saveUserProfile(profile);
    return true;
  }

  return false;
}

export async function changeUserPassword(newPassword: string): Promise<boolean> {
  const profile = getStoredUserProfile();
  if (!profile) return false;
  
  const { hash: newHash, salt: newSalt } = await createPasswordHashAndSalt(newPassword);
  profile.passwordHash = newHash;
  profile.passwordSalt = newSalt;
  profile.kdf = 'argon2id';
  saveUserProfile(profile);
  return true;
}

export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
  saveUserProfileToIDB(profile).catch(() => {});
}

export async function saveUserProfileToIDB(profile: UserProfile): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('userProfile', 'readwrite');
      const store = tx.objectStore('userProfile');
      store.put(profile);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IDB saveUserProfile failed:', e);
  }
}

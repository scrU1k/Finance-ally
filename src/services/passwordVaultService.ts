import { PasswordVaultItem, DecryptedPasswordCard, PasswordVaultEnvelope } from '../types';

const ITEMS_KEY = 'fa_password_vault_items';
const ENVELOPE_KEY = 'fa_password_vault_envelope';
const VERIFIER_KEY = 'fa_pwd_vault_verifier';
const FAILED_ATTEMPTS_KEY = 'fa_pwd_vault_failed_attempts';
const LOCKOUT_UNTIL_KEY = 'fa_pwd_vault_lockout_until';
const MAGIC_STRING = 'FA_VAULT_OK';

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPassword(password: string, pin: string): Promise<{ cipherText: string; iv: string; salt: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const enc = new TextEncoder();
  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    enc.encode(password)
  );
  return {
    cipherText: bufferToHex(encryptedBuf),
    iv: bufferToHex(iv.buffer),
    salt: bufferToHex(salt.buffer)
  };
}

export async function decryptPassword(cipherText: string, ivHex: string, saltHex: string, pin: string): Promise<string> {
  const salt = hexToBuffer(saltHex);
  const iv = hexToBuffer(ivHex);
  const encryptedBuf = hexToBuffer(cipherText);
  const key = await deriveKey(pin, salt);
  const decryptedBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encryptedBuf.buffer as ArrayBuffer
  );
  const dec = new TextDecoder();
  return dec.decode(decryptedBuf);
}

// ─── INTEGRITY & CHECKSUM ───────────────────────────────────────────────────

export async function calculateVaultChecksum(items: PasswordVaultItem[]): Promise<string> {
  const str = items.map(i => i.encryptedBlob || i.encryptedPassword || i.id).join('|');
  const enc = new TextEncoder();
  const hashBuf = await window.crypto.subtle.digest('SHA-256', enc.encode(str));
  return bufferToHex(hashBuf);
}

export function getStoredPasswordEnvelope(): PasswordVaultEnvelope {
  try {
    const rawEnv = localStorage.getItem(ENVELOPE_KEY);
    if (rawEnv) {
      return JSON.parse(rawEnv);
    }
    // Fallback migration from raw items key
    const rawItems = localStorage.getItem(ITEMS_KEY);
    const items: PasswordVaultItem[] = rawItems ? JSON.parse(rawItems) : [];
    return {
      version: '2.1',
      checksum: 'uncalculated',
      items
    };
  } catch {
    return { version: '2.1', checksum: 'none', items: [] };
  }
}

export async function savePasswordEnvelope(items: PasswordVaultItem[]): Promise<void> {
  const checksum = await calculateVaultChecksum(items);
  const envelope: PasswordVaultEnvelope = {
    version: '2.1',
    checksum,
    items
  };
  localStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export async function verifyVaultIntegrity(): Promise<boolean> {
  try {
    const env = getStoredPasswordEnvelope();
    if (!env.items || env.checksum === 'uncalculated') return true;
    const computed = await calculateVaultChecksum(env.items);
    return computed === env.checksum;
  } catch {
    return false;
  }
}

// ─── MASTER PIN & FAILED ATTEMPT THROTTLING ───────────────────────────────

export function hasMasterPin(): boolean {
  return !!localStorage.getItem(VERIFIER_KEY);
}

export function getLockoutStatus(): { isLockedOut: boolean; remainingSeconds: number; attemptsCount: number } {
  const attempts = parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0', 10);
  const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_UNTIL_KEY) || '0', 10);
  const now = Date.now();

  if (lockoutUntil > now) {
    const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
    return { isLockedOut: true, remainingSeconds, attemptsCount: attempts };
  }

  return { isLockedOut: false, remainingSeconds: 0, attemptsCount: attempts };
}

export function recordFailedPinAttempt(): { isLockedOut: boolean; remainingSeconds: number; attemptsCount: number } {
  let attempts = parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0', 10) + 1;
  localStorage.setItem(FAILED_ATTEMPTS_KEY, attempts.toString());

  let lockoutMs = 0;
  if (attempts >= 10) {
    lockoutMs = 300000; // 5 minutes lockout after 10 failed attempts
  } else if (attempts >= 5) {
    lockoutMs = 30000; // 30 seconds delay after 5 failed attempts
  }

  if (lockoutMs > 0) {
    const lockoutUntil = Date.now() + lockoutMs;
    localStorage.setItem(LOCKOUT_UNTIL_KEY, lockoutUntil.toString());
    return { isLockedOut: true, remainingSeconds: Math.ceil(lockoutMs / 1000), attemptsCount: attempts };
  }

  return { isLockedOut: false, remainingSeconds: 0, attemptsCount: attempts };
}

export function resetFailedPinAttempts(): void {
  localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_UNTIL_KEY);
}

export async function setMasterPin(pin: string): Promise<boolean> {
  try {
    const verifier = await encryptPassword(MAGIC_STRING, pin);
    localStorage.setItem(VERIFIER_KEY, JSON.stringify(verifier));
    resetFailedPinAttempts();
    return true;
  } catch (e) {
    console.error('Failed to set master pin:', e);
    return false;
  }
}

export async function verifyMasterPin(pin: string): Promise<boolean> {
  const lockout = getLockoutStatus();
  if (lockout.isLockedOut) {
    return false;
  }

  try {
    const raw = localStorage.getItem(VERIFIER_KEY);
    if (!raw) return false;
    const { cipherText, iv, salt } = JSON.parse(raw);
    const decrypted = await decryptPassword(cipherText, iv, salt, pin);
    const isValid = decrypted === MAGIC_STRING;

    if (isValid) {
      resetFailedPinAttempts();
      return true;
    } else {
      recordFailedPinAttempt();
      return false;
    }
  } catch {
    recordFailedPinAttempt();
    return false;
  }
}

// ─── FULL OBJECT ENCRYPTION & DECRYPTION ─────────────────────────────────

export async function encryptCardPayload(
  card: DecryptedPasswordCard,
  pin: string
): Promise<PasswordVaultItem> {
  const payloadStr = JSON.stringify(card);
  const enc = await encryptPassword(payloadStr, pin);
  return {
    id: card.id,
    serviceName: card.serviceName,
    encryptedBlob: enc.cipherText,
    iv: enc.iv,
    salt: enc.salt,
    updatedAt: new Date().toISOString()
  };
}

export async function decryptCardPayload(
  item: PasswordVaultItem,
  pin: string
): Promise<DecryptedPasswordCard> {
  // Legacy decrypt fallback if old structure
  if (!item.encryptedBlob && item.encryptedPassword) {
    const password = await decryptPassword(item.encryptedPassword, item.iv, item.salt, pin);
    return {
      id: item.id,
      serviceName: item.serviceName || 'Service',
      username: item.username,
      password,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString()
    };
  }

  const jsonStr = await decryptPassword(item.encryptedBlob, item.iv, item.salt, pin);
  return JSON.parse(jsonStr);
}

export function getStoredPasswordItems(): PasswordVaultItem[] {
  const env = getStoredPasswordEnvelope();
  return env.items || [];
}

export async function savePasswordItem(
  serviceName: string,
  username: string | undefined,
  rawPassword: string,
  pin: string
): Promise<PasswordVaultItem> {
  const id = `pwd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const card: DecryptedPasswordCard = {
    id,
    serviceName: serviceName.trim(),
    username: username?.trim() || undefined,
    password: rawPassword,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const encryptedItem = await encryptCardPayload(card, pin);
  const existing = getStoredPasswordItems();
  const updated = [encryptedItem, ...existing];
  await savePasswordEnvelope(updated);
  return encryptedItem;
}

export async function updatePasswordItem(
  id: string,
  serviceName: string,
  username: string | undefined,
  rawPassword: string | undefined,
  pin: string
): Promise<boolean> {
  const existing = getStoredPasswordItems();
  const itemIndex = existing.findIndex(i => i.id === id);
  if (itemIndex === -1) return false;

  const currentItem = existing[itemIndex];
  let currentCard: DecryptedPasswordCard;

  try {
    currentCard = await decryptCardPayload(currentItem, pin);
  } catch {
    currentCard = {
      id,
      serviceName: currentItem.serviceName || serviceName,
      username: currentItem.username || username,
      password: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const updatedCard: DecryptedPasswordCard = {
    ...currentCard,
    serviceName: serviceName.trim(),
    username: username?.trim() || undefined,
    password: rawPassword && rawPassword.trim().length > 0 ? rawPassword : currentCard.password,
    updatedAt: new Date().toISOString()
  };

  const reEncrypted = await encryptCardPayload(updatedCard, pin);
  existing[itemIndex] = reEncrypted;
  await savePasswordEnvelope(existing);
  return true;
}

export async function deletePasswordItem(id: string): Promise<void> {
  const existing = getStoredPasswordItems();
  const filtered = existing.filter(i => i.id !== id);
  await savePasswordEnvelope(filtered);
}

export async function deleteMultiplePasswordItems(ids: string[]): Promise<void> {
  const set = new Set(ids);
  const existing = getStoredPasswordItems();
  const filtered = existing.filter(i => !set.has(i.id));
  await savePasswordEnvelope(filtered);
}

export async function savePasswordItemsOrder(orderedItems: PasswordVaultItem[]): Promise<void> {
  await savePasswordEnvelope(orderedItems);
}

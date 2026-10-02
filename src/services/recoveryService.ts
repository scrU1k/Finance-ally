import { hashPasswordArgon2id } from './kdfService';

const VERIFIER_KEY = 'fa_global_recovery_verifier';
const ENCRYPTED_KEY_STORAGE = 'fa_global_recovery_escrow_key';

// Helper: buffer to base64 with chunking (stack safe)
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Helper: base64 to buffer
function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const binStr = atob(b64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

/**
 * Normalizes recovery key format: trimmed, uppercase prefix, case-preserved or upper
 */
export function normalizeRecoveryKey(raw: string): string {
  return raw.trim();
}

/**
 * Generates a high-entropy 12-character recovery key with username prefix:
 * e.g. JOH-a1b2-c3d4-e5f6
 */
export function generateRecoveryKey(username: string): string {
  const cleanName = username.replace(/[^a-zA-Z0-9]/g, '');
  const prefix = (cleanName.substring(0, 3) || 'USR').toUpperCase().padEnd(3, 'X');
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const chars = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${chars.substring(0, 4)}-${chars.substring(4, 8)}-${chars.substring(8, 12)}`;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from a recovery key using PBKDF2
 */
export async function deriveKeyFromRecovery(recoveryKey: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const normKey = normalizeRecoveryKey(recoveryKey);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(normKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Checks if a Global Recovery Key has been initialized
 */
export function hasGlobalRecoveryKey(): boolean {
  return !!localStorage.getItem(VERIFIER_KEY);
}

/**
 * Sets up and stores the verifier hash for a recovery key
 */
export async function setGlobalRecoveryKeyVerifier(recoveryKey: string): Promise<void> {
  const normKey = normalizeRecoveryKey(recoveryKey);
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const hash = await hashPasswordArgon2id(normKey, salt);
  const stored = {
    hash,
    salt: bufToBase64(salt.buffer as ArrayBuffer)
  };
  localStorage.setItem(VERIFIER_KEY, JSON.stringify(stored));
}

/**
 * Verifies if an entered recovery key matches the stored verifier
 */
export async function verifyGlobalRecoveryKey(enteredKey: string): Promise<boolean> {
  const raw = localStorage.getItem(VERIFIER_KEY);
  if (!raw) return false;
  try {
    const { hash, salt } = JSON.parse(raw);
    const saltBuf = base64ToBuf(salt);
    const computed = await hashPasswordArgon2id(normalizeRecoveryKey(enteredKey), saltBuf);
    return computed === hash;
  } catch {
    return false;
  }
}

/**
 * Encrypts an arbitrary string payload (like the vault PIN or backup key) using the Recovery Key
 */
export async function encryptPayloadWithRecovery(
  payload: string,
  recoveryKey: string
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const key = await deriveKeyFromRecovery(recoveryKey, salt);
  const enc = new TextEncoder();
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(payload)
  );

  return {
    ciphertext: bufToBase64(encryptedBuf),
    iv: bufToBase64(iv.buffer as ArrayBuffer),
    salt: bufToBase64(salt.buffer as ArrayBuffer)
  };
}

/**
 * Decrypts a payload previously encrypted with the Recovery Key
 */
export async function decryptPayloadWithRecovery(
  encrypted: { ciphertext: string; iv: string; salt: string },
  recoveryKey: string
): Promise<string> {
  const salt = base64ToBuf(encrypted.salt);
  const iv = base64ToBuf(encrypted.iv);
  const data = base64ToBuf(encrypted.ciphertext);
  const key = await deriveKeyFromRecovery(recoveryKey, salt);

  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decryptedBuf);
}

/**
 * Stores an encrypted copy of the recovery key protected by the user's password,
 * allowing the user to view their recovery key in Settings after verifying their password.
 */
export async function storeRecoveryKeyForViewing(recoveryKey: string, userPassword: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(userPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const encBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(recoveryKey)
  );

  const bundle = {
    ciphertext: bufToBase64(encBuf),
    iv: bufToBase64(iv.buffer as ArrayBuffer),
    salt: bufToBase64(salt.buffer as ArrayBuffer)
  };
  localStorage.setItem(ENCRYPTED_KEY_STORAGE, JSON.stringify(bundle));
}

/**
 * Attempts to decrypt and reveal the recovery key by providing the user's password.
 */
export async function revealRecoveryKeyWithPassword(userPassword: string): Promise<string | null> {
  const raw = localStorage.getItem(ENCRYPTED_KEY_STORAGE);
  if (!raw) return null;
  try {
    const { ciphertext, iv, salt } = JSON.parse(raw);
    const saltBuf = base64ToBuf(salt);
    const ivBuf = base64ToBuf(iv);
    const dataBuf = base64ToBuf(ciphertext);

    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(userPassword),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuf, iterations: 100_000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const decBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuf },
      aesKey,
      dataBuf
    );
    return new TextDecoder().decode(decBuf);
  } catch {
    return null; // Incorrect password
  }
}

/**
 * Creates and registers a new Global Recovery Key
 */
export async function initializeGlobalRecoveryKey(username: string, userPassword?: string): Promise<string> {
  const key = generateRecoveryKey(username);
  await setGlobalRecoveryKeyVerifier(key);
  if (userPassword) {
    await storeRecoveryKeyForViewing(key, userPassword);
  }
  return key;
}

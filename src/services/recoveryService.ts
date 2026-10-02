import { hashPasswordArgon2id } from './kdfService';

const VERIFIER_KEY = 'fa_global_recovery_verifier';

// Clean up any legacy escrow key storage if it ever existed
try {
  localStorage.removeItem('fa_global_recovery_escrow_key');
} catch {}

// Helper: buffer to base64 with chunking (stack safe)
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 1024;
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
 * Normalizes recovery key format: trimmed, uppercase prefix
 */
export function normalizeRecoveryKey(raw: string): string {
  return raw.trim();
}

/**
 * Generates a high-entropy 16-character full Base-62 recovery key with username prefix:
 * e.g. JOH-k7B2-9xLm-4PqR-v8Tw
 * This key is shown ONCE to the user and NEVER saved in plaintext or reversible form on the device.
 */
export function generateRecoveryKey(username: string): string {
  const cleanName = username.replace(/[^a-zA-Z0-9]/g, '');
  const prefix = (cleanName.substring(0, 3) || 'USR').toUpperCase().padEnd(3, 'X');
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);
  let keyChars = '';
  let i = 0;
  while (keyChars.length < 16) {
    if (i >= rand.length) {
      crypto.getRandomValues(rand);
      i = 0;
    }
    const b = rand[i++];
    if (b < 248) { // 248 = 62 * 4, completely eliminates modulo bias
      keyChars += charset[b % 62];
    }
  }
  return `${prefix}-${keyChars.substring(0, 4)}-${keyChars.substring(4, 8)}-${keyChars.substring(8, 12)}-${keyChars.substring(12, 16)}`;
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
 * Checks if a Global Recovery Key has been initialized (i.e. verifier hash exists)
 */
export function hasGlobalRecoveryKey(): boolean {
  return !!localStorage.getItem(VERIFIER_KEY);
}

/**
 * Sets up and stores only the one-way Argon2id verifier hash for a recovery key.
 * The recovery key itself is never stored.
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
 * Verifies if an entered recovery key matches the stored Argon2id verifier
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
 * Generates and initializes a new Global Recovery Key, saves its verifier hash,
 * and returns the key so it can be presented ONCE to the user.
 */
export async function initializeGlobalRecoveryKey(username: string): Promise<string> {
  const key = generateRecoveryKey(username);
  await setGlobalRecoveryKeyVerifier(key);
  return key;
}

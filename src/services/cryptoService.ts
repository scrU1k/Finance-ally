/**
 * cryptoService.ts
 * AES-256-GCM backup encryption via built-in Web Crypto API.
 * No external dependencies required.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12;   // bytes (96-bit IV for GCM)

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypts a plaintext string with AES-256-GCM using PBKDF2 key derivation from pin. */
export async function encryptJSON(plaintext: string, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
  const iv   = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const key  = await deriveKey(pin, salt);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return JSON.stringify({
    _fa_encrypted: true,
    encrypted: bufToBase64(cipherBuf),
    iv:        bufToBase64(iv.buffer as ArrayBuffer),
    salt:      bufToBase64(salt.buffer as ArrayBuffer),
  });
}

/** Decrypts an encrypted payload string. Throws on wrong PIN or corrupt data. */
export async function decryptJSON(encryptedString: string, pin: string): Promise<string> {
  const parsed = JSON.parse(encryptedString);
  if (!parsed._fa_encrypted) {
    // Already plain JSON — return as-is
    return encryptedString;
  }

  const salt = base64ToBuf(parsed.salt);
  const iv   = base64ToBuf(parsed.iv);
  const data = base64ToBuf(parsed.encrypted);
  const key  = await deriveKey(pin, salt);

  const decBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decBuf);
}

/** Returns true if the given JSON string is an FA encrypted payload. */
export function isEncryptedBackup(jsonString: string): boolean {
  try {
    const p = JSON.parse(jsonString);
    return !!p._fa_encrypted;
  } catch {
    return false;
  }
}

// ── PIN management (stored in localStorage, hashed with PBKDF2) ───────────────

const PIN_KEY = 'fa_export_pin';

// Version flag distinguishes legacy SHA-256 from upgraded PBKDF2 entries
interface StoredPin {
  hash: string;
  salt: string;
  v?: 2; // v=2 means PBKDF2; absent means legacy SHA-256
}

async function pbkdf2HashPin(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bufToBase64(derivedBits);
}

async function hashPinForStorage(pin: string): Promise<StoredPin> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
  const hash = await pbkdf2HashPin(pin, salt);
  return { hash, salt: bufToBase64(salt.buffer as ArrayBuffer), v: 2 };
}

export async function saveExportPin(pin: string): Promise<void> {
  const stored = await hashPinForStorage(pin);
  localStorage.setItem(PIN_KEY, JSON.stringify(stored));
}

export async function verifyExportPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) return false;
  try {
    const stored: StoredPin = JSON.parse(raw);

    if (stored.v === 2) {
      // Modern PBKDF2 path
      const salt = base64ToBuf(stored.salt) as Uint8Array<ArrayBuffer>;
      const hash = await pbkdf2HashPin(pin, salt);
      return hash === stored.hash;
    } else {
      // Legacy SHA-256 path — verify, then silently migrate to PBKDF2
      const enc = new TextEncoder();
      const legacyData = enc.encode(pin + stored.salt + 'FA_BACKUP_SALT_2026');
      const legacyHashBuf = await crypto.subtle.digest('SHA-256', legacyData);
      const isMatch = bufToBase64(legacyHashBuf) === stored.hash;
      if (isMatch) {
        // Migrate: re-hash with PBKDF2 and save
        const upgraded = await hashPinForStorage(pin);
        localStorage.setItem(PIN_KEY, JSON.stringify(upgraded));
      }
      return isMatch;
    }
  } catch {
    return false;
  }
}

export function hasExportPin(): boolean {
  return !!localStorage.getItem(PIN_KEY);
}

export function clearExportPin(): void {
  localStorage.removeItem(PIN_KEY);
}

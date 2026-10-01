/**
 * cryptoService.ts
 * Asymmetric Hybrid Crypto Engine (v4) for Finance-Ally backups.
 * Utilizes RSA-OAEP for asymmetric key transport, AES-256-GCM for bulk encryption,
 * and Argon2id WebAssembly for memory-hard PIN key derivation.
 * 
 * Supports backward compatibility for v3 (PBKDF2 Hybrid) while discarding obsolete v1 and v2.
 */

import { deriveKeyArgon2id } from './kdfService';

const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12;   // bytes (96-bit IV for GCM)
const PIN_KEY = 'fa_export_pin';

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

// ─── LEGACY PBKDF2 KEY DERIVATION (FOR V3 RESTORE ONLY) ─────────────────────────

async function deriveKeyPbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
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

// ─── HYBRID CRYPTO TYPES ───────────────────────────────────────────────────────

export interface EncryptedPrivateKey {
  ciphertext: string; // base64
  iv: string;         // base64
  salt: string;       // base64
}

export interface HybridCryptoBundle {
  _fa_encrypted_v2?: true; // v3 legacy tag
  _fa_encrypted_v3?: true; // v4 modern tag
  v?: 3 | 4;
  kdf?: 'argon2id' | 'pbkdf2';
  encryptedPayload: string;     // base64 (AES-GCM of JSON)
  payloadIv: string;            // base64
  encryptedDek: string;         // base64 (RSA-OAEP of AES key)
  encryptedPrivateKey: EncryptedPrivateKey; // Allows portability to other devices
}

export interface StoredHybridKeys {
  v: 3 | 4; // v=3: PBKDF2 hybrid, v=4: Argon2id hybrid
  kdf?: 'argon2id' | 'pbkdf2';
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: EncryptedPrivateKey;
  encryptedPrivateKeyRecovery?: EncryptedPrivateKey; // Encrypted with Recovery Key (AES-GCM from PBKDF2 of Recovery Key string)
}

// ─── KEY MANAGEMENT ────────────────────────────────────────────────────────────

export async function generateRecoveryKey(username: string): Promise<string> {
  const prefix = (username.substring(0, 3) || 'USR').toUpperCase();
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const chars = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${chars.substring(0,4)}-${chars.substring(4,8)}-${chars.substring(8,12)}`;
}

export async function setupExportPin(pin: string, username: string): Promise<string> {
  // 1. Generate RSA-OAEP Key Pair (2048-bit)
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );

  // 2. Export Keys
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  // 3. Encrypt Private Key with PIN via Argon2id (AES-256-GCM)
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const aesKey = await deriveKeyArgon2id(pin, salt);

  const encryptedPrivateKeyBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    privateKeyPkcs8
  );

  const encryptedPrivateKey: EncryptedPrivateKey = {
    ciphertext: bufToBase64(encryptedPrivateKeyBuf),
    iv: bufToBase64(iv.buffer as ArrayBuffer),
    salt: bufToBase64(salt.buffer as ArrayBuffer)
  };

  // 4. Encrypt Private Key with Recovery Key via PBKDF2 (AES-256-GCM)
  const recoveryKey = await generateRecoveryKey(username);
  const rSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
  const rIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const rAesKey = await deriveKeyPbkdf2(recoveryKey, rSalt);
  
  const rEncryptedPrivateKeyBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: rIv },
    rAesKey,
    privateKeyPkcs8
  );

  const encryptedPrivateKeyRecovery: EncryptedPrivateKey = {
    ciphertext: bufToBase64(rEncryptedPrivateKeyBuf),
    iv: bufToBase64(rIv.buffer as ArrayBuffer),
    salt: bufToBase64(rSalt.buffer as ArrayBuffer)
  };

  // 5. Save to localStorage with v: 4 (Argon2id)
  const stored: StoredHybridKeys = {
    v: 4,
    kdf: 'argon2id',
    publicKeyJwk,
    encryptedPrivateKey,
    encryptedPrivateKeyRecovery
  };
  localStorage.setItem(PIN_KEY, JSON.stringify(stored));
  return recoveryKey;
}

export async function changeExportPin(oldPin: string, newPin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) throw new Error('No existing PIN configuration found.');
  const stored: StoredHybridKeys = JSON.parse(raw);

  // Verify and decrypt with old PIN
  const { encryptedPrivateKey } = stored;
  const salt = base64ToBuf(encryptedPrivateKey.salt);
  const iv = base64ToBuf(encryptedPrivateKey.iv);
  const data = base64ToBuf(encryptedPrivateKey.ciphertext);
  
  const isArgon2id = stored.v === 4 || stored.kdf === 'argon2id';
  const aesKey = isArgon2id ? await deriveKeyArgon2id(oldPin, salt) : await deriveKeyPbkdf2(oldPin, salt);

  let privateKeyPkcs8: ArrayBuffer;
  try {
    privateKeyPkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
  } catch {
    return false; // Wrong old PIN
  }

  // Re-encrypt with new PIN
  const newSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
  const newIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const newAesKey = await deriveKeyArgon2id(newPin, newSalt);
  const newEncryptedPrivateKeyBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv }, newAesKey, privateKeyPkcs8);

  stored.encryptedPrivateKey = {
    ciphertext: bufToBase64(newEncryptedPrivateKeyBuf),
    iv: bufToBase64(newIv.buffer as ArrayBuffer),
    salt: bufToBase64(newSalt.buffer as ArrayBuffer)
  };
  
  // Ensure upgraded to v4 if it was v3
  stored.v = 4;
  stored.kdf = 'argon2id';
  localStorage.setItem(PIN_KEY, JSON.stringify(stored));
  return true;
}

export async function recoverExportPin(recoveryKey: string, newPin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) throw new Error('No existing PIN configuration found.');
  const stored: StoredHybridKeys = JSON.parse(raw);
  
  if (!stored.encryptedPrivateKeyRecovery) {
    throw new Error('No recovery key configuration exists for this vault.');
  }

  // Verify and decrypt with Recovery Key
  const rSalt = base64ToBuf(stored.encryptedPrivateKeyRecovery.salt);
  const rIv = base64ToBuf(stored.encryptedPrivateKeyRecovery.iv);
  const rData = base64ToBuf(stored.encryptedPrivateKeyRecovery.ciphertext);
  const rAesKey = await deriveKeyPbkdf2(recoveryKey, rSalt);

  let privateKeyPkcs8: ArrayBuffer;
  try {
    privateKeyPkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rIv }, rAesKey, rData);
  } catch {
    return false; // Wrong recovery key
  }

  // Re-encrypt with new PIN
  const newSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
  const newIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const newAesKey = await deriveKeyArgon2id(newPin, newSalt);
  const newEncryptedPrivateKeyBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv }, newAesKey, privateKeyPkcs8);

  stored.encryptedPrivateKey = {
    ciphertext: bufToBase64(newEncryptedPrivateKeyBuf),
    iv: bufToBase64(newIv.buffer as ArrayBuffer),
    salt: bufToBase64(newSalt.buffer as ArrayBuffer)
  };
  
  stored.v = 4;
  stored.kdf = 'argon2id';
  localStorage.setItem(PIN_KEY, JSON.stringify(stored));
  return true;
}

export async function resetExportPin(pin: string, username: string): Promise<string> {
  return setupExportPin(pin, username);
}

export async function verifyExportPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) return false;
  try {
    const stored: StoredHybridKeys = JSON.parse(raw);

    // v4 Verification (Argon2id)
    if (stored.v === 4 || stored.kdf === 'argon2id') {
      const { encryptedPrivateKey } = stored;
      const salt = base64ToBuf(encryptedPrivateKey.salt);
      const iv = base64ToBuf(encryptedPrivateKey.iv);
      const data = base64ToBuf(encryptedPrivateKey.ciphertext);
      const aesKey = await deriveKeyArgon2id(pin, salt);

      try {
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
        return true;
      } catch {
        return false;
      }
    }

    // v3 Verification (PBKDF2 Hybrid) + Auto-upgrade to v4
    if (stored.v === 3) {
      const { encryptedPrivateKey } = stored;
      const salt = base64ToBuf(encryptedPrivateKey.salt);
      const iv = base64ToBuf(encryptedPrivateKey.iv);
      const data = base64ToBuf(encryptedPrivateKey.ciphertext);
      const aesKey = await deriveKeyPbkdf2(pin, salt);

      try {
        const decryptedPkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
        // Successfully verified, seamlessly upgrade stored key to Argon2id
        const newSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
        const newIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
        const newAesKey = await deriveKeyArgon2id(pin, newSalt);
        const newEncryptedBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv }, newAesKey, decryptedPkcs8);
        const upgraded: StoredHybridKeys = {
          v: 4,
          kdf: 'argon2id',
          publicKeyJwk: stored.publicKeyJwk,
          encryptedPrivateKey: {
            ciphertext: bufToBase64(newEncryptedBuf),
            iv: bufToBase64(newIv.buffer as ArrayBuffer),
            salt: bufToBase64(newSalt.buffer as ArrayBuffer)
          }
        };
        localStorage.setItem(PIN_KEY, JSON.stringify(upgraded));
        return true;
      } catch {
        return false;
      }
    }

    return false;
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

export function getStoredHybridKeys(): StoredHybridKeys | null {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (stored.v === 3 || stored.v === 4) return stored as StoredHybridKeys;
    return null;
  } catch {
    return null;
  }
}

// ─── HYBRID ENCRYPTION & DECRYPTION ──────────────────────────────────────────

/** Encrypts data using Hybrid Cryptography (Argon2id + RSA-OAEP + AES-256-GCM) */
export async function encryptHybridJSON(plaintext: string): Promise<string> {
  const storedKeys = getStoredHybridKeys();
  if (!storedKeys) {
    throw new Error('Hybrid keys not found. Please set a backup PIN first.');
  }

  // 1. Import RSA Public Key
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    storedKeys.publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  // 2. Generate Random AES-256-GCM Data Encryption Key (DEK)
  const dek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // 3. Encrypt the JSON Payload with DEK
  const enc = new TextEncoder();
  const payloadIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encryptedPayloadBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: payloadIv },
    dek,
    enc.encode(plaintext)
  );

  // 4. Export DEK and Encrypt it with RSA Public Key
  const dekRaw = await crypto.subtle.exportKey('raw', dek);
  const encryptedDekBuf = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    dekRaw
  );

  // 5. Package and Return (Tagged as v4 Argon2id)
  const bundle: HybridCryptoBundle = {
    _fa_encrypted_v3: true,
    v: 4,
    kdf: 'argon2id',
    encryptedPayload: bufToBase64(encryptedPayloadBuf),
    payloadIv: bufToBase64(payloadIv.buffer as ArrayBuffer),
    encryptedDek: bufToBase64(encryptedDekBuf),
    encryptedPrivateKey: storedKeys.encryptedPrivateKey
  };

  return JSON.stringify(bundle);
}

/** Decrypts Hybrid JSON: handles modern v4 (Argon2id) and legacy v3 (PBKDF2 Hybrid). */
export async function decryptJSON(encryptedString: string, pin: string): Promise<string> {
  const parsed = JSON.parse(encryptedString);
  if (!parsed._fa_encrypted_v2 && !parsed._fa_encrypted_v3) {
    return encryptedString;
  }

  const bundle = parsed as HybridCryptoBundle;
  const isArgon2id = bundle._fa_encrypted_v3 || bundle.v === 4 || bundle.kdf === 'argon2id';

  // 1. Decrypt Private Key using PIN (Argon2id for v4, PBKDF2 for v3)
  const privSalt = base64ToBuf(bundle.encryptedPrivateKey.salt);
  const privIv = base64ToBuf(bundle.encryptedPrivateKey.iv);
  const privData = base64ToBuf(bundle.encryptedPrivateKey.ciphertext);
  
  const pinKey = isArgon2id
    ? await deriveKeyArgon2id(pin, privSalt)
    : await deriveKeyPbkdf2(pin, privSalt);
  
  let privateKeyPkcs8: ArrayBuffer;
  try {
    privateKeyPkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: privIv }, pinKey, privData);
  } catch {
    throw new Error('Incorrect PIN (Failed to decrypt private key)');
  }

  // 2. Import Private Key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyPkcs8,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );

  // 3. Decrypt DEK using Private Key
  const encryptedDek = base64ToBuf(bundle.encryptedDek);
  let dekRaw: ArrayBuffer;
  try {
    dekRaw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedDek);
  } catch {
    throw new Error('Corrupt backup file (Failed to decrypt DEK)');
  }

  // 4. Import DEK and Decrypt Payload
  const dek = await crypto.subtle.importKey(
    'raw',
    dekRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const encryptedPayload = base64ToBuf(bundle.encryptedPayload);
  const payloadIv = base64ToBuf(bundle.payloadIv);
  const payloadBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: payloadIv }, dek, encryptedPayload);

  return new TextDecoder().decode(payloadBuf);
}

export function isEncryptedBackup(jsonString: string): boolean {
  try {
    const p = JSON.parse(jsonString);
    return !!p._fa_encrypted_v2 || !!p._fa_encrypted_v3;
  } catch {
    return false;
  }
}

export async function encryptJSON(plaintext: string, _pin: string): Promise<string> {
  return encryptHybridJSON(plaintext);
}

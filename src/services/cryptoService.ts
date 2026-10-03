/**
 * cryptoService.ts
 * Asymmetric Hybrid Crypto Engine (v4) for Finance-Ally backups.
 * Utilizes RSA-OAEP for asymmetric key transport, AES-256-GCM for bulk encryption,
 * and Argon2id WebAssembly for memory-hard PIN key derivation.
 * 
 * Supports backward compatibility for v3 (PBKDF2 Hybrid) while discarding obsolete v1 and v2.
 */

import { deriveKeyArgon2id } from './kdfService';
import { verifyGlobalRecoveryKey } from './recoveryService';

const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12;   // bytes (96-bit IV for GCM)
const PIN_KEY = 'fa_export_pin';

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 1024; // 1024-byte safe chunk to completely prevent 'Maximum call stack size exceeded' on Android WebView
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const binStr = atob(b64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
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
  compressed?: 'gzip';
  encryptedPayload: string;     // base64 (AES-GCM of JSON)
  payloadIv: string;            // base64
  encryptedDek: string;         // base64 (RSA-OAEP of AES key)
  encryptedPrivateKey: EncryptedPrivateKey; // Allows portability to other devices
}

export async function compressGzip(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof CompressionStream === 'undefined') {
    return data as Uint8Array<ArrayBuffer>;
  }
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  await writer.write(data as any);
  await writer.close();
  const response = new Response(cs.readable);
  const ab = await response.arrayBuffer();
  return new Uint8Array(ab) as Uint8Array<ArrayBuffer>;
}

export async function decompressGzip(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === 'undefined') {
    return data as Uint8Array<ArrayBuffer>;
  }
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  await writer.write(data as any);
  await writer.close();
  const response = new Response(ds.readable);
  const ab = await response.arrayBuffer();
  return new Uint8Array(ab) as Uint8Array<ArrayBuffer>;
}

export function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export interface StoredHybridKeys {
  v: 3 | 4; // v=3: PBKDF2 hybrid, v=4: Argon2id hybrid
  kdf?: 'argon2id' | 'pbkdf2';
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: EncryptedPrivateKey;
  encryptedPrivateKeyRecovery?: EncryptedPrivateKey; // Encrypted with Recovery Key (AES-GCM from PBKDF2 of Recovery Key string)
}

// ─── KEY MANAGEMENT ────────────────────────────────────────────────────────────

export { generateRecoveryKey } from './recoveryService';

export async function setupExportPin(pin: string, username: string, providedRecoveryKey?: string): Promise<string> {
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

  // 4. Encrypt Private Key with Recovery Key if provided, or preserve existing recovery escrow
  let encryptedPrivateKeyRecovery: EncryptedPrivateKey | undefined = undefined;

  if (providedRecoveryKey) {
    const rSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
    const rIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
    const rAesKey = await deriveKeyPbkdf2(providedRecoveryKey, rSalt);
    
    const rEncryptedPrivateKeyBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: rIv },
      rAesKey,
      privateKeyPkcs8
    );

    encryptedPrivateKeyRecovery = {
      ciphertext: bufToBase64(rEncryptedPrivateKeyBuf),
      iv: bufToBase64(rIv.buffer as ArrayBuffer),
      salt: bufToBase64(rSalt.buffer as ArrayBuffer)
    };
  } else {
    // Preserve existing recovery escrow if present from previous setup
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (raw) {
        const existing: StoredHybridKeys = JSON.parse(raw);
        if (existing.encryptedPrivateKeyRecovery) {
          encryptedPrivateKeyRecovery = existing.encryptedPrivateKeyRecovery;
        }
      }
    } catch {}
  }

  // 5. Save to localStorage with v: 4 (Argon2id)
  const stored: StoredHybridKeys = {
    v: 4,
    kdf: 'argon2id',
    publicKeyJwk,
    encryptedPrivateKey,
    ...(encryptedPrivateKeyRecovery ? { encryptedPrivateKeyRecovery } : {})
  };
  localStorage.setItem(PIN_KEY, JSON.stringify(stored));
  return providedRecoveryKey || '';
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

export async function recoverExportPin(recoveryKey: string, newPin: string, username: string = 'USER'): Promise<boolean> {
  const isKeyValid = await verifyGlobalRecoveryKey(recoveryKey.trim());
  if (!isKeyValid) {
    return false;
  }

  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) {
    await setupExportPin(newPin, username, recoveryKey);
    return true;
  }
  const stored: StoredHybridKeys = JSON.parse(raw);
  
  if (stored.encryptedPrivateKeyRecovery) {
    try {
      const rSalt = base64ToBuf(stored.encryptedPrivateKeyRecovery.salt);
      const rIv = base64ToBuf(stored.encryptedPrivateKeyRecovery.iv);
      const rData = base64ToBuf(stored.encryptedPrivateKeyRecovery.ciphertext);
      const rAesKey = await deriveKeyPbkdf2(recoveryKey.trim(), rSalt);

      const privateKeyPkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rIv }, rAesKey, rData);

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
    } catch {
      // If decryption with this key didn't match the specific escrow, proceed to reset with verified master key
    }
  }

  // Recovery Key is globally valid -> allow resetting export PIN and keys
  await setupExportPin(newPin, username, recoveryKey);
  return true;
}

export async function resetExportPin(pin: string, username: string, providedRecoveryKey?: string): Promise<string> {
  return setupExportPin(pin, username, providedRecoveryKey);
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
export async function encryptHybridJSON(plaintext: string, compress = false): Promise<string> {
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

  // 3. Encrypt the JSON Payload with DEK (optional lossless gzip compression before encryption)
  const enc = new TextEncoder();
  let payloadBytes = enc.encode(plaintext) as Uint8Array<ArrayBuffer>;
  let isCompressed = false;
  if (compress) {
    try {
      payloadBytes = await compressGzip(payloadBytes);
      isCompressed = true;
    } catch (e) {
      console.warn('Gzip compression failed, saving uncompressed:', e);
    }
  }

  const payloadIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encryptedPayloadBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: payloadIv },
    dek,
    payloadBytes
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
    compressed: isCompressed ? 'gzip' : undefined,
    encryptedPayload: bufToBase64(encryptedPayloadBuf),
    payloadIv: bufToBase64(payloadIv.buffer as ArrayBuffer),
    encryptedDek: bufToBase64(encryptedDekBuf),
    encryptedPrivateKey: storedKeys.encryptedPrivateKey
  };

  return JSON.stringify(bundle);
}

/** Decrypts Hybrid JSON: handles modern v4 (Argon2id) and legacy v3 (PBKDF2 Hybrid). */
export async function decryptJSON(encryptedString: string, pin: string): Promise<string> {
  let parsed: any;
  try {
    parsed = JSON.parse(encryptedString);
  } catch {
    throw new Error('Corrupt backup file: Malformed or invalid JSON syntax.');
  }

  if (!parsed || (!parsed._fa_encrypted_v2 && !parsed._fa_encrypted_v3)) {
    return encryptedString;
  }

  const bundle = parsed as HybridCryptoBundle;
  const isArgon2id = bundle._fa_encrypted_v3 || bundle.v === 4 || bundle.kdf === 'argon2id';

  if (!bundle.encryptedPrivateKey || !bundle.encryptedDek || !bundle.encryptedPayload) {
    throw new Error('Corrupt backup file: Missing essential cryptographic headers or payload.');
  }

  // 1. Decrypt Private Key using PIN (Argon2id for v4, PBKDF2 for v3)
  let privSalt: Uint8Array<ArrayBuffer>;
  let privIv: Uint8Array<ArrayBuffer>;
  let privData: Uint8Array<ArrayBuffer>;
  try {
    privSalt = base64ToBuf(bundle.encryptedPrivateKey.salt);
    privIv = base64ToBuf(bundle.encryptedPrivateKey.iv);
    privData = base64ToBuf(bundle.encryptedPrivateKey.ciphertext);
  } catch {
    throw new Error('Corrupt backup file: Malformed private key encoding.');
  }
  
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
  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyPkcs8,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
  } catch {
    throw new Error('Corrupt backup file: Invalid private key structure.');
  }

  // 3. Decrypt DEK using Private Key
  let encryptedDek: Uint8Array<ArrayBuffer>;
  try {
    encryptedDek = base64ToBuf(bundle.encryptedDek);
  } catch {
    throw new Error('Corrupt backup file: Malformed DEK encoding.');
  }

  let dekRaw: ArrayBuffer;
  try {
    dekRaw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedDek);
  } catch {
    throw new Error('Corrupt backup file: Failed to decrypt DEK.');
  }

  // 4. Import DEK and Decrypt Payload
  let dek: CryptoKey;
  try {
    dek = await crypto.subtle.importKey(
      'raw',
      dekRaw,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  } catch {
    throw new Error('Corrupt backup file: Malformed DEK key.');
  }

  let encryptedPayload: Uint8Array<ArrayBuffer>;
  let payloadIv: Uint8Array<ArrayBuffer>;
  try {
    encryptedPayload = base64ToBuf(bundle.encryptedPayload);
    payloadIv = base64ToBuf(bundle.payloadIv);
  } catch {
    throw new Error('Corrupt backup file: Malformed payload encoding.');
  }

  let payloadBuf: ArrayBuffer;
  try {
    payloadBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: payloadIv }, dek, encryptedPayload);
  } catch {
    throw new Error('Backup file is corrupted or has been tampered with (AES-GCM integrity check failed).');
  }

  let rawBytes = new Uint8Array(payloadBuf) as Uint8Array<ArrayBuffer>;
  if (bundle.compressed === 'gzip' || isGzipBytes(rawBytes)) {
    try {
      rawBytes = await decompressGzip(rawBytes);
    } catch {
      throw new Error('Corrupt backup file: Failed to decompress gzip payload.');
    }
  }

  try {
    return new TextDecoder().decode(rawBytes);
  } catch {
    throw new Error('Corrupt backup file: Failed to decode UTF-8 payload.');
  }
}

export function isEncryptedBackup(jsonString: string): boolean {
  try {
    const p = JSON.parse(jsonString);
    return !!p._fa_encrypted_v2 || !!p._fa_encrypted_v3;
  } catch {
    return false;
  }
}

export async function encryptJSON(plaintext: string, _pin: string, compress = false): Promise<string> {
  return encryptHybridJSON(plaintext, compress);
}

/**
 * cryptoService.ts
 * Asymmetric Hybrid Crypto Engine (v2) for Finance-Ally backups.
 * Utilizes RSA-OAEP for asymmetric key transport and AES-256-GCM for bulk encryption.
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

// ─── AES KEY DERIVATION FROM PIN ──────────────────────────────────────────────

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

// ─── HYBRID CRYPTO ENGINE ─────────────────────────────────────────────────────

export interface EncryptedPrivateKey {
  ciphertext: string; // base64
  iv: string;         // base64
  salt: string;       // base64
}

export interface HybridCryptoBundle {
  _fa_encrypted_v2: true;
  encryptedPayload: string;     // base64 (AES-GCM of JSON)
  payloadIv: string;            // base64
  encryptedDek: string;         // base64 (RSA-OAEP of AES key)
  encryptedPrivateKey: EncryptedPrivateKey; // Allows portability to other devices
}

const PIN_KEY = 'fa_export_pin';

export interface StoredHybridKeys {
  v: 3; // v=3 means Hybrid Crypto
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: EncryptedPrivateKey;
}

// --- Key Management ---

export async function saveExportPin(pin: string): Promise<void> {
  // 1. Generate RSA-OAEP Key Pair
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

  // 3. Encrypt Private Key with PIN (AES-GCM)
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const aesKey = await deriveKey(pin, salt);

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

  // 4. Save to localStorage
  const stored: StoredHybridKeys = {
    v: 3,
    publicKeyJwk,
    encryptedPrivateKey
  };
  localStorage.setItem(PIN_KEY, JSON.stringify(stored));
}

export async function verifyExportPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_KEY);
  if (!raw) return false;
  try {
    const stored = JSON.parse(raw);
    
    // Legacy v2 verification (PBKDF2 hash only)
    if (stored.v === 2) {
      const salt = base64ToBuf(stored.salt) as Uint8Array<ArrayBuffer>;
      const hash = await pbkdf2HashPin(pin, salt);
      return hash === stored.hash;
    }

    // Hybrid v3 verification (Decrypt private key)
    if (stored.v === 3) {
      const { encryptedPrivateKey } = stored as StoredHybridKeys;
      const salt = base64ToBuf(encryptedPrivateKey.salt);
      const iv = base64ToBuf(encryptedPrivateKey.iv);
      const data = base64ToBuf(encryptedPrivateKey.ciphertext);
      const aesKey = await deriveKey(pin, salt);

      try {
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
        return true; // Successfully decrypted private key
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
    if (stored.v === 3) return stored as StoredHybridKeys;
    return null;
  } catch {
    return null;
  }
}

// ─── HYBRID ENCRYPTION & DECRYPTION ──────────────────────────────────────────

/** Encrypts data using Hybrid Cryptography. Requires Hybrid Keys to be set. */
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

  // 5. Package and Return
  const bundle: HybridCryptoBundle = {
    _fa_encrypted_v2: true,
    encryptedPayload: bufToBase64(encryptedPayloadBuf),
    payloadIv: bufToBase64(payloadIv.buffer as ArrayBuffer),
    encryptedDek: bufToBase64(encryptedDekBuf),
    encryptedPrivateKey: storedKeys.encryptedPrivateKey
  };

  return JSON.stringify(bundle);
}

/** Legacy PBKDF2 hash (used for v2 fallback) */
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

/** Decrypts Hybrid JSON (v2) or Legacy JSON (v1). */
export async function decryptJSON(encryptedString: string, pin: string): Promise<string> {
  const parsed = JSON.parse(encryptedString);
  if (!parsed._fa_encrypted && !parsed._fa_encrypted_v2) {
    return encryptedString;
  }

  // Handle Legacy v1 (Symmetric Only)
  if (parsed._fa_encrypted) {
    const salt = base64ToBuf(parsed.salt);
    const iv   = base64ToBuf(parsed.iv);
    const data = base64ToBuf(parsed.encrypted);
    const key  = await deriveKey(pin, salt);
    const decBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decBuf);
  }

  // Handle Hybrid v2
  if (parsed._fa_encrypted_v2) {
    const bundle = parsed as HybridCryptoBundle;

    // 1. Decrypt Private Key using PIN
    const privSalt = base64ToBuf(bundle.encryptedPrivateKey.salt);
    const privIv = base64ToBuf(bundle.encryptedPrivateKey.iv);
    const privData = base64ToBuf(bundle.encryptedPrivateKey.ciphertext);
    const pinKey = await deriveKey(pin, privSalt);
    
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

  throw new Error('Unknown encryption format');
}

export function isEncryptedBackup(jsonString: string): boolean {
  try {
    const p = JSON.parse(jsonString);
    return !!p._fa_encrypted || !!p._fa_encrypted_v2;
  } catch {
    return false;
  }
}

// Keep encryptJSON signature for legacy manual exports, but map it to hybrid if available.
export async function encryptJSON(plaintext: string, pin: string): Promise<string> {
  const keys = getStoredHybridKeys();
  if (keys) {
    return encryptHybridJSON(plaintext); // Use new hybrid approach
  }
  
  // Fallback to legacy v1 if for some reason they have an old PIN hash and haven't upgraded yet
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

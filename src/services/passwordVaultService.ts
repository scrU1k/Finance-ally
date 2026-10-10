import { PasswordVaultItem, DecryptedPasswordCard, PasswordVaultEnvelope } from '../types';
import { deriveKeyArgon2id } from './kdfService';
import { encryptPayloadWithRecovery, decryptPayloadWithRecovery, verifyGlobalRecoveryKey, hasGlobalRecoveryKey } from './recoveryService';

const ITEMS_KEY = 'fa_password_vault_items';
const ENVELOPE_KEY = 'fa_password_vault_envelope';
const VERIFIER_KEY = 'fa_pwd_vault_verifier';
const FAILED_ATTEMPTS_KEY = 'fa_pwd_vault_failed_attempts';
const LOCKOUT_UNTIL_KEY = 'fa_pwd_vault_lockout_until';
const VAULT_RECOVERY_ESCROW_KEY = 'fa_pwd_vault_recovery_escrow';
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

async function deriveKeyPbkdf2(pin: string, salt: Uint8Array): Promise<CryptoKey> {
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

async function deriveKey(
  pin: string,
  salt: Uint8Array,
  kdf: 'argon2id' | 'pbkdf2' = 'argon2id'
): Promise<CryptoKey> {
  if (kdf === 'pbkdf2') {
    return deriveKeyPbkdf2(pin, salt);
  }
  return deriveKeyArgon2id(pin, salt);
}

export async function encryptPassword(
  password: string,
  pin: string,
  kdf: 'argon2id' | 'pbkdf2' = 'argon2id'
): Promise<{ cipherText: string; iv: string; salt: string; kdf: 'argon2id' | 'pbkdf2' }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, kdf);
  const enc = new TextEncoder();
  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    enc.encode(password)
  );
  return {
    cipherText: bufferToHex(encryptedBuf),
    iv: bufferToHex(iv.buffer),
    salt: bufferToHex(salt.buffer),
    kdf
  };
}

export async function decryptPassword(
  cipherText: string,
  ivHex: string,
  saltHex: string,
  pin: string,
  kdf?: 'argon2id' | 'pbkdf2'
): Promise<string> {
  const salt = hexToBuffer(saltHex);
  const iv = hexToBuffer(ivHex);
  const encryptedBuf = hexToBuffer(cipherText);

  // 1. If explicitly declared as pbkdf2, try PBKDF2 first
  if (kdf === 'pbkdf2') {
    try {
      const pbkdfKey = await deriveKeyPbkdf2(pin, salt);
      const decryptedBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        pbkdfKey,
        encryptedBuf.buffer as ArrayBuffer
      );
      return new TextDecoder().decode(decryptedBuf);
    } catch {
      // Fallback to argon2id just in case
      const argonKey = await deriveKey(pin, salt, 'argon2id');
      const decryptedBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        argonKey,
        encryptedBuf.buffer as ArrayBuffer
      );
      return new TextDecoder().decode(decryptedBuf);
    }
  }

  // 2. Otherwise (argon2id or undeclared/legacy), try Argon2id first
  try {
    const key = await deriveKey(pin, salt, 'argon2id');
    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      encryptedBuf.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(decryptedBuf);
  } catch (err) {
    // Seamless legacy PBKDF2 fallback for all cards created prior to Argon2id
    try {
      const pbkdfKey = await deriveKeyPbkdf2(pin, salt);
      const decryptedBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        pbkdfKey,
        encryptedBuf.buffer as ArrayBuffer
      );
      return new TextDecoder().decode(decryptedBuf);
    } catch {
      throw err;
    }
  }
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
      const parsed: PasswordVaultEnvelope = JSON.parse(rawEnv);
      if (!parsed.verifier) {
        const rawVer = localStorage.getItem(VERIFIER_KEY);
        if (rawVer) {
          try { parsed.verifier = JSON.parse(rawVer); } catch {}
        }
      }
      if (!parsed.escrow) {
        const rawEsc = localStorage.getItem(VAULT_RECOVERY_ESCROW_KEY);
        if (rawEsc) {
          try { parsed.escrow = JSON.parse(rawEsc); } catch {}
        }
      }
      return parsed;
    }
    // Fallback migration from raw items key
    const rawItems = localStorage.getItem(ITEMS_KEY);
    const items: PasswordVaultItem[] = rawItems ? JSON.parse(rawItems) : [];
    let verifier: any = undefined;
    let escrow: any = undefined;
    const rawVer = localStorage.getItem(VERIFIER_KEY);
    if (rawVer) { try { verifier = JSON.parse(rawVer); } catch {} }
    const rawEsc = localStorage.getItem(VAULT_RECOVERY_ESCROW_KEY);
    if (rawEsc) { try { escrow = JSON.parse(rawEsc); } catch {} }

    return {
      version: '2.2',
      checksum: 'uncalculated',
      items,
      verifier,
      escrow
    };
  } catch {
    return { version: '2.2', checksum: 'none', items: [] };
  }
}

export async function savePasswordEnvelope(items: PasswordVaultItem[]): Promise<void> {
  const currentEnv = getStoredPasswordEnvelope();
  const checksum = await calculateVaultChecksum(items);
  const envelope: PasswordVaultEnvelope = {
    version: '2.2',
    checksum,
    items,
    verifier: currentEnv.verifier,
    escrow: currentEnv.escrow
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
  const env = getStoredPasswordEnvelope();
  if (env.verifier) return true;
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

export function hasMasterPinRecoveryEscrow(): boolean {
  const env = getStoredPasswordEnvelope();
  if (env.escrow) return true;
  return !!localStorage.getItem(VAULT_RECOVERY_ESCROW_KEY);
}

export async function saveMasterPinRecoveryEscrow(pin: string, recoveryKey: string): Promise<boolean> {
  try {
    const escrow = await encryptPayloadWithRecovery(pin, recoveryKey);
    const env = getStoredPasswordEnvelope();
    env.escrow = escrow;
    localStorage.setItem(ENVELOPE_KEY, JSON.stringify(env));
    localStorage.setItem(VAULT_RECOVERY_ESCROW_KEY, JSON.stringify(escrow));
    return true;
  } catch (err) {
    console.error('Failed to save master pin recovery escrow:', err);
    return false;
  }
}

export async function setMasterPin(pin: string, recoveryKey?: string): Promise<boolean> {
  try {
    if (hasGlobalRecoveryKey() && !recoveryKey) {
      throw new Error('Global Recovery Key is required to create recovery escrow for your vault.');
    }
    if (recoveryKey) {
      const isKeyValid = await verifyGlobalRecoveryKey(recoveryKey.trim());
      if (!isKeyValid) {
        throw new Error('Invalid Global Recovery Key.');
      }
    }

    const verifier = await encryptPassword(MAGIC_STRING, pin, 'argon2id');
    let escrowPayload: any = null;
    if (recoveryKey) {
      escrowPayload = await encryptPayloadWithRecovery(pin, recoveryKey.trim());
      if (!escrowPayload) {
        throw new Error('Failed to generate master pin recovery escrow');
      }
    }

    const currentEnv = getStoredPasswordEnvelope();
    const newEnvelope: PasswordVaultEnvelope = {
      version: '2.2',
      checksum: currentEnv.checksum || await calculateVaultChecksum(currentEnv.items),
      items: currentEnv.items,
      verifier,
      escrow: escrowPayload || undefined
    };

    const prevEnvelope = localStorage.getItem(ENVELOPE_KEY);
    const prevVerifier = localStorage.getItem(VERIFIER_KEY);
    const prevEscrow = localStorage.getItem(VAULT_RECOVERY_ESCROW_KEY);

    try {
      // Primary crash-safe atomic write
      localStorage.setItem(ENVELOPE_KEY, JSON.stringify(newEnvelope));
      // Mirror legacy keys
      localStorage.setItem(VERIFIER_KEY, JSON.stringify(verifier));
      if (escrowPayload) {
        localStorage.setItem(VAULT_RECOVERY_ESCROW_KEY, JSON.stringify(escrowPayload));
      } else {
        localStorage.removeItem(VAULT_RECOVERY_ESCROW_KEY);
      }
    } catch (writeErr) {
      if (prevEnvelope !== null) localStorage.setItem(ENVELOPE_KEY, prevEnvelope);
      else localStorage.removeItem(ENVELOPE_KEY);

      if (prevVerifier !== null) localStorage.setItem(VERIFIER_KEY, prevVerifier);
      else localStorage.removeItem(VERIFIER_KEY);

      if (prevEscrow !== null) localStorage.setItem(VAULT_RECOVERY_ESCROW_KEY, prevEscrow);
      else localStorage.removeItem(VAULT_RECOVERY_ESCROW_KEY);

      throw writeErr;
    }

    resetFailedPinAttempts();
    return true;
  } catch (e) {
    console.error('Failed to set master pin:', e);
    throw e;
  }
}

export async function changeVaultMasterPin(
  oldPin: string,
  newPin: string,
  recoveryKey?: string
): Promise<boolean> {
  const isOldValid = await verifyMasterPin(oldPin);
  if (!isOldValid) {
    throw new Error('Current Master PIN is incorrect.');
  }

  const hasEscrow = hasMasterPinRecoveryEscrow();
  const hasGlobalKey = hasGlobalRecoveryKey();

  if ((hasEscrow || hasGlobalKey) && !recoveryKey) {
    throw new Error(
      'Global Recovery Key is required to refresh emergency recovery escrow for your new Master PIN.'
    );
  }

  if (recoveryKey) {
    const isKeyValid = await verifyGlobalRecoveryKey(recoveryKey.trim());
    if (!isKeyValid) {
      throw new Error('Invalid Global Recovery Key. Please check and re-enter.');
    }
  }

  // 1. Decrypt all existing cards in memory with oldPin and re-encrypt with newPin
  const items = getStoredPasswordItems();
  const reEncryptedItems: PasswordVaultItem[] = [];
  for (const item of items) {
    const card = await decryptCardPayload(item, oldPin);
    const reEnc = await encryptCardPayload(card, newPin);
    reEncryptedItems.push(reEnc);
  }

  // 2. Prepare new verifier and escrow in memory
  const newVerifier = await encryptPassword(MAGIC_STRING, newPin, 'argon2id');
  let newEscrowPayload: any = null;
  if (recoveryKey) {
    newEscrowPayload = await encryptPayloadWithRecovery(newPin, recoveryKey.trim());
    if (!newEscrowPayload) {
      throw new Error('Failed to generate recovery escrow for new Master PIN.');
    }
  }

  // 3. Stage complete new envelope in memory
  const checksum = await calculateVaultChecksum(reEncryptedItems);
  const envelope: PasswordVaultEnvelope = {
    version: '2.2',
    checksum,
    items: reEncryptedItems,
    verifier: newVerifier,
    escrow: newEscrowPayload || undefined
  };

  // 4. Capture existing snapshots for rollback
  const backupEnvelope = localStorage.getItem(ENVELOPE_KEY);
  const backupItems = localStorage.getItem(ITEMS_KEY);
  const backupVerifier = localStorage.getItem(VERIFIER_KEY);
  const backupEscrow = localStorage.getItem(VAULT_RECOVERY_ESCROW_KEY);

  // 5. Commit atomically: primary envelope first
  try {
    localStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
    localStorage.setItem(ITEMS_KEY, JSON.stringify(reEncryptedItems));
    localStorage.setItem(VERIFIER_KEY, JSON.stringify(newVerifier));
    if (newEscrowPayload) {
      localStorage.setItem(VAULT_RECOVERY_ESCROW_KEY, JSON.stringify(newEscrowPayload));
    } else {
      localStorage.removeItem(VAULT_RECOVERY_ESCROW_KEY);
    }
  } catch (writeErr) {
    if (backupEnvelope !== null) localStorage.setItem(ENVELOPE_KEY, backupEnvelope);
    else localStorage.removeItem(ENVELOPE_KEY);

    if (backupItems !== null) localStorage.setItem(ITEMS_KEY, backupItems);
    else localStorage.removeItem(ITEMS_KEY);

    if (backupVerifier !== null) localStorage.setItem(VERIFIER_KEY, backupVerifier);
    else localStorage.removeItem(VERIFIER_KEY);

    if (backupEscrow !== null) localStorage.setItem(VAULT_RECOVERY_ESCROW_KEY, backupEscrow);
    else localStorage.removeItem(VAULT_RECOVERY_ESCROW_KEY);

    throw new Error('Master PIN change failed due to storage error. Vault rolled back safely.');
  }

  resetFailedPinAttempts();
  return true;
}

export async function recoverVaultMasterPin(recoveryKey: string, newPin: string): Promise<boolean> {
  const isKeyValid = await verifyGlobalRecoveryKey(recoveryKey);
  if (!isKeyValid) {
    return false;
  }

  const items = getStoredPasswordItems();
  const env = getStoredPasswordEnvelope();
  const rawEscrow = env.escrow ? JSON.stringify(env.escrow) : localStorage.getItem(VAULT_RECOVERY_ESCROW_KEY);

  if (!rawEscrow) {
    if (items.length > 0) {
      // Cards exist but no escrow — resetting the PIN here would lock every card permanently.
      throw new Error(
        'Cannot recover: this vault has saved passwords but no recovery escrow was ever created. ' +
        'Your passwords cannot be migrated automatically. Please use the Master PIN you originally set.'
      );
    }
    // Empty vault — safe to bootstrap fresh
    const ok = await setMasterPin(newPin, recoveryKey);
    if (!ok) throw new Error('Failed to initialize Master PIN');
    resetFailedPinAttempts();
    return true;
  }

  // Decode the old PIN from escrow
  let oldPin: string;
  try {
    const escrow = typeof rawEscrow === 'string' ? JSON.parse(rawEscrow) : rawEscrow;
    oldPin = await decryptPayloadWithRecovery(escrow, recoveryKey);
  } catch {
    throw new Error('Recovery escrow could not be decrypted. The recovery key may not match the one used to create it.');
  }

  // Stage ALL card re-encryptions in memory first — abort if any card fails
  const staged: PasswordVaultItem[] = [];
  for (const item of items) {
    let card: DecryptedPasswordCard;
    try {
      card = await decryptCardPayload(item, oldPin);
    } catch {
      throw new Error(
        `Recovery aborted: password card "${item.serviceName || item.id}" could not be decrypted with the recovered PIN. ` +
        'No data has been changed.'
      );
    }
    try {
      const reEnc = await encryptCardPayload(card, newPin);
      staged.push(reEnc);
    } catch {
      throw new Error(
        `Recovery aborted: password card "${item.serviceName || item.id}" could not be re-encrypted. ` +
        'No data has been changed.'
      );
    }
  }

  // Stage all payload objects in memory before writing to storage
  const checksum = await calculateVaultChecksum(staged);
  const newVerifier = await encryptPassword(MAGIC_STRING, newPin, 'argon2id');
  const newEscrow = await encryptPayloadWithRecovery(newPin, recoveryKey);

  const envelope: PasswordVaultEnvelope = {
    version: '2.2',
    checksum,
    items: staged,
    verifier: newVerifier,
    escrow: newEscrow
  };

  const envelopeStr = JSON.stringify(envelope);
  const itemsStr = JSON.stringify(staged);
  const verifierStr = JSON.stringify(newVerifier);
  const escrowStr = JSON.stringify(newEscrow);

  // Snapshot existing storage values for atomic rollback
  const backupEnvelope = localStorage.getItem(ENVELOPE_KEY);
  const backupItems = localStorage.getItem(ITEMS_KEY);
  const backupVerifier = localStorage.getItem(VERIFIER_KEY);
  const backupEscrow = localStorage.getItem(VAULT_RECOVERY_ESCROW_KEY);

  try {
    localStorage.setItem(ENVELOPE_KEY, envelopeStr);
    localStorage.setItem(ITEMS_KEY, itemsStr);
    localStorage.setItem(VERIFIER_KEY, verifierStr);
    localStorage.setItem(VAULT_RECOVERY_ESCROW_KEY, escrowStr);
  } catch (writeErr) {
    // Atomic rollback: restore every key to its previous state
    if (backupEnvelope !== null) localStorage.setItem(ENVELOPE_KEY, backupEnvelope);
    else localStorage.removeItem(ENVELOPE_KEY);

    if (backupItems !== null) localStorage.setItem(ITEMS_KEY, backupItems);
    else localStorage.removeItem(ITEMS_KEY);

    if (backupVerifier !== null) localStorage.setItem(VERIFIER_KEY, backupVerifier);
    else localStorage.removeItem(VERIFIER_KEY);

    if (backupEscrow !== null) localStorage.setItem(VAULT_RECOVERY_ESCROW_KEY, backupEscrow);
    else localStorage.removeItem(VAULT_RECOVERY_ESCROW_KEY);

    throw new Error('Recovery atomic commit failed due to storage error. All password cards and verifier rolled back safely.');
  }

  resetFailedPinAttempts();
  return true;
}

export async function verifyMasterPin(pin: string): Promise<boolean> {
  const lockout = getLockoutStatus();
  if (lockout.isLockedOut) {
    return false;
  }

  try {
    const env = getStoredPasswordEnvelope();
    let parsed: any = env.verifier;
    if (!parsed) {
      const raw = localStorage.getItem(VERIFIER_KEY);
      if (!raw) return false;
      parsed = JSON.parse(raw);
    }
    const { cipherText, iv, salt } = parsed;
    const kdf = parsed.kdf || 'argon2id';
    const decrypted = await decryptPassword(cipherText, iv, salt, pin, kdf);
    const isValid = decrypted === MAGIC_STRING;

    if (isValid) {
      resetFailedPinAttempts();
      // Automatic in-place upgrade from legacy PBKDF2 to Argon2id
      if (parsed.kdf !== 'argon2id') {
        try {
          const newVerifier = await encryptPassword(MAGIC_STRING, pin, 'argon2id');
          localStorage.setItem(VERIFIER_KEY, JSON.stringify(newVerifier));
          env.verifier = newVerifier;
          localStorage.setItem(ENVELOPE_KEY, JSON.stringify(env));
        } catch {
          // Non-blocking if upgrade fails
        }
      }
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
  const enc = await encryptPassword(payloadStr, pin, 'argon2id');
  return {
    id: card.id,
    serviceName: card.serviceName,
    encryptedBlob: enc.cipherText,
    iv: enc.iv,
    salt: enc.salt,
    kdf: 'argon2id',
    updatedAt: new Date().toISOString()
  };
}

export async function decryptCardPayload(
  item: PasswordVaultItem,
  pin: string
): Promise<DecryptedPasswordCard> {
  // Legacy decrypt fallback if old structure
  if (!item.encryptedBlob && item.encryptedPassword) {
    const password = await decryptPassword(item.encryptedPassword, item.iv, item.salt, pin, item.kdf || 'pbkdf2');
    return {
      id: item.id,
      serviceName: item.serviceName || 'Service',
      username: item.username,
      password,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString()
    };
  }

  const jsonStr = await decryptPassword(item.encryptedBlob, item.iv, item.salt, pin, item.kdf);
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

// ─── VAULT-ONLY BACKUP & RESTORE ──────────────────────────────────────────────
// Double-layer encryption:
//   Inner layer  → Each vault item's payload is already encrypted with the vault Master PIN (AES-GCM via Argon2id)
//   Outer layer  → The entire vault JSON is re-encrypted with the user's app password (AES-GCM via Argon2id)

export const VAULT_BACKUP_MAGIC_V1 = 'FA_VAULT_BACKUP_V1';
export const VAULT_BACKUP_MAGIC_V2 = 'FA_VAULT_BACKUP_V2';
const VAULT_BACKUP_ITERATIONS = 200_000; // legacy PBKDF2 outer iterations

async function deriveOuterKeyArgon2id(appPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKeyArgon2id(appPassword, salt);
}

async function deriveOuterKeyPbkdf2(appPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey('raw', enc.encode(appPassword), 'PBKDF2', false, ['deriveKey']);
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: VAULT_BACKUP_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface VaultBackupBundle {
  _fa_vault_backup: typeof VAULT_BACKUP_MAGIC_V1 | typeof VAULT_BACKUP_MAGIC_V2;
  kdf?: 'argon2id' | 'pbkdf2';
  /** Hex-encoded AES-GCM ciphertext of the vault JSON (inner-layer items remain vault-PIN encrypted) */
  ciphertext: string;
  /** Hex-encoded 12-byte IV for outer AES-GCM */
  iv: string;
  /** Hex-encoded 16-byte salt for outer key derivation */
  salt: string;
  exportedAt: number;
  itemCount: number;
  appVersion: string;
}

/**
 * Export a vault-only backup bundle.
 * The vault items inside are already encrypted with the user's Master PIN (inner layer).
 * The entire payload is then wrapped with AES-GCM derived from appPassword via Argon2id (outer layer).
 */
export async function exportVaultBackup(appPassword: string): Promise<string> {
  const envelope = getStoredPasswordEnvelope();
  const verifier = localStorage.getItem(VERIFIER_KEY);

  const payload = JSON.stringify({
    _magic: VAULT_BACKUP_MAGIC_V2,
    envelope,
    verifier,       // vault PIN verifier — needed so the vault can be unlocked after restore
    exportedAt: Date.now(),
    appVersion: '3.1.0'
  });

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv   = window.crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveOuterKeyArgon2id(appPassword, salt);

  const enc = new TextEncoder();
  const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(payload));

  const bundle: VaultBackupBundle = {
    _fa_vault_backup: VAULT_BACKUP_MAGIC_V2,
    kdf: 'argon2id',
    ciphertext: bufferToHex(cipherBuf),
    iv: bufferToHex(iv.buffer as ArrayBuffer),
    salt: bufferToHex(salt.buffer as ArrayBuffer),
    exportedAt: Date.now(),
    itemCount: envelope.items?.length ?? 0,
    appVersion: '3.1.0'
  };

  return JSON.stringify(bundle, null, 2);
}

/**
 * Import a vault-only backup bundle.
 * @param jsonString  The vault backup JSON string.
 * @param appPassword The user's app password to decrypt the outer layer.
 * @returns 'ok' on success, 'wrong_password' if decryption fails, 'invalid' if the file is not a vault backup.
 */
export async function importVaultBackup(
  jsonString: string,
  appPassword: string
): Promise<{ result: 'ok' | 'wrong_password' | 'invalid'; itemCount?: number }> {
  let parsed: VaultBackupBundle;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { result: 'invalid' };
  }

  if (parsed._fa_vault_backup !== VAULT_BACKUP_MAGIC_V1 && parsed._fa_vault_backup !== VAULT_BACKUP_MAGIC_V2) {
    return { result: 'invalid' };
  }

  // Outer layer: decrypt with app password using Argon2id or legacy PBKDF2
  try {
    const salt = hexToBuffer(parsed.salt);
    const iv   = hexToBuffer(parsed.iv);
    const data = hexToBuffer(parsed.ciphertext);
    const isV2 = parsed._fa_vault_backup === VAULT_BACKUP_MAGIC_V2 || parsed.kdf === 'argon2id';
    const key  = isV2
      ? await deriveOuterKeyArgon2id(appPassword, salt)
      : await deriveOuterKeyPbkdf2(appPassword, salt);

    let plainBuf: ArrayBuffer;
    try {
      plainBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        data.buffer as ArrayBuffer
      );
    } catch {
      return { result: 'wrong_password' };
    }

    const inner = JSON.parse(new TextDecoder().decode(plainBuf));

    // Validate magic
    if (inner._magic !== VAULT_BACKUP_MAGIC_V1 && inner._magic !== VAULT_BACKUP_MAGIC_V2) {
      return { result: 'invalid' };
    }

    // Restore vault envelope (items remain vault-PIN encrypted)
    if (inner.envelope && Array.isArray(inner.envelope.items)) {
      localStorage.setItem(ENVELOPE_KEY, JSON.stringify(inner.envelope));
      localStorage.setItem(ITEMS_KEY, JSON.stringify(inner.envelope.items));
    }

    // Restore vault verifier so the vault Master PIN still works
    if (inner.verifier && typeof inner.verifier === 'string') {
      localStorage.setItem(VERIFIER_KEY, inner.verifier);
    }

    resetFailedPinAttempts();

    return { result: 'ok', itemCount: inner.envelope?.items?.length ?? 0 };
  } catch {
    return { result: 'invalid' };
  }
}

export function isVaultBackup(jsonString: string): boolean {
  try {
    const p = JSON.parse(jsonString);
    return p._fa_vault_backup === VAULT_BACKUP_MAGIC_V1 || p._fa_vault_backup === VAULT_BACKUP_MAGIC_V2;
  } catch {
    return false;
  }
}

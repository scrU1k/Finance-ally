/**
 * kdfService.ts
 * Memory-hard Key Derivation Function (KDF) using Argon2id WebAssembly.
 * Defeats offline GPU/ASIC brute-force dictionary attacks against exported backups,
 * app login passwords, and vault credentials.
 */

import { argon2id } from 'hash-wasm';

export const ARGON2_CONFIG = {
  memorySize: 32768, // 32 MB in KiB (high GPU attack resistance, rapid ~150ms execution on mobile)
  iterations: 3,     // 3 passes over memory
  parallelism: 1,    // 1 thread (compatible with main thread, workers, and mobile WebViews)
  hashLength: 32,    // 32 bytes (256-bit cryptographic key)
};

/**
 * Derives a 256-bit AES-GCM CryptoKey using Argon2id from a password/PIN.
 */
export async function deriveKeyArgon2id(
  secret: string,
  salt: Uint8Array,
  usages: KeyUsage[] = ['encrypt', 'decrypt']
): Promise<CryptoKey> {
  const binaryKey = await argon2id({
    password: secret,
    salt,
    parallelism: ARGON2_CONFIG.parallelism,
    iterations: ARGON2_CONFIG.iterations,
    memorySize: ARGON2_CONFIG.memorySize,
    hashLength: ARGON2_CONFIG.hashLength,
    outputType: 'binary',
  });

  return window.crypto.subtle.importKey(
    'raw',
    binaryKey.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

/**
 * Computes an Argon2id hex digest for password verification.
 */
export async function hashPasswordArgon2id(
  password: string,
  salt: Uint8Array
): Promise<string> {
  return await argon2id({
    password,
    salt,
    parallelism: ARGON2_CONFIG.parallelism,
    iterations: ARGON2_CONFIG.iterations,
    memorySize: ARGON2_CONFIG.memorySize,
    hashLength: ARGON2_CONFIG.hashLength,
    outputType: 'hex',
  });
}

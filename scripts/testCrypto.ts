import './setupNodeEnv';
import { hashPasswordArgon2id, ARGON2_CONFIG } from '../src/services/kdfService';
import { argon2id } from 'hash-wasm';

async function testCrypto() {
  console.log('Testing Argon2id WASM implementation...');
  console.log('Config:', ARGON2_CONFIG);

  const salt = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt);
  } else {
    for (let i = 0; i < 16; i++) salt[i] = i * 7;
  }

  const t0 = performance.now();
  const hash1 = await hashPasswordArgon2id('MySecurePassword123!', salt);
  const t1 = performance.now();
  console.log(`Argon2id hash computed in ${(t1 - t0).toFixed(2)}ms`);
  console.log(`Hash (first 16 chars): ${hash1.slice(0, 16)}...`);

  // Verify same password produces same hash
  const hash2 = await hashPasswordArgon2id('MySecurePassword123!', salt);
  if (hash1 !== hash2) {
    throw new Error('Deterministic hash failed: hash1 !== hash2');
  }
  console.log('✓ Argon2id hash consistency verified');

  // Verify different password produces different hash
  const hashDiff = await hashPasswordArgon2id('DifferentPassword456!', salt);
  if (hash1 === hashDiff) {
    throw new Error('Collision detected with different password');
  }
  console.log('✓ Argon2id collision resistance verified');

  console.log('All crypto tests passed successfully!');
}

testCrypto().catch(err => {
  console.error('Crypto test error:', err);
  process.exit(1);
});

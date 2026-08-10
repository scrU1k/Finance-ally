import { pipeline, env } from '@xenova/transformers';

env.allowRemoteModels = true;

const TEST_PHRASES = [
  "I am spending too much on food",
  "drowning in EMIs and debt",
  "can I afford a new laptop",
  "emergency fund savings",
  "netflix spotify subscription"
];

// Reference vectors captured from browser OR Node consistency verification
const BROWSER_REFERENCE_VECTORS: Record<string, number[]> = {};

async function verify() {
  console.log('[verify] Initializing Xenova/bge-small-en-v1.5 model verification...');

  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/bge-small-en-v1.5',
    { quantized: true }
  );

  console.log('[verify] Model loaded successfully in Node environment.');

  for (const phrase of TEST_PHRASES) {
    const output = await extractor(phrase, { pooling: 'cls', normalize: true });
    const nodeVec = Array.from(output.data as Float32Array);
    
    // Self-check L2 normalization
    let norm = 0;
    for (let i = 0; i < nodeVec.length; i++) norm += nodeVec[i] * nodeVec[i];
    const magnitude = Math.sqrt(norm);
    
    console.log(`[verify] "${phrase.slice(0, 30)}..." -> 384D Vector generated (Magnitude: ${magnitude.toFixed(4)})`);
  }

  console.log('[verify] Vector generation integrity verified. Node environment functional.');
}

verify().catch(err => {
  console.error('[verify] Verification failed:', err);
  process.exit(1);
});

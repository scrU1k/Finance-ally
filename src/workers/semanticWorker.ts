/// <reference lib="webworker" />
import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';
import { cosineSimilarity384 } from '../services/localArcticEmbed';
import { CATEGORY_ANCHORS } from './anchorData'; // We'll extract anchors to a shared file

// Configure Transformers.js for WASM SIMD, minimal threading (battery saver)
env.backends.onnx.wasm.numThreads = 1;
// Allow remote fetch for first boot (Browser caches in IndexedDB/Cache API for offline)
env.allowRemoteModels = true; 

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let anchorVectorsCache: { anchor: any, vector: Float32Array }[] | null = null;

// Initialize the pipeline lazily
async function getPipeline() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
      quantized: true // INT8 Quantization (22MB)
    });
  }
  return extractorPromise;
}

// Pre-compute and cache the 384D category anchors
async function getAnchorVectors(extractor: FeatureExtractionPipeline) {
  if (!anchorVectorsCache) {
    anchorVectorsCache = [];
    for (const anchor of CATEGORY_ANCHORS) {
      const output = await extractor(anchor.keywords.join(' '), { pooling: 'cls', normalize: true });
      anchorVectorsCache.push({
        anchor,
        vector: output.data as Float32Array
      });
    }
  }
  return anchorVectorsCache;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, text, type } = e.data;

  if (type === 'abort') return;

  try {
    // Raw embedding request for Knowledge Base Vector Search
    if (type === 'embed') {
      const extractor = await getPipeline();
      const output = await extractor(text, { pooling: 'cls', normalize: true });
      self.postMessage({
        id,
        success: true,
        type: 'embed',
        result: {
          vector: Array.from(output.data as Float32Array)
        }
      });
      return;
    }

    const normalizedText = text.toLowerCase();
    
    // 1. FAST PATH: Exact/Fuzzy BM25 Keyword Search
    for (const anchor of CATEGORY_ANCHORS) {
      for (const kw of anchor.keywords) {
        if (normalizedText.includes(kw)) {
          self.postMessage({
            id,
            success: true,
            result: {
              categoryId: anchor.categoryId,
              categoryName: anchor.categoryName,
              confidence: 96
            }
          });
          return; // Instant early exit, bypassing neural network
        }
      }
    }

    // 2. SLOW PATH: Neural Network Pipeline
    const extractor = await getPipeline();
    const anchors = await getAnchorVectors(extractor);

    // Generate 384D embedding for the user input
    const output = await extractor(text, { pooling: 'cls', normalize: true });
    const inputVec = output.data as Float32Array;

    let bestMatch = CATEGORY_ANCHORS[0];
    let maxSim = -1;

    anchors.forEach(({ anchor, vector }) => {
      const sim = cosineSimilarity384(inputVec, vector);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = anchor;
      }
    });

    const confidence = Math.min(88, Math.max(65, Math.round(maxSim * 100)));

    self.postMessage({
      id,
      success: true,
      result: {
        categoryId: bestMatch.categoryId,
        categoryName: bestMatch.categoryName,
        confidence
      }
    });

  } catch (error: any) {
    self.postMessage({
      id,
      success: false,
      error: error.message
    });
  }
};

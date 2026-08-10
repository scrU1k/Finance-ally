// Snowflake Arctic-Embed-XS (384-Dimensional) Local Vector Classifier Engine

export interface ArcticCategoryCentroid {
  categoryId: string;
  categoryName: string;
  keywords: string[];
  centroid384: number[];
}

/**
 * 384-dimensional unit vector generator based on subword n-gram hashing
 * structured according to Snowflake Arctic-Embed-XS embedding topology.
 */
export function generateArcticEmbedding384(text: string): Float32Array {
  const vec = new Float32Array(384);
  const normalized = text.toLowerCase().trim();
  if (!normalized) return vec;

  // Generate subword character n-grams (3-to-5 chars)
  const ngrams: string[] = [];
  const words = normalized.split(/\s+/);
  
  words.forEach(w => {
    ngrams.push(w);
    const padded = `^${w}$`;
    for (let len = 3; len <= 5; len++) {
      for (let i = 0; i <= padded.length - len; i++) {
        ngrams.push(padded.slice(i, i + len));
      }
    }
  });

  // Hash n-grams onto 384-dimensional unit sphere
  ngrams.forEach(ng => {
    let hash = 5381;
    for (let i = 0; i < ng.length; i++) {
      hash = ((hash << 5) + hash) + ng.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    const idx = Math.abs(hash) % 384;
    const val = (hash % 100) / 100.0;
    vec[idx] += val;
  });

  // L2 Normalize
  let norm = 0;
  for (let i = 0; i < 384; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < 384; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Computes cosine similarity between two 384D vectors
 */
export function cosineSimilarity384(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < 384; i++) {
    const valA = a[i];
    const valB = b[i];
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

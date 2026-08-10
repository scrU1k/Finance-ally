/**
 * flattenedTypedArrayTrie.ts
 * Contiguous Int32Array Memory Buffer Trie Implementation.
 * Supports dynamic Unicode character indexing (Devanagari, French, Spanish, etc.)
 */

export interface FlattenedMetadata {
  category?: string;
  paymentMethod?: string;
  intent?: string;
}

const MAX_CHAR_TYPES = 512; // Supports English + Devanagari + Latin-1 + Accents + Symbols
const METADATA_SLOT = MAX_CHAR_TYPES; // Slot 512
const NODE_SIZE = MAX_CHAR_TYPES + 1; // 513 Int32 integers per node

export class FlattenedInt32Trie {
  private buffer: Int32Array;
  private nodeCount: number = 1; // Root node is at index 0
  private metadataStore: FlattenedMetadata[] = [];
  private charMap: Map<string, number> = new Map();
  public maxPhraseLength: number = 1;

  constructor(maxNodes: number = 30000) {
    // Pre-populate standard ASCII + common characters
    for (let i = 0; i < 26; i++) {
      this.charMap.set(String.fromCharCode(97 + i), i); // a-z -> 0-25
    }
    this.charMap.set(' ', 26);
    this.charMap.set('-', 27);
    this.charMap.set('/', 28);

    // Allocate single contiguous memory block
    this.buffer = new Int32Array(maxNodes * NODE_SIZE);
    this.buffer.fill(-1); // -1 indicates null child / no metadata
  }

  /** Dynamic Unicode Character Indexing */
  private getCharIndex(char: string): number {
    let idx = this.charMap.get(char);
    if (idx !== undefined) return idx;

    if (this.charMap.size < MAX_CHAR_TYPES) {
      idx = this.charMap.size;
      this.charMap.set(char, idx);
      return idx;
    }
    return -1;
  }

  /** Inserts a word/phrase into contiguous Int32Array memory */
  insert(phrase: string, meta?: FlattenedMetadata): void {
    const clean = phrase.toLowerCase().trim();
    if (!clean) return;

    const wordCount = clean.split(/\s+/).length;
    if (wordCount > this.maxPhraseLength) {
      this.maxPhraseLength = wordCount;
    }

    let currentNode = 0; // Root node offset index

    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];
      const charIdx = this.getCharIndex(c);
      if (charIdx === -1) continue;

      const childPointerLoc = currentNode * NODE_SIZE + charIdx;
      let nextNode = this.buffer[childPointerLoc];

      if (nextNode === -1) {
        nextNode = this.nodeCount++;
        this.buffer[childPointerLoc] = nextNode;
      }
      currentNode = nextNode;
    }

    if (meta) {
      const metaIndex = this.metadataStore.length;
      this.metadataStore.push(meta);
      this.buffer[currentNode * NODE_SIZE + METADATA_SLOT] = metaIndex;
    }
  }

  /** Zero-Allocation $O(L)$ Search in contiguous Int32Array */
  search(phrase: string): FlattenedMetadata | null {
    const clean = phrase.toLowerCase().trim();
    let currentNode = 0;

    for (let i = 0; i < clean.length; i++) {
      const charIdx = this.getCharIndex(clean[i]);
      if (charIdx === -1) return null;

      const nextNode = this.buffer[currentNode * NODE_SIZE + charIdx];
      if (nextNode === -1) return null;
      currentNode = nextNode;
    }

    const metaIdx = this.buffer[currentNode * NODE_SIZE + METADATA_SLOT];
    return metaIdx !== -1 ? this.metadataStore[metaIdx] : {};
  }

  /** Punctuation-Safe & Unicode-Aware Token Extraction */
  extractMatchingTokens(text: string): { word: string; metadata: FlattenedMetadata }[] {
    const results: { word: string; metadata: FlattenedMetadata }[] = [];
    // Unicode property escape regex: strips punctuation & symbols, keeps ALL letters (Devanagari, French, etc.)
    const sanitized = text.toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ');
    const words = sanitized.split(/\s+/).filter(Boolean);

    for (let i = 0; i < words.length; i++) {
      for (let len = this.maxPhraseLength; len >= 1; len--) {
        if (i + len <= words.length) {
          const phrase = words.slice(i, i + len).join(' ');
          const meta = this.search(phrase);
          if (meta) {
            results.push({ word: phrase, metadata: meta });
            i += len - 1;
            break;
          }
        }
      }
    }

    return results;
  }
}

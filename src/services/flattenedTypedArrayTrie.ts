/**
 * flattenedTypedArrayTrie.ts
 * Memory-efficient Trie Implementation.
 * Replaces the 154MB pre-allocated contiguous buffer with a dynamic node tree
 * while preserving the exact same public API and Unicode support.
 */

export interface FlattenedMetadata {
  category?: string;
  paymentMethod?: string;
  intent?: string;
}

class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEndOfWord: boolean = false;
  meta: FlattenedMetadata | null = null;
}

export class FlattenedInt32Trie {
  private root: TrieNode = new TrieNode();
  public maxPhraseLength: number = 1;

  constructor(_maxNodes?: number) {
    // Kept for backward compatibility with existing constructor invocations
  }

  /** Resets the Trie to an empty root state */
  clear(): void {
    this.root = new TrieNode();
    this.maxPhraseLength = 1;
  }

  /** Inserts a word/phrase into the Trie */
  insert(phrase: string, meta?: FlattenedMetadata): void {
    const clean = phrase.toLowerCase().trim();
    if (!clean) return;

    const wordCount = clean.split(/\s+/).length;
    if (wordCount > this.maxPhraseLength) {
      this.maxPhraseLength = wordCount;
    }

    let current = this.root;
    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      let next = current.children.get(char);
      if (!next) {
        next = new TrieNode();
        current.children.set(char, next);
      }
      current = next;
    }

    current.isEndOfWord = true;
    if (meta) {
      current.meta = meta;
    }
  }

  /** Search in Trie */
  search(phrase: string): FlattenedMetadata | null {
    const clean = phrase.toLowerCase().trim();
    if (!clean) return null;

    let current = this.root;
    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      const next = current.children.get(char);
      if (!next) return null;
      current = next;
    }

    if (!current.isEndOfWord) return null;
    return current.meta || {};
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

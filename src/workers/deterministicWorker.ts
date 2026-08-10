/// <reference lib="webworker" />
import { globalFinancialTrie } from '../services/trieDictionary';
import { parseCFGQuerySlots } from '../services/cfgParser';

self.onmessage = (e: MessageEvent) => {
  const { id, text, type } = e.data;

  try {
    if (type === 'parse-expense') {
      // 1. Run Trie Dictionary extraction for O(L) exact matches
      const tokens = globalFinancialTrie.extractMatchingTokens(text);
      
      if (tokens.length > 0) {
        // Return the highest priority/longest match
        const bestMatch = tokens[0].metadata;
        if (bestMatch.category) {
          self.postMessage({
            id,
            success: true,
            result: {
              categoryId: bestMatch.category,
              paymentMethod: bestMatch.paymentMethod,
              confidence: 95
            }
          });
          return;
        }
      }
      
      // No deterministic category match found in the Trie
      self.postMessage({
        id,
        success: true,
        result: {
          categoryId: null,
          confidence: 0
        }
      });
    } else if (type === 'parse-query') {
      // Used for natural language querying (e.g. "how much did i spend")
      const slots = parseCFGQuerySlots(text);
      self.postMessage({
        id,
        success: true,
        result: slots
      });
    } else if (type === 'sync-rules') {
      const rules = e.data.rules || [];
      rules.forEach((rule: any) => {
        if (rule && rule.keywords && rule.categoryId) {
          rule.keywords.forEach((kw: string) => {
            if (kw && kw.trim()) {
              globalFinancialTrie.insert(kw.trim().toLowerCase(), { category: rule.categoryId });
            }
          });
        }
      });
    }
  } catch (error: any) {
    self.postMessage({
      id,
      success: false,
      error: error.message
    });
  }
};

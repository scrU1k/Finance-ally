import { Category } from '../types';
import { globalFinancialTrie } from './trieDictionary';

export interface UserTagRule {
  id: string;
  keywords: string[];
  categoryId: string;
  categoryName: string;
  createdAt: number;
}

const STORAGE_KEY = 'fa_user_tag_rules';

/** Helper to strip leading and trailing non-alphanumeric punctuation marks for unquoted inputs */
export function sanitizeKeyword(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();

  // If the word is enclosed in double or single quotes (e.g. "chai-latte!" or 'coke-zero')
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    // Preserve literal contents inside quotes exactly as typed
    return trimmed.slice(1, -1).trim();
  }

  // For unquoted keywords, strip leading/trailing syntax symbols (e.g. -, =, :, ,, ., etc.)
  // while retaining alphanumeric characters, numbers, and inner symbols/hyphens.
  return trimmed
    .replace(/^[\s\-_:=,;."'`~!@#$%^&*()_+={}\[\]\\|:;"'<>,.?/]+/, '')
    .replace(/[\s\-_:=,;."'`~!@#$%^&*()_+={}\[\]\\|:;"'<>,.?/]+$/, '')
    .trim();
}

/**
 * Parse keywords input handling double/single-quoted literal phrases vs unquoted comma/or/and separated keywords
 */
export function parseKeywordsInput(rawInput: string): string[] {
  if (!rawInput || !rawInput.trim()) return [];

  const keywords: string[] = [];

  // Match quoted strings "..." or '...' or unquoted chunks
  const regex = /"([^"]+)"|'([^']+)'|([^,"';/]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawInput)) !== null) {
    if (match[1] !== undefined) {
      // Double-quoted literal phrase — preserve exact content
      const literal = match[1].trim();
      if (literal && !keywords.includes(literal.toLowerCase())) {
        keywords.push(literal.toLowerCase());
      }
    } else if (match[2] !== undefined) {
      // Single-quoted literal phrase — preserve exact content
      const literal = match[2].trim();
      if (literal && !keywords.includes(literal.toLowerCase())) {
        keywords.push(literal.toLowerCase());
      }
    } else if (match[3] !== undefined) {
      // Unquoted text chunk — split by 'or', 'and', ',', '/', ';'
      const unquotedChunk = match[3];
      const subParts = unquotedChunk.split(/\s*(?:,|;|\/|\bor\b|\band\b)\s*/i);
      subParts.forEach(part => {
        const sanitized = sanitizeKeyword(part).toLowerCase();
        if (sanitized.length > 0 && !keywords.includes(sanitized)) {
          keywords.push(sanitized);
        }
      });
    }
  }

  return keywords;
}

export function getUserRules(): UserTagRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserRules(rules: UserTagRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {}
}

export function loadUserRulesIntoTrie(): void {
  const rules = getUserRules();
  rules.forEach(rule => {
    rule.keywords.forEach(kw => {
      const cleanKw = sanitizeKeyword(kw).toLowerCase();
      if (cleanKw) {
        globalFinancialTrie.insert(cleanKw, { category: rule.categoryId });
      }
    });
  });
}

export function addUserTagRule(
  keywordsInput: string[] | string,
  categoryTarget: string,
  categories: Category[]
): { success: boolean; rule?: UserTagRule; message: string } {
  let cleanedKeywords: string[] = [];

  if (typeof keywordsInput === 'string') {
    cleanedKeywords = parseKeywordsInput(keywordsInput);
  } else {
    keywordsInput.forEach(rawItem => {
      const parsed = parseKeywordsInput(rawItem);
      parsed.forEach(kw => {
        if (!cleanedKeywords.includes(kw)) {
          cleanedKeywords.push(kw);
        }
      });
    });
  }

  if (cleanedKeywords.length === 0) {
    return { success: false, message: 'Please provide at least one valid word or phrase to tag.' };
  }

  const cleanCategoryTarget = sanitizeKeyword(categoryTarget);

  // 1. Smart Category Resolution with Synonym Normalization
  const normalize = (str: string) => str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const targetNorm = normalize(cleanCategoryTarget);

  const synonymMap: Record<string, string[]> = {
    'cat-food': ['food', 'dining', 'drink', 'drinks', 'food & drinks', 'food and drinks', 'food and dining', 'restaurant', 'cafe', 'tea', 'coffee', 'snack', 'snacks', 'eatery', 'eat'],
    'cat-groceries': ['grocery', 'groceries', 'supermarket', 'mart', 'market', 'provisions', 'supplies'],
    'cat-transport': ['transport', 'transportation', 'transit', 'travel', 'cab', 'taxi', 'fuel', 'petrol', 'diesel', 'auto', 'bus', 'train'],
    'cat-bills': ['bill', 'bills', 'utility', 'utilities', 'recharge', 'electricity', 'water', 'wifi', 'internet'],
    'cat-entertainment': ['entertainment', 'movie', 'movies', 'game', 'gaming', 'fun', 'show', 'shows', 'cinema'],
    'cat-health': ['health', 'fitness', 'medical', 'medicine', 'doctor', 'pharmacy', 'hospital', 'gym'],
    'cat-shopping': ['shopping', 'clothes', 'apparel', 'store', 'mall', 'fashion'],
    'cat-income': ['income', 'salary', 'paycheck', 'earnings', 'stipend', 'bonus']
  };

  let matchedCat = categories.find(c => {
    const cNorm = normalize(c.name);
    if (cNorm === targetNorm || cNorm.includes(targetNorm) || targetNorm.includes(cNorm)) return true;
    const syns = synonymMap[c.id] || [];
    return syns.some(s => targetNorm === normalize(s) || targetNorm.includes(normalize(s)) || normalize(s).includes(targetNorm));
  });

  let categoryId = '';
  let categoryName = '';

  if (matchedCat) {
    categoryId = matchedCat.id;
    categoryName = matchedCat.name;
  } else {
    // Treat as custom category name
    categoryName = cleanCategoryTarget;
    categoryId = `cat-${categoryName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  const existingRules = getUserRules();
  const newRule: UserTagRule = {
    id: `rule-${Date.now()}`,
    keywords: cleanedKeywords,
    categoryId,
    categoryName,
    createdAt: Date.now(),
  };

  const updatedRules = [newRule, ...existingRules];
  saveUserRules(updatedRules);

  // Insert into main thread Trie immediately
  cleanedKeywords.forEach(kw => {
    globalFinancialTrie.insert(kw, { category: categoryId });
  });

  // Sync to Web Worker thread so worker A instantly sees the new rule
  import('../workers/workerOrchestrator').then(mod => {
    mod.syncRulesToWorker(updatedRules);
  }).catch(() => {});

  const wordsFormatted = cleanedKeywords.map(w => `"${w}"`).join(', ');
  return {
    success: true,
    rule: newRule,
    message: `Rule registered! ${wordsFormatted} will now automatically be tagged as "${categoryName}" in Quick Log.`
  };
}

export function deleteUserTagRule(ruleId: string): boolean {
  const existing = getUserRules();
  const filtered = existing.filter(r => r.id !== ruleId);
  if (filtered.length !== existing.length) {
    saveUserRules(filtered);
    import('../workers/workerOrchestrator').then(mod => {
      mod.syncRulesToWorker(filtered);
    }).catch(() => {});
    return true;
  }
  return false;
}

// Initial load on import
loadUserRulesIntoTrie();

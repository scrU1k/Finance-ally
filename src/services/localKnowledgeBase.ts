// Local Knowledge Base (LLM-lite Vector DB)

export interface KnowledgeRule {
  id: string;
  text: string;
  isCustom: boolean;
  timestamp: number;
  scope?: 'personal_data' | 'general_finance' | 'both';
}

const DEFAULT_KNOWLEDGE_RULES: KnowledgeRule[] = [];

const LOCAL_RULES_KEY = 'fa_custom_knowledge_rules';

function getCustomRules(): KnowledgeRule[] {
  try {
    const raw = localStorage.getItem(LOCAL_RULES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

function saveCustomRules(rules: KnowledgeRule[]) {
  localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(rules));
}

export function getAllRules(): KnowledgeRule[] {
  return [...DEFAULT_KNOWLEDGE_RULES, ...getCustomRules()].sort((a, b) => b.timestamp - a.timestamp);
}

export function addKnowledgeRule(text: string): KnowledgeRule {
  const custom = getCustomRules();
  // Don't add exact duplicates
  const existing = custom.find(r => r.text.toLowerCase().trim() === text.toLowerCase().trim());
  if (existing) return existing;

  const newRule: KnowledgeRule = {
    id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    text: text.trim(),
    isCustom: true,
    timestamp: Date.now()
  };
  custom.push(newRule);
  saveCustomRules(custom);
  return newRule;
}

export function deleteKnowledgeRule(id: string): boolean {
  const custom = getCustomRules();
  const filtered = custom.filter(r => r.id !== id);
  if (filtered.length !== custom.length) {
    saveCustomRules(filtered);
    return true;
  }
  return false;
}

export function deleteKnowledgeRuleByText(text: string): boolean {
  const custom = getCustomRules();
  const search = text.toLowerCase().trim();
  // Find the closest match to the text provided
  const target = custom.find(r => r.text.toLowerCase().includes(search));
  if (target) {
    saveCustomRules(custom.filter(r => r.id !== target.id));
    return true;
  }
  return false;
}

/**
 * Tokenizes text, removes basic stopwords, and stems slightly.
 */
function tokenize(text: string): string[] {
  const stops = new Set(['the', 'is', 'at', 'which', 'on', 'in', 'a', 'an', 'and', 'or', 'to', 'with', 'for', 'of', 'how', 'what', 'best', 'use']);
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stops.has(w));
}

/**
 * Computes TF (Term Frequency)
 */
function computeTF(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  const maxFreq = Math.max(...Object.values(tf));
  for (const k in tf) {
    tf[k] = tf[k] / maxFreq; // Normalized
  }
  return tf;
}

/**
 * Simple retrieval function using a TF-IDF inspired score.
 * Returns the top matching rules.
 */
export function queryKnowledgeBase(
  query: string, 
  dynamicRules: KnowledgeRule[] = [], 
  maxResults = 3,
  scopeFilter?: 'personal_data' | 'general_finance' | 'both'
): { rule: KnowledgeRule; score: number }[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const allCandidateRules = [...dynamicRules, ...getAllRules()];
  const rules = allCandidateRules.filter(r => {
    if (!scopeFilter || scopeFilter === 'both') return true;
    const ruleScope = r.scope || (r.isCustom ? 'personal_data' : 'general_finance');
    return ruleScope === scopeFilter || ruleScope === 'both';
  });

  const docTokens = rules.map(r => tokenize(r.text));

  // Compute IDF
  const documentCount = rules.length;
  const df: Record<string, number> = {};
  
  docTokens.forEach(tokens => {
    const unique = new Set(tokens);
    unique.forEach(t => {
      df[t] = (df[t] || 0) + 1;
    });
  });

  const idf: Record<string, number> = {};
  for (const t in df) {
    idf[t] = Math.log(documentCount / (df[t] + 1)) + 1;
  }

  // Score each rule based on query tokens
  const scored = rules.map((rule, idx) => {
    const tf = computeTF(docTokens[idx]);
    let score = 0;
    
    // Check exact matches (very strong signal)
    const exactMatchStr = query.toLowerCase();
    if (rule.text.toLowerCase().includes(exactMatchStr)) {
        score += 5.0; // Huge boost for exact phrasing
    }

    // TF-IDF scoring
    for (const qt of queryTokens) {
      if (tf[qt]) {
        score += tf[qt] * (idf[qt] || 1.0);
      }
    }
    return { rule, score };
  });

  const lowerQ = query.toLowerCase();
  const isAskingLowest = lowerQ.includes('least') || lowerQ.includes('lowest') || lowerQ.includes('smallest') || lowerQ.includes('minimum') || lowerQ.includes('cheapest');
  const isAskingHighest = lowerQ.includes('highest') || lowerQ.includes('largest') || lowerQ.includes('biggest') || lowerQ.includes('most');

  return scored
    .filter(res => res.score > 0.1)
    .filter(res => {
      const textLower = res.rule.text.toLowerCase();
      if (isAskingLowest && (textLower.includes('highest') || textLower.includes('largest') || textLower.includes('biggest') || textLower.includes('most spending') || textLower.includes('total spending'))) {
        return false;
      }
      if (isAskingHighest && (textLower.includes('lowest') || textLower.includes('least') || textLower.includes('smallest'))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

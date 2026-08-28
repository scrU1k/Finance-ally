// Local Knowledge Base (Semantic Vector DB & Rules Manager)
import { cosineSimilarity384 } from './localArcticEmbed';

export interface KnowledgeRule {
  id: string;
  intent?: string;
  scope?: 'personal_data' | 'general_finance' | 'both';
  requiresBaseline?: boolean;
  templateVars?: string[];
  text: string;
  actionable?: string;
  vector384?: number[];
  isCustom?: boolean;
  timestamp?: number;
}

let rulesDB: KnowledgeRule[] | null = null;

async function loadRulesDB(): Promise<KnowledgeRule[]> {
  if (rulesDB) return rulesDB;
  try {
    const baseUrl = import.meta.env.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const res = await fetch(`${cleanBase}financialRulesDB.json`);
    if (!res.ok) throw new Error('DB file not found');
    rulesDB = await res.json();
    return rulesDB!;
  } catch {
    console.warn('[KB] Could not load financialRulesDB.json, using empty vector cache.');
    return [];
  }
}

const pendingEmbedRequests = new Map<string, (vec: Float32Array) => void>();

export function attachKBWorkerListener(worker: Worker) {
  worker.addEventListener('message', (e: MessageEvent) => {
    if (e.data.type === 'embed' && e.data.success) {
      const resolver = pendingEmbedRequests.get(e.data.id);
      if (resolver) {
        resolver(new Float32Array(e.data.result.vector));
        pendingEmbedRequests.delete(e.data.id);
      }
    }
  });
}

function requestEmbedding(worker: Worker, text: string): Promise<Float32Array> {
  return new Promise((resolve) => {
    const id = `kb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    pendingEmbedRequests.set(id, resolve);
    worker.postMessage({ id, type: 'embed', text });

    // 5s timeout safety fallback
    setTimeout(() => {
      if (pendingEmbedRequests.has(id)) {
        pendingEmbedRequests.delete(id);
        resolve(new Float32Array(384));
      }
    }, 5000);
  });
}

export async function queryKnowledgeBase(
  query: string,
  worker: Worker,
  options: {
    maxResults?: number;
    scopeFilter?: 'personal_data' | 'general_finance' | 'both';
    similarityThreshold?: number;
  } = {}
): Promise<{ rule: KnowledgeRule; score: number }[]> {
  const {
    maxResults = 3,
    scopeFilter,
    similarityThreshold = 0.35
  } = options;

  const [dbRules, queryVec] = await Promise.all([
    loadRulesDB(),
    requestEmbedding(worker, query)
  ]);

  // Combine pre-computed DB rules with user custom rules
  const customRules = getCustomRules();
  const candidates = [...dbRules, ...customRules].filter(r => {
    if (!scopeFilter || scopeFilter === 'both') return true;
    return r.scope === scopeFilter || r.scope === 'both';
  });

  const scored = candidates.map(rule => {
    let score = 0;
    if (rule.vector384 && rule.vector384.length === 384) {
      score = cosineSimilarity384(queryVec, new Float32Array(rule.vector384));
    } else {
      // Basic text matching fallback for custom user rules without vectors
      const qLower = query.toLowerCase();
      if (rule.text.toLowerCase().includes(qLower)) score = 0.6;
    }
    return { rule, score };
  });

  return scored
    .filter(res => res.score >= similarityThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── CUSTOM USER RULES STORAGE (localStorage) ─────────────────────────

const LOCAL_RULES_KEY = 'fa_custom_knowledge_rules';

export function getCustomRules(): KnowledgeRule[] {
  try {
    const raw = localStorage.getItem(LOCAL_RULES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function getAllRules(): KnowledgeRule[] {
  return getCustomRules().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export function addKnowledgeRule(text: string): KnowledgeRule {
  const custom = getCustomRules();
  const existing = custom.find(r => r.text.toLowerCase().trim() === text.toLowerCase().trim());
  if (existing) return existing;

  const newRule: KnowledgeRule = {
    id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    text: text.trim(),
    isCustom: true,
    timestamp: Date.now(),
    scope: 'personal_data'
  };
  custom.push(newRule);
  localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(custom));
  return newRule;
}

export function deleteKnowledgeRule(id: string): boolean {
  const custom = getCustomRules();
  const filtered = custom.filter(r => r.id !== id);
  if (filtered.length !== custom.length) {
    localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(filtered));
    return true;
  }
  return false;
}

export function deleteKnowledgeRuleByText(text: string): boolean {
  const custom = getCustomRules();
  const search = text.toLowerCase().trim();
  const target = custom.find(r => r.text.toLowerCase().includes(search));
  if (target) {
    localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(custom.filter(r => r.id !== target.id)));
    return true;
  }
  return false;
}

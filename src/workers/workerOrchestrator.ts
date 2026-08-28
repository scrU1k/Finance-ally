// Multi-Threaded Speculative Race Orchestrator

let deterministicWorker: Worker | null = null;
let semanticWorker: Worker | null = null;
let messageIdCounter = 0;
let isFirstRun = true;

export interface OrchestratorResult {
  categoryId: string | null;
  categoryName?: string;
  paymentMethod?: string | null;
  confidence: number;
  source: 'deterministic' | 'semantic' | 'fallback';
}

function initWorkers() {
  if (typeof window === 'undefined') return; // Server-side rendering guard

  try {
    if (!deterministicWorker) {
      deterministicWorker = new Worker(new URL('./deterministicWorker.ts', import.meta.url), { type: 'module' });
      // Import getUserRules dynamically to populate worker on boot
      import('../services/userRuleService').then(mod => {
        const rules = mod.getUserRules();
        if (rules.length > 0 && deterministicWorker) {
          deterministicWorker.postMessage({ type: 'sync-rules', rules });
        }
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Deterministic worker could not be initialized:', e);
  }

  try {
    if (!semanticWorker) {
      semanticWorker = new Worker(new URL('./semanticWorker.ts', import.meta.url), { type: 'module' });
    }
  } catch (e) {
    console.warn('Semantic worker could not be initialized:', e);
  }
}

export function getSemanticWorkerSingleton(): Worker | null {
  initWorkers();
  return semanticWorker;
}

export function syncRulesToWorker(rules: any[]) {
  initWorkers();
  if (deterministicWorker) {
    deterministicWorker.postMessage({ type: 'sync-rules', rules });
  }
}

/**
 * Dispatches a query to both workers simultaneously.
 * Implements the Speculative Race: if the Deterministic Worker (A) finds a high-confidence match,
 * it instantly resolves the promise and aborts the Semantic Worker (B).
 */
export async function dispatchSpeculativeRace(text: string): Promise<OrchestratorResult> {
  initWorkers();
  
  if (!deterministicWorker || !semanticWorker) {
    return { categoryId: 'cat-others', confidence: 0, source: 'fallback' };
  }

  const messageId = `msg_${++messageIdCounter}`;
  
  const payload = { id: messageId, type: 'parse-expense', text };

  return new Promise((resolve) => {
    let resolved = false;

    // Handler for Worker A (Deterministic - CFG/Trie)
    const handleDeterministic = (e: MessageEvent) => {
      if (e.data.id !== messageId) return;
      
      const { success, result } = e.data;
      if (success && result.confidence >= 90 && !resolved) {
        resolved = true;
        // Speculative Race Won: Early Abort Worker B
        // (We send an explicit abort message to signal the worker to halt processing)
        semanticWorker!.postMessage({ id: messageId, type: 'abort' });
        
        resolve({
          categoryId: result.categoryId,
          paymentMethod: result.paymentMethod,
          confidence: result.confidence,
          source: 'deterministic'
        });
      }
    };

    // Handler for Worker B (Semantic - Transformers.js arctic-xs)
    const handleSemantic = (e: MessageEvent) => {
      if (e.data.id !== messageId) return;
      
      if (!resolved) {
        resolved = true;
        const { success, result } = e.data;
        if (success && result.categoryId) {
          resolve({
            categoryId: result.categoryId,
            categoryName: result.categoryName,
            confidence: result.confidence,
            source: 'semantic'
          });
        } else {
          resolve({ categoryId: 'cat-others', categoryName: 'Others', confidence: 0, source: 'fallback' });
        }
      }
    };

    deterministicWorker!.addEventListener('message', handleDeterministic);
    semanticWorker!.addEventListener('message', handleSemantic);

    // Dispatch the race
    deterministicWorker!.postMessage(payload);
    semanticWorker!.postMessage(payload);

    // Timeout safety fallback (prevent hanging)
    const timeoutDuration = isFirstRun ? 5000 : 1500;
    isFirstRun = false;

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ categoryId: 'cat-others', categoryName: 'Others', confidence: 0, source: 'fallback' });
      }
      deterministicWorker!.removeEventListener('message', handleDeterministic);
      semanticWorker!.removeEventListener('message', handleSemantic);
    }, timeoutDuration);
  });
}

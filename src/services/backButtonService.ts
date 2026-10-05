/**
 * Centralized Back Button Registry Service
 * Manages priority-based hardware/gesture back button handlers across the app.
 */

export type BackHandler = () => boolean;

interface RegisteredHandler {
  id: string;
  priority: number;
  handler: BackHandler;
}

const handlers: RegisteredHandler[] = [];

/**
 * Register a back button handler.
 * Higher priority handlers are executed first.
 * The handler should return `true` if it consumed the back event (e.g. closed a sub-page or modal),
 * or `false` to pass control to the next handler in the stack.
 */
export function registerBackHandler(id: string, priority: number, handler: BackHandler): () => void {
  // Remove existing handler with same ID if any
  const existingIdx = handlers.findIndex(h => h.id === id);
  if (existingIdx !== -1) {
    handlers.splice(existingIdx, 1);
  }

  handlers.push({ id, priority, handler });
  handlers.sort((a, b) => b.priority - a.priority);

  return () => {
    const idx = handlers.findIndex(h => h.id === id);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  };
}

/**
 * Execute the registered back button handlers in order of priority.
 * Returns true if an active handler consumed the event.
 */
export function executeBackAction(): boolean {
  for (const item of [...handlers]) {
    try {
      if (item.handler()) {
        return true;
      }
    } catch (err) {
      console.warn(`[BackButton] Handler error in ${item.id}:`, err);
    }
  }
  return false;
}

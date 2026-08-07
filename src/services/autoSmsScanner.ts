import { ParsedNotification, CurrencyCode } from '../types';
import { parseNotificationText } from './notificationParser';

export interface PendingSmsItem {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
}

/**
 * Reads pending transactional SMS queue captured natively by Android SmsReceiver
 */
export function getPendingSmsQueue(): PendingSmsItem[] {
  try {
    const raw = localStorage.getItem('fa_pending_sms_queue');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Clears an item from the pending SMS queue once auto-logged or dismissed
 */
export function dismissPendingSmsItem(id: string): void {
  try {
    const queue = getPendingSmsQueue();
    const filtered = queue.filter(item => item.id !== id);
    localStorage.setItem('fa_pending_sms_queue', JSON.stringify(filtered));
  } catch {
    // Non-blocking
  }
}

/**
 * Processes all pending SMS items and parses them into transaction proposals
 */
export function processPendingSmsQueue(baseCurrency: CurrencyCode = 'INR'): { item: PendingSmsItem; parsed: ParsedNotification }[] {
  const queue = getPendingSmsQueue();
  const results: { item: PendingSmsItem; parsed: ParsedNotification }[] = [];

  for (const item of queue) {
    const parsed = parseNotificationText(item.body, baseCurrency);
    if (parsed.amount && parsed.amount > 0) {
      results.push({ item, parsed });
    }
  }

  return results;
}

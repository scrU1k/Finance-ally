import { Transaction } from '../types';

/**
 * Utility helper to determine if a transaction is a pending scheduled transaction.
 * A transaction is pending scheduled if its date and time are strictly in the future.
 * Pending scheduled transactions are marked with a loading icon and "Scheduled" tag,
 * and their amounts are excluded from total spending calculations until the target date/time arrives.
 */
export function isPendingScheduledTx(tx: Transaction): boolean {
  if (!tx.isScheduled) return false;
  if (!tx.date) return false;

  const txDateStr = tx.date; // YYYY-MM-DD
  const txTimeStr = tx.time && tx.time.trim() ? tx.time.trim() : '00:00';

  // Construct target timestamp
  const txDateTime = new Date(`${txDateStr}T${txTimeStr}:00`);

  if (isNaN(txDateTime.getTime())) return false;

  return txDateTime.getTime() > Date.now();
}

/**
 * Formats a scheduled transaction's remaining time into a human-readable countdown string.
 * e.g., "Due in 2 hours", "Due tomorrow at 14:30", "Due in 3 days"
 */
export function getScheduledCountdownText(dateStr: string, timeStr?: string): string {
  const now = new Date();
  const target = new Date(`${dateStr}T${timeStr && timeStr.trim() ? timeStr.trim() : '00:00'}:00`);

  if (isNaN(target.getTime())) return 'Scheduled';

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Due now';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `Due in ${diffMins} min${diffMins !== 1 ? 's' : ''}`;
  }
  if (diffHours < 24) {
    return `Due in ${diffHours} hr${diffHours !== 1 ? 's' : ''}`;
  }
  return `Due in ${diffDays} day${diffDays !== 1 ? 's' : ''} (${dateStr})`;
}

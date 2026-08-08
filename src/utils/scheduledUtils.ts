import { Transaction } from '../types';

/**
 * Utility helper to determine if a date and time are in the future relative to right now.
 */
export function isFutureDateTime(dateStr: string, timeStr?: string): boolean {
  if (!dateStr) return false;
  const now = Date.now();
  const timeFormatted = timeStr && timeStr.trim() ? timeStr.trim() : '00:00';
  const targetDateTime = new Date(`${dateStr}T${timeFormatted}:00`);

  if (isNaN(targetDateTime.getTime())) return false;
  return targetDateTime.getTime() > now;
}

/**
 * Utility helper to determine if a transaction is a pending scheduled transaction.
 * A transaction is pending scheduled if:
 * 1. tx.isScheduled is explicitly true AND target date+time is in the future.
 * 2. tx.isScheduled is undefined BUT target date+time is strictly in the future.
 */
export function isPendingScheduledTx(tx: Transaction): boolean {
  if (tx.isScheduled === false) return false;
  return isFutureDateTime(tx.date, tx.time);
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

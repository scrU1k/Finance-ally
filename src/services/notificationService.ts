import { Transaction, CurrencyCode } from '../types';
import { formatCurrency } from './currency';

const NOTIFIED_KEY = 'fa_notified_scheduled_txs';

function getNotifiedTxIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markTxAsNotified(id: string) {
  try {
    const set = getNotifiedTxIds();
    set.add(id);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('Failed to save notified tx state:', e);
  }
}

/**
 * Requests native system notification permissions if supported.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }
  }
  return false;
}

/**
 * Triggers a native system notification for a scheduled payment when its time arrives.
 */
export function triggerScheduledPaymentNotification(tx: Transaction, baseCurrency: CurrencyCode) {
  const notifiedSet = getNotifiedTxIds();
  if (notifiedSet.has(tx.id)) return; // Already notified

  markTxAsNotified(tx.id);

  const title = '⏰ Scheduled Payment Logged';
  const formattedAmt = formatCurrency(tx.amount, tx.currency || baseCurrency);
  const body = `Your scheduled expense "${tx.note}" of ${formattedAmt} is now active and logged into your total.`;

  // 1. Web / System Notification API
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: `tx-scheduled-${tx.id}`,
      });
    } catch (e) {
      console.warn('Notification trigger error:', e);
    }
  }
}

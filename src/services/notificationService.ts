import { registerPlugin } from '@capacitor/core';
import { Transaction, CurrencyCode } from '../types';
import { formatCurrency } from './currency';

// Register the native ScheduledNotification plugin
const ScheduledNotification = registerPlugin<{
  scheduleNotification(opts: { id: number; title: string; body: string; timestamp: number }): Promise<{ success: boolean }>;
  showNotification(opts: { id: number; title: string; body: string }): Promise<{ success: boolean }>;
  cancelNotification(opts: { id: number }): Promise<{ success: boolean }>;
}>('ScheduledNotification');

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

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647 || 1001;
}

/**
 * Requests native system notification permissions on app launch.
 * The actual Android runtime permission dialog is triggered natively in MainActivity.java.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // On Android, the native permission dialog is handled by MainActivity.java on launch.
  // Capacitor's Notification API is used here only as a JS-layer check.
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }
    return false;
  }
  return true; // Native Android handles it
}

/**
 * Pre-schedules a native Android system notification for a future scheduled expense.
 * Uses AlarmManager.setExactAndAllowWhileIdle via the native ScheduledNotificationPlugin —
 * fires even when the app is in background or closed.
 */
export async function scheduleFutureNativeNotification(tx: Transaction, baseCurrency: CurrencyCode) {
  if (!tx.isScheduled || !tx.date) return;

  const tTimeStr = tx.time && tx.time.trim() ? tx.time.trim() : '00:00';
  const targetTime = new Date(`${tx.date}T${tTimeStr}:00`).getTime();

  if (isNaN(targetTime) || targetTime <= Date.now()) return;

  const formattedAmt = formatCurrency(tx.amount, tx.currency || baseCurrency);
  const title = '⏰ Scheduled Payment Due';
  const body = `"${tx.note || 'Scheduled Expense'}" of ${formattedAmt} is now due and has been logged.`;
  const id = hashString(tx.id);

  try {
    await ScheduledNotification.scheduleNotification({ id, title, body, timestamp: targetTime });
    console.log(`[Native] Scheduled alarm notification for ${tx.date} at ${tTimeStr}, id=${id}`);
  } catch (e) {
    console.warn('[Native] scheduleNotification failed:', e);
  }
}

/**
 * Fires an immediate native Android notification when a scheduled payment activates.
 */
export async function triggerScheduledPaymentNotification(tx: Transaction, baseCurrency: CurrencyCode) {
  const notifiedSet = getNotifiedTxIds();
  if (notifiedSet.has(tx.id)) return;

  markTxAsNotified(tx.id);

  const title = '⏰ Scheduled Payment Logged';
  const formattedAmt = formatCurrency(tx.amount, tx.currency || baseCurrency);
  const body = `"${tx.note || 'Scheduled Expense'}" of ${formattedAmt} is now active and added to your total.`;
  const id = hashString(tx.id);

  try {
    await ScheduledNotification.showNotification({ id, title, body });
    console.log('[Native] Fired immediate notification for tx:', tx.id);
  } catch (e) {
    console.warn('[Native] showNotification failed, trying web fallback:', e);
    // Web fallback
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/favicon.ico', tag: `tx-${tx.id}` }); } catch {}
    }
  }
}

/**
 * Fires an immediate native Android notification for general events.
 */
export async function triggerSystemNotification(title: string, body: string, idStr: string) {
  const id = hashString(idStr);
  try {
    await ScheduledNotification.showNotification({ id, title, body });
    console.log('[Native] Fired immediate generic notification for:', idStr);
  } catch (e) {
    console.warn('[Native] showNotification failed, trying web fallback:', e);
    // Web fallback
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/favicon.ico', tag: idStr }); } catch {}
    }
  }
}

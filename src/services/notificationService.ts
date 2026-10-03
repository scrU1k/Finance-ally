import { registerPlugin } from '@capacitor/core';
import { Transaction, Subscription, CurrencyCode } from '../types';
import { formatCurrency } from './currency';
import { logDiagnosticWarn } from './diagnosticLogger';

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
export async function scheduleFutureNativeNotification(tx: Transaction, baseCurrency: CurrencyCode): Promise<boolean> {
  if (!tx.isScheduled || !tx.date) return false;

  const tTimeStr = tx.time && tx.time.trim() ? tx.time.trim() : '00:00';
  const targetTime = new Date(`${tx.date}T${tTimeStr}:00`).getTime();

  if (isNaN(targetTime) || targetTime <= Date.now()) return false;

  const formattedAmt = formatCurrency(tx.amount, tx.currency || baseCurrency);
  const title = '⏰ Scheduled Payment Due';
  const body = `"${tx.note || 'Scheduled Expense'}" of ${formattedAmt} is due today.`;
  const id = hashString(tx.id);

  try {
    const res = await ScheduledNotification.scheduleNotification({ id, title, body, timestamp: targetTime });
    console.log(`[Native] Scheduled alarm notification for ${tx.date} at ${tTimeStr}, id=${id}`);
    return res?.success ?? true;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn('[Native] scheduleNotification failed:', e);
    logDiagnosticWarn('NotificationService', `Failed to schedule native alarm for tx ${tx.id}: ${msg}`);
    return false;
  }
}

/**
 * Cancels a pre-scheduled native Android system notification for a scheduled expense.
 */
export async function cancelScheduledNotification(txId: string) {
  const id = hashString(txId);
  try {
    await ScheduledNotification.cancelNotification({ id });
    console.log(`[Native] Cancelled scheduled alarm notification for tx: ${txId} (id=${id})`);
  } catch (e) {
    console.warn('[Native] cancelNotification failed:', e);
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

/**
 * Pre-schedules a native Android system notification reminder for a subscription.
 * Uses exact alarm notification via ScheduledNotificationPlugin without emojis.
 */
export async function scheduleSubscriptionReminder(
  sub: Subscription,
  categoryName: string,
  baseCurrency: CurrencyCode
): Promise<void> {
  if (!sub.reminderOffset || sub.reminderOffset === 'none') {
    await cancelSubscriptionReminder(sub.id);
    return;
  }

  const timeStr = sub.dueTime && sub.dueTime.trim() ? sub.dueTime.trim() : '09:00';
  const dueDateTime = new Date(`${sub.nextDueDate}T${timeStr}:00`).getTime();
  if (isNaN(dueDateTime)) return;

  let offsetMs = 0;
  switch (sub.reminderOffset) {
    case '15m': offsetMs = 15 * 60 * 1000; break;
    case '30m': offsetMs = 30 * 60 * 1000; break;
    case '1h': offsetMs = 60 * 60 * 1000; break;
    case '4h': offsetMs = 4 * 60 * 60 * 1000; break;
    case '12h': offsetMs = 12 * 60 * 60 * 1000; break;
    case '1d': offsetMs = 24 * 60 * 60 * 1000; break;
    case '2d': offsetMs = 48 * 60 * 60 * 1000; break;
    default: return;
  }

  const targetReminderTime = dueDateTime - offsetMs;
  if (targetReminderTime <= Date.now()) {
    return;
  }

  const formattedAmt = formatCurrency(sub.amount, sub.currency || baseCurrency);
  // Strictly without emojis:
  const title = `Subscription Due: ${sub.name}`;
  const body = `"${sub.name}" (${categoryName}) due on ${sub.nextDueDate} at ${timeStr} • ${formattedAmt}`;
  const id = hashString(`sub_reminder_${sub.id}`);

  try {
    await ScheduledNotification.scheduleNotification({
      id,
      title,
      body,
      timestamp: targetReminderTime
    });
    console.log(`[Native] Scheduled subscription reminder for ${sub.name} at ${new Date(targetReminderTime).toISOString()} (id=${id})`);
  } catch (e) {
    console.warn('[Native] scheduleSubscriptionReminder failed:', e);
  }
}

/**
 * Cancels a pre-scheduled native Android system notification reminder for a subscription.
 */
export async function cancelSubscriptionReminder(subId: string): Promise<void> {
  const id = hashString(`sub_reminder_${subId}`);
  try {
    await ScheduledNotification.cancelNotification({ id });
    console.log(`[Native] Cancelled subscription reminder for sub: ${subId} (id=${id})`);
  } catch (e) {
    console.warn('[Native] cancelSubscriptionReminder failed:', e);
  }
}

/**
 * Synchronizes all upcoming scheduled payments and subscription reminders with the native OS alarm manager.
 * Ensures native alarms are always active even if the app was closed or device was rebooted.
 */
export async function syncAllFutureNotifications(
  transactions: Transaction[],
  subscriptions: Subscription[],
  categories: { id: string; name: string }[],
  baseCurrency: CurrencyCode
): Promise<void> {
  // 1. Sync future scheduled transactions
  for (const tx of transactions) {
    if (tx.isScheduled && tx.date) {
      await scheduleFutureNativeNotification(tx, baseCurrency);
    }
  }

  // 2. Sync future subscription reminders
  for (const sub of subscriptions) {
    if (sub.reminderOffset && sub.reminderOffset !== 'none') {
      const cat = categories.find(c => c.id === sub.categoryId);
      await scheduleSubscriptionReminder(sub, cat?.name || 'General', baseCurrency);
    }
  }
}


import { LocalNotifications } from '@capacitor/local-notifications';
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

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Creates native Android Notification Channel for scheduled payments.
 */
async function createAndroidNotificationChannel() {
  try {
    await LocalNotifications.createChannel({
      id: 'scheduled_payments',
      name: 'Scheduled Payments',
      description: 'Notifications for scheduled expenses and payment reminders',
      importance: 5, // High Importance: Heads-up banner + sound + vibration
      visibility: 1, // Public
      sound: 'beep.wav',
      vibration: true,
    });
  } catch (e) {
    console.warn('Native notification channel creation error:', e);
  }
}

/**
 * Requests native system notification permissions on app launch.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // 1. Native Android / iOS LocalNotifications check & request
    const capStatus = await LocalNotifications.checkPermissions();
    if (capStatus.display !== 'granted') {
      const reqRes = await LocalNotifications.requestPermissions();
      if (reqRes.display === 'granted') {
        await createAndroidNotificationChannel();
        return true;
      }
    } else {
      await createAndroidNotificationChannel();
      return true;
    }
  } catch (e) {
    console.log('Capacitor local notifications check failed, checking web fallback:', e);
  }

  // 2. Web Notification API fallback
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
 * Pre-schedules a native Android/iOS system notification for a future scheduled expense.
 * Android OS will fire this notification at the exact target date & time even if app is in background.
 */
export async function scheduleFutureNativeNotification(tx: Transaction, baseCurrency: CurrencyCode) {
  if (!tx.isScheduled || !tx.date) return;

  const tDateStr = tx.date;
  const tTimeStr = tx.time && tx.time.trim() ? tx.time.trim() : '00:00';
  const targetTime = new Date(`${tDateStr}T${tTimeStr}:00`).getTime();

  if (isNaN(targetTime) || targetTime <= Date.now()) return;

  const formattedAmt = formatCurrency(tx.amount, tx.currency || baseCurrency);
  const title = '⏰ Scheduled Payment Due';
  const body = `Your scheduled expense "${tx.note || 'Scheduled Expense'}" of ${formattedAmt} is due now!`;

  try {
    await createAndroidNotificationChannel();
    const idHash = Math.abs(hashString(tx.id)) % 2147483647 || 1001;
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: idHash,
          schedule: { at: new Date(targetTime) },
          channelId: 'scheduled_payments',
        },
      ],
    });
    console.log(`Pre-scheduled native notification for ${tx.date} at ${tx.time}`);
  } catch (e) {
    console.warn('Failed to pre-schedule native notification:', e);
  }
}

/**
 * Triggers an immediate native Android/iOS system notification when a scheduled payment activates.
 */
export async function triggerScheduledPaymentNotification(tx: Transaction, baseCurrency: CurrencyCode) {
  const notifiedSet = getNotifiedTxIds();
  if (notifiedSet.has(tx.id)) return; // Already notified

  markTxAsNotified(tx.id);

  const title = '⏰ Scheduled Payment Logged';
  const formattedAmt = formatCurrency(tx.amount, tx.currency || baseCurrency);
  const body = `Your scheduled expense "${tx.note || 'Scheduled Expense'}" of ${formattedAmt} is now active and added to your total.`;

  // 1. Native Capacitor Local Notification
  try {
    await createAndroidNotificationChannel();
    const idHash = Math.abs(hashString(tx.id)) % 2147483647 || 1001;
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: idHash,
          schedule: { at: new Date(Date.now() + 500) }, // Fire in 0.5 sec
          channelId: 'scheduled_payments',
        },
      ],
    });
    console.log('Fired native Capacitor local notification for tx:', tx.id);
  } catch (e) {
    console.warn('Capacitor LocalNotification failed, trying web fallback:', e);

    // 2. Web Notification fallback
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: `tx-scheduled-${tx.id}`,
        });
      } catch (err) {
        console.warn('Web notification error:', err);
      }
    }
  }
}

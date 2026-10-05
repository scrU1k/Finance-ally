/**
 * Finance Orchestrator Service
 * Handles background lifecycle operations, periodic synchronizations,
 * and automated backups decoupled from React UI component trees.
 */

import { Transaction, Category, Subscription, CurrencyCode } from '../types';
import { checkAndPerformLocalAutoBackup, pruneFilesystemSnapshots, getRetentionLimit, purgeLegacySnapshotLocalStorageCache } from './localAutoBackupService';
import { syncAllFutureNotifications } from './notificationService';
import { trainModel } from './localInferenceEngine';

/**
 * Runs background maintenance and scheduled notification sync on startup or data reload.
 */
export async function runStartupSync(
  transactions: Transaction[],
  subscriptions: Subscription[],
  categories: Category[],
  baseCurrency: CurrencyCode
): Promise<void> {
  // 1. Purge any legacy multi-megabyte snapshots from localStorage to prevent quota crashes
  purgeLegacySnapshotLocalStorageCache();

  // 2. Check and perform automated snapshot backup if due
  checkAndPerformLocalAutoBackup(transactions.length).catch(e => {
    console.warn('[Orchestrator] Auto backup check failed:', e);
  });

  // 3. Prune old filesystem snapshots globally across devices
  pruneFilesystemSnapshots(getRetentionLimit()).catch(e => {
    console.warn('[Orchestrator] Pruning snapshots failed:', e);
  });

  // 3. Sync all future scheduled payments to native alarms
  syncAllFutureNotifications(transactions, subscriptions, categories, baseCurrency).catch(e => {
    console.warn('[Orchestrator] Notification sync failed:', e);
  });
}

/**
 * Triggers an incremental auto-backup check after modifying transactions.
 */
export function triggerBackgroundBackup(transactionCount: number): void {
  checkAndPerformLocalAutoBackup(transactionCount).catch(e => {
    console.warn('[Orchestrator] Background backup error:', e);
  });
}

/**
 * Retrains the local ML inference engine in the background when transactions change.
 */
export function scheduleModelRetraining(transactions: Transaction[]): void {
  if (transactions.length > 0) {
    try {
      trainModel(transactions);
    } catch (e) {
      console.warn('[Orchestrator] Model training error:', e);
    }
  }
}

/**
 * Checks if forex exchange rates need a daily background refresh.
 */
export function checkAndAutoSyncForex(syncFn: () => Promise<boolean>): void {
  const lastSyncStr = localStorage.getItem('fa_rates_last_sync');
  if (lastSyncStr) {
    const lastSync = parseInt(lastSyncStr, 10);
    if (Date.now() - lastSync > 24 * 60 * 60 * 1000) {
      syncFn().catch(() => {});
    }
  } else {
    syncFn().catch(() => {}); // Initial sync
  }
}

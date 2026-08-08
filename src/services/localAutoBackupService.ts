/**
 * Offline Automated Local Database Backup Service
 * Performs background automated JSON/Encrypted snapshots on local storage / Android filesystem.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { exportFullDataBackup } from './db';

export type LocalSyncSchedule = 'daily' | 'weekly' | 'monthly' | 'off';

export interface LocalSnapshotMetadata {
  id: string;
  filename: string;
  timestamp: string;
  schedule: LocalSyncSchedule;
  isEncrypted: boolean;
  sizeBytes: number;
}

const CONFIG_KEY = 'fa_local_autobackup_config';
const SNAPSHOTS_KEY = 'fa_local_snapshots_list';
const MAX_SNAPSHOTS = 10;

export interface LocalAutoBackupConfig {
  enabled: boolean;
  schedule: LocalSyncSchedule;
  monthlyDay: number; // 1 - 31
  lastBackupTime: number; // ms timestamp
}

export function getLocalAutoBackupConfig(): LocalAutoBackupConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse local autobackup config:', e);
  }
  return {
    enabled: true,
    schedule: 'weekly',
    monthlyDay: 1,
    lastBackupTime: 0,
  };
}

export function saveLocalAutoBackupConfig(config: Partial<LocalAutoBackupConfig>): LocalAutoBackupConfig {
  const current = getLocalAutoBackupConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

export function getLocalSnapshots(): LocalSnapshotMetadata[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse local snapshots list:', e);
  }
  return [];
}

function saveSnapshotsList(list: LocalSnapshotMetadata[]) {
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(list));
}

/**
 * Determines if a new auto-backup is due based on schedule and last backup time.
 */
export function isBackupDue(config: LocalAutoBackupConfig): boolean {
  if (!config.enabled || config.schedule === 'off') return false;

  const now = new Date();
  const nowMs = now.getTime();
  const lastMs = config.lastBackupTime || 0;

  if (lastMs === 0) return true; // First time backup

  const diffMs = nowMs - lastMs;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  switch (config.schedule) {
    case 'daily':
      return diffDays >= 1;
    case 'weekly':
      return diffDays >= 7;
    case 'monthly': {
      if (diffDays < 25) return false;
      const currentDay = now.getDate();
      return currentDay >= config.monthlyDay;
    }
    default:
      return false;
  }
}

/**
 * Creates an offline local automated snapshot of the app database.
 * Auto-backups are always saved as plain JSON — encryption requires the user's
 * plaintext PIN which is never held in memory and cannot be safely used here.
 * Manual encrypted exports from the Settings modal are unaffected.
 */
export async function createLocalAutoBackup(manualTrigger = false): Promise<{ success: boolean; snapshot?: LocalSnapshotMetadata; message: string }> {
  try {
    const config = getLocalAutoBackupConfig();
    const jsonStr = await exportFullDataBackup();

    // Auto-backups are always plain JSON — encryption requires the raw PIN
    // which is never stored in memory. Manual exports retain AES-256-GCM encryption.
    const finalPayload = jsonStr;
    const isEncrypted = false;

    const isoDate = new Date().toISOString().split('T')[0];
    const timestampStr = new Date().toLocaleString();
    const filename = `fa_autobackup_${isoDate}_${Date.now().toString().slice(-4)}.${isEncrypted ? 'json.enc' : 'json'}`;
    const sizeBytes = new Blob([finalPayload]).size;

    // Save payload to Native Filesystem if on Android/iOS, else localStorage fallback
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.writeFile({
          path: `Finance-Ally/Snapshots/${filename}`,
          data: finalPayload,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });
      } catch (err) {
        console.warn('Native filesystem save warning, falling back to cache:', err);
        await Filesystem.writeFile({
          path: filename,
          data: finalPayload,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
      }
    }

    const newSnapshot: LocalSnapshotMetadata = {
      id: `snap_${Date.now()}`,
      filename,
      timestamp: timestampStr,
      schedule: config.schedule,
      isEncrypted,
      sizeBytes,
    };

    // Store payload snapshot in localStorage cache for instant UI restoration
    try {
      localStorage.setItem(`fa_snap_data_${newSnapshot.id}`, finalPayload);
    } catch {
      // Storage quota exceeded — prune older snapshot payloads to free space
      try {
        const existing = getLocalSnapshots();
        // Remove older cached payloads except the newest one
        existing.slice(1).forEach(old => localStorage.removeItem(`fa_snap_data_${old.id}`));
        localStorage.setItem(`fa_snap_data_${newSnapshot.id}`, finalPayload);
      } catch {
        // Safe fallback if still full
      }
    }

    // Update snapshots history list (keep max 10 latest metadata records)
    let snapshots = getLocalSnapshots();
    snapshots.unshift(newSnapshot);
    if (snapshots.length > MAX_SNAPSHOTS) {
      const removed = snapshots.slice(MAX_SNAPSHOTS);
      removed.forEach(r => localStorage.removeItem(`fa_snap_data_${r.id}`));
      snapshots = snapshots.slice(0, MAX_SNAPSHOTS);
    }

    saveSnapshotsList(snapshots);
    saveLocalAutoBackupConfig({ lastBackupTime: Date.now() });

    return {
      success: true,
      snapshot: newSnapshot,
      message: `${manualTrigger ? 'Manual' : 'Automated'} local snapshot created successfully (${(sizeBytes / 1024).toFixed(1)} KB).`,
    };
  } catch (err: any) {
    console.error('Failed to create local auto backup:', err);
    return {
      success: false,
      message: `Local backup error: ${err?.message || 'Failed to generate snapshot.'}`,
    };
  }
}

/**
 * Checks and performs auto-backup if schedule is due on app startup.
 */
export async function checkAndPerformLocalAutoBackup(): Promise<void> {
  const config = getLocalAutoBackupConfig();
  if (isBackupDue(config)) {
    console.log('Finance-Ally: Local auto-backup is due. Creating snapshot...');
    await createLocalAutoBackup(false);
  }
}

/**
 * Gets payload for a specific snapshot ID.
 */
export function getSnapshotPayload(snapshotId: string): string | null {
  return localStorage.getItem(`fa_snap_data_${snapshotId}`);
}

/**
 * Deletes a snapshot.
 */
export function deleteLocalSnapshot(snapshotId: string): LocalSnapshotMetadata[] {
  localStorage.removeItem(`fa_snap_data_${snapshotId}`);
  const list = getLocalSnapshots().filter(s => s.id !== snapshotId);
  saveSnapshotsList(list);
  return list;
}

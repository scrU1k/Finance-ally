/**
 * Offline Automated Local Database Backup Service
 * Performs background automated JSON/Encrypted snapshots on local storage / Android filesystem.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { exportFullDataBackup } from './db';
import { encryptHybridJSON, hasExportPin } from './cryptoService';
import { triggerSystemNotification } from './notificationService';


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
const ACCOUNT_CREATED_KEY = 'fa_account_created_at';
const MAX_SNAPSHOTS = 5;

export function getAccountCreatedAt(): number {
  try {
    const raw = localStorage.getItem(ACCOUNT_CREATED_KEY);
    if (raw) return parseInt(raw, 10);
  } catch {}
  const now = Date.now();
  localStorage.setItem(ACCOUNT_CREATED_KEY, now.toString());
  return now;
}

export function setAccountCreatedAt(ts: number = Date.now()): void {
  localStorage.setItem(ACCOUNT_CREATED_KEY, ts.toString());
}

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
 * Scans the native filesystem for snapshots (in case App Data / localStorage was wiped)
 * and repopulates the local cache metadata list.
 */
export async function syncSnapshotsFromFilesystem(): Promise<LocalSnapshotMetadata[]> {
  if (!Capacitor.isNativePlatform()) return getLocalSnapshots();

  try {
    const res = await Filesystem.readdir({
      path: 'Finance-Ally/Snapshots',
      directory: Directory.Documents,
    });

    const validFiles = res.files.filter(f => f.name.endsWith('.json') || f.name.endsWith('.json.enc'));
    if (validFiles.length === 0) return getLocalSnapshots();

    // Rebuild metadata array
    const rebuilt: LocalSnapshotMetadata[] = validFiles.map((f, i) => {
      // Best-effort timestamp extraction from 'fa_autobackup_YYYY-MM-DD_ID.json'
      const parts = f.name.split('_');
      let timestamp = new Date(f.mtime || Date.now()).toLocaleString();
      if (parts.length >= 3) {
        timestamp = parts[2]; // The YYYY-MM-DD part as fallback
      }
      return {
        id: `snap_recovered_${f.mtime || Date.now()}_${i}`,
        filename: f.name,
        timestamp,
        schedule: 'off' as LocalSyncSchedule, // assume manual/unknown since config was lost
        isEncrypted: f.name.endsWith('.json.enc'),
        sizeBytes: f.size || 0,
      };
    });

    // Sort by newest first
    rebuilt.sort((a, b) => {
      if (a.id > b.id) return -1;
      if (a.id < b.id) return 1;
      return 0;
    });

    // Merge with any existing local storage records (avoiding exact filename duplicates)
    const existing = getLocalSnapshots();
    const merged = [...existing];
    for (const r of rebuilt) {
      if (!merged.find(m => m.filename === r.filename)) {
        merged.push(r);
      }
    }
    
    // Sort again
    merged.sort((a, b) => b.id.localeCompare(a.id));
    const finalMerged = merged.slice(0, 10); // keep up to max

    saveSnapshotsList(finalMerged);
    return finalMerged;

  } catch (err) {
    console.warn('Could not scan native filesystem for snapshots:', err);
    return getLocalSnapshots();
  }
}

/**
 * Determines if a new auto-backup is due based on schedule and last backup time.
 */
export function isBackupDue(config: LocalAutoBackupConfig, transactionCount: number = 0): boolean {
  if (!config.enabled || config.schedule === 'off') return false;

  const now = new Date();
  const nowMs = now.getTime();
  const lastMs = config.lastBackupTime || 0;

  // First time auto-snapshot: ONLY taken on 2nd day or later AFTER user makes a log
  if (lastMs === 0) {
    if (transactionCount === 0) return false;

    const createdMs = getAccountCreatedAt();
    const createdDate = new Date(createdMs).toISOString().split('T')[0];
    const currentDate = now.toISOString().split('T')[0];

    // Same day as account creation -> do NOT take snapshot yet
    if (currentDate === createdDate) {
      return false;
    }

    // 2nd day or later + user has logged at least 1 expense -> trigger 1st auto snapshot!
    return true;
  }

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
 * If a Backup PIN is set, it automatically encrypts the snapshot using 
 * the stored RSA Public Key (Hybrid Crypto) without needing the PIN in memory.
 */
export async function createLocalAutoBackup(
  manualTrigger = false
): Promise<{ success: boolean; snapshot?: LocalSnapshotMetadata; message: string }> {
  try {
    const config = getLocalAutoBackupConfig();
    const jsonStr = await exportFullDataBackup();

    // Automatically encrypt if a PIN is set (uses stored RSA Public Key)
    const isEncrypted = hasExportPin();
    const finalPayload = isEncrypted ? await encryptHybridJSON(jsonStr) : jsonStr;

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
    } catch (e) {
      console.warn('LocalStorage cache write failed:', e);
    }

    // Update snapshots list
    const snapshots = getLocalSnapshots();
    snapshots.unshift(newSnapshot);
    const trimmedSnapshots = snapshots.slice(0, MAX_SNAPSHOTS);
    saveSnapshotsList(trimmedSnapshots);

    // Update last backup time
    saveLocalAutoBackupConfig({ lastBackupTime: Date.now() });

    // Native notification alert
    if (!manualTrigger) {
      triggerSystemNotification(
        'Offline Auto-Backup Complete',
        `Automated database snapshot saved (${(sizeBytes / 1024).toFixed(1)} KB).`,
        `snap_notify_${newSnapshot.id}`
      );
    }

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
 * Checks and performs auto-backup if schedule is due on app startup or log creation.
 */
export async function checkAndPerformLocalAutoBackup(transactionCount: number = 0): Promise<void> {
  const config = getLocalAutoBackupConfig();
  if (isBackupDue(config, transactionCount)) {
    console.log('Finance-Ally: Local auto-backup is due. Creating snapshot...');
    await createLocalAutoBackup(false);
  }
}

/**
 * Gets payload for a specific snapshot. Tries cache first, then reads native filesystem.
 */
export async function getSnapshotPayload(snap: LocalSnapshotMetadata): Promise<string | null> {
  const cached = localStorage.getItem(`fa_snap_data_${snap.id}`);
  if (cached) return cached;

  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Filesystem.readFile({
        path: `Finance-Ally/Snapshots/${snap.filename}`,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
      if (typeof result.data === 'string') return result.data;
    } catch (e) {
      console.warn(`Failed to read snapshot ${snap.filename} from Documents:`, e);
      try {
        const result2 = await Filesystem.readFile({
          path: snap.filename,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });
        if (typeof result2.data === 'string') return result2.data;
      } catch (e2) {
        console.warn(`Failed to read snapshot ${snap.filename} from Cache fallback:`, e2);
      }
    }
  }
  
  return null;
}

/**
 * Deletes a snapshot.
 */
export function deleteLocalSnapshot(snapshotId: string): LocalSnapshotMetadata[] {
  const list = getLocalSnapshots();
  const snap = list.find(s => s.id === snapshotId);
  
  localStorage.removeItem(`fa_snap_data_${snapshotId}`);
  
  if (snap && Capacitor.isNativePlatform()) {
    Filesystem.deleteFile({
      path: `Finance-Ally/Snapshots/${snap.filename}`,
      directory: Directory.Documents
    }).catch(() => {
      Filesystem.deleteFile({
        path: snap.filename,
        directory: Directory.Cache
      }).catch(() => {});
    });
  }
  
  const updatedList = list.filter(s => s.id !== snapshotId);
  saveSnapshotsList(updatedList);
  return updatedList;
}

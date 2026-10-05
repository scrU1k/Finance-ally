/**
 * Offline Automated Local Database Backup Service
 * Performs background automated JSON/Encrypted snapshots on local storage / Android filesystem.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { exportFullDataBackup } from './db';
import { encryptHybridJSON, hasExportPin } from './cryptoService';
import { triggerSystemNotification } from './notificationService';
import { getLocalDateString } from '../utils/dateUtils';

export type LocalSyncSchedule = 'daily' | 'weekly' | 'monthly' | 'off';

export interface LocalSnapshotMetadata {
  id: string;
  filename: string;
  timestamp: string;
  schedule: LocalSyncSchedule;
  isEncrypted: boolean;
  sizeBytes: number;
}

export interface LastBackupError {
  timestamp: number;
  message: string;
  dismissed: boolean;
}

const CONFIG_KEY = 'fa_local_autobackup_config';
const SNAPSHOTS_KEY = 'fa_local_snapshots_list';
const ACCOUNT_CREATED_KEY = 'fa_account_created_at';
const ERROR_KEY = 'fa_last_backup_error';

const backupErrorListeners: Array<(err: LastBackupError) => void> = [];

export function getLastBackupError(): LastBackupError | null {
  try {
    const raw = localStorage.getItem(ERROR_KEY);
    if (raw) {
      const err: LastBackupError = JSON.parse(raw);
      if (!err.dismissed) return err;
    }
  } catch {}
  return null;
}

export function dismissLastBackupError(): void {
  try {
    const raw = localStorage.getItem(ERROR_KEY);
    if (raw) {
      const err: LastBackupError = JSON.parse(raw);
      err.dismissed = true;
      localStorage.setItem(ERROR_KEY, JSON.stringify(err));
    }
  } catch {}
}

export function setLastBackupError(message: string): void {
  const err: LastBackupError = {
    timestamp: Date.now(),
    message,
    dismissed: false,
  };
  try {
    localStorage.setItem(ERROR_KEY, JSON.stringify(err));
  } catch {}
  backupErrorListeners.forEach(listener => {
    try { listener(err); } catch {}
  });
}

export function onBackupError(listener: (err: LastBackupError) => void): () => void {
  backupErrorListeners.push(listener);
  return () => {
    const idx = backupErrorListeners.indexOf(listener);
    if (idx >= 0) backupErrorListeners.splice(idx, 1);
  };
}

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
  retentionLimit: number; // 5 or 10 (default: 10)
  gzipCompression?: boolean;
}

export function getLocalAutoBackupConfig(): LocalAutoBackupConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        retentionLimit: parsed.retentionLimit === 5 ? 5 : 10,
        gzipCompression: !!parsed.gzipCompression,
      };
    }
  } catch (e) {
    console.warn('Failed to parse local autobackup config:', e);
  }
  return {
    enabled: true,
    schedule: 'weekly',
    monthlyDay: 1,
    lastBackupTime: 0,
    retentionLimit: 10,
    gzipCompression: false,
  };
}

export function getRetentionLimit(): number {
  return getLocalAutoBackupConfig().retentionLimit || 10;
}

export function saveLocalAutoBackupConfig(config: Partial<LocalAutoBackupConfig>): LocalAutoBackupConfig {
  const current = getLocalAutoBackupConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  if (config.retentionLimit) {
    pruneFilesystemSnapshots(config.retentionLimit).catch((e) => console.warn('Pruning error:', e));
  }
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
 * Safely extracts a string filename from readdir results across Capacitor versions.
 */
export function getEntryName(item: any): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object' && typeof item.name === 'string') return item.name;
  return '';
}

/**
 * Extracts a dependable timestamp from a snapshot file's name and metadata.
 * Ensures newest-first ordering even if Android filesystem readdir omits mtime.
 */
export function getFileTime(f: any): number {
  if (f && typeof f === 'object' && typeof f.mtime === 'number' && f.mtime > 0) return f.mtime;
  const name = getEntryName(f);
  // Match fa_autobackup_YYYY-MM-DD_1727891234567 or fa_autobackup_YYYY-MM-DD_1234
  const match = name.match(/fa_autobackup_(\d{4}-\d{2}-\d{2})(?:_(\d+))?/);
  if (match) {
    const datePart = match[1];
    const suffix = match[2];
    const baseTime = new Date(datePart).getTime();
    if (suffix && suffix.length >= 10) {
      return parseInt(suffix, 10);
    }
    if (suffix) {
      return baseTime + parseInt(suffix, 10);
    }
    return baseTime;
  }
  return 0;
}

/**
 * Strict validator preventing path traversal sequences and ensuring safe snapshot filenames.
 */
export function isValidSnapshotFilename(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
  return /^fa_autobackup_[\w\.-]+\.(json|json\.enc|gz)$/.test(filename);
}

/**
 * Purges all legacy fa_snap_data_* items from localStorage to prevent QuotaExceededError.
 */
export function purgeLegacySnapshotLocalStorageCache(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('fa_snap_data_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/**
 * Robustly prunes older snapshots directly from device filesystem storage beyond retentionLimit.
 * Scans all known snapshot directories, deduplicates, sorts globally by timestamp, and deletes surplus files.
 */
export async function pruneFilesystemSnapshots(retentionLimit: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const locations = [
    { path: 'Finance-Ally/Snapshots', dir: Directory.Documents },
    { path: 'Snapshots', dir: Directory.Documents },
    { path: 'Finance-Ally', dir: Directory.Documents },
    { path: 'Finance-Ally/Snapshots', dir: Directory.Data },
    { path: '', dir: Directory.Cache },
  ];

  interface FoundFile {
    locPath: string;
    locDir: Directory;
    fullPath: string;
    fileName: string;
    timeMs: number;
  }

  const allFoundFiles: FoundFile[] = [];

  for (const loc of locations) {
    try {
      const res = await Filesystem.readdir({
        path: loc.path,
        directory: loc.dir,
      });

      if (!res || !Array.isArray(res.files)) continue;

      for (const f of res.files) {
        const name = getEntryName(f);
        if (isValidSnapshotFilename(name)) {
          const filePath = loc.path ? `${loc.path}/${name}` : name;
          allFoundFiles.push({
            locPath: loc.path,
            locDir: loc.dir,
            fullPath: filePath,
            fileName: name,
            timeMs: getFileTime(f) || 0,
          });
        }
      }
    } catch {
      // Directory may not exist in this particular location, ignore silently
    }
  }

  if (allFoundFiles.length === 0) return;

  // Identify files in primary directory vs secondary fallback locations
  const primaryFileNames = new Set<string>();
  for (const item of allFoundFiles) {
    if (item.locPath === 'Finance-Ally/Snapshots' && item.locDir === Directory.Documents) {
      primaryFileNames.add(item.fileName);
    }
  }

  const uniqueFilesMap = new Map<string, FoundFile>();
  for (const item of allFoundFiles) {
    // Delete stale duplicate in secondary location if already in primary
    if (item.locPath !== 'Finance-Ally/Snapshots' && primaryFileNames.has(item.fileName)) {
      try {
        await Filesystem.deleteFile({ path: item.fullPath, directory: item.locDir });
      } catch {}
      continue;
    }
    if (!uniqueFilesMap.has(item.fileName) || uniqueFilesMap.get(item.fileName)!.timeMs < item.timeMs) {
      uniqueFilesMap.set(item.fileName, item);
    }
  }

  const sortedList = Array.from(uniqueFilesMap.values()).sort((a, b) => b.timeMs - a.timeMs);

  if (sortedList.length > retentionLimit) {
    const surplus = sortedList.slice(retentionLimit);
    for (const item of surplus) {
      try {
        await Filesystem.deleteFile({
          path: item.fullPath,
          directory: item.locDir,
        });
        console.log(`[Auto-Backup] Pruned surplus snapshot from filesystem: ${item.fullPath}`);
      } catch (e) {
        console.warn(`[Auto-Backup] Could not delete surplus snapshot: ${item.fullPath}`, e);
      }
    }
  }
}

/**
 * Scans the native filesystem for snapshots, removes surplus files on disk beyond retentionLimit,
 * and repopulates the local metadata list.
 */
export async function syncSnapshotsFromFilesystem(): Promise<LocalSnapshotMetadata[]> {
  const limit = getRetentionLimit();
  if (!Capacitor.isNativePlatform()) {
    const list = getLocalSnapshots();
    const kept = list.slice(0, limit);
    const evicted = list.slice(limit);
    for (const e of evicted) {
      try { localStorage.removeItem(`fa_snap_data_${e.id}`); } catch {}
    }
    saveSnapshotsList(kept);
    return kept;
  }

  try {
    // 1. Physically prune surplus files on disk first
    await pruneFilesystemSnapshots(limit);
    // 2. Free up any multi-MB localStorage snapshot clutter from legacy versions
    purgeLegacySnapshotLocalStorageCache();

    // 2. Read current files from primary snapshot directory
    const res = await Filesystem.readdir({
      path: 'Finance-Ally/Snapshots',
      directory: Directory.Documents,
    });

    if (!res || !Array.isArray(res.files)) return getLocalSnapshots().slice(0, limit);

    const validFiles = res.files.filter(f => {
      const name = getEntryName(f);
      return name.startsWith('fa_autobackup_') && (name.endsWith('.json') || name.endsWith('.json.enc') || name.endsWith('.gz'));
    });
    if (validFiles.length === 0) return getLocalSnapshots().slice(0, limit);

    // Sort newest first
    validFiles.sort((a, b) => getFileTime(b) - getFileTime(a));

    const keptFiles = validFiles.slice(0, limit);

    // Rebuild metadata array for the kept files
    const rebuilt: LocalSnapshotMetadata[] = keptFiles.map((f, i) => {
      const fileName = getEntryName(f);
      const timeMs = getFileTime(f) || Date.now();
      const timestamp = new Date(timeMs).toLocaleString();
      const fileSize = (typeof f === 'object' && f && typeof f.size === 'number') ? f.size : 0;
      return {
        id: `snap_recovered_${timeMs}_${i}`,
        filename: fileName,
        timestamp,
        schedule: 'off' as LocalSyncSchedule,
        isEncrypted: fileName.endsWith('.json.enc'),
        sizeBytes: fileSize,
      };
    });

    // Merge with any existing local storage records
    const existing = getLocalSnapshots();
    const merged: LocalSnapshotMetadata[] = [];

    for (const k of keptFiles) {
      const fileName = getEntryName(k);
      const match = existing.find(e => e.filename === fileName);
      if (match) {
        merged.push(match);
      } else {
        const r = rebuilt.find(rb => rb.filename === fileName);
        if (r) merged.push(r);
      }
    }

    const finalMerged = merged.slice(0, limit);
    saveSnapshotsList(finalMerged);

    // Purge any orphan cache keys from localStorage
    try {
      const keptIds = new Set(finalMerged.map(m => m.id));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fa_snap_data_')) {
          const snapId = key.replace('fa_snap_data_', '');
          if (!keptIds.has(snapId)) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch {}

    return finalMerged;
  } catch (err) {
    console.warn('Could not scan native filesystem for snapshots:', err);
    return getLocalSnapshots().slice(0, limit);
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
    const createdDate = getLocalDateString(new Date(createdMs));
    const currentDate = getLocalDateString(now);

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
    const limit = config.retentionLimit || 10;
    const jsonStr = await exportFullDataBackup();

    // Automatically encrypt if a PIN is set (uses stored RSA Public Key)
    const isEncrypted = hasExportPin();
    const shouldCompress = !!config.gzipCompression;
    const finalPayload = isEncrypted ? await encryptHybridJSON(jsonStr, shouldCompress) : jsonStr;

    const isoDate = getLocalDateString();
    const timestampStr = new Date().toLocaleString();
    const filename = `fa_autobackup_${isoDate}_${Date.now()}.${isEncrypted ? 'json.enc' : 'json'}`;
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

    // Do NOT duplicate multi-megabyte database snapshots into localStorage on Native platform (prevents 5MB quota crash)
    if (!Capacitor.isNativePlatform()) {
      try {
        localStorage.setItem(`fa_snap_data_${newSnapshot.id}`, finalPayload);
      } catch (e) {
        console.warn('LocalStorage snapshot cache write skipped (quota constrained):', e);
      }
    }

    // Update snapshots list and prune old ones beyond retentionLimit
    const snapshots = getLocalSnapshots();
    snapshots.unshift(newSnapshot);
    const trimmedSnapshots = snapshots.slice(0, limit);
    const evictedSnapshots = snapshots.slice(limit);

    // Evict old snapshots from cache & filesystem
    for (const evicted of evictedSnapshots) {
      try {
        localStorage.removeItem(`fa_snap_data_${evicted.id}`);
      } catch {}

      if (Capacitor.isNativePlatform()) {
        try {
          await Filesystem.deleteFile({
            path: `Finance-Ally/Snapshots/${evicted.filename}`,
            directory: Directory.Documents,
          });
        } catch {
          try {
            await Filesystem.deleteFile({
              path: evicted.filename,
              directory: Directory.Cache,
            });
          } catch {}
        }
      }
    }

    saveSnapshotsList(trimmedSnapshots);

    // Deep prune filesystem to remove any historic accumulation of files
    if (Capacitor.isNativePlatform()) {
      await pruneFilesystemSnapshots(limit);
    }

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
    const errorMsg = err?.message || String(err) || 'Failed to generate snapshot.';
    console.error('Failed to create local auto backup:', err);

    setLastBackupError(errorMsg);

    if (!manualTrigger) {
      triggerSystemNotification(
        'Auto-Backup Failed',
        `Database snapshot failed: ${errorMsg}`,
        `snap_err_${Date.now()}`
      );
    }

    return {
      success: false,
      message: `Local backup error: ${errorMsg}`,
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
  if (!isValidSnapshotFilename(snap.filename)) {
    console.error('[Security] Rejected snapshot with unsafe or path-traversal filename:', snap.filename);
    return null;
  }

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
export async function deleteLocalSnapshot(snapshotId: string): Promise<LocalSnapshotMetadata[]> {
  const list = getLocalSnapshots();
  const snap = list.find(s => s.id === snapshotId);
  
  localStorage.removeItem(`fa_snap_data_${snapshotId}`);
  
  if (snap && isValidSnapshotFilename(snap.filename) && Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({
        path: `Finance-Ally/Snapshots/${snap.filename}`,
        directory: Directory.Documents
      });
    } catch {
      try {
        await Filesystem.deleteFile({
          path: snap.filename,
          directory: Directory.Cache
        });
      } catch {}
    }
  }
  
  const updatedList = list.filter(s => s.id !== snapshotId);
  saveSnapshotsList(updatedList);
  return updatedList;
}

/**
 * Deletes all local snapshots and backup files from native device storage and localStorage cache.
 */
export async function clearAllLocalBackups(): Promise<{ success: boolean; clearedCount: number; message: string }> {
  try {
    const list = getLocalSnapshots();
    let deletedCount = 0;
    let failedCount = 0;

    // 1. Remove all cached snapshot payloads from localStorage
    list.forEach(s => {
      try {
        localStorage.removeItem(`fa_snap_data_${s.id}`);
      } catch {}
    });

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('fa_snap_data_')) {
        localStorage.removeItem(key);
      }
    }

    // 2. Clear native filesystem files if on mobile / native
    if (Capacitor.isNativePlatform()) {
      const locations = [
        { path: 'Finance-Ally/Snapshots', dir: Directory.Documents },
        { path: 'Snapshots', dir: Directory.Documents },
        { path: 'Finance-Ally/Backups', dir: Directory.Documents },
        { path: 'Finance-Ally', dir: Directory.Documents },
        { path: 'Finance-Ally/Snapshots', dir: Directory.Data },
        { path: '', dir: Directory.Cache },
      ];

      for (const loc of locations) {
        try {
          const res = await Filesystem.readdir({
            path: loc.path,
            directory: loc.dir,
          });

          if (!res || !Array.isArray(res.files)) continue;

          for (const file of res.files) {
            const fileName = getEntryName(file);
            if (!fileName) continue;

            const isSnapshotOrBackupDir = loc.path.includes('Snapshots') || loc.path.includes('Backups');
            const isBackupFile = fileName.startsWith('fa_autobackup_') ||
              fileName.startsWith('finance-ally-backup-') ||
              (isSnapshotOrBackupDir && (fileName.endsWith('.json') || fileName.endsWith('.json.enc') || fileName.endsWith('.gz')));

            if (isBackupFile) {
              const filePath = loc.path ? `${loc.path}/${fileName}` : fileName;
              try {
                await Filesystem.deleteFile({
                  path: filePath,
                  directory: loc.dir,
                });
                deletedCount++;
              } catch (delErr) {
                console.warn(`[Auto-Backup] Failed to delete backup file: ${filePath}`, delErr);
                failedCount++;
              }
            }
          }
        } catch (readErr: any) {
          const errMsg = String(readErr?.message || readErr || '').toLowerCase();
          const isNotFound = errMsg.includes('does not exist') || errMsg.includes('not found') || errMsg.includes('no such') || errMsg.includes('enoent');
          if (!isNotFound) {
            console.warn(`[Auto-Backup] Failed to inspect directory ${loc.path}:`, readErr);
            failedCount++;
          }
        }
      }
    } else {
      deletedCount = list.length;
    }

    // 3. Update or clear stored snapshots list in localStorage
    if (failedCount === 0) {
      saveSnapshotsList([]);
      return {
        success: true,
        clearedCount: deletedCount,
        message: 'All local snapshots and backup files deleted from app storage.',
      };
    } else {
      // Partial failure: re-sync remaining files from disk
      await syncSnapshotsFromFilesystem();
      return {
        success: false,
        clearedCount: deletedCount,
        message: `Deleted ${deletedCount} local backup file(s), but ${failedCount} could not be deleted from storage.`,
      };
    }
  } catch (err: any) {
    console.error('Failed to clear all local backups:', err);
    return {
      success: false,
      clearedCount: 0,
      message: `Failed to clear all backups: ${err?.message || String(err)}`,
    };
  }
}


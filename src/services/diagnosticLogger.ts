/**
 * Privacy-First Localized Diagnostic Logger
 * Captures non-sensitive diagnostic events and crash logs.
 * Exports strictly sanitized reports directly to Documents/Finance-Ally/Logs
 * with zero external telemetry or tracking.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { loadTransactions, loadCategories, loadTrips } from './db';

export interface DiagnosticLogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  context: string;
  message: string;
  stack?: string;
}

const STORAGE_KEY = 'fa_diagnostic_logs';
const MAX_LOGS = 30;

function getStoredLogs(): DiagnosticLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistLogs(logs: DiagnosticLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
  } catch {}
}

export function logDiagnosticError(context: string, error: unknown): void {
  try {
    const logs = getStoredLogs();
    const entry: DiagnosticLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      context,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    logs.push(entry);
    persistLogs(logs);
    console.error(`[DiagnosticLog:${context}]`, error);
  } catch {}
}

export function logDiagnosticWarn(context: string, message: string): void {
  try {
    const logs = getStoredLogs();
    const entry: DiagnosticLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      context,
      message,
    };
    logs.push(entry);
    persistLogs(logs);
    console.warn(`[DiagnosticLog:${context}]`, message);
  } catch {}
}

export interface DiagnosticReport {
  generatedAt: string;
  appVersion: string;
  runtime: {
    platform: string;
    isNative: boolean;
    userAgent: string;
    viewport: string;
    devicePixelRatio: number;
    language: string;
  };
  metrics: {
    transactionCount: number;
    categoryCount: number;
    tripCount: number;
    lastBackupTime: number | null;
  };
  logs: DiagnosticLogEntry[];
}

export async function generateDiagnosticReport(): Promise<DiagnosticReport> {
  let transactionCount = 0;
  let categoryCount = 0;
  let tripCount = 0;

  try {
    const [txs, cats, trps] = await Promise.all([
      loadTransactions().catch(() => []),
      loadCategories().catch(() => []),
      loadTrips().catch(() => []),
    ]);
    transactionCount = txs.length;
    categoryCount = cats.length;
    tripCount = trps.length;
  } catch {}

  let lastBackupTime: number | null = null;
  try {
    const rawConfig = localStorage.getItem('fa_local_autobackup_config');
    if (rawConfig) {
      const cfg = JSON.parse(rawConfig);
      lastBackupTime = cfg.lastBackupTime || null;
    }
  } catch {}

  return {
    generatedAt: new Date().toISOString(),
    appVersion: '3.0.0',
    runtime: {
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A',
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      language: typeof navigator !== 'undefined' ? navigator.language : 'en',
    },
    metrics: {
      transactionCount,
      categoryCount,
      tripCount,
      lastBackupTime,
    },
    logs: getStoredLogs(),
  };
}

export interface ExportResult {
  success: boolean;
  destination: string;
  filename: string;
  error?: string;
}

/**
 * Exports the diagnostic report to Documents/Finance-Ally/Logs on native devices,
 * or triggers a browser download on web.
 */
export async function exportDiagnosticReportToFile(): Promise<ExportResult> {
  const report = await generateDiagnosticReport();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `fa_diagnostic_${dateStr}.json`;
  const fileContent = JSON.stringify(report, null, 2);

  if (Capacitor.isNativePlatform()) {
    try {
      const dirPath = 'Finance-Ally/Logs';
      // Ensure directory exists
      try {
        await Filesystem.mkdir({
          path: dirPath,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        // Directory may already exist
      }

      const filePath = `${dirPath}/${filename}`;
      await Filesystem.writeFile({
        path: filePath,
        directory: Directory.Documents,
        data: fileContent,
        encoding: Encoding.UTF8,
      });

      return {
        success: true,
        destination: `Documents/${filePath}`,
        filename,
      };
    } catch (err) {
      logDiagnosticError('DiagnosticExportNative', err);
      // Fallback to web download if filesystem failed
    }
  }

  // Web fallback: Trigger standard file download
  try {
    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
      success: true,
      destination: 'Downloads folder',
      filename,
    };
  } catch (webErr) {
    return {
      success: false,
      destination: 'Failed to export',
      filename,
      error: String(webErr),
    };
  }
}

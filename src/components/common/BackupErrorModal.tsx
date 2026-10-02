import React, { useState } from 'react';
import { AlertTriangle, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { createLocalAutoBackup, dismissLastBackupError } from '../../services/localAutoBackupService';

interface BackupErrorModalProps {
  errorMessage: string;
  timestamp?: number;
  onDismiss: () => void;
}

export const BackupErrorModal: React.FC<BackupErrorModalProps> = ({
  errorMessage,
  timestamp,
  onDismiss,
}) => {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await createLocalAutoBackup(true);
      if (res.success) {
        dismissLastBackupError();
        setRetryResult({ success: true, message: res.message });
        setTimeout(() => {
          onDismiss();
        }, 1500);
      } else {
        setRetryResult({ success: false, message: res.message });
      }
    } catch (err: any) {
      setRetryResult({
        success: false,
        message: err?.message || 'Manual backup retry failed.',
      });
    } finally {
      setRetrying(false);
    }
  };

  const handleClose = () => {
    dismissLastBackupError();
    onDismiss();
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="max-w-md w-full bg-surface-card/90 backdrop-blur-2xl border border-red-500/30 rounded-2xl p-6 shadow-2xl shadow-black/40 space-y-4 relative cursor-default ring-1 ring-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-display font-bold text-ink">
                Database Backup Failed
              </h3>
              {timestamp && (
                <span className="text-[10px] font-mono text-muted-custom">
                  {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Offline Snapshot
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-muted-custom hover:text-ink cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Advisory Context */}
        <p className="text-xs font-mono text-muted-custom leading-relaxed">
          Finance-Ally encountered an error while attempting your scheduled local database snapshot. Your on-device data remains safe, but the latest backup could not be written to disk.
        </p>

        {/* Exact Error Details Box */}
        <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl space-y-1">
          <span className="text-[10px] font-mono uppercase font-bold text-red-400 block tracking-wider">
            Reported System Error:
          </span>
          <div className="text-xs font-mono text-red-300 font-semibold break-all select-all">
            {errorMessage}
          </div>
        </div>

        {retryResult && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-mono ${
              retryResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {retryResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{retryResult.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="flex-1 py-2.5 px-4 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
            <span>{retrying ? 'Retrying Backup...' : 'Retry Backup Now'}</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="py-2.5 px-4 bg-surface-soft hover:bg-surface-card border border-hairline text-muted-custom hover:text-ink rounded-xl font-mono text-xs font-bold transition-all cursor-pointer text-center"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Copy, Check, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { enableScreenSecurity, disableScreenSecurity } from '../../services/privacyScreenService';

interface RecoveryKeyModalProps {
  recoveryKey: string;
  onDismiss: () => void;
  title?: string;
  subtitle?: string;
  noticeText?: string;
}

export const RecoveryKeyModal: React.FC<RecoveryKeyModalProps> = ({ 
  recoveryKey, 
  onDismiss,
  title = 'Master Security Recovery Key',
  subtitle = 'One-Time Zero-Knowledge Key',
  noticeText
}) => {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Block screenshots and recents preview while recovery key is exposed
  useEffect(() => {
    enableScreenSecurity();
    return () => {
      disableScreenSecurity();
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    setTimeout(async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const current = await navigator.clipboard.readText();
          if (current === recoveryKey) {
            await navigator.clipboard.writeText('');
          }
        }
      } catch {}
    }, 45000);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md max-h-[90dvh] sm:max-h-[85vh] flex flex-col bg-surface-card/95 backdrop-blur-2xl saturate-[180%] border border-brand-yellow/30 rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150 relative my-auto overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 p-4 sm:p-5 pb-3.5 border-b border-hairline bg-surface-card/60">
          <div className="w-10 h-10 rounded-full bg-brand-yellow/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-brand-yellow" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-display font-bold text-ink">{title}</h2>
            <p className="text-[11px] font-mono text-brand-yellow">{subtitle}</p>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain">
          <div className="bg-brand-coral/10 border border-brand-coral/30 rounded-xl p-3 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-brand-coral shrink-0 mt-0.5" />
            <p className="text-[11px] font-mono text-ink leading-relaxed">
              {noticeText ? (
                noticeText
              ) : (
                <>This key is <strong className="text-brand-coral">generated strictly in volatile component memory while displayed</strong>. It is <strong className="text-brand-coral">NEVER written to browser storage (neither localStorage nor sessionStorage)</strong>. If you ever forget your App Password, Password Vault PIN, or Backup PIN, this key is the <strong className="text-brand-coral">ONLY way</strong> to recover your account and encrypted data.</>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Your Unique Recovery Key</label>
              {copied && <span className="text-[10px] font-mono text-brand-mint font-semibold animate-in fade-in">Copied to clipboard!</span>}
            </div>
            <div 
              onClick={handleCopy}
              className="flex items-center justify-between gap-2 bg-canvas border border-hairline hover:border-brand-yellow/50 rounded-xl p-2.5 sm:p-3 cursor-pointer group transition-all"
              title="Tap to copy key"
            >
              <code className="text-xs sm:text-sm font-mono font-bold text-brand-blue flex-1 text-center tracking-widest break-all px-1 select-all">
                {recoveryKey}
              </code>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className="p-2 rounded-lg bg-surface-soft hover:bg-surface-card border border-hairline text-ink transition-all cursor-pointer shrink-0"
                title="Copy to clipboard"
                aria-label="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-brand-mint" /> : <Copy className="w-4 h-4 text-muted-custom group-hover:text-ink" />}
              </button>
            </div>
            <p className="text-[10px] font-mono text-muted-custom px-1 text-center sm:text-left">
              Tap the key box or the copy button to copy to clipboard.
            </p>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-soft/40 border border-hairline/60 cursor-pointer group transition-colors hover:bg-surface-soft/70">
            <div className="relative flex items-center justify-center w-4 h-4 mt-0.5 shrink-0">
              <input
                type="checkbox"
                className="peer appearance-none w-4 h-4 border border-hairline rounded bg-surface-soft checked:bg-brand-blue checked:border-brand-blue transition-colors cursor-pointer"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <Check className="w-3 h-3 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100" />
            </div>
            <span className="text-[11px] font-mono text-muted-custom group-hover:text-ink transition-colors leading-relaxed select-none">
              I have written down or saved this Recovery Key in a password manager. I understand that it is never saved to browser storage and cannot be recovered if dismissed.
            </span>
          </label>
        </div>

        {/* Sticky Action Footer */}
        <div className="shrink-0 p-4 sm:p-5 pt-3 border-t border-hairline bg-surface-card/95">
          <button
            type="button"
            disabled={!acknowledged}
            onClick={onDismiss}
            className="w-full py-3 bg-brand-blue hover:bg-brand-blue/90 disabled:bg-surface-soft disabled:text-muted-custom disabled:border-hairline disabled:border border border-brand-blue text-white rounded-xl text-xs font-mono font-bold transition-all shadow-md active:scale-[0.98] disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed"
          >
            I've Safely Saved My Recovery Key
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

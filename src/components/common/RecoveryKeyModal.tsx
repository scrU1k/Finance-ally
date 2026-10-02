import React, { useState } from 'react';
import { ShieldCheck, Copy, Check, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

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

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-surface-card/90 backdrop-blur-2xl saturate-[180%] border border-brand-yellow/30 rounded-2xl p-6 shadow-2xl shadow-black/50 space-y-5 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150 relative">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-hairline pb-3">
          <div className="w-10 h-10 rounded-full bg-brand-yellow/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-brand-yellow" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-ink">{title}</h2>
            <p className="text-[11px] font-mono text-brand-yellow">{subtitle}</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div className="bg-brand-coral/10 border border-brand-coral/30 rounded-xl p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-brand-coral shrink-0 mt-0.5" />
            <p className="text-[11px] font-mono text-ink leading-relaxed">
              {noticeText ? (
                noticeText
              ) : (
                <>This key is <strong className="text-brand-coral">shown once and NEVER saved on this device</strong>. If you ever forget your App Password, Password Vault PIN, or Backup PIN, this key is the <strong className="text-brand-coral">ONLY way</strong> to recover your account and encrypted data.</>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-custom uppercase font-bold px-1">Your Unique Recovery Key</label>
            <div className="flex items-center gap-2 bg-canvas border border-hairline rounded-xl p-2 relative group">
              <code className="text-sm font-mono font-bold text-brand-blue flex-1 text-center tracking-widest break-all px-2 select-all">
                {recoveryKey}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-lg bg-surface-soft hover:bg-surface-card border border-hairline text-ink transition-all absolute right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-brand-mint" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {copied && <p className="text-[10px] font-mono text-brand-mint text-right px-1">Copied to clipboard!</p>}
          </div>

          <label className="flex items-start gap-2 pt-2 cursor-pointer group">
            <div className="relative flex items-center justify-center w-4 h-4 mt-0.5 shrink-0">
              <input
                type="checkbox"
                className="peer appearance-none w-4 h-4 border border-hairline rounded bg-surface-soft checked:bg-brand-blue checked:border-brand-blue transition-colors cursor-pointer"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <Check className="w-3 h-3 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100" />
            </div>
            <span className="text-[11px] font-mono text-muted-custom group-hover:text-ink transition-colors leading-relaxed">
              I have written down or saved this Recovery Key in a password manager. I understand that it is not stored on this device and cannot be viewed again.
            </span>
          </label>
        </div>

        {/* Action */}
        <div className="pt-2">
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

import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff } from 'lucide-react';
import { createPortal } from 'react-dom';

interface PinModalProps {
  mode: 'verify' | 'set' | 'change';
  title: string;
  description?: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
}

export const PinModal: React.FC<PinModalProps> = ({
  mode,
  title,
  description,
  onConfirm,
  onCancel,
  loading = false,
  error,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!pin || pin.length < 4) {
      setLocalError('PIN must be at least 4 characters.');
      return;
    }

    if ((mode === 'set' || mode === 'change') && pin !== confirmPin) {
      setLocalError('PINs do not match. Please re-check.');
      return;
    }

    onConfirm(pin);
  };

  const displayError = error || localError;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl p-6 shadow-2xl shadow-black/30 space-y-4 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-brand-blue" />
            <span className="text-sm font-display font-bold text-ink">{title}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-muted-custom hover:text-ink cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {description && (
          <p className="text-[11px] font-mono text-muted-custom leading-relaxed">{description}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* PIN input */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">
              {mode === 'verify' ? 'Enter Your Backup PIN' : 'New PIN (min 4 characters)'}
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="••••"
                autoFocus
                className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-10 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink tracking-widest"
                maxLength={20}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-2 text-muted-custom hover:text-ink cursor-pointer"
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Confirm PIN for set/change modes */}
          {(mode === 'set' || mode === 'change') && (
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Confirm PIN</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-10 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink tracking-widest"
                  maxLength={20}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-2 text-muted-custom hover:text-ink cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {displayError && (
            <p className="text-[10px] font-mono text-brand-coral font-bold">{displayError}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 rounded-xl border border-hairline text-muted-custom text-xs font-mono font-bold hover:border-ink hover:text-ink transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-xl border border-brand-blue text-brand-blue text-xs font-mono font-bold hover:bg-surface-soft transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Verifying...' : (mode === 'verify' ? 'Unlock & Import' : 'Set PIN')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface PinModalProps {
  mode: 'verify' | 'set' | 'change' | 'recover' | 'reset' | 'disable' | 'recover-disable';
  title: string;
  description?: string;
  secretType?: 'pin' | 'password';
  // onConfirm passes (primarySecret, secondarySecret, recoveryKey)
  onConfirm: (pin1: string, pin2?: string, recoveryKey?: string) => void;
  onCancel: () => void;
  onForgotPin?: () => void;
  loading?: boolean;
  error?: string;
}

export const PinModal: React.FC<PinModalProps> = ({
  mode,
  title,
  description,
  secretType = 'password',
  onConfirm,
  onCancel,
  onForgotPin,
  loading = false,
  error,
}) => {
  const [pin, setPin] = useState(''); // Serves as password or old PIN or Recovery Key
  const [newPin, setNewPin] = useState(''); 
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState('');

  const isPassword = secretType === 'password';
  const term = isPassword ? 'Password' : 'PIN';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (mode === 'verify' || mode === 'set' || mode === 'reset' || mode === 'disable' || mode === 'recover-disable') {
      if (!pin || (mode !== 'recover-disable' && pin.length < 4)) {
        setLocalError(mode === 'recover-disable' ? 'Recovery Key is required.' : `${term} must be at least 4 characters.`);
        return;
      }
      if ((mode === 'set' || mode === 'reset') && pin !== confirmPin) {
        setLocalError(`${term}s do not match. Please re-check.`);
        return;
      }
      onConfirm(pin, confirmPin, recoveryKey.trim() || undefined);
    } else if (mode === 'change' || mode === 'recover') {
      if (!pin) {
        setLocalError(mode === 'change' ? `Current ${term} is required.` : 'Recovery Key is required.');
        return;
      }
      if (!newPin || newPin.length < 4) {
        setLocalError(`New ${term} must be at least 4 characters.`);
        return;
      }
      if (newPin !== confirmPin) {
        setLocalError(`New ${term}s do not match. Please re-check.`);
        return;
      }
      onConfirm(pin, newPin, recoveryKey.trim() || undefined);
    }
  };

  const displayError = error || localError;
  const isMultiInput = mode === 'change' || mode === 'recover';

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl p-6 shadow-2xl shadow-black/30 space-y-4 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
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

        {mode === 'reset' && (
          <div className="bg-brand-coral/10 border border-brand-coral/30 rounded-xl p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-brand-coral shrink-0 mt-0.5" />
            <p className="text-[10px] font-mono text-ink leading-relaxed">
              <strong className="text-brand-coral">WARNING:</strong> Creating a new PIN from scratch will generate new encryption keys for future backups. Because your PIN is used to encrypt the backup keys, existing encrypted backups will remain permanently unrecoverable without the old PIN.
            </p>
          </div>
        )}

        {description && mode !== 'reset' && (
          <p className="text-[11px] font-mono text-muted-custom leading-relaxed">{description}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-custom uppercase font-bold flex justify-between">
              <span>
                {mode === 'verify' ? `Enter Your Backup ${term}` :
                 mode === 'change' || mode === 'disable' ? `Current Backup ${term}` :
                 mode === 'recover' || mode === 'recover-disable' ? 'Global Recovery Key' :
                 `New Backup ${term} (min 4 characters)`}
              </span>
              {(mode === 'change' || mode === 'verify' || mode === 'disable') && onForgotPin && (
                <button type="button" onClick={onForgotPin} className="text-brand-blue hover:underline cursor-pointer">
                  Forgot {term}?
                </button>
              )}
            </label>
            <div className="relative">
              <input
                type={showPin || mode === 'recover' || mode === 'recover-disable' ? 'text' : 'password'}
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder={mode === 'recover' || mode === 'recover-disable' ? 'FAK-xxxx-xxxx-xxxx-xxxx' : (isPassword ? 'Enter backup password...' : '••••')}
                autoFocus
                className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-10 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink tracking-widest"
                maxLength={mode === 'recover' || mode === 'recover-disable' ? 60 : 40}
              />
              {mode !== 'recover' && mode !== 'recover-disable' && (
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-2 text-muted-custom hover:text-ink cursor-pointer"
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          {isMultiInput && (
            <div className="space-y-1 pt-2">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">New Backup {term} (min 4 characters)</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value)}
                  placeholder={isPassword ? 'Enter new backup password...' : '••••'}
                  className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-10 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink tracking-widest"
                  maxLength={40}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-2 text-muted-custom hover:text-ink cursor-pointer"
                >
                  {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {(mode === 'set' || mode === 'change' || mode === 'recover' || mode === 'reset') && (
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Confirm Backup {term}</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value)}
                  placeholder={isPassword ? 'Confirm password...' : '••••'}
                  className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-10 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink tracking-widest"
                  maxLength={40}
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

          {/* Optional Recovery Key input for automatic escrow linking */}
          {(mode === 'set' || mode === 'change') && (
            <div className="space-y-1 pt-1">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold flex justify-between">
                <span>Global Recovery Key (Recommended)</span>
                <span className="text-brand-blue lowercase font-normal">enables emergency reset</span>
              </label>
              <input
                type="text"
                value={recoveryKey}
                onChange={e => setRecoveryKey(e.target.value)}
                placeholder="FAK-xxxx-xxxx-xxxx-xxxx"
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink tracking-wider"
                maxLength={60}
              />
              <p className="text-[9px] font-mono text-muted-custom">
                Links your recovery key to this backup so you can recover data even if you lose this password.
              </p>
            </div>
          )}

          {/* Real-time Strength Warning for secrets shorter than 6 characters */}
          {(mode === 'set' || mode === 'reset' || mode === 'change') && (isMultiInput ? newPin : pin).length > 0 && (isMultiInput ? newPin : pin).length < 6 && (
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-600 dark:text-amber-400">
              ⚠️ Short password: 6+ characters or a passphrase strongly recommended for maximum offline resistance against dictionary attacks.
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
              className={`flex-1 py-2 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer disabled:opacity-50 ${mode === 'reset' || mode === 'disable' || mode === 'recover-disable' ? 'border-brand-coral text-brand-coral hover:bg-brand-coral/10' : 'border-brand-blue text-brand-blue hover:bg-surface-soft'}`}
            >
              {loading ? 'Processing...' : (
                mode === 'verify' ? 'Unlock & Import' : 
                mode === 'change' || mode === 'recover' ? `Update ${term}` : 
                mode === 'reset' ? `Reset ${term}` : 
                mode === 'disable' || mode === 'recover-disable' ? `Disable ${term}` : `Set ${term}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

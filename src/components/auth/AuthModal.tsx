import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, KeyRound, AlertCircle, Eye, EyeOff, Timer, ArrowLeft, Key } from 'lucide-react';
import logoImg from '../../assets/logo.png';

export const AuthModal: React.FC = () => {
  const { user, login, lockoutUntil, failedAttempts, recoverPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Recovery Mode State
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Live countdown timer when locked
  useEffect(() => {
    if (lockoutUntil <= Date.now()) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const isLocked = secondsLeft > 0;

  const formatCountdown = (s: number) => {
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setLoading(true);
    setError(false);
    const success = await login(password);
    setLoading(false);
    if (!success) {
      setError(true);
      setPassword('');
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');

    if (!recoveryKey.trim()) {
      setRecoveryError('Please enter your Recovery Key.');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setRecoveryError('New password must be at least 4 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setRecoveryError('Passwords do not match.');
      return;
    }

    setRecoveryLoading(true);
    try {
      const ok = await recoverPassword(recoveryKey.trim(), newPassword);
      if (!ok) {
        setRecoveryError('Invalid Recovery Key. Please check and try again.');
      }
    } catch {
      setRecoveryError('Recovery failed. Please check your key.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="max-w-sm w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-3xl p-8 shadow-2xl shadow-black/20 text-center space-y-6 ring-1 ring-white/10">
        <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
          {/* Subtle logo glow */}
          <div className="absolute inset-0 bg-brand-blue/20 rounded-[22%] blur-lg animate-pulse"></div>
          <div className="relative w-14 h-14 bg-surface-card rounded-[22%] overflow-hidden border border-hairline shadow-md p-0.5 z-10">
            <img src={logoImg} className="w-full h-full object-cover rounded-[20%]" alt="Finance-Ally Logo" />
          </div>
        </div>

        {!isRecovering ? (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-display font-bold text-ink tracking-tight">
                Vault Locked
              </h2>
              <p className="text-xs font-mono text-muted-custom">
                Enter password for <span className="text-ink font-semibold">{user?.username}</span>
              </p>
            </div>

            {/* Lockout Warning Banner */}
            {isLocked && (
              <div className="bg-brand-coral/10 border border-brand-coral/30 rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-brand-coral text-xs font-mono font-bold">
                  <Timer className="w-3.5 h-3.5" />
                  <span>Account Locked</span>
                </div>
                <p className="text-[10px] font-mono text-brand-coral/80">
                  Too many failed attempts. Try again in{' '}
                  <span className="font-bold">{formatCountdown(secondsLeft)}</span>
                </p>
              </div>
            )}

            {/* Attempt counter warning (3–4 failures, not yet locked) */}
            {!isLocked && failedAttempts >= 3 && failedAttempts < 5 && (
              <div className="bg-brand-yellow/10 border border-brand-yellow/30 rounded-xl p-2.5">
                <p className="text-[10px] font-mono text-brand-yellow font-bold">
                  ⚠ {5 - failedAttempts} attempt{5 - failedAttempts === 1 ? '' : 's'} remaining before lockout
                </p>
              </div>
            )}

            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  disabled={isLocked}
                  className="w-full bg-surface-soft border border-hairline rounded-xl pl-10 pr-10 py-3 text-center text-base font-mono text-ink focus:outline-none focus:border-ink tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <KeyRound className="w-4 h-4 text-muted-custom absolute left-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-muted-custom hover:text-ink cursor-pointer"
                  title={showPassword ? 'Hide password' : 'View password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && !isLocked && (
                <div className="flex items-center justify-center gap-1.5 text-brand-coral text-xs font-mono">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Incorrect password. Please try again.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || isLocked}
                className="w-full bg-brand-blue hover:bg-blue-600 text-white font-medium text-sm py-3 rounded-xl shadow-md transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? 'Verifying...' : isLocked ? `Locked (${formatCountdown(secondsLeft)})` : 'Unlock Vault'}
              </button>
            </form>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsRecovering(true);
                  setRecoveryError('');
                }}
                className="text-[11px] font-mono text-brand-blue hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
              <p className="text-[10px] font-mono text-muted-custom flex items-center gap-1">
                <Shield className="w-3 h-3 text-brand-mint" />
                <span>Local Security Active</span>
              </p>
            </div>
          </>
        ) : (
          /* Emergency Recovery Sub-View */
          <div className="space-y-4 text-left">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-display font-bold text-ink tracking-tight flex items-center justify-center gap-1.5">
                <Key className="w-4 h-4 text-brand-yellow" />
                <span>Emergency Recovery</span>
              </h2>
              <p className="text-[11px] font-mono text-muted-custom">
                Enter your Global Recovery Key to set a new password.
              </p>
            </div>

            <form onSubmit={handleRecoverySubmit} className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block mb-1">
                  Global Recovery Key
                </label>
                <input
                  type="text"
                  value={recoveryKey}
                  onChange={e => setRecoveryKey(e.target.value)}
                  placeholder="FAK-xxxx-xxxx-xxxx-xxxx"
                  autoFocus
                  required
                  className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink tracking-wider focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min 4 characters"
                    required
                    className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-10 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand-blue"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2 text-muted-custom hover:text-ink cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand-blue"
                />
              </div>

              {recoveryError && (
                <p className="text-[10px] font-mono text-brand-coral font-bold text-center">
                  {recoveryError}
                </p>
              )}

              <button
                type="submit"
                disabled={recoveryLoading}
                className="w-full py-2.5 bg-brand-blue hover:bg-blue-600 text-white rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                {recoveryLoading ? 'Verifying & Unlocking...' : 'Reset Password & Unlock'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRecovering(false);
                  setRecoveryError('');
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer pt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Login</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, KeyRound, AlertCircle, Eye, EyeOff, Timer } from 'lucide-react';
import logoImg from '../../assets/logo.png';

export const AuthModal: React.FC = () => {
  const { user, login, lockoutUntil, failedAttempts } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

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
              className="absolute right-3.5 top-3.5 text-muted-custom hover:text-ink"
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
            className="w-full bg-brand-blue hover:bg-blue-600 text-white font-medium text-sm py-3 rounded-xl shadow-md transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : isLocked ? `Locked (${formatCountdown(secondsLeft)})` : 'Unlock Vault'}
          </button>
        </form>

        <p className="text-[10px] font-mono text-muted-custom flex items-center justify-center gap-1">
          <Shield className="w-3 h-3 text-brand-mint" />
          <span>Local Device Security Active</span>
        </p>

      </div>
    </div>
  );
};

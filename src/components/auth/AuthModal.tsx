import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, Shield, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { user, login } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
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
        
        <div className="w-14 h-14 rounded-2xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center text-brand-blue mx-auto">
          <Lock className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-display font-bold text-ink tracking-tight">
            Vault Locked
          </h2>
          <p className="text-xs font-mono text-muted-custom">
            Enter password for <span className="text-ink font-semibold">{user?.username}</span>
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="w-full bg-surface-soft border border-hairline rounded-xl pl-10 pr-10 py-3 text-center text-base font-mono text-ink focus:outline-none focus:border-ink tracking-widest"
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

          {error && (
            <div className="flex items-center justify-center gap-1.5 text-brand-coral text-xs font-mono">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Incorrect password. Please try again.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue hover:bg-blue-600 text-white font-medium text-sm py-3 rounded-xl shadow-md transition-all active:scale-98"
          >
            {loading ? 'Decrypting...' : 'Unlock Vault'}
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

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TOP_CURRENCIES } from '../../services/currency';
import { CurrencyCode } from '../../types';
import { Shield, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';

export const OnboardingCurrency: React.FC = () => {
  const { onboard } = useAuth();
  const [username, setUsername] = useState('My Account');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('INR');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 4) {
      setError('Please set a password or PIN (at least 4 characters)');
      return;
    }
    await onboard(username, password, selectedCurrency);
  };

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-surface-card border border-hairline rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            {/* Subtle logo glow */}
            <div className="absolute inset-0 bg-brand-blue/20 rounded-[33%] blur-lg animate-pulse"></div>
            <div className="relative w-14 h-14 bg-surface-card rounded-[33%] overflow-hidden border border-hairline shadow-md p-0.5 z-10">
              <img src="/logo.png" className="w-full h-full object-cover rounded-[30%]" alt="Logo" />
            </div>
          </div>
          <h2 className="text-2xl font-display font-bold text-ink tracking-tight">
            Welcome to Finance-Ally
          </h2>
          <p className="text-xs font-mono text-muted-custom">
            100% Offline & Sandboxed Personal Finance Vault
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-custom uppercase">Profile Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-ink font-sans-custom"
              required
            />
          </div>

          {/* Local Password / PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-custom uppercase">Set App Password / PIN</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-soft border border-hairline rounded-xl pl-4 pr-10 py-2.5 text-sm text-ink focus:outline-none focus:border-ink font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-muted-custom hover:text-ink"
                title={showPassword ? 'Hide password' : 'View password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] font-mono text-muted-custom">
              Stored 100% locally with salted SHA-256 encryption.
            </p>
          </div>

          {/* Select Base Currency */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-custom uppercase">Select Base Currency (Top 10)</label>
            <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
              {TOP_CURRENCIES.map(curr => {
                const isSelected = selectedCurrency === curr.code;
                return (
                  <button
                    key={curr.code}
                    type="button"
                    onClick={() => setSelectedCurrency(curr.code)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-mono transition-all ${
                      isSelected
                        ? 'bg-ink text-canvas border-ink font-semibold shadow-sm'
                        : 'bg-surface-soft text-body-custom border-hairline hover:border-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{curr.flag}</span>
                      <span>{curr.code}</span>
                    </div>
                    <span>{curr.symbol}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs font-mono text-brand-coral">{error}</p>}

          <button
            type="submit"
            className="w-full bg-brand-blue hover:bg-blue-600 text-white font-medium text-sm py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all transform active:scale-98"
          >
            <span>Create Secure Vault</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

      </div>
    </div>
  );
};

import React from 'react';
import { Shield, Settings, Lock, Sparkles, Plane, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { TOP_CURRENCIES } from '../../services/currency';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenCategories: () => void;
  onOpenQuickAdd?: () => void;
  onOpenScanner: () => void;
  onTitleClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, onOpenCategories, onOpenScanner, onTitleClick }) => {
  const { logout } = useAuth();
  const { baseCurrency, activeTripVault, setActiveTripVault } = useFinance();

  const currencyConfig = TOP_CURRENCIES.find(c => c.code === baseCurrency) || TOP_CURRENCIES[0];

  return (
    <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-md border-b border-hairline px-3 sm:px-6 py-2.5 transition-colors max-w-full overflow-hidden">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        
        {/* Brand Logo & Vault Badge */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onTitleClick}
            className="font-display font-bold text-sm sm:text-base tracking-tight text-ink hover:opacity-80 transition-opacity shrink-0 text-left cursor-pointer"
            title="Go to Expense Log"
          >
            Finance-Ally
          </button>

          {/* Active Trip Vault Badge */}
          {activeTripVault ? (
            <button
              onClick={() => setActiveTripVault(null)}
              className="flex items-center gap-1.5 bg-brand-coral/10 hover:bg-brand-coral/20 border border-brand-coral/40 px-2.5 py-1 rounded-full text-[11px] font-mono text-brand-coral truncate transition-all cursor-pointer font-bold"
              title="Click to Exit Trip Vault & Return to Default Wallet"
            >
              <Plane className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{activeTripVault.name} ({activeTripVault.currency})</span>
              <span className="ml-1 text-xs font-bold shrink-0">✕</span>
            </button>
          ) : (
            <div className="hidden md:flex items-center gap-1.5 bg-surface-card border border-hairline px-2.5 py-0.5 rounded-full text-[11px] font-mono text-muted-custom">
              <Shield className="w-3 h-3 text-brand-mint" />
              <span>Offline & Sandboxed</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Category Budget Caps & Tags Button */}
          <button
            onClick={onOpenCategories}
            className="p-1.5 text-muted-custom hover:text-brand-purple hover:bg-surface-card rounded-full transition-colors border border-transparent hover:border-hairline"
            title="Category Budget Caps & Tag Palette"
          >
            <Tag className="w-4 h-4" />
          </button>



          {/* Base Currency Selector Pill */}
          <div className="flex items-center gap-1 bg-surface-card border border-hairline px-2 py-1 rounded-full text-xs font-mono text-ink">
            <span>{currencyConfig.flag}</span>
            <span className="font-semibold">{currencyConfig.code}</span>
          </div>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-muted-custom hover:text-ink hover:bg-surface-card rounded-full transition-colors border border-transparent hover:border-hairline"
            title="Settings & Currency Converter"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Lock App Session */}
          <button
            onClick={logout}
            className="p-1.5 text-muted-custom hover:text-brand-coral hover:bg-surface-card rounded-full transition-colors border border-transparent hover:border-hairline"
            title="Lock Session"
          >
            <Lock className="w-4 h-4" />
          </button>

        </div>

      </div>
    </header>
  );
};

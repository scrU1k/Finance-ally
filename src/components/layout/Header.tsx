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
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onTitleClick}
            className="font-display font-bold text-sm sm:text-base tracking-tight text-ink hover:opacity-80 transition-opacity shrink-0 text-left cursor-pointer"
            title="Go to Expense Log"
          >
            Finance-Ally
          </button>

          {/* Active Trip Vault Badge (Plane icon only) */}
          {activeTripVault ? (
            <button
              onClick={() => setActiveTripVault(null)}
              className="p-1.5 bg-brand-coral/15 hover:bg-brand-coral/25 border border-brand-coral/40 rounded-full text-brand-coral transition-all cursor-pointer shadow-sm shrink-0 flex items-center justify-center"
              title={`Active Trip Vault: ${activeTripVault.name}. Click to exit.`}
            >
              <Plane className="w-4 h-4 text-brand-coral" />
            </button>
          ) : (
            <div className="hidden md:flex items-center gap-1.5 bg-surface-card border border-hairline px-2.5 py-0.5 rounded-full text-[11px] font-mono text-muted-custom">
              <Shield className="w-3.5 h-3.5 text-brand-mint" />
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

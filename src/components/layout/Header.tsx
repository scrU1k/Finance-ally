import React from 'react';
import { Settings, Lock, Plane, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import logoImg from '../../assets/logo.png';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenCategories: () => void;
  onOpenQuickAdd?: () => void;
  onTitleClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings, onOpenCategories, onTitleClick }) => {
  const { logout } = useAuth();
  const { activeTripVault, setActiveTripVault } = useFinance();

  return (
    <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-md border-b border-hairline px-3 sm:px-6 py-2.5 transition-colors max-w-full overflow-hidden">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        
        {/* Brand Logo & Vault Badge */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onTitleClick}
            className="font-display font-bold text-sm sm:text-base tracking-tight text-ink hover:opacity-80 transition-opacity shrink-0 text-left cursor-pointer flex items-center gap-2"
            title="Go to Expense Log"
          >
            <img src={logoImg} className="w-5 h-5 sm:w-6 sm:h-6 rounded-md object-contain shrink-0" alt="Finance-Ally Logo" />
            <span>Finance-Ally</span>
          </button>

          {/* Active Trip Vault Badge (Plane icon only) */}
          {activeTripVault && (
            <button
              onClick={() => setActiveTripVault(null)}
              className="p-1.5 bg-brand-coral/15 hover:bg-brand-coral/25 border border-brand-coral/40 rounded-full text-brand-coral transition-all cursor-pointer shadow-sm shrink-0 flex items-center justify-center"
              title={`Active Trip Vault: ${activeTripVault.name}. Click to exit.`}
            >
              <Plane className="w-4 h-4 text-brand-coral" />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          
          {/* Category Budget Caps & Tags Button */}
          <button
            type="button"
            onClick={onOpenCategories}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-muted-custom hover:text-brand-purple hover:bg-surface-card rounded-full transition-all border border-transparent hover:border-hairline active:scale-95 cursor-pointer shrink-0"
            title="Category Budget Caps & Tag Palette"
            aria-label="Categories"
          >
            <Tag className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-muted-custom hover:text-ink hover:bg-surface-card rounded-full transition-all border border-transparent hover:border-hairline active:scale-95 cursor-pointer shrink-0"
            title="Settings & Currency Converter"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Lock App Session */}
          <button
            type="button"
            onClick={logout}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-muted-custom hover:text-brand-coral hover:bg-surface-card rounded-full transition-all border border-transparent hover:border-hairline active:scale-95 cursor-pointer shrink-0"
            title="Lock Session"
            aria-label="Lock Session"
          >
            <Lock className="w-4 h-4" />
          </button>

        </div>

      </div>
    </header>
  );
};

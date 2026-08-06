import React, { useState, useRef } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { PeriodType } from '../../types';
import { formatCurrency } from '../../services/currency';
import { TrendingDown, Plus, ChevronUp, ChevronDown } from 'lucide-react';

interface BottomPeriodBarProps {
  onOpenQuickAdd: () => void;
}

export const BottomPeriodBar: React.FC<BottomPeriodBarProps> = ({ onOpenQuickAdd }) => {
  const { period, setPeriod, periodTotalSpent, baseCurrency, filteredTransactions } = useFinance();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPeriodSelectorOpen, setIsPeriodSelectorOpen] = useState(false);

  // Touch swipe down tracking to minimize
  const touchStartY = useRef<number | null>(null);

  const periods: { key: PeriodType; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All' },
  ];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      const deltaY = e.touches[0].clientY - touchStartY.current;
      // If user swipes down by more than 20px, minimize the bar
      if (deltaY > 20) {
        setIsMinimized(true);
        touchStartY.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  const currentPeriodLabel = periods.find(p => p.key === period)?.label || 'Month';

  // 1. MINIMIZED GLASSMORPHIC PILL VIEW
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 max-w-[92vw]">
        {/* Glassmorphic Spending Total Pill */}
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 dotgui-glass border border-hairline px-4 py-2.5 rounded-full text-ink font-mono text-xs font-semibold shadow-2xl hover:scale-105 active:scale-95 transition-all group cursor-pointer bg-surface-card/90 backdrop-blur-xl"
          title="Tap to Expand Spending Bar"
        >
          <ChevronUp className="w-4 h-4 text-brand-mint group-hover:-translate-y-0.5 transition-transform" />
          <span className="truncate">Total ({period}): {formatCurrency(periodTotalSpent, baseCurrency)}</span>
        </button>

        {/* Border Highlighted + Button */}
        <button
          onClick={onOpenQuickAdd}
          className="p-2.5 border border-brand-blue text-brand-blue bg-surface-card/90 backdrop-blur-xl rounded-full shadow-2xl hover:bg-surface-soft active:scale-95 transition-all shrink-0 cursor-pointer"
          title="Add Expense"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // 2. EXPANDED SLEEK GLASSMORPHIC BOTTOM PERIOD BAR VIEW
  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed bottom-0 left-0 right-0 z-40 dotgui-glass border-t border-hairline px-4 py-4 sm:px-6 sm:py-5 shadow-2xl max-w-full overflow-hidden bg-surface-card/90 backdrop-blur-xl"
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
        
        {/* Real-time Spending Total Display */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <div className="w-9 h-9 rounded-2xl border border-brand-blue/30 text-brand-blue flex items-center justify-center shrink-0 bg-surface-soft/60">
            <TrendingDown className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-muted-custom uppercase tracking-wider truncate font-semibold">
              Spent ({period})
            </div>
            <div className="text-base sm:text-lg font-display font-bold text-ink tracking-tight truncate">
              {formatCurrency(periodTotalSpent, baseCurrency)}
            </div>
          </div>

          <div className="hidden sm:inline-block text-[11px] font-mono text-muted-custom bg-surface-soft px-2.5 py-0.5 rounded-full border border-hairline shrink-0 ml-1">
            {filteredTransactions.length} items
          </div>
        </div>

        {/* Period Selector & Large + Log Button (Horizontally Scrollable Container) */}
        <div className="flex items-center gap-2.5 shrink-0 overflow-x-auto no-scrollbar py-0.5">
          
          {/* Dropdown Period Selector */}
          <div className="relative shrink-0">
            {!isPeriodSelectorOpen ? (
              <button
                type="button"
                onClick={() => setIsPeriodSelectorOpen(true)}
                className="flex items-center gap-1.5 bg-surface-soft hover:border-ink border border-hairline px-3.5 py-1.5 rounded-full text-xs font-mono font-bold text-ink transition-all cursor-pointer shadow-sm shrink-0"
              >
                <span>{currentPeriodLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-custom" />
              </button>
            ) : (
              /* Expanded Horizontal Selection */
              <div className="flex items-center bg-surface-soft p-1 rounded-full border border-hairline gap-1 animate-in fade-in zoom-in-95 duration-150 shadow-md shrink-0">
                {periods.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setPeriod(p.key);
                      setIsPeriodSelectorOpen(false);
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                      period === p.key
                        ? 'border border-ink text-ink font-bold bg-surface-card shadow-sm'
                        : 'text-body-custom hover:text-ink'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Large Easy-to-Tap + Log Button */}
          <button
            onClick={onOpenQuickAdd}
            className="flex items-center gap-1.5 border border-brand-blue text-brand-blue bg-surface-card/90 hover:bg-surface-soft px-4 py-2 rounded-full text-xs font-mono font-bold shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
            title="Log New Expense"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Log</span>
          </button>

        </div>

      </div>
    </div>
  );
};

import React from 'react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../services/currency';
import { Bell, X } from 'lucide-react';

export const ScheduledPaymentToastBanner: React.FC = () => {
  const { scheduledToast, dismissScheduledToast } = useFinance();

  if (!scheduledToast) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[92vw] bg-surface-card/95 backdrop-blur-2xl saturate-[180%] border border-brand-yellow/50 rounded-2xl shadow-2xl p-4 ring-1 ring-brand-yellow/30 animate-in slide-in-from-top-4 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-yellow/15 border border-brand-yellow/30 text-brand-yellow flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 animate-bounce" />
        </div>

        <div className="flex-1 space-y-0.5 min-w-0">
          <div className="text-[10px] font-mono font-bold text-brand-yellow uppercase tracking-wider">
            ⏰ Scheduled Payment Logged
          </div>
          <div className="text-xs font-bold text-ink truncate font-sans-custom">
            {scheduledToast.note}
          </div>
          <div className="text-xs font-display font-bold text-brand-mint">
            {formatCurrency(scheduledToast.amount, scheduledToast.currency)} is now added to total!
          </div>
        </div>

        <button
          onClick={dismissScheduledToast}
          className="p-1 rounded-lg text-muted-custom hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer shrink-0"
          title="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

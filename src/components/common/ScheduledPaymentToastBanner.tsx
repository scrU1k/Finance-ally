import React, { useState, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../services/currency';
import { Transaction } from '../../types';
import { Bell, Undo2, X } from 'lucide-react';

interface ScheduledPaymentToastBannerProps {
  onEditScheduledTx?: (tx: Transaction) => void;
}

export const ScheduledPaymentToastBanner: React.FC<ScheduledPaymentToastBannerProps> = ({ onEditScheduledTx }) => {
  const { scheduledToast, dismissScheduledToast, undoScheduledActivation } = useFinance();
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    if (!scheduledToast) {
      setTimeLeft(5);
      return;
    }

    setTimeLeft(5);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          dismissScheduledToast();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [scheduledToast, dismissScheduledToast]);

  if (!scheduledToast) return null;

  const handleUndo = async () => {
    const revertedTx = await undoScheduledActivation(scheduledToast.id);
    if (revertedTx && onEditScheduledTx) {
      onEditScheduledTx(revertedTx);
    }
  };

  const progressPct = (timeLeft / 5) * 100;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[92vw] bg-surface-card/95 backdrop-blur-2xl saturate-[180%] border border-brand-yellow/50 rounded-2xl shadow-2xl p-4 ring-1 ring-brand-yellow/30 animate-in slide-in-from-top-4 duration-300 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-yellow/15 border border-brand-yellow/30 text-brand-yellow flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 animate-bounce" />
        </div>

        <div className="flex-1 space-y-0.5 min-w-0">
          <div className="text-[10px] font-mono font-bold text-brand-yellow uppercase tracking-wider flex items-center justify-between">
            <span>⏰ Scheduled Payment Logged</span>
            <span className="text-brand-yellow font-bold">({timeLeft}s)</span>
          </div>
          <div className="text-xs font-bold text-ink truncate font-sans-custom">
            {scheduledToast.note}
          </div>
          <div className="text-xs font-display font-bold text-brand-mint">
            {formatCurrency(scheduledToast.amount, scheduledToast.currency)} is now added to total!
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo Button */}
          <button
            type="button"
            onClick={handleUndo}
            className="px-2.5 py-1.5 rounded-xl bg-brand-yellow/15 border border-brand-yellow/30 text-brand-yellow hover:bg-brand-yellow/25 font-mono text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-sm active:scale-95"
            title="Undo scheduled activation & edit transaction"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          {/* Close FAB */}
          <button
            type="button"
            onClick={dismissScheduledToast}
            className="p-1 rounded-lg text-muted-custom hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
            title="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5-Second Countdown Progress Bar */}
      <div className="w-full h-1 bg-surface-soft rounded-full overflow-hidden border border-hairline/60">
        <div
          className="h-full bg-brand-yellow transition-all duration-1000 ease-linear rounded-full"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
};

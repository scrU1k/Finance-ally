import React, { useState, useEffect } from 'react';
import { Sparkles, Check, Edit3, X } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { getPendingSmsQueue, dismissPendingSmsItem, PendingSmsItem } from '../../services/autoSmsScanner';
import { parseNotificationText } from '../../services/notificationParser';
import { Transaction } from '../../types';

interface AutoSmsDetectorBannerProps {
  onEditDetectedTransaction?: (tx: Transaction) => void;
}

export const AutoSmsDetectorBanner: React.FC<AutoSmsDetectorBannerProps> = ({ onEditDetectedTransaction }) => {
  const { addTransaction, baseCurrency } = useFinance();
  const [pendingItems, setPendingItems] = useState<PendingSmsItem[]>([]);

  useEffect(() => {
    const checkQueue = () => {
      const queue = getPendingSmsQueue();
      setPendingItems(queue);
    };

    checkQueue();
    const interval = setInterval(checkQueue, 3000);
    return () => clearInterval(interval);
  }, []);

  if (pendingItems.length === 0) return null;

  const current = pendingItems[0];
  const parsed = parseNotificationText(current.body, baseCurrency);

  const handleAutoLog = async () => {
    await addTransaction({
      amount: parsed.amount || 100,
      currency: parsed.currency || baseCurrency,
      categoryId: parsed.suggestedCategoryId,
      date: parsed.date,
      time: new Date().toTimeString().split(' ')[0].substring(0, 5),
      note: `${parsed.merchant} (Auto-parsed from SMS)`,
      paymentMethod: 'Bank Auto-Debit',
      isAutoParsed: true,
      confidenceScore: parsed.confidence || 95
    });
    dismissPendingSmsItem(current.id);
    setPendingItems(prev => prev.filter(i => i.id !== current.id));
  };

  const handleEdit = () => {
    if (onEditDetectedTransaction) {
      const tx: Transaction = {
        id: `tx-${Date.now()}`,
        amount: parsed.amount || 0,
        currency: parsed.currency || baseCurrency,
        categoryId: parsed.suggestedCategoryId,
        date: parsed.date,
        time: new Date().toTimeString().split(' ')[0].substring(0, 5),
        note: parsed.merchant,
        paymentMethod: 'UPI',
        isAutoParsed: true,
        confidenceScore: parsed.confidence || 95,
        createdAt: Date.now()
      };
      onEditDetectedTransaction(tx);
    }
    dismissPendingSmsItem(current.id);
    setPendingItems(prev => prev.filter(i => i.id !== current.id));
  };

  const handleDismiss = () => {
    dismissPendingSmsItem(current.id);
    setPendingItems(prev => prev.filter(i => i.id !== current.id));
  };

  return (
    <div className="bg-surface-card border-b border-hairline backdrop-blur-md px-4 py-2.5 flex items-center justify-between gap-3 animate-in slide-in-from-top duration-200 z-40">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="w-4 h-4 text-brand-yellow shrink-0 animate-pulse" />
        <div className="text-xs font-mono truncate">
          <span className="font-bold text-ink">Auto-Detected Payment: </span>
          <span className="text-brand-mint font-bold">{parsed.currency} {parsed.amount}</span> at <span className="font-bold text-ink">{parsed.merchant}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
        <button
          onClick={handleAutoLog}
          className="bg-brand-mint/20 border border-brand-mint/40 text-brand-mint font-bold px-3 py-1 rounded-xl hover:bg-brand-mint/30 cursor-pointer shadow-sm flex items-center gap-1"
        >
          <Check className="w-3.5 h-3.5" /> Log
        </button>
        <button
          onClick={handleEdit}
          className="bg-surface-soft border border-hairline text-ink font-bold px-3 py-1 rounded-xl hover:border-ink cursor-pointer shadow-sm flex items-center gap-1"
        >
          <Edit3 className="w-3.5 h-3.5 text-brand-blue" /> Edit
        </button>
        <button
          onClick={handleDismiss}
          className="text-muted-custom hover:text-ink p-1 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

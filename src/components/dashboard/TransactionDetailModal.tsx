import React from 'react';
import { Transaction, Category, Trip } from '../../types';
import { formatCurrency, convertCurrencyAmount } from '../../services/currency';
import { useFinance } from '../../context/FinanceContext';
import { isPendingScheduledTx, getScheduledCountdownText } from '../../utils/scheduledUtils';
import { X, Calendar, Clock, CreditCard, Tag, Plane, Sparkles, Trash2, Edit3 } from 'lucide-react';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  categories: Category[];
  trips: Trip[];
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  categories,
  trips,
  onClose,
  onEdit,
  onDelete,
}) => {
  const { baseCurrency, forexRates } = useFinance();

  if (!transaction) return null;

  const category = categories.find(c => c.id === transaction.categoryId);
  const trip = trips.find(t => t.id === transaction.tripId);
  const isForeign = transaction.currency !== baseCurrency;

  const convertedValue = isForeign
    ? convertCurrencyAmount(transaction.amount, transaction.currency, baseCurrency, forexRates)
    : null;

  const formattedDate = new Date(transaction.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200 cursor-pointer"
    >
      {/* Glass Popout Card */}
      <div
        onClick={e => e.stopPropagation()}
        className="max-w-lg w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl p-6 shadow-2xl shadow-black/20 space-y-6 relative max-h-[90vh] overflow-y-auto cursor-default ring-1 ring-white/10"
      >
        
        {/* Sticky Exit FAB */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-surface-soft border border-hairline text-muted-custom hover:text-ink hover:border-ink transition-all cursor-pointer shadow-sm"
          title="Close details"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Amount & Main Title Header */}
        <div className="space-y-2 border-b border-hairline pb-4 pr-10">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: category?.color || '#2b6be4' }} />
            <span className="text-xs font-mono font-bold text-ink uppercase tracking-wider">
              {(category?.id === 'cat-others' && transaction.customCategoryName) ? transaction.customCategoryName : (category?.name || 'General Expense')}
            </span>
            {isPendingScheduledTx(transaction) && (
              <span className="text-[10px] font-mono text-brand-yellow bg-brand-yellow/15 border border-brand-yellow/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Clock className="w-3 h-3 text-brand-yellow" />
                Scheduled ({getScheduledCountdownText(transaction.date, transaction.time)})
              </span>
            )}
            {transaction.isAutoParsed && !isPendingScheduledTx(transaction) && (
              <span className="text-[10px] font-mono text-brand-yellow border border-brand-yellow/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {transaction.confidenceScore || 95}% Accuracy
              </span>
            )}
          </div>

          <div className="pt-1">
            <div className="text-3xl font-display font-bold text-ink">
              {formatCurrency(transaction.amount, transaction.currency)}
            </div>

            {convertedValue && (
              <div className="text-xs font-mono text-muted-custom mt-0.5">
                ≈ {formatCurrency(convertedValue, baseCurrency)} ({baseCurrency} converted)
              </div>
            )}
          </div>
        </div>

        {/* Full Untruncated Expense Note */}
        <div className="space-y-1.5 bg-surface-soft/40 backdrop-blur-md p-4 rounded-xl border border-hairline">
          <label className="text-[10px] font-mono text-muted-custom uppercase font-bold tracking-wider">
            Note / Description
          </label>
          <p className="text-sm font-mono text-ink whitespace-pre-wrap leading-relaxed break-words">
            {transaction.note || 'No note attached'}
          </p>
        </div>

        {/* Full Metadata Details Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          
          {/* Date */}
          <div className="bg-surface-card/50 backdrop-blur-sm p-3 rounded-xl border border-hairline space-y-1">
            <span className="text-[10px] text-muted-custom uppercase flex items-center gap-1">
              <Calendar className="w-3 h-3 text-brand-blue" /> Date
            </span>
            <div className="font-bold text-ink">{formattedDate}</div>
          </div>

          {/* Time */}
          <div className="bg-surface-card/50 backdrop-blur-sm p-3 rounded-xl border border-hairline space-y-1">
            <span className="text-[10px] text-muted-custom uppercase flex items-center gap-1">
              <Clock className="w-3 h-3 text-brand-mint" /> Time
            </span>
            <div className="font-bold text-ink">{transaction.time || 'N/A'}</div>
          </div>

          {/* Payment Method */}
          <div className="bg-surface-card/50 backdrop-blur-sm p-3 rounded-xl border border-hairline space-y-1">
            <span className="text-[10px] text-muted-custom uppercase flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-brand-purple" /> Payment Method
            </span>
            <div className="font-bold text-ink">{transaction.paymentMethod || 'Manual Entry'}</div>
          </div>

          {/* Trip Vault */}
          <div className="bg-surface-card/50 backdrop-blur-sm p-3 rounded-xl border border-hairline space-y-1">
            <span className="text-[10px] text-muted-custom uppercase flex items-center gap-1">
              <Plane className="w-3 h-3 text-brand-coral" /> Vault
            </span>
            <div className="font-bold text-ink">{trip ? trip.name : 'Main Wallet'}</div>
          </div>

        </div>

        {/* Action Buttons: Edit / Delete */}
        <div className="pt-2 border-t border-hairline flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onDelete(transaction.id);
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-mono border border-hairline text-brand-coral hover:border-brand-coral transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          <button
            onClick={() => {
              onEdit(transaction);
              onClose();
            }}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-mono font-bold border border-ink text-ink hover:bg-surface-soft transition-all cursor-pointer shadow-sm"
          >
            <Edit3 className="w-3.5 h-3.5 text-brand-blue" />
            <span>Edit Details</span>
          </button>
        </div>

      </div>
    </div>
  );
};

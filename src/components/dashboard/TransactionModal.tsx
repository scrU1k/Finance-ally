import React, { useState, useEffect } from 'react';
import { Transaction, Category, Trip, CurrencyCode } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { TOP_CURRENCIES } from '../../services/currency';
import { X, Check, Calendar, Clock, CreditCard, Plane } from 'lucide-react';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Transaction | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, initialData }) => {
  const { categories, trips, baseCurrency, addTransaction, editTransaction } = useFinance();

  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || 'cat-food');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState<string>(
    new Date().toTimeString().split(' ')[0].substring(0, 5)
  );
  const [note, setNote] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [tripId, setTripId] = useState<string>('');

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toString());
      setCurrency(initialData.currency);
      setCategoryId(initialData.categoryId);
      setDate(initialData.date);
      setTime(initialData.time || '12:00');
      setNote(initialData.note);
      setPaymentMethod(initialData.paymentMethod || 'UPI');
      setTripId(initialData.tripId || '');
    } else {
      setAmount('');
      setCurrency(baseCurrency);
      setCategoryId(categories[0]?.id || 'cat-food');
      setDate(new Date().toISOString().split('T')[0]);
      setTime(new Date().toTimeString().split(' ')[0].substring(0, 5));
      setNote('');
      setPaymentMethod('UPI');
      setTripId('');
    }
  }, [initialData, baseCurrency, categories, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    if (initialData) {
      await editTransaction({
        ...initialData,
        amount: numAmount,
        currency,
        categoryId,
        date,
        time,
        note,
        paymentMethod,
        tripId: tripId || undefined,
      });
    } else {
      await addTransaction({
        amount: numAmount,
        currency,
        categoryId,
        date,
        time,
        note,
        paymentMethod,
        tripId: tripId || undefined,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-lg w-full dotgui-glass border border-hairline rounded-2xl p-6 shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <h3 className="text-lg font-display font-bold text-ink">
            {initialData ? 'Edit Expense' : 'Log New Expense'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-custom hover:text-ink hover:bg-surface-soft rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Amount & Currency Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-custom uppercase">Amount Spent</label>
            <div className="flex items-center gap-2">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value as CurrencyCode)}
                className="bg-surface-soft border border-hairline rounded-xl px-3 py-2.5 text-sm font-mono text-ink focus:outline-none focus:border-ink cursor-pointer"
              >
                {TOP_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.symbol})
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                required
                className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2.5 text-xl font-display font-bold text-ink focus:outline-none focus:border-ink placeholder:text-muted-custom"
              />
            </div>
          </div>

          {/* Note / Merchant */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-custom uppercase">Description / Merchant</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Starbucks Coffee, Uber Ride, ZARA shirt"
              required
              className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2 text-sm text-ink focus:outline-none focus:border-ink font-sans-custom"
            />
          </div>

          {/* Category Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-custom uppercase">Category Tag</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
              {categories.map(cat => {
                const isSelected = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-mono text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                        : 'border-hairline bg-surface-card text-body-custom hover:border-ink'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Tag Name for Others */}
          {categoryId === 'cat-others' && (
            <div className="space-y-1.5 bg-surface-soft p-3 rounded-xl border border-hairline animate-in fade-in duration-150">
              <label className="text-[11px] font-mono text-muted-custom uppercase font-bold">Custom Tag Name</label>
              <input
                type="text"
                value={note.startsWith('Custom: ') ? note.split('Custom: ')[1] : ''}
                onChange={e => {
                  const val = e.target.value;
                  if (val) setNote(`Custom: ${val}`);
                }}
                placeholder="e.g. Pet Care, Hobbies, Subscriptions"
                className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time
              </label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          {/* Payment Method & Optional Trip Link */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink cursor-pointer"
              >
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Cash">Cash</option>
                <option value="Net Banking">Net Banking</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <Plane className="w-3 h-3" /> Trip Tag (Optional)
              </label>
              <select
                value={tripId}
                onChange={e => setTripId(e.target.value)}
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink cursor-pointer"
              >
                <option value="">No Trip Tag (Default)</option>
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.currency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-98 flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{initialData ? 'Save Changes' : 'Record Expense'}</span>
          </button>

        </form>

      </div>
    </div>
  );
};

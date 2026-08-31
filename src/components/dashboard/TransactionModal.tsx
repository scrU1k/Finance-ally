import React, { useState, useEffect } from 'react';
import { Transaction, CurrencyCode } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { TOP_CURRENCIES } from '../../services/currency';
import { CustomSelect, SelectOption } from '../common/CustomSelect';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { CustomTimePicker } from '../common/CustomTimePicker';
import { isFutureDateTime } from '../../utils/scheduledUtils';
import { X, Check, Calendar, Clock, CreditCard, Plane } from 'lucide-react';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Transaction | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, initialData }) => {
  const { categories, trips, baseCurrency, activeTripVault, addTransaction, editTransaction, addCategoryItem } = useFinance();

  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id || 'cat-food');
  const [customCategoryName, setCustomCategoryName] = useState<string>('');
  const [customTagColor, setCustomTagColor] = useState<string>('#ec4899');
  const [tagSaveMsg, setTagSaveMsg] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState<string>(
    new Date().toTimeString().split(' ')[0].substring(0, 5)
  );
  const [note, setNote] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [tripId, setTripId] = useState<string>('');

  const tagColorPalette = [
    '#ec4899', // Hot Pink
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#6366f1', // Indigo
    '#f43f5e', // Rose
    '#14b8a6', // Teal
  ];

  const handleSaveCustomTag = async () => {
    if (!customCategoryName.trim()) return;
    const tagName = customCategoryName.trim();
    await addCategoryItem({
      name: tagName,
      color: customTagColor,
      icon: 'Tag',
      isDefault: false
    });
    setTagSaveMsg(`Saved "${tagName}" as reusable tag!`);
    setCustomCategoryName('');
    setTimeout(() => setTagSaveMsg(''), 2000);
  };

  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toString());
      setCurrency(initialData.currency);
      setCategoryId(initialData.categoryId);
      setCustomCategoryName(initialData.customCategoryName || '');
      setDate(initialData.date);
      setTime(initialData.time || '12:00');
      setNote(initialData.note);
      setPaymentMethod(initialData.paymentMethod || 'UPI');
      setTripId(initialData.tripId || activeTripVault?.id || '');
    } else {
      setAmount('');
      setCurrency(baseCurrency);
      setCategoryId(categories[0]?.id || 'cat-food');
      setCustomCategoryName('');
      setDate(new Date().toISOString().split('T')[0]);
      setTime(new Date().toTimeString().split(' ')[0].substring(0, 5));
      setNote('');
      setPaymentMethod('UPI');
      setTripId(activeTripVault?.id || '');
    }
  }, [initialData, baseCurrency, categories, activeTripVault, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    const isFuture = isFutureDateTime(date, time);
    const payload: Omit<Transaction, 'id' | 'createdAt'> = {
      amount: numAmount,
      currency,
      categoryId,
      customCategoryName: categoryId === 'cat-others' && customCategoryName.trim() ? customCategoryName.trim() : undefined,
      date,
      time,
      note,
      paymentMethod,
      tripId: tripId || undefined,
      isScheduled: isFuture,
    };

    if (initialData) {
      await editTransaction({
        ...initialData,
        ...payload,
      });
    } else {
      await addTransaction(payload);
    }

    onClose();
  };

  const currencyOptions: SelectOption[] = TOP_CURRENCIES.map(c => ({
    value: c.code,
    label: `${c.flag} ${c.code} (${c.symbol})`,
  }));

  const paymentOptions: SelectOption[] = [
    { value: 'UPI', label: 'UPI (GPay / PhonePe / Paytm)' },
    { value: 'Credit Card', label: 'Credit Card' },
    { value: 'Debit Card', label: 'Debit Card' },
    { value: 'Cash', label: 'Cash' },
    { value: 'Net Banking', label: 'Net Banking' },
  ];

  const tripOptions: SelectOption[] = [
    { value: '', label: 'No Trip Tag (Default)' },
    ...trips.map(t => ({
      value: t.id,
      label: `${t.name} (${t.currency})`,
    })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center px-4 overflow-y-auto animate-in fade-in duration-200"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)'
      }}
    >
      <div className="max-w-lg w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-3xl p-6 shadow-2xl shadow-black/20 space-y-5 ring-1 ring-white/10 max-h-[85vh] overflow-y-auto my-auto">
        
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
              <CustomSelect
                direction="down"
                options={currencyOptions}
                value={currency}
                onChange={val => setCurrency(val as CurrencyCode)}
                className="w-40 shrink-0"
              />

              <input
                type="number"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                required
                className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2 text-xl font-display font-bold text-ink focus:outline-none focus:border-ink placeholder:text-muted-custom min-h-[38px]"
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
              className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2 text-sm text-ink focus:outline-none focus:border-ink font-sans-custom min-h-[38px]"
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
            <div className="space-y-3 bg-surface-soft p-3.5 rounded-xl border border-hairline animate-in fade-in duration-150">
              <label className="text-[11px] font-mono text-muted-custom uppercase font-bold block">Custom Tag Name</label>
              <input
                type="text"
                value={customCategoryName}
                onChange={e => setCustomCategoryName(e.target.value)}
                placeholder="e.g. Pet Care, Hobbies, Subscriptions"
                className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />

              {/* Tag Color Palette Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block">Select Tag Color Accent</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {tagColorPalette.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCustomTagColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer border ${
                        customTagColor === color ? 'scale-125 border-ink ring-2 ring-white/20' : 'border-hairline hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Save as Reusable Tag Button */}
              {customCategoryName.trim() && (
                <button
                  type="button"
                  onClick={handleSaveCustomTag}
                  className="w-full border border-brand-purple text-brand-purple hover:bg-surface-card text-xs font-mono font-bold py-1.5 rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span>Save as Permanent Tag</span>
                </button>
              )}

              {tagSaveMsg && <p className="text-[10px] font-mono text-brand-mint text-center font-bold">{tagSaveMsg}</p>}
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Date
              </label>
              <CustomDatePicker
                value={date}
                onChange={val => setDate(val)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time
              </label>
              <CustomTimePicker
                value={time}
                onChange={val => setTime(val)}
              />
            </div>
          </div>

          {/* Payment Method & Optional Trip Link */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> Payment Method
              </label>
              <CustomSelect
                options={paymentOptions}
                value={paymentMethod}
                onChange={val => setPaymentMethod(val)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase flex items-center gap-1">
                <Plane className="w-3 h-3" /> Trip Tag (Optional)
              </label>
              <CustomSelect
                direction="up"
                options={tripOptions}
                value={tripId}
                onChange={val => setTripId(val)}
              />
            </div>
          </div>

          {isFutureDateTime(date, time) && (
            <div className="bg-brand-yellow/10 border border-brand-yellow/30 p-2.5 rounded-xl text-xs font-mono text-brand-yellow flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 shrink-0 text-brand-yellow" />
              <span>Scheduled Payment — will activate on {date} at {time}</span>
            </div>
          )}

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

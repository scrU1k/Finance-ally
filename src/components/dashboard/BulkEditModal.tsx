import React, { useState } from 'react';
import { Category, Trip, CurrencyCode } from '../../types';
import { CustomSelect, SelectOption } from '../common/CustomSelect';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { X, Check, Calendar, Clock, Tag, Plane, CreditCard } from 'lucide-react';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  categories: Category[];
  trips: Trip[];
  onSave: (updates: {
    date?: string;
    time?: string;
    categoryId?: string;
    tripId?: string | null;
    paymentMethod?: string;
  }) => Promise<void>;
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  categories,
  trips,
  onSave,
}) => {
  const [updateDate, setUpdateDate] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [updateTime, setUpdateTime] = useState(false);
  const [time, setTime] = useState('12:00');

  const [updateCategory, setUpdateCategory] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-food');

  const [updateTrip, setUpdateTrip] = useState(false);
  const [tripId, setTripId] = useState(''); // '' means Keep Current, 'remove' means Remove Trip tag

  const [updatePayment, setUpdatePayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('UPI');

  if (!isOpen) return null;

  const paymentOptions: SelectOption[] = [
    { value: 'UPI', label: 'UPI (GPay / PhonePe / Paytm)' },
    { value: 'Credit Card', label: 'Credit Card' },
    { value: 'Debit Card', label: 'Debit Card' },
    { value: 'Cash', label: 'Cash' },
    { value: 'Net Banking', label: 'Net Banking' },
  ];

  const tripOptions: SelectOption[] = [
    { value: '', label: 'Keep Current Trip Tag' },
    { value: 'remove', label: 'Remove Trip Tag (Clear)' },
    ...trips.map(t => ({
      value: t.id,
      label: `${t.name} (${t.currency})`,
    })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const updates: Parameters<typeof onSave>[0] = {};
    if (updateDate) updates.date = date;
    if (updateTime) updates.time = time;
    if (updateCategory) updates.categoryId = categoryId;
    if (updateTrip) {
      updates.tripId = tripId === 'remove' ? null : (tripId || undefined);
    }
    if (updatePayment) updates.paymentMethod = paymentMethod;

    if (Object.keys(updates).length === 0) {
      alert('Please check at least one field to update.');
      return;
    }

    await onSave(updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="max-w-md w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl p-6 shadow-2xl shadow-black/20 space-y-4 ring-1 ring-white/10" onClick={e => e.stopPropagation()}>
        
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <h3 className="text-sm font-mono font-bold text-ink uppercase">Bulk Edit Transactions</h3>
            <p className="text-[10px] font-mono text-muted-custom mt-0.5">Updating {selectedCount} selected logs</p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-custom hover:text-ink cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <p className="text-[10px] font-mono text-muted-custom leading-relaxed bg-surface-soft p-2.5 rounded-xl border border-hairline">
            Check the boxes next to the fields you wish to bulk update. Unchecked fields will remain untouched on the selected transactions.
          </p>

          {/* 1. Date */}
          <div className="flex items-center gap-3.5 border-b border-hairline/40 pb-2">
            <input
              type="checkbox"
              id="update-date"
              checked={updateDate}
              onChange={e => setUpdateDate(e.target.checked)}
              className="w-4 h-4 rounded border-hairline text-brand-blue focus:ring-brand-blue/30 bg-surface-soft cursor-pointer"
            />
            <div className="flex-1 space-y-1">
              <label htmlFor="update-date" className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5 cursor-pointer">
                <Calendar className="w-3.5 h-3.5 text-brand-blue" /> Change Date
              </label>
              {updateDate && (
                <div className="animate-in slide-in-from-top-1 duration-150 mt-1">
                  <CustomDatePicker value={date} onChange={val => setDate(val)} />
                </div>
              )}
            </div>
          </div>

          {/* 2. Time */}
          <div className="flex items-center gap-3.5 border-b border-hairline/40 pb-2">
            <input
              type="checkbox"
              id="update-time"
              checked={updateTime}
              onChange={e => setUpdateTime(e.target.checked)}
              className="w-4 h-4 rounded border-hairline text-brand-blue focus:ring-brand-blue/30 bg-surface-soft cursor-pointer"
            />
            <div className="flex-1 space-y-1">
              <label htmlFor="update-time" className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5 cursor-pointer">
                <Clock className="w-3.5 h-3.5 text-brand-mint" /> Change Time
              </label>
              {updateTime && (
                <div className="animate-in slide-in-from-top-1 duration-150 mt-1">
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink min-h-[38px]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3. Category Tag */}
          <div className="flex items-center gap-3.5 border-b border-hairline/40 pb-2">
            <input
              type="checkbox"
              id="update-category"
              checked={updateCategory}
              onChange={e => setUpdateCategory(e.target.checked)}
              className="w-4 h-4 rounded border-hairline text-brand-blue focus:ring-brand-blue/30 bg-surface-soft cursor-pointer"
            />
            <div className="flex-1 space-y-1">
              <label htmlFor="update-category" className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5 cursor-pointer">
                <Tag className="w-3.5 h-3.5 text-brand-yellow" /> Change Category Tag
              </label>
              {updateCategory && (
                <div className="animate-in slide-in-from-top-1 duration-150 mt-1">
                  <CustomSelect
                    direction="up"
                    options={categories.map(c => ({ value: c.id, label: c.name }))}
                    value={categoryId}
                    onChange={val => setCategoryId(val)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 4. Trip Tag */}
          <div className="flex items-center gap-3.5 border-b border-hairline/40 pb-2">
            <input
              type="checkbox"
              id="update-trip"
              checked={updateTrip}
              onChange={e => setUpdateTrip(e.target.checked)}
              className="w-4 h-4 rounded border-hairline text-brand-blue focus:ring-brand-blue/30 bg-surface-soft cursor-pointer"
            />
            <div className="flex-1 space-y-1">
              <label htmlFor="update-trip" className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5 cursor-pointer">
                <Plane className="w-3.5 h-3.5 text-brand-coral" /> Add / Remove Trip Tag
              </label>
              {updateTrip && (
                <div className="animate-in slide-in-from-top-1 duration-150 mt-1">
                  <CustomSelect
                    direction="up"
                    options={tripOptions}
                    value={tripId}
                    onChange={val => setTripId(val)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 5. Payment Method */}
          <div className="flex items-center gap-3.5 border-b border-hairline/40 pb-2">
            <input
              type="checkbox"
              id="update-payment"
              checked={updatePayment}
              onChange={e => setUpdatePayment(e.target.checked)}
              className="w-4 h-4 rounded border-hairline text-brand-blue focus:ring-brand-blue/30 bg-surface-soft cursor-pointer"
            />
            <div className="flex-1 space-y-1">
              <label htmlFor="update-payment" className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5 cursor-pointer">
                <CreditCard className="w-3.5 h-3.5 text-brand-blue" /> Change Payment Method
              </label>
              {updatePayment && (
                <div className="animate-in slide-in-from-top-1 duration-150 mt-1">
                  <CustomSelect
                    direction="up"
                    options={paymentOptions}
                    value={paymentMethod}
                    onChange={val => setPaymentMethod(val)}
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-98 flex items-center justify-center gap-2 mt-4 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply Bulk Updates</span>
          </button>

        </form>

      </div>
    </div>
  );
};

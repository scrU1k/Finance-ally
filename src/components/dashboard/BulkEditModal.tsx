import React, { useState } from 'react';
import { Category, Trip, CurrencyCode } from '../../types';
import { CustomSelect, SelectOption } from '../common/CustomSelect';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { CustomTimePicker } from '../common/CustomTimePicker';
import { X, Check, Calendar, Clock, Tag, Plane, CreditCard, Palette } from 'lucide-react';

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
    customCategoryName?: string;
    customTagColor?: string;
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
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customTagColor, setCustomTagColor] = useState('#6366f1');
  const [tripId, setTripId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  if (!isOpen) return null;

  const tagColorPalette = [
    '#6366f1', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b',
    '#3b82f6', '#ef4444', '#14b8a6', '#84cc16', '#64748b'
  ];

  const categoryOptions: SelectOption[] = [
    { value: '', label: 'Keep Current Tag' },
    ...categories.map(c => ({
      value: c.id,
      label: c.name,
      icon: <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />,
    })),
  ];

  const paymentOptions: SelectOption[] = [
    { value: '', label: 'Keep Current Payment Method' },
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
    if (date) updates.date = date;
    if (time) updates.time = time;
    if (categoryId) {
      updates.categoryId = categoryId;
      if (categoryId === 'cat-others' && customCategoryName.trim()) {
        updates.customCategoryName = customCategoryName.trim();
        updates.customTagColor = customTagColor;
      }
    }
    if (tripId) {
      updates.tripId = tripId === 'remove' ? null : tripId;
    }
    if (paymentMethod) updates.paymentMethod = paymentMethod;

    if (Object.keys(updates).length === 0) {
      alert('Please select at least one field to change.');
      return;
    }

    await onSave(updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="max-w-md w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl p-6 shadow-2xl shadow-black/20 space-y-4 ring-1 ring-white/10" onClick={e => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <h3 className="text-sm font-mono font-bold text-ink uppercase">Edit Transactions</h3>
            <p className="text-[10px] font-mono text-muted-custom mt-0.5">Updating {selectedCount} selected logs</p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-custom hover:text-ink cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-left">

          {/* Date Selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-brand-blue" /> Date
            </label>
            <CustomDatePicker value={date} onChange={val => setDate(val)} placeholder="Keep Current Date" />
          </div>

          {/* Time Selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-mint" /> Time
            </label>
            <CustomTimePicker value={time || 'Keep Current Time'} onChange={val => setTime(val)} />
          </div>

          {/* Category Tag Selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-brand-yellow" /> Category Tag
            </label>
            <CustomSelect
              direction="up"
              options={categoryOptions}
              value={categoryId}
              onChange={val => setCategoryId(val)}
            />
          </div>

          {/* Custom Tag Name & Color Palette when "Others" is selected */}
          {categoryId === 'cat-others' && (
            <div className="space-y-3 bg-surface-soft p-3 rounded-xl border border-hairline animate-in fade-in duration-150">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block">Custom Tag Name</label>
              <input
                type="text"
                value={customCategoryName}
                onChange={e => setCustomCategoryName(e.target.value)}
                placeholder="e.g. Pet Care, Hobbies, Subscriptions"
                className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1">
                  <Palette className="w-3 h-3 text-brand-pink" /> Tag Color Accent
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {tagColorPalette.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCustomTagColor(color)}
                      className={`w-5 h-5 rounded-full transition-transform cursor-pointer border ${
                        customTagColor === color ? 'scale-125 border-ink ring-2 ring-white/20' : 'border-hairline hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Trip Tag Selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-brand-coral" /> Trip Tag
            </label>
            <CustomSelect
              direction="up"
              options={tripOptions}
              value={tripId}
              onChange={val => setTripId(val)}
            />
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-brand-blue" /> Payment Method
            </label>
            <CustomSelect
              direction="up"
              options={paymentOptions}
              value={paymentMethod}
              onChange={val => setPaymentMethod(val)}
            />
          </div>

          {/* Apply Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

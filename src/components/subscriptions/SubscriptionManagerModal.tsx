import React, { useState, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Subscription, CurrencyCode } from '../../types';
import { loadSubscriptions, saveSubscription, deleteSubscription as dbDeleteSub } from '../../services/db';
import { formatCurrency } from '../../services/currency';
import { X, CalendarCheck, Plus, Trash2, CheckCircle2, Clock, CreditCard, RefreshCw } from 'lucide-react';

interface SubscriptionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionManagerModal: React.FC<SubscriptionManagerModalProps> = ({ isOpen, onClose }) => {
  const { categories, baseCurrency, addTransaction } = useFinance();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [logStatus, setLogStatus] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'bi-monthly' | 'tri-monthly' | 'annually'>('monthly');
  const [nextDueDate, setNextDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-housing');
  const [paymentMethod, setPaymentMethod] = useState('Bank Auto-Debit');

  useEffect(() => {
    if (isOpen) {
      loadSubscriptions().then(setSubscriptions);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!name.trim() || isNaN(numAmount) || numAmount <= 0) return;

    const newSub: Subscription = {
      id: `sub-${Date.now()}`,
      name: name.trim(),
      amount: numAmount,
      currency,
      billingCycle,
      nextDueDate,
      categoryId,
      paymentMethod,
      autoLog: true,
      createdAt: Date.now(),
    };

    await saveSubscription(newSub);
    setSubscriptions(prev => [newSub, ...prev]);

    setName('');
    setAmount('');
    setShowAddForm(false);
  };

  const handleDeleteSub = async (id: string) => {
    await dbDeleteSub(id);
    setSubscriptions(prev => prev.filter(s => s.id !== id));
  };

  const [isProcessingDue, setIsProcessingDue] = useState(false);

  const handleProcessDueSubscriptions = async () => {
    if (isProcessingDue) return;
    setIsProcessingDue(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      let loggedCount = 0;

      const updatedSubs = [...subscriptions];
      for (let i = 0; i < updatedSubs.length; i++) {
        const sub = updatedSubs[i];
        if (sub.nextDueDate <= today && sub.lastProcessedDate !== today) {
          // Auto log transaction
          await addTransaction({
            amount: sub.amount,
            currency: sub.currency,
            categoryId: sub.categoryId,
            date: today,
            time: '09:00',
            note: `${sub.name} (Recurring Subscription)`,
            paymentMethod: sub.paymentMethod,
            isAutoParsed: true,
          });

          // Advance next due date
          const d = new Date(sub.nextDueDate);
          if (sub.billingCycle === 'monthly') d.setMonth(d.getMonth() + 1);
          else if (sub.billingCycle === 'bi-monthly') d.setMonth(d.getMonth() + 2);
          else if (sub.billingCycle === 'tri-monthly') d.setMonth(d.getMonth() + 3);
          else if (sub.billingCycle === 'annually') d.setFullYear(d.getFullYear() + 1);

          const newDateStr = d.toISOString().split('T')[0];
          const updatedSub = { ...sub, nextDueDate: newDateStr, lastProcessedDate: today };
          await saveSubscription(updatedSub);
          updatedSubs[i] = updatedSub;
          loggedCount++;
        }
      }

      setSubscriptions(updatedSubs);
      if (loggedCount > 0) {
        setLogStatus(`Auto-logged ${loggedCount} due subscription(s)! System notification dispatched.`);
      } else {
        setLogStatus('No subscriptions due today.');
      }
    } finally {
      setIsProcessingDue(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto cursor-pointer animate-in fade-in duration-200"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="max-w-xl w-full bg-surface-card/75 backdrop-blur-2xl border border-hairline rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 cursor-default relative ring-1 ring-white/10 max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-brand-mint" />
            <h3 className="text-lg font-display font-bold text-ink">
              Recurring Subscriptions Manager
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-custom hover:text-ink hover:bg-surface-soft rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleProcessDueSubscriptions}
            className="text-xs font-mono border border-brand-mint text-brand-mint px-3 py-1.5 rounded-full font-bold hover:bg-surface-soft cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Process Due Subscriptions</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs font-mono border border-brand-blue text-brand-blue px-3 py-1.5 rounded-full font-bold hover:bg-surface-soft cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Subscription</span>
          </button>
        </div>

        {logStatus && (
          <div className="p-3 rounded-xl bg-surface-soft border border-hairline text-center text-xs font-mono font-bold text-brand-mint animate-in fade-in">
            {logStatus}
          </div>
        )}

        {/* Add Subscription Form */}
        {showAddForm && (
          <form onSubmit={handleAddSubscription} className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline animate-in fade-in duration-150">
            <span className="text-xs font-mono font-bold text-ink block uppercase">Add New Recurring Expense</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Subscription Name (e.g. Netflix)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-surface-card border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink"
                required
              />
              <input
                type="number"
                placeholder={`Amount (${baseCurrency})`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-surface-card border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink"
                required
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Billing Cycle</label>
                <select
                  value={billingCycle}
                  onChange={e => setBillingCycle(e.target.value as any)}
                  className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink cursor-pointer"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Next Due Date</label>
                <input
                  type="date"
                  value={nextDueDate}
                  onChange={e => setNextDueDate(e.target.value)}
                  className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                />
              </div>

              <div className="space-y-1 sm:col-span-1 col-span-2">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Category</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink cursor-pointer"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full border border-brand-blue text-brand-blue hover:bg-surface-card text-xs font-mono font-bold py-2 rounded-xl cursor-pointer shadow-sm"
            >
              Save Subscription
            </button>
          </form>
        )}

        {/* Subscriptions List */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {subscriptions.length === 0 ? (
            <div className="p-8 text-center bg-surface-soft rounded-xl border border-hairline space-y-2">
              <CalendarCheck className="w-8 h-8 text-muted-custom mx-auto" />
              <p className="text-xs font-mono text-muted-custom">No active recurring subscriptions logged yet.</p>
            </div>
          ) : (
            subscriptions.map(sub => {
              const catObj = categories.find(c => c.id === sub.categoryId);
              return (
                <div
                  key={sub.id}
                  className="bg-surface-soft border border-hairline p-4 rounded-xl flex items-center justify-between gap-3 text-xs font-mono"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm">{sub.name}</span>
                      <span className="text-[10px] uppercase font-bold border border-hairline px-2 py-0.5 rounded-full bg-surface-card text-brand-blue">
                        {sub.billingCycle}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-custom">
                      <span className="font-bold text-brand-mint">{formatCurrency(sub.amount, sub.currency)}</span>
                      <span>•</span>
                      <span>Next Due: {sub.nextDueDate}</span>
                      {catObj && (
                        <>
                          <span>•</span>
                          <span className="text-ink">{catObj.name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteSub(sub.id)}
                    className="text-brand-coral hover:opacity-80 p-2 cursor-pointer rounded-lg border border-hairline bg-surface-card"
                    title="Delete subscription"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};

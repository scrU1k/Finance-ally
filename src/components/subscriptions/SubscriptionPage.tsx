import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Subscription, CurrencyCode } from '../../types';
import { loadSubscriptions, saveSubscription, deleteSubscription as dbDeleteSub } from '../../services/db';
import { formatCurrency, TOP_CURRENCIES } from '../../services/currency';
import { CustomSelect, SelectOption } from '../common/CustomSelect';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { CalendarCheck, Plus, Trash2, RefreshCw, CreditCard, Tag, Sparkles, Check, DollarSign, Edit2 } from 'lucide-react';

export const SubscriptionPage: React.FC = () => {
  const { categories, baseCurrency, addTransaction } = useFinance();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [logStatus, setLogStatus] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'bi-monthly' | 'tri-monthly' | 'annually'>('monthly');
  const [nextDueDate, setNextDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-housing');
  const [paymentMethod, setPaymentMethod] = useState('Bank Auto-Debit');

  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    loadSubscriptions().then(setSubscriptions);
  }, []);

  useEffect(() => {
    if (showAddForm && formRef.current) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [showAddForm]);

  const [editingSubId, setEditingSubId] = useState<string | null>(null);

  const handleEditSub = (sub: Subscription) => {
    setName(sub.name);
    setAmount(sub.amount.toString());
    setCurrency(sub.currency);
    setBillingCycle(sub.billingCycle);
    setNextDueDate(sub.nextDueDate);
    setCategoryId(sub.categoryId);
    setPaymentMethod(sub.paymentMethod);
    setEditingSubId(sub.id);
    setShowAddForm(true);
  };

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!name.trim() || isNaN(numAmount) || numAmount <= 0) return;

    if (editingSubId) {
      const existingSub = subscriptions.find(s => s.id === editingSubId);
      const updatedSub: Subscription = {
        id: editingSubId,
        name: name.trim(),
        amount: numAmount,
        currency,
        billingCycle,
        nextDueDate,
        categoryId,
        paymentMethod,
        autoLog: true,
        lastProcessedDate: existingSub?.lastProcessedDate,
        createdAt: existingSub?.createdAt || Date.now(),
      };

      await saveSubscription(updatedSub);
      setSubscriptions(prev => prev.map(s => s.id === editingSubId ? updatedSub : s));
      setEditingSubId(null);
    } else {
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
    }

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
          // Auto log expense transaction
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

          // Advance next due date based on selected cycle with month-end day clamping
          const [curY, curM, curD] = sub.nextDueDate.split('-').map(Number);
          let targetY = curY;
          let targetM = curM - 1; // 0-indexed
          const originalDay = curD;

          if (sub.billingCycle === 'monthly') targetM += 1;
          else if (sub.billingCycle === 'bi-monthly') targetM += 2;
          else if (sub.billingCycle === 'tri-monthly') targetM += 3;
          else if (sub.billingCycle === 'annually') targetY += 1;

          if (targetM >= 12) {
            targetY += Math.floor(targetM / 12);
            targetM = targetM % 12;
          }

          const maxDays = new Date(targetY, targetM + 1, 0).getDate();
          const targetD = Math.min(originalDay, maxDays);
          const newDateStr = `${targetY}-${String(targetM + 1).padStart(2, '0')}-${String(targetD).padStart(2, '0')}`;

          const updatedSub = { ...sub, nextDueDate: newDateStr, lastProcessedDate: today };
          await saveSubscription(updatedSub);
          updatedSubs[i] = updatedSub;
          loggedCount++;
        }
      }

      setSubscriptions(updatedSubs);
      if (loggedCount > 0) {
        setLogStatus(`✅ Auto-logged ${loggedCount} due subscription expense(s) into your timeline!`);
      } else {
        setLogStatus('✨ All subscriptions are up to date! None due today.');
      }

      setTimeout(() => setLogStatus(''), 4000);
    } finally {
      setIsProcessingDue(false);
    }
  };

  // Monthly Equivalent Total Calculation
  const totalMonthlyCommitment = useMemo(() => {
    return subscriptions.reduce((sum, sub) => {
      let monthlyVal = sub.amount;
      if (sub.billingCycle === 'bi-monthly') monthlyVal = sub.amount / 2;
      else if (sub.billingCycle === 'tri-monthly') monthlyVal = sub.amount / 3;
      else if (sub.billingCycle === 'annually') monthlyVal = sub.amount / 12;
      return sum + monthlyVal;
    }, 0);
  }, [subscriptions]);

  // Options for custom app-matching dropdowns
  const billingCycleOptions: SelectOption[] = [
    { value: 'monthly', label: 'Monthly (Every Month)' },
    { value: 'bi-monthly', label: 'Bi-monthly (Every 2 Months)' },
    { value: 'tri-monthly', label: 'Tri-monthly (Quarterly / 3 Months)' },
    { value: 'annually', label: 'Annually (Yearly / 12 Months)' },
  ];

  const categoryOptions: SelectOption[] = categories.map(c => ({
    value: c.id,
    label: c.name,
  }));

  const paymentOptions: SelectOption[] = [
    { value: 'Bank Auto-Debit', label: 'Bank Auto-Debit' },
    { value: 'UPI (GPay / PhonePe / Paytm)', label: 'UPI' },
    { value: 'Credit Card', label: 'Credit Card' },
    { value: 'Debit Card', label: 'Debit Card' },
    { value: 'Net Banking', label: 'Net Banking' },
  ];

  const currencyOptions: SelectOption[] = TOP_CURRENCIES.map(c => ({
    value: c.code,
    label: `${c.flag} ${c.code} (${c.symbol})`,
  }));

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200 max-w-5xl mx-auto">
      
      {/* Full Page Header & Commitment Hero Banner */}
      <div className="dotgui-glass border border-hairline p-6 rounded-3xl shadow-xl bg-surface-card/80 backdrop-blur-xl relative overflow-hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-6 h-6 text-brand-mint" />
              <h1 className="text-xl sm:text-2xl font-display font-bold text-ink">
                Recurring Subscriptions Timeline
              </h1>
            </div>
            <p className="text-xs font-mono text-muted-custom">
              Track fixed expenses, auto-log recurring bills (Netflix, Rent, Internet), and avoid unexpected auto-debit surprises.
            </p>
          </div>

          <div className="bg-surface-soft border border-hairline p-3.5 rounded-2xl shrink-0 space-y-0.5">
            <span className="text-[10px] font-mono text-muted-custom uppercase font-bold block">Est. Monthly Commitment</span>
            <div className="text-xl font-display font-bold text-brand-mint">
              {formatCurrency(totalMonthlyCommitment, baseCurrency)}
            </div>
          </div>
        </div>

        {/* Hero Control Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-hairline/60 flex-wrap">
          <button
            type="button"
            disabled={isProcessingDue}
            onClick={handleProcessDueSubscriptions}
            className="px-4 py-2 rounded-xl border border-brand-mint text-brand-mint hover:bg-surface-soft disabled:opacity-50 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm flex items-center gap-2 active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessingDue ? 'animate-spin' : ''}`} />
            <span>{isProcessingDue ? 'Processing...' : 'Process & Check Due Bills'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 rounded-xl border border-brand-blue text-brand-blue hover:bg-surface-soft text-xs font-mono font-bold transition-all cursor-pointer shadow-sm flex items-center gap-2 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddForm ? 'Close Form' : 'Add New Subscription'}</span>
          </button>
        </div>

        {logStatus && (
          <div className="p-3 rounded-xl bg-surface-soft border border-brand-mint/30 text-xs font-mono font-bold text-brand-mint animate-in fade-in">
            {logStatus}
          </div>
        )}
      </div>

      {/* Add Subscription Form (App-Matching Custom Dropdowns) */}
      {showAddForm && (
        <form ref={formRef} onSubmit={handleAddSubscription} className="dotgui-glass border border-hairline p-5 rounded-2xl shadow-lg bg-surface-soft/90 backdrop-blur-xl space-y-4 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand-yellow" /> Create New Recurring Subscription
            </span>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-muted-custom hover:text-ink text-xs font-mono cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase font-bold block">Subscription Name</label>
              <input
                type="text"
                placeholder="e.g. Netflix, Rent, Spotify, Broadband"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase font-bold block">Amount & Currency</label>
              <div className="flex items-center gap-2">
                <CustomSelect
                  direction="down"
                  options={currencyOptions}
                  value={currency}
                  onChange={val => setCurrency(val as CurrencyCode)}
                  className="w-36 shrink-0"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-2 text-xs font-mono font-bold text-ink focus:outline-none focus:border-ink"
                  required
                />
              </div>
            </div>
          </div>

          {/* Frequency & Details (All Custom App-Matching Dropdowns) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase font-bold block">Billing Frequency</label>
              <CustomSelect
                direction="down"
                options={billingCycleOptions}
                value={billingCycle}
                onChange={val => setBillingCycle(val as any)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase font-bold block">Category Tag</label>
              <CustomSelect
                direction="down"
                options={categoryOptions}
                value={categoryId}
                onChange={val => setCategoryId(val)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-muted-custom uppercase font-bold block">Payment Method</label>
              <CustomSelect
                direction="down"
                options={paymentOptions}
                value={paymentMethod}
                onChange={val => setPaymentMethod(val)}
              />
            </div>

          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-mono text-muted-custom uppercase font-bold block">Next Due Date</label>
            <CustomDatePicker
              value={nextDueDate}
              onChange={val => setNextDueDate(val)}
            />
          </div>

          <button
            type="submit"
            className="w-full border border-brand-mint text-brand-mint hover:bg-surface-card font-mono text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <Check className="w-4 h-4" />
            <span>Save Subscription</span>
          </button>
        </form>
      )}

      {/* Subscriptions Grid View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subscriptions.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-surface-card/60 rounded-3xl border border-hairline space-y-2">
            <CalendarCheck className="w-10 h-10 text-muted-custom mx-auto" />
            <p className="text-sm font-mono text-muted-custom font-bold">No active recurring subscriptions logged yet.</p>
          </div>
        ) : (
          subscriptions.map(sub => {
            const catObj = categories.find(c => c.id === sub.categoryId);
            const isDueToday = sub.nextDueDate <= new Date().toISOString().split('T')[0];

            return (
              <div
                key={sub.id}
                className="dotgui-glass border border-hairline p-5 rounded-2xl shadow-md bg-surface-card/90 backdrop-blur-xl space-y-3 relative hover:border-ink transition-all flex flex-col justify-between"
              >
                <div className="space-y-2">
                  
                  {/* Top Bar: Name & Billing Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-ink font-display">{sub.name}</h3>
                      <div className="text-[11px] font-mono text-muted-custom flex items-center gap-1.5 mt-0.5">
                        <CreditCard className="w-3 h-3 text-brand-blue" />
                        <span>{sub.paymentMethod}</span>
                      </div>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold border ${
                      sub.billingCycle === 'annually' ? 'border-brand-purple text-brand-purple bg-brand-purple/10' :
                      sub.billingCycle === 'tri-monthly' ? 'border-brand-yellow text-brand-yellow bg-brand-yellow/10' :
                      sub.billingCycle === 'bi-monthly' ? 'border-brand-blue text-brand-blue bg-brand-blue/10' :
                      'border-brand-mint text-brand-mint bg-brand-mint/10'
                    }`}>
                      {sub.billingCycle}
                    </span>
                  </div>

                  {/* Price & Category Row */}
                  <div className="flex items-center justify-between border-t border-b border-hairline/60 py-2.5">
                    <div>
                      <span className="text-[10px] font-mono text-muted-custom uppercase font-bold block">Recurring Cost</span>
                      <span className="text-lg font-display font-bold text-ink">
                        {formatCurrency(sub.amount, sub.currency)}
                      </span>
                    </div>

                    {catObj && (
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-muted-custom uppercase font-bold block">Category</span>
                        <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-ink justify-end">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: catObj.color }} />
                          <span>{catObj.name}</span>
                        </span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Bottom Bar: Next Due Date & Delete */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-muted-custom">Next Due:</span>
                    <span className={`font-bold ${isDueToday ? 'text-brand-coral animate-pulse' : 'text-ink'}`}>
                      {sub.nextDueDate} {isDueToday && '(DUE TODAY)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleEditSub(sub)}
                      className="p-1.5 rounded-lg border border-hairline hover:border-brand-blue text-muted-custom hover:text-brand-blue transition-colors cursor-pointer bg-surface-soft"
                      title="Edit subscription"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSub(sub.id)}
                      className="p-1.5 rounded-lg border border-hairline hover:border-brand-coral text-muted-custom hover:text-brand-coral transition-colors cursor-pointer bg-surface-soft"
                      title="Remove subscription"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

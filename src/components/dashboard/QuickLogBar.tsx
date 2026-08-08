import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { parseNaturalLanguageExpense, ParsedNaturalExpense } from '../../services/naturalLanguageParser';
import { formatCurrency } from '../../services/currency';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { CustomSelect } from '../common/CustomSelect';
import { Sparkles, ArrowRight, Check, X, CreditCard, Calendar, Clock, Tag, Plus, Trash2, Edit2, ListPlus } from 'lucide-react';

interface QuickLogBarProps {
  onLoggedSuccess?: () => void;
  isMultiLogOpen?: boolean;
  onToggleMultiLog?: () => void;
}

export interface StagedLogItem extends ParsedNaturalExpense {
  id: string;
  rawPrompt: string;
  paymentMethod: string;
}

export const QuickLogBar: React.FC<QuickLogBarProps> = ({ onLoggedSuccess, isMultiLogOpen: isMultiLogOpenProp, onToggleMultiLog }) => {
  const { baseCurrency, addTransaction, categories, transactions, activeTripVault } = useFinance();

  const [inputPrompt, setInputPrompt] = useState('');
  const [parsedExpense, setParsedExpense] = useState<ParsedNaturalExpense | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTagPopupOpen, setIsTagPopupOpen] = useState(false);

  // Multi-Log Batch State - isOpen is driven by parent toolbar via prop, with internal fallback
  const [isMultiLogOpenInternal, setIsMultiLogOpenInternal] = useState(false);
  const isMultiLogOpen = isMultiLogOpenProp !== undefined ? isMultiLogOpenProp : isMultiLogOpenInternal;
  const [batchDate, setBatchDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [multiInputPrompt, setMultiInputPrompt] = useState('');
  const [stagedItems, setStagedItems] = useState<StagedLogItem[]>([]);
  const [editingStagedId, setEditingStagedId] = useState<string | null>(null);
  const [changingTagStagedId, setChangingTagStagedId] = useState<string | null>(null);

  // Proactive Budget Cap Interception State
  const [budgetWarning, setBudgetWarning] = useState<{
    categoryName: string;
    currentSpent: number;
    newAmount: number;
    limit: number;
    pendingMethod?: string;
  } | null>(null);

  const handleParse = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim()) return;

    const parsed = parseNaturalLanguageExpense(inputPrompt, baseCurrency);
    setParsedExpense(parsed);
  };

  // Multi-Log Handlers
  const handleAddStagedItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!multiInputPrompt.trim()) return;

    const parsed = parseNaturalLanguageExpense(multiInputPrompt, baseCurrency);

    if (editingStagedId) {
      setStagedItems(prev =>
        prev.map(item =>
          item.id === editingStagedId
            ? {
                ...parsed,
                id: editingStagedId,
                rawPrompt: multiInputPrompt,
                date: batchDate,
                paymentMethod: item.paymentMethod || 'UPI',
              }
            : item
        )
      );
      setEditingStagedId(null);
    } else {
      const newItem: StagedLogItem = {
        ...parsed,
        id: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        rawPrompt: multiInputPrompt,
        date: batchDate,
        paymentMethod: 'UPI',
      };
      setStagedItems(prev => [...prev, newItem]);
    }

    setMultiInputPrompt('');
  };

  const handleEditStagedItem = (id: string) => {
    const item = stagedItems.find(i => i.id === id);
    if (!item) return;
    setMultiInputPrompt(item.rawPrompt);
    setEditingStagedId(id);
  };

  const handleDeleteStagedItem = (id: string) => {
    setStagedItems(prev => prev.filter(i => i.id !== id));
    if (editingStagedId === id) {
      setEditingStagedId(null);
      setMultiInputPrompt('');
    }
  };

  const handleSaveSingleStagedItem = async (id: string) => {
    const item = stagedItems.find(i => i.id === id);
    if (!item) return;

    await addTransaction({
      amount: item.amount,
      currency: item.currency,
      categoryId: item.categoryId,
      date: item.date,
      time: item.time,
      note: item.description,
      paymentMethod: item.paymentMethod,
      isAutoParsed: true,
      confidenceScore: item.confidence,
      tripId: activeTripVault?.id || undefined,
    });

    handleDeleteStagedItem(id);
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 1200);
  };

  const handleSaveAllStaged = async () => {
    if (stagedItems.length === 0) return;

    for (const item of stagedItems) {
      await addTransaction({
        amount: item.amount,
        currency: item.currency,
        categoryId: item.categoryId,
        date: item.date,
        time: item.time,
        note: item.description,
        paymentMethod: item.paymentMethod,
        isAutoParsed: true,
        confidenceScore: item.confidence,
        tripId: activeTripVault?.id || undefined,
      });
    }

    setStagedItems([]);
    setMultiInputPrompt('');
    setEditingStagedId(null);
    if (onToggleMultiLog) onToggleMultiLog(); // close via parent
    else setIsMultiLogOpenInternal(false);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onLoggedSuccess?.();
    }, 1200);
  };

  const checkBudgetAndLog = (selectedPayment?: string) => {
    if (!parsedExpense) return;
    const finalMethod = selectedPayment || paymentMethod;

    const targetCat = categories.find(c => c.id === parsedExpense.categoryId);

    if (targetCat && targetCat.budgetLimit && targetCat.budgetLimit > 0) {
      const currentMonthKey = new Date().toISOString().substring(0, 7);
      const currentSpent = transactions
        .filter(t => t.categoryId === targetCat.id && t.date.startsWith(currentMonthKey))
        .reduce((sum, t) => sum + t.amount, 0);

      const projectedTotal = currentSpent + parsedExpense.amount;
      if (projectedTotal > targetCat.budgetLimit) {
        setBudgetWarning({
          categoryName: targetCat.name,
          currentSpent,
          newAmount: parsedExpense.amount,
          limit: targetCat.budgetLimit,
          pendingMethod: finalMethod,
        });
        return;
      }
    }

    handleConfirmLog(finalMethod);
  };

  const handleConfirmLog = async (selectedPayment?: string) => {
    if (!parsedExpense) return;
    const finalMethod = selectedPayment || paymentMethod;

    await addTransaction({
      amount: parsedExpense.amount,
      currency: parsedExpense.currency,
      categoryId: parsedExpense.categoryId,
      date: parsedExpense.date,
      time: parsedExpense.time,
      note: parsedExpense.description,
      paymentMethod: finalMethod,
      isAutoParsed: true,
      confidenceScore: parsedExpense.confidence,
      tripId: activeTripVault?.id || undefined,
    });

    setBudgetWarning(null);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      setParsedExpense(null);
      setInputPrompt('');
      onLoggedSuccess?.();
    }, 1200);
  };

  const paymentOptions = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Net Banking'];

  return (
    <div className="space-y-3 dotgui-glass border border-hairline p-4 rounded-2xl shadow-lg bg-surface-card/90 backdrop-blur-xl">
      
      {/* Natural Language Prompt Input Bar */}
      <form onSubmit={handleParse} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputPrompt}
            onChange={e => setInputPrompt(e.target.value)}
            placeholder="Quick Log: 300Rs spent on Burger..."
            className="w-full bg-surface-soft border border-hairline rounded-2xl pl-12 pr-4 py-3.5 text-sm sm:text-base font-sans-custom text-ink focus:outline-none focus:border-ink placeholder:text-muted-custom/70 min-h-[54px]"
          />
          <Sparkles className="w-4 h-4 text-brand-yellow absolute left-4.5 top-1/2 -translate-y-1/2" />
        </div>

        <button
          type="submit"
          disabled={!inputPrompt.trim()}
          className="border-2 border-brand-blue text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40 w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-lg active:scale-95 bg-surface-card"
          title="Log Expense"
        >
          <ArrowRight className="w-5 h-5 stroke-[2.5]" />
        </button>
      </form>



      {/* EXPANDABLE MULTI-LOG BATCH CANVAS DRAWER - controlled by parent toolbar */}
      {(isMultiLogOpen ?? false) && (
        <div className="bg-surface-soft border border-hairline p-4 rounded-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 relative shadow-inner">
          
          {/* Header & Date Selector: Two-Line Layout */}
          <div className="space-y-2 border-b border-hairline pb-3">
            {/* Line 1: Title (One-line on top, no wrapping, no truncation) */}
            <div className="overflow-x-auto no-scrollbar">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5 whitespace-nowrap">
                <ListPlus className="w-4 h-4 text-brand-purple shrink-0" />
                <span>Multi-Log Batch Session</span>
              </span>
            </div>

            {/* Line 2: Set Date */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-xs font-mono text-muted-custom shrink-0 font-semibold">Set Date:</span>
              <CustomDatePicker
                value={batchDate}
                onChange={val => {
                  setBatchDate(val);
                  setStagedItems(prev => prev.map(item => ({ ...item, date: val })));
                }}
              />
            </div>
          </div>

          {/* Input Row */}
          <form onSubmit={handleAddStagedItem} className="flex items-center gap-2">
            <input
              type="text"
              value={multiInputPrompt}
              onChange={e => setMultiInputPrompt(e.target.value)}
              placeholder="e.g. 450 cab to airport at 8pm"
              className="flex-1 bg-surface-card border border-hairline rounded-xl px-3.5 py-2 text-xs sm:text-sm font-sans-custom text-ink focus:outline-none focus:border-ink placeholder:text-muted-custom"
            />
            <button
              type="submit"
              disabled={!multiInputPrompt.trim()}
              className="w-9 h-9 rounded-xl border border-brand-blue text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40 transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0 bg-surface-card"
              title={editingStagedId ? 'Update item' : 'Add item'}
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          {/* Staged Items List */}
          {stagedItems.length > 0 && (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {stagedItems.map((item) => {
                const catObj = categories.find(c => c.id === item.categoryId);
                const catColor = catObj?.color || '#8B5CF6';

                return (
                  <div
                    key={item.id}
                    className="bg-surface-card border border-hairline p-3 rounded-xl space-y-2 text-xs font-mono"
                  >
                    {/* Line 1: Name (Left, truncated) & Amount (Right, no wrap) */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-bold text-ink truncate text-sm flex-1 min-w-0">
                        {item.description}
                      </span>
                      <span className="font-bold text-brand-mint text-sm shrink-0 whitespace-nowrap">
                        {formatCurrency(item.amount, item.currency)}
                      </span>
                    </div>

                    {/* Line 2: Time (Left) & Category Tag (Right) */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-muted-custom text-xs font-mono shrink-0">
                        {item.time}
                      </span>
                      <button
                        type="button"
                        onClick={() => setChangingTagStagedId(item.id)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-lg font-bold shrink-0 flex items-center gap-1 hover:opacity-80 active:scale-95 transition-all cursor-pointer shadow-2xs"
                        style={{ backgroundColor: `${catColor}18`, color: catColor, border: `1px solid ${catColor}40` }}
                        title="Click to change category tag"
                      >
                        <Tag className="w-3 h-3" />
                        <span>{item.categoryName}</span>
                      </button>
                    </div>

                    {/* Line 3: Compact Payment Dropdown (Left) & Segmented Icon Action Pill (Right) */}
                    <div className="flex items-center justify-between gap-2 min-w-0 pt-0.5">
                      <select
                        value={item.paymentMethod}
                        onChange={e => {
                          const val = e.target.value;
                          setStagedItems(prev =>
                            prev.map(i => i.id === item.id ? { ...i, paymentMethod: val } : i)
                          );
                        }}
                        className="bg-surface-soft border border-hairline rounded-lg px-2 py-1 text-xs text-ink font-mono font-semibold focus:outline-none focus:border-brand-blue cursor-pointer transition-all shrink-0 w-24"
                      >
                        {paymentOptions.map(p => (
                          <option key={p} value={p} className="bg-surface-card text-ink">{p}</option>
                        ))}
                      </select>

                      {/* Single segmented pill parted by vertical lines for action icons */}
                      <div className="border border-hairline bg-surface-soft rounded-lg flex items-center divide-x divide-hairline overflow-hidden shrink-0 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleSaveSingleStagedItem(item.id)}
                          className="p-1.5 hover:bg-brand-mint/15 transition-colors cursor-pointer"
                          title="Save expense"
                        >
                          <Check className="w-3.5 h-3.5 text-brand-mint" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditStagedItem(item.id)}
                          className="p-1.5 hover:bg-brand-blue/15 transition-colors cursor-pointer"
                          title="Edit expense"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStagedItem(item.id)}
                          className="p-1.5 hover:bg-brand-coral/15 transition-colors cursor-pointer"
                          title="Delete expense"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-brand-coral" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Save All Button */}
          {stagedItems.length > 0 && (
            <div className="pt-2 border-t border-hairline flex justify-end">
              <button
                type="button"
                onClick={handleSaveAllStaged}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-brand-mint text-brand-mint hover:bg-surface-card text-xs font-mono font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2 active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Save All</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* Success Notification */}
      {isSuccess && (
        <div className="flex items-center gap-2 text-xs font-mono text-brand-mint font-bold bg-surface-soft p-3 rounded-xl border border-brand-mint/30 animate-in fade-in duration-150">
          <Check className="w-4 h-4" />
          <span>Expense Recorded Successfully!</span>
        </div>
      )}

      {/* Interactive Parsed Preview Card */}
      {parsedExpense && !isSuccess && (
        <div className="bg-surface-soft border border-hairline p-4 rounded-xl space-y-3 animate-in fade-in zoom-in-95 duration-150 relative">
          
          <button
            onClick={() => setParsedExpense(null)}
            className="absolute top-3 right-3 text-muted-custom hover:text-ink cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Parsed Breakdown Metadata */}
          <div className="flex items-center justify-between border-b border-hairline pb-2.5 pr-6">
            <div className="space-y-0.5">
              <span className="text-[10px] font-mono text-muted-custom uppercase font-bold">Auto-Identified Expense</span>
              <div className="text-sm font-bold text-ink font-sans-custom">
                {parsedExpense.description}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono text-muted-custom uppercase font-bold">Parsed Amount</span>
              <div className="text-lg font-display font-bold text-ink">
                {formatCurrency(parsedExpense.amount, parsedExpense.currency)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-custom">
            {/* Clickable Auto-detected Tag selector */}
            <button
              type="button"
              onClick={() => setIsTagPopupOpen(true)}
              className="flex items-center gap-1.5 text-ink font-semibold hover:bg-surface-card px-2 py-0.5 rounded-lg border border-hairline transition-all cursor-pointer"
              title="Click to change category tag"
            >
              <Tag className="w-3 h-3 text-brand-purple shrink-0" />
              <span>{parsedExpense.categoryName}</span>
            </button>

            <span>•</span>

            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-brand-blue" />
              <span>{parsedExpense.dateLabel} ({parsedExpense.date})</span>
            </span>

            <span>•</span>

            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-brand-mint" />
              <span>{parsedExpense.timeLabel} ({parsedExpense.time})</span>
            </span>
          </div>

          {/* Select Payment Method & Instant Log Chips */}
          <div className="space-y-1.5 pt-2 border-t border-hairline/60">
            <label className="text-[10px] font-mono text-muted-custom uppercase font-bold flex items-center gap-1">
              <CreditCard className="w-3 h-3" /> Select Payment Method & Log:
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {paymentOptions.map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => checkBudgetAndLog(method)}
                  className="px-3 py-1.5 rounded-full text-xs font-mono border border-hairline bg-surface-card text-ink font-semibold hover:border-brand-blue hover:text-brand-blue transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                >
                  <Check className="w-3 h-3 text-brand-blue" />
                  <span>{method}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* PROACTIVE BUDGET CAP WARNING MODAL */}
      {budgetWarning && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
          onClick={() => setBudgetWarning(null)}
        >
          <div
            className="max-w-sm w-full bg-surface-card/95 backdrop-blur-2xl border border-brand-coral/40 rounded-2xl p-6 shadow-2xl space-y-4 cursor-default relative ring-1 ring-brand-coral/20 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-brand-coral border-b border-hairline pb-2.5">
              <span className="text-sm font-mono font-bold uppercase">⚠️ Proactive Budget Warning</span>
            </div>

            <div className="space-y-2 text-xs font-mono text-ink">
              <p className="leading-relaxed">
                Logging this expense of <strong className="text-brand-coral">{formatCurrency(budgetWarning.newAmount, baseCurrency)}</strong> will push your <strong className="text-ink font-bold">"{budgetWarning.categoryName}"</strong> category budget over its monthly limit!
              </p>

              <div className="bg-surface-soft p-3 rounded-xl border border-hairline space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-custom">Current Spend:</span>
                  <span>{formatCurrency(budgetWarning.currentSpent, baseCurrency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-custom">Monthly Budget Limit:</span>
                  <span className="font-bold">{formatCurrency(budgetWarning.limit, baseCurrency)}</span>
                </div>
                <div className="flex justify-between border-t border-hairline/60 pt-1 font-bold">
                  <span className="text-brand-coral">Projected Total:</span>
                  <span className="text-brand-coral">{formatCurrency(budgetWarning.currentSpent + budgetWarning.newAmount, baseCurrency)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBudgetWarning(null)}
                className="flex-1 py-2 rounded-xl border border-hairline text-muted-custom text-xs font-mono font-bold hover:border-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmLog(budgetWarning.pendingMethod)}
                className="flex-1 py-2 rounded-xl border border-brand-coral text-brand-coral hover:bg-brand-coral/10 text-xs font-mono font-bold cursor-pointer shadow-sm"
              >
                Proceed & Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Glassmorphic Category Tag Selection Popup */}
      {isTagPopupOpen && parsedExpense && (
        <div
          className="fixed inset-0 z-[80] bg-canvas/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsTagPopupOpen(false)}
        >
          <div
            className="dotgui-glass border border-hairline rounded-2xl shadow-2xl p-5 space-y-4 bg-surface-card/95 backdrop-blur-xl w-72 max-w-[92vw]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-brand-purple" /> Select Tag
              </span>
              <button
                type="button"
                onClick={() => setIsTagPopupOpen(false)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto no-scrollbar">
              {categories.map(cat => {
                const isSelected = parsedExpense.categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setParsedExpense({
                        ...parsedExpense,
                        categoryId: cat.id,
                        categoryName: cat.name,
                      });
                      setIsTagPopupOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 p-2 rounded-xl border text-xs font-mono text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-ink text-ink font-bold bg-surface-soft'
                        : 'border-hairline bg-surface-card text-body-custom hover:border-ink'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Staged Item Category Tag Selection Popup */}
      {changingTagStagedId && (
        <div
          className="fixed inset-0 z-[85] bg-canvas/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setChangingTagStagedId(null)}
        >
          <div
            className="dotgui-glass border border-hairline rounded-2xl shadow-2xl p-5 space-y-4 bg-surface-card/95 backdrop-blur-xl w-72 max-w-[92vw]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-brand-purple" /> Select Category Tag
              </span>
              <button
                type="button"
                onClick={() => setChangingTagStagedId(null)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto no-scrollbar">
              {categories.map(cat => {
                const currentItem = stagedItems.find(i => i.id === changingTagStagedId);
                const isSelected = currentItem?.categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setStagedItems(prev =>
                        prev.map(i =>
                          i.id === changingTagStagedId
                            ? { ...i, categoryId: cat.id, categoryName: cat.name }
                            : i
                        )
                      );
                      setChangingTagStagedId(null);
                    }}
                    className={`w-full flex items-center gap-2 p-2 rounded-xl border text-xs font-mono text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-ink text-ink font-bold bg-surface-soft'
                        : 'border-hairline bg-surface-card text-body-custom hover:border-ink'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

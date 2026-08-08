import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { parseNaturalLanguageExpense, ParsedNaturalExpense } from '../../services/naturalLanguageParser';
import { formatCurrency } from '../../services/currency';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { Sparkles, ArrowRight, Check, X, CreditCard, Calendar, Clock, Tag, Plus } from 'lucide-react';

interface QuickLogBarProps {
  onLoggedSuccess?: () => void;
  isMultiLogActive?: boolean;
  onToggleMultiLog?: () => void;
  batchDate?: string;
  onBatchDateChange?: (date: string) => void;
}

export const QuickLogBar: React.FC<QuickLogBarProps> = ({
  onLoggedSuccess,
  isMultiLogActive = false,
  onToggleMultiLog,
  batchDate: batchDateProp,
  onBatchDateChange,
}) => {
  const { baseCurrency, addTransaction, categories, transactions, activeTripVault, addCategoryItem } = useFinance();

  const [inputPrompt, setInputPrompt] = useState('');
  const [parsedExpense, setParsedExpense] = useState<ParsedNaturalExpense | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTagPopupOpen, setIsTagPopupOpen] = useState(false);

  // Custom Tag Creation Modal Form State
  const [showCustomTagForm, setShowCustomTagForm] = useState(false);
  const [customTagName, setCustomTagName] = useState('');
  const [selectedCustomColor, setSelectedCustomColor] = useState('#EE5F1C');

  // Internal Date State for Multi-Log mode
  const [internalBatchDate, setInternalBatchDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const batchDate = batchDateProp !== undefined ? batchDateProp : internalBatchDate;

  const setBatchDate = (newDate: string) => {
    setInternalBatchDate(newDate);
    onBatchDateChange?.(newDate);
  };

  // Proactive Budget Cap Interception State
  const [budgetWarning, setBudgetWarning] = useState<{
    categoryName: string;
    currentSpent: number;
    newAmount: number;
    limit: number;
    pendingMethod?: string;
  } | null>(null);

  const COLOR_PALETTE = ['#EE5F1C', '#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#F59E0B', '#F43F5E', '#14B8A6', '#6366F1', '#06B6D4'];

  const ensureCustomTagSaved = async (catName: string): Promise<string> => {
    const existing = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    if (existing) return existing.id;

    const color = selectedCustomColor || COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    await addCategoryItem({
      name: catName,
      color,
      icon: 'Tag',
      isDefault: false
    });

    const newlyAdded = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    return newlyAdded?.id || 'cat-others';
  };

  const handleParse = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim()) return;

    const parsed = parseNaturalLanguageExpense(inputPrompt, baseCurrency, categories);

    // If Multi-Log mode is active, override parsed date with the selected batch date
    if (isMultiLogActive && batchDate) {
      parsed.date = batchDate;
      parsed.dateLabel = batchDate;
    }

    setParsedExpense(parsed);
  };

  const checkBudgetAndLog = (selectedPayment?: string) => {
    if (!parsedExpense) return;
    const finalMethod = selectedPayment || paymentMethod;

    const targetCat = categories.find(c => c.id === parsedExpense.categoryId);

    if (targetCat && targetCat.budgetLimit && targetCat.budgetLimit > 0) {
      const currentMonthKey = parsedExpense.date.substring(0, 7);
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

    let targetCatId = parsedExpense.categoryId;
    if (parsedExpense.isNewCustomTag || targetCatId.startsWith('cat-custom-')) {
      targetCatId = await ensureCustomTagSaved(parsedExpense.categoryName);
    }

    await addTransaction({
      amount: parsedExpense.amount,
      currency: parsedExpense.currency,
      categoryId: targetCatId,
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
    }, 1000);
  };

  const paymentOptions = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Net Banking'];

  return (
    <div className="space-y-3 dotgui-glass border border-hairline p-4 rounded-2xl shadow-lg bg-surface-card/90 backdrop-blur-xl">

      {/* Natural Language Prompt Input Bar - EXACTLY AS ORIGINALLY DESIGNED */}
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

      {/* Compact Date Field below Quick Log Text Box when Multi-Log is active */}
      {isMultiLogActive && (
        <div className="flex items-center pt-0.5 animate-in fade-in duration-150">
          <CustomDatePicker
            value={batchDate}
            onChange={val => setBatchDate(val)}
            className="bg-surface-soft border-brand-purple/50 text-brand-purple font-bold rounded-xl text-xs px-3 py-1 hover:border-brand-purple cursor-pointer shadow-2xs"
          />
        </div>
      )}

      {/* Success Notification */}
      {isSuccess && (
        <div className="flex items-center gap-2 text-xs font-mono text-brand-mint font-bold bg-surface-soft p-3 rounded-xl border border-brand-mint/30 animate-in fade-in duration-150">
          <Check className="w-4 h-4" />
          <span>Expense Recorded for {parsedExpense?.date || batchDate}!</span>
        </div>
      )}

      {/* Interactive Parsed Preview Card */}
      {parsedExpense && !isSuccess && (
        <div className="bg-surface-soft border border-hairline p-4 rounded-xl space-y-3 animate-in fade-in zoom-in-95 duration-150 relative">
          
          <button
            onClick={() => {
              setParsedExpense(null);
              setInputPrompt('');
            }}
            className="absolute top-3 right-3 text-muted-custom hover:text-ink cursor-pointer"
            title="Clear quick log text box"
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
                className="flex-1 py-2 rounded-xl bg-brand-coral text-white font-mono text-xs font-bold hover:bg-brand-coral/90 transition-all cursor-pointer shadow-md"
              >
                Log Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY TAG SELECTION MODAL */}
      {isTagPopupOpen && parsedExpense && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
          onClick={() => {
            setIsTagPopupOpen(false);
            setShowCustomTagForm(false);
          }}
        >
          <div
            className="max-w-md w-full bg-surface-card/90 backdrop-blur-2xl border border-hairline rounded-3xl p-5 shadow-2xl space-y-4 cursor-default relative ring-1 ring-white/10 max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-brand-purple" /> Select Category Tag
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsTagPopupOpen(false);
                  setShowCustomTagForm(false);
                }}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category Tag Grid */}
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 no-scrollbar">
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
                        isNewCustomTag: false,
                      });
                      setIsTagPopupOpen(false);
                      setShowCustomTagForm(false);
                    }}
                    className={`p-2.5 rounded-xl border text-left text-xs font-mono flex items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-purple bg-surface-soft font-bold text-ink shadow-sm'
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

            {/* Custom Category Button */}
            {!showCustomTagForm ? (
              <button
                type="button"
                onClick={() => setShowCustomTagForm(true)}
                className="w-full py-2 rounded-xl border border-dashed border-brand-purple/50 text-brand-purple hover:bg-brand-purple/10 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Custom Tag</span>
              </button>
            ) : (
              <div className="space-y-3 p-3 bg-surface-soft rounded-2xl border border-hairline animate-in fade-in duration-150">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Custom Tag Name</label>
                  <input
                    type="text"
                    value={customTagName}
                    onChange={e => setCustomTagName(e.target.value)}
                    placeholder="e.g. Flowers, Gaming, Books"
                    className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-brand-purple"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Choose Color</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_PALETTE.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedCustomColor(color)}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                          selectedCustomColor === color ? 'scale-125 ring-2 ring-white shadow-md' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCustomTagForm(false)}
                    className="flex-1 py-1.5 rounded-xl border border-hairline text-muted-custom text-xs font-mono font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!customTagName.trim()) return;
                      setParsedExpense({
                        ...parsedExpense,
                        categoryId: 'cat-custom-temp',
                        categoryName: customTagName.trim(),
                        isNewCustomTag: true,
                      });
                      setIsTagPopupOpen(false);
                      setShowCustomTagForm(false);
                    }}
                    className="flex-1 py-1.5 rounded-xl bg-brand-purple text-white font-mono text-xs font-bold shadow-md hover:bg-brand-purple/90"
                  >
                    Use Custom Tag
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

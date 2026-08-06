import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { parseNaturalLanguageExpense, ParsedNaturalExpense } from '../../services/naturalLanguageParser';
import { formatCurrency } from '../../services/currency';
import { Sparkles, ArrowRight, Check, X, CreditCard, Calendar, Clock, Tag } from 'lucide-react';

interface QuickLogBarProps {
  onLoggedSuccess?: () => void;
}

export const QuickLogBar: React.FC<QuickLogBarProps> = ({ onLoggedSuccess }) => {
  const { baseCurrency, addTransaction, categories } = useFinance();

  const [inputPrompt, setInputPrompt] = useState('');
  const [parsedExpense, setParsedExpense] = useState<ParsedNaturalExpense | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTagPopupOpen, setIsTagPopupOpen] = useState(false);

  const handleParse = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputPrompt.trim()) return;

    const parsed = parseNaturalLanguageExpense(inputPrompt, baseCurrency);
    setParsedExpense(parsed);
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
    });

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
            placeholder="Quick Log: e.g. 300Rs spent on Burger at McD on Wednesday afternoon"
            className="w-full bg-surface-soft border border-hairline rounded-xl pl-11 pr-4 py-3 text-xs sm:text-sm md:text-base font-sans-custom text-ink focus:outline-none focus:border-ink placeholder:text-muted-custom/70 min-h-[48px]"
          />
          <Sparkles className="w-4 h-4 text-brand-yellow absolute left-4 top-1/2 -translate-y-1/2" />
        </div>

        <button
          type="submit"
          disabled={!inputPrompt.trim()}
          className="border border-brand-blue text-brand-blue hover:bg-surface-soft disabled:opacity-40 px-4 py-3 rounded-xl font-mono text-xs sm:text-sm font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer min-h-[48px]"
        >
          <span>Log</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>

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
                  onClick={() => handleConfirmLog(method)}
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

    </div>
  );
};

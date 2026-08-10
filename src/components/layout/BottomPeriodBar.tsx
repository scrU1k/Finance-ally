import React, { useState, useRef, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { PeriodType } from '../../types';
import { PeriodNote } from '../../types';
import { formatCurrency } from '../../services/currency';
import { loadPeriodNotes, savePeriodNote, deletePeriodNote } from '../../services/db';
import { Plus, ChevronUp, FileText, X, Edit2, Trash2 } from 'lucide-react';

interface BottomPeriodBarProps {
  onOpenQuickAdd: () => void;
}

export const BottomPeriodBar: React.FC<BottomPeriodBarProps> = ({ onOpenQuickAdd }) => {
  const { period, setPeriod, viewedPeriodTotal, viewedPeriodLabel, baseCurrency, filteredTransactions } = useFinance();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPeriodSelectorOpen, setIsPeriodSelectorOpen] = useState(false);

  // Period Notes state (current month)
  const [periodNotes, setPeriodNotes] = useState<PeriodNote[]>([]);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteEditContent, setNoteEditContent] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);

  const currentMonthKey = new Date().toISOString().substring(0, 7);
  const currentMonthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    loadPeriodNotes().then(notes => setPeriodNotes(notes));
  }, []);

  const handleOpenNoteModal = () => {
    const existing = periodNotes.find(n => n.periodKey === currentMonthKey);
    setNoteEditContent(existing?.content || '');
    setIsEditingNote(!existing);
    setIsNoteModalOpen(true);
  };

  const handleSaveNote = async () => {
    const newNote: PeriodNote = {
      id: `note-${currentMonthKey}`,
      periodType: 'month',
      periodKey: currentMonthKey,
      title: `${currentMonthLabel} Note`,
      content: noteEditContent.trim(),
      updatedAt: Date.now(),
    };
    await savePeriodNote(newNote);
    const updated = await loadPeriodNotes();
    setPeriodNotes(updated);
    setIsEditingNote(false);
  };

  const handleDeleteNote = async () => {
    await deletePeriodNote(currentMonthKey);
    const updated = await loadPeriodNotes();
    setPeriodNotes(updated);
    setIsNoteModalOpen(false);
    setNoteEditContent('');
  };

  const currentNote = periodNotes.find(n => n.periodKey === currentMonthKey);

  // Touch swipe down tracking to minimize
  const touchStartY = useRef<number | null>(null);

  const periods: { key: PeriodType; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All' },
  ];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      const deltaY = e.touches[0].clientY - touchStartY.current;
      // If user swipes down by more than 20px, minimize the bar
      if (deltaY > 20) {
        setIsMinimized(true);
        touchStartY.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  const currentPeriodLabel = viewedPeriodLabel || (periods.find(p => p.key === period)?.label || 'Month');

  const formattedTotal = formatCurrency(viewedPeriodTotal, baseCurrency);

  // Dynamic font sizing to fit large amounts (e.g. ₹100,074.00) on all screen sizes
  const getAmountFontSize = (str: string) => {
    if (str.length > 12) return 'text-xs sm:text-sm';
    if (str.length > 9) return 'text-sm sm:text-base';
    if (str.length > 7) return 'text-base sm:text-lg';
    return 'text-lg sm:text-2xl';
  };

  // 1. MINIMIZED GLASSMORPHIC PILL VIEW
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 max-w-[92vw]">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 dotgui-glass border border-hairline px-4 py-2.5 sm:px-5 sm:py-3 rounded-full text-ink font-mono text-sm font-semibold shadow-2xl hover:scale-105 active:scale-95 transition-all group cursor-pointer bg-surface-card/90 backdrop-blur-xl min-w-0"
          title="Tap to Expand Spending Bar"
        >
          <ChevronUp className="w-5 h-5 text-brand-mint group-hover:-translate-y-0.5 transition-transform shrink-0" />
          <span className="whitespace-nowrap font-bold truncate">{formattedTotal} <span className="font-normal text-muted-custom">({currentPeriodLabel})</span></span>
        </button>

        {/* Border Highlighted + Button */}
        <button
          onClick={onOpenQuickAdd}
          className="p-2.5 sm:p-3 border border-brand-blue text-brand-blue bg-surface-card/90 backdrop-blur-xl rounded-full shadow-2xl hover:bg-surface-soft active:scale-95 transition-all shrink-0 cursor-pointer"
          title="Add Expense"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // 2. EXPANDED SLEEK GLASSMORPHIC BOTTOM PERIOD BAR VIEW
  return (
    <>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="fixed bottom-0 left-0 right-0 z-40 dotgui-glass border-t border-hairline px-3 py-3.5 sm:px-6 sm:py-4 shadow-2xl max-w-full overflow-hidden bg-surface-card/90 backdrop-blur-xl"
      >
        <div className={`max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-3 ${isPeriodSelectorOpen ? 'overflow-x-auto no-scrollbar' : 'overflow-hidden'}`}>
          
          {/* Real-time Spending Total Display (Dynamic Auto-Sizing) */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            {/* Note Icon Button */}
            <button
              type="button"
              onClick={handleOpenNoteModal}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                currentNote?.content
                  ? 'border-brand-purple/40 text-brand-purple bg-brand-purple/10 hover:bg-brand-purple/20'
                  : 'border-hairline text-muted-custom bg-surface-soft/60 hover:border-brand-purple hover:text-brand-purple'
              }`}
              title="Period Notes"
            >
              <FileText className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>

            <div className="flex flex-col justify-center min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-mono text-muted-custom uppercase font-bold tracking-wider truncate block leading-none mb-0.5">
                {currentPeriodLabel}
              </span>
              <div className={`font-display font-bold text-ink truncate leading-tight ${getAmountFontSize(formattedTotal)}`}>
                {formattedTotal}
              </div>
            </div>

            <div className="hidden lg:inline-block text-[10px] font-mono text-muted-custom bg-surface-soft px-2 py-0.5 rounded-full border border-hairline shrink-0 ml-1">
              {filteredTransactions.length} items
            </div>
          </div>

          {/* Period Selector & Large + Log Button (Shrink-0 to prevent clipping) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Dropdown / Expanded Row Period Selector */}
            <div className="relative shrink-0">
              {!isPeriodSelectorOpen ? (
                <button
                  type="button"
                  onClick={() => setIsPeriodSelectorOpen(true)}
                  className="flex items-center justify-center bg-surface-soft hover:border-ink border border-hairline px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-mono font-bold text-ink transition-all cursor-pointer shadow-sm shrink-0"
                >
                  <span>{periods.find(p => p.key === period)?.label || 'Month'}</span>
                </button>
              ) : (
                /* Expanded Horizontal Selection Row */
                <div className="flex items-center bg-surface-soft p-1 rounded-full border border-hairline gap-1 animate-in fade-in zoom-in-95 duration-150 shadow-md shrink-0 overflow-x-auto no-scrollbar">
                  {periods.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setPeriod(p.key);
                        setIsPeriodSelectorOpen(false);
                      }}
                      className={`px-2 py-1 rounded-full text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                        period === p.key
                          ? 'border border-ink text-ink font-bold bg-surface-card shadow-sm'
                          : 'text-body-custom hover:text-ink'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Large Easy-to-Tap + Log Button */}
            <button
              onClick={onOpenQuickAdd}
              className="flex items-center gap-1 border border-brand-blue text-brand-blue bg-surface-card/90 hover:bg-surface-soft px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-mono font-bold shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
              title="Log New Expense"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Log</span>
            </button>

          </div>

        </div>
      </div>

      {/* Monthly Note Modal */}
      {isNoteModalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
          onClick={() => setIsNoteModalOpen(false)}
        >
          <div
            className="max-w-md w-full bg-surface-card/95 backdrop-blur-2xl border border-hairline rounded-2xl p-5 shadow-2xl space-y-4 relative cursor-default ring-1 ring-white/10 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <span className="text-sm font-mono font-bold text-ink flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-purple" />
                {currentMonthLabel} Note
              </span>
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body / Textarea */}
            {isEditingNote ? (
              <div className="space-y-2">
                <textarea
                  value={noteEditContent}
                  onChange={e => setNoteEditContent(e.target.value)}
                  placeholder="Add a personal note..."
                  rows={6}
                  autoFocus
                  className="w-full bg-surface-soft border border-hairline rounded-xl p-3 text-xs font-mono text-ink focus:outline-none focus:border-brand-purple leading-relaxed"
                />
              </div>
            ) : (
              <div className="bg-surface-soft p-4 rounded-xl border border-hairline min-h-[100px]">
                <p className="text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed">
                  {noteEditContent || <span className="text-muted-custom italic">Add a personal note...</span>}
                </p>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-hairline">
              {currentNote ? (
                <button
                  type="button"
                  onClick={handleDeleteNote}
                  className="px-3.5 py-1.5 rounded-xl border border-hairline text-brand-coral text-xs font-mono font-bold hover:border-brand-coral cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                {isEditingNote ? (
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="px-4 py-1.5 rounded-xl bg-brand-purple text-white text-xs font-mono font-bold shadow-md hover:bg-brand-purple/90 cursor-pointer"
                  >
                    Save Note
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingNote(true)}
                    className="px-4 py-1.5 rounded-xl border border-hairline bg-surface-soft hover:bg-surface-card text-ink text-xs font-mono font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                    <span>Edit Note</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

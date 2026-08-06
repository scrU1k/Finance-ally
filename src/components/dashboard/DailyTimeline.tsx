import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Transaction } from '../../types';
import { TransactionCard } from './TransactionCard';
import { TransactionDetailModal } from './TransactionDetailModal';
import { LiveSpendChart } from './LiveSpendChart';
import { Search, Calendar as CalendarIcon, Sparkles, Plus, CalendarRange } from 'lucide-react';
import { formatCurrency, convertCurrencyAmount } from '../../services/currency';

interface DailyTimelineProps {
  onOpenQuickAdd: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export const DailyTimeline: React.FC<DailyTimelineProps> = ({ onOpenQuickAdd, onEditTransaction }) => {
  const { filteredTransactions, categories, trips, deleteTx, baseCurrency, forexRates } = useFinance();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('all');
  const [showCharts, setShowCharts] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDetailTx, setSelectedDetailTx] = useState<Transaction | null>(null);

  const datePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showDatePicker]);

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dateStr === today) return `Today, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    if (dateStr === yesterday) return `Yesterday, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Search & category & date filtering
  const processedTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return filteredTransactions.filter(tx => {
      const matchCat = selectedCatFilter === 'all' || tx.categoryId === selectedCatFilter;
      if (!matchCat) return false;
      if (!q) return true;

      const dateHeaderStr = formatDateHeader(tx.date).toLowerCase();
      const matchNote = tx.note.toLowerCase().includes(q);
      const matchAmount = tx.amount.toString().includes(q);
      const matchMethod = tx.paymentMethod?.toLowerCase().includes(q) || false;
      const matchDateRaw = tx.date.toLowerCase().includes(q);
      const matchDateHeader = dateHeaderStr.includes(q);

      return matchNote || matchAmount || matchMethod || matchDateRaw || matchDateHeader;
    });
  }, [filteredTransactions, selectedCatFilter, searchQuery]);

  // Group transactions by date (YYYY-MM-DD) & convert day total to base currency
  const groupedByDay = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    processedTransactions.forEach(tx => {
      if (!groups[tx.date]) groups[tx.date] = [];
      groups[tx.date].push(tx);
    });

    // Sort dates descending
    const sortedDates = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return sortedDates.map(date => {
      const dayTxs = groups[date];
      // Convert each transaction amount from its currency to the app base currency
      const dayTotalInBaseCurrency = dayTxs.reduce((acc, t) => {
        return acc + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);

      return {
        date,
        transactions: dayTxs,
        dayTotal: dayTotalInBaseCurrency,
      };
    });
  }, [processedTransactions, baseCurrency, forexRates]);

  const handleDateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = e.target.value;
    if (selectedDate) {
      setSearchQuery(selectedDate);
      setShowDatePicker(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      
      {/* Search & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Search Input (Notes, Merchants, Amounts, Dates) */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search notes, merchants, amounts, dates..."
            className="w-full bg-surface-card border border-hairline text-ink rounded-xl pl-9 pr-4 py-2 text-xs font-mono focus:outline-none focus:border-ink placeholder:text-muted-custom"
          />
          <Search className="w-3.5 h-3.5 text-muted-custom absolute left-3 top-3" />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 relative" ref={datePickerRef}>
          {/* Hide/Show Charts Button */}
          <button
            onClick={() => setShowCharts(!showCharts)}
            className={`px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer ${
              showCharts
                ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-yellow" />
            <span>{showCharts ? 'Hide Charts' : 'Show Charts'}</span>
          </button>

          {/* Date Picker Toggle Button */}
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer ${
              showDatePicker
                ? 'border-brand-blue text-brand-blue font-bold shadow-sm bg-surface-soft'
                : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
            }`}
            title="Go to specific date"
          >
            <CalendarRange className="w-3.5 h-3.5 text-brand-blue" />
            <span>Date</span>
          </button>

          {/* Hidden HTML Date Picker Popover */}
          {showDatePicker && (
            <div className="absolute right-0 top-10 z-20 bg-surface-card border border-hairline p-3 rounded-xl shadow-xl animate-in fade-in duration-100 dotgui-glass">
              <label className="block text-[10px] font-mono text-muted-custom uppercase mb-1 font-bold">Select Date</label>
              <input
                type="date"
                onChange={handleDateSelect}
                className="bg-surface-soft border border-hairline rounded-lg px-2 py-1 text-xs font-mono text-ink focus:outline-none cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* Category Tag Filter Pill Rail (Border Highlight Selection) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSelectedCatFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap transition-all border ${
            selectedCatFilter === 'all'
              ? 'border-brand-blue text-brand-blue font-bold shadow-sm bg-surface-soft'
              : 'bg-surface-card text-muted-custom border-hairline hover:border-ink'
          }`}
        >
          All Tags ({filteredTransactions.length})
        </button>
        {categories.map(cat => {
          const count = filteredTransactions.filter(t => t.categoryId === cat.id).length;
          if (count === 0 && selectedCatFilter !== cat.id) return null;
          const isSelected = selectedCatFilter === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCatFilter(isSelected ? 'all' : cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap transition-all border shrink-0 ${
                isSelected
                  ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                  : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="truncate whitespace-nowrap max-w-[120px]">{cat.name}</span>
              <span className="text-[10px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Day-by-Day Timeline List */}
      {groupedByDay.length === 0 ? (
        <div className="dotgui-card p-12 text-center space-y-3">
          <CalendarIcon className="w-10 h-10 mx-auto text-muted-custom/40" />
          <h3 className="text-base font-display font-semibold text-ink">No Expenses Recorded</h3>
          <p className="text-xs font-mono text-muted-custom max-w-sm mx-auto">
            Log your daily spendings manually or use the SMS Scanner to import bank & UPI alerts.
          </p>
          <button
            onClick={onOpenQuickAdd}
            className="inline-flex items-center gap-2 border border-brand-blue text-brand-blue text-xs font-medium px-4 py-2 rounded-full shadow-sm hover:bg-surface-soft transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map(dayGroup => (
            <div key={dayGroup.date} className="space-y-2.5">
              
              {/* Day Header */}
              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5 px-1">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-brand-blue" />
                  <span className="text-xs font-mono font-bold text-ink uppercase tracking-wider">
                    {formatDateHeader(dayGroup.date)}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-muted-custom">
                  Daily Spend: {formatCurrency(dayGroup.dayTotal, baseCurrency)}
                </span>
              </div>

              {/* Transactions on this day */}
              <div className="space-y-2">
                {dayGroup.transactions.map(tx => (
                  <TransactionCard
                    key={tx.id}
                    transaction={tx}
                    categories={categories}
                    trips={trips}
                    onSelect={setSelectedDetailTx}
                    onEdit={onEditTransaction}
                    onDelete={deleteTx}
                  />
                ))}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Live Spending Chart Widget at the Bottom */}
      {showCharts && <LiveSpendChart />}

      {/* Transaction Details Glass Popout Modal */}
      {selectedDetailTx && (
        <TransactionDetailModal
          transaction={selectedDetailTx}
          categories={categories}
          trips={trips}
          onClose={() => setSelectedDetailTx(null)}
          onEdit={onEditTransaction}
          onDelete={deleteTx}
        />
      )}

    </div>
  );
};

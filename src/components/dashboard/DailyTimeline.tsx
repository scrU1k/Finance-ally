import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Transaction } from '../../types';
import { TransactionCard } from './TransactionCard';
import { TransactionDetailModal } from './TransactionDetailModal';
import { LiveSpendChart } from './LiveSpendChart';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { QuickLogBar } from './QuickLogBar';
import { Search, Sparkles } from 'lucide-react';
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
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  const processedTransactions = useMemo(() => {
    return filteredTransactions.filter(tx => {
      const matchCat = selectedCatFilter === 'all' || tx.categoryId === selectedCatFilter;
      const query = searchQuery.toLowerCase().trim();
      const matchQuery =
        !query ||
        tx.note.toLowerCase().includes(query) ||
        tx.amount.toString().includes(query) ||
        (tx.paymentMethod && tx.paymentMethod.toLowerCase().includes(query)) ||
        tx.date.includes(query);
      return matchCat && matchQuery;
    });
  }, [filteredTransactions, selectedCatFilter, searchQuery]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    processedTransactions.forEach(tx => {
      const dateKey = tx.date;
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(tx);
    });

    const sortedDates = Array.from(map.keys()).sort((a, b) => (b > a ? 1 : -1));

    return sortedDates.map(date => {
      const dayTxs = map.get(date)!;
      const dayTotalInBaseCurrency = dayTxs.reduce((sum, t) => {
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);

      return {
        date,
        transactions: dayTxs,
        dayTotal: dayTotalInBaseCurrency,
      };
    });
  }, [processedTransactions, baseCurrency, forexRates]);

  return (
    <div className="space-y-6 pb-24">
      
      {/* 1. Smart Natural Language Quick-Log Input Bar (Replaces top search bar) */}
      <QuickLogBar />

      {/* 2. Controls Toolbar with Search Chip, Hide Charts Chip, and Date Chip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
          
          <div className="flex items-center gap-2">
            {/* Search Chip Button (To the left of Hide Charts) */}
            <button
              type="button"
              onClick={() => setShowSearchInput(!showSearchInput)}
              className={`px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                showSearchInput || searchQuery
                  ? 'border-brand-blue text-brand-blue font-bold shadow-sm bg-surface-soft'
                  : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
              }`}
              title="Search logs"
            >
              <Search className="w-3.5 h-3.5 text-brand-blue shrink-0" />
              <span>Search</span>
            </button>

            {/* Hide/Show Charts Chip Button */}
            <button
              type="button"
              onClick={() => setShowCharts(!showCharts)}
              className={`px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                showCharts
                  ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                  : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
              <span>{showCharts ? 'Hide Charts' : 'Show Charts'}</span>
            </button>
          </div>

          {/* Custom App-Styled Date Picker Chip */}
          <CustomDatePicker
            value={searchQuery.match(/^\d{4}-\d{2}-\d{2}$/) ? searchQuery : ''}
            onChange={(selectedDate) => setSearchQuery(selectedDate)}
            className="w-auto shrink-0"
          />

        </div>

        {/* Expandable Search Input Bar */}
        {(showSearchInput || searchQuery) && (
          <div className="relative animate-in fade-in zoom-in-95 duration-150">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes, merchants, amounts, dates..."
              autoFocus
              className="w-full bg-surface-card border border-hairline text-ink rounded-xl pl-9 pr-8 py-2 text-xs font-mono focus:outline-none focus:border-ink placeholder:text-muted-custom shadow-sm"
            />
            <Search className="w-3.5 h-3.5 text-muted-custom absolute left-3 top-2.5" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-muted-custom hover:text-ink cursor-pointer text-xs"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category Tag Filter Pill Rail */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedCatFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
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
              type="button"
              onClick={() => setSelectedCatFilter(isSelected ? 'all' : cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
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

      {/* Visual Charts Overview */}
      {showCharts && (
        <div className="animate-in fade-in duration-200">
          <LiveSpendChart />
        </div>
      )}

      {/* Grouped Daily Transactions Feed */}
      {groupedByDate.length === 0 ? (
        <div className="dotgui-card p-12 text-center space-y-3 my-8">
          <div className="text-muted-custom text-sm font-mono">No matching transactions found</div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs font-mono text-brand-blue underline cursor-pointer"
            >
              Clear search filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDate.map(group => (
            <div key={group.date} className="space-y-2.5">
              
              {/* Day Header with converted Daily Total */}
              <div className="flex items-center justify-between px-1 border-b border-hairline/60 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-ink uppercase tracking-wider">
                    {group.date}
                  </span>
                  <span className="text-[10px] font-mono text-muted-custom">
                    ({group.transactions.length} logs)
                  </span>
                </div>
                <div className="text-xs font-mono font-bold text-ink">
                  Total: {formatCurrency(group.dayTotal, baseCurrency)}
                </div>
              </div>

              {/* Transactions List */}
              <div className="space-y-2">
                {group.transactions.map(tx => (
                  <TransactionCard
                    key={tx.id}
                    transaction={tx}
                    categories={categories}
                    trips={trips}
                    onSelect={t => setSelectedTxDetail(t)}
                    onEdit={t => onEditTransaction(t)}
                    onDelete={id => deleteTx(id)}
                  />
                ))}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Transaction Detail Popout Modal */}
      {selectedTxDetail && (
        <TransactionDetailModal
          transaction={selectedTxDetail}
          categories={categories}
          trips={trips}
          onClose={() => setSelectedTxDetail(null)}
          onEdit={t => {
            setSelectedTxDetail(null);
            onEditTransaction(t);
          }}
          onDelete={id => {
            setSelectedTxDetail(null);
            deleteTx(id);
          }}
        />
      )}

    </div>
  );
};

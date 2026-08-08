import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Transaction, TimelineViewMode } from '../../types';
import { TransactionCard } from './TransactionCard';
import { TransactionDetailModal } from './TransactionDetailModal';
import { LiveSpendChart } from './LiveSpendChart';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { QuickLogBar } from './QuickLogBar';
import { Search, Sparkles, Calendar, Tag, X, CheckSquare, Edit2, Trash2, LayoutGrid, List, Grid } from 'lucide-react';
import { BulkEditModal } from './BulkEditModal';
import { formatCurrency, convertCurrencyAmount } from '../../services/currency';

interface DailyTimelineProps {
  onOpenQuickAdd: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

function formatDayHeader(dateStr: string): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const date = new Date(dateStr + 'T00:00:00');
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
  const formatted = date.toLocaleDateString('en-US', options).toUpperCase();
  
  if (dateStr === todayStr) {
    return formatted.replace(/^[A-Z]+/, 'TODAY');
  } else if (dateStr === yesterdayStr) {
    return formatted.replace(/^[A-Z]+/, 'YESTERDAY');
  }
  return formatted;
}

export const DailyTimeline: React.FC<DailyTimelineProps> = ({ onOpenQuickAdd, onEditTransaction }) => {
  const { filteredTransactions, categories, trips, deleteTx, editTransaction, baseCurrency, forexRates } = useFinance();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('all');
  const [showCharts, setShowCharts] = useState(true);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [showTagFilterRow, setShowTagFilterRow] = useState(false);
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  // Multi-select bulk edit/delete states & custom delete modal
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // Persistent View Mode ('compact' | 'list' | 'grid')
  const [viewMode, setViewMode] = useState<TimelineViewMode>(() => {
    try {
      const stored = localStorage.getItem('fa_timeline_view_mode');
      if (stored === 'list' || stored === 'grid' || stored === 'compact') {
        return stored;
      }
    } catch {}
    return 'compact';
  });
  const [showViewMenu, setShowViewMenu] = useState(false);

  const handleSetViewMode = (mode: TimelineViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('fa_timeline_view_mode', mode);
    } catch {}
  };

  useEffect(() => {
    if (isSelectMode && selectedTxIds.length === 0) {
      setIsSelectMode(false);
    }
  }, [selectedTxIds, isSelectMode]);

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

  const activeCategoryObj = categories.find(c => c.id === selectedCatFilter);

  const handleToggleSelect = (txId: string) => {
    setIsSelectMode(true);
    setSelectedTxIds(prev =>
      prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]
    );
  };

  const allFilteredIds = processedTransactions.map(tx => tx.id);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedTxIds.includes(id));
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTxIds([]);
    } else {
      setSelectedTxIds(allFilteredIds);
    }
  };

  const handleBulkDelete = () => {
    if (selectedTxIds.length === 0) return;
    setShowDeleteConfirmModal(true);
  };

  const handleConfirmBulkDelete = async () => {
    setShowDeleteConfirmModal(false);
    for (const id of selectedTxIds) {
      await deleteTx(id);
    }
    setSelectedTxIds([]);
    setIsSelectMode(false);
  };

  const handleBulkSave = async (updates: {
    date?: string;
    time?: string;
    categoryId?: string;
    customCategoryName?: string;
    customTagColor?: string;
    tripId?: string | null;
    paymentMethod?: string;
  }) => {
    if (selectedTxIds.length === 0) return;

    for (const txId of selectedTxIds) {
      const tx = filteredTransactions.find(t => t.id === txId);
      if (tx) {
        const updatedTx: Transaction = {
          ...tx,
        };

        if (updates.date !== undefined) updatedTx.date = updates.date;
        if (updates.time !== undefined) updatedTx.time = updates.time;
        if (updates.categoryId !== undefined) {
          updatedTx.categoryId = updates.categoryId;
          if (updates.customCategoryName !== undefined) {
            updatedTx.customCategoryName = updates.customCategoryName;
          }
        }
        if (updates.paymentMethod !== undefined) updatedTx.paymentMethod = updates.paymentMethod;

        if (updates.tripId !== undefined) {
          if (updates.tripId === null) {
            delete updatedTx.tripId;
          } else {
            updatedTx.tripId = updates.tripId;
          }
        }

        await editTransaction(updatedTx);
      }
    }

    setSelectedTxIds([]);
    setIsSelectMode(false);
  };

  return (
    <div className="space-y-6 pb-24">
      
      {/* 1. Smart Natural Language Quick-Log Input Bar */}
      <QuickLogBar />

      {/* 2. Controls Toolbar: Search | Tags | Date | Hide Charts */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          
          {/* 1. Search Chip Button */}
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

          {/* 2. Tags Filter Toggle Chip Button */}
          <button
            type="button"
            onClick={() => setShowTagFilterRow(!showTagFilterRow)}
            className={`px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              showTagFilterRow || selectedCatFilter !== 'all'
                ? 'border-brand-mint text-brand-mint font-bold shadow-sm bg-surface-soft'
                : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
            }`}
            title="Filter by category tags"
          >
            <Tag className="w-3.5 h-3.5 text-brand-mint shrink-0" />
            <span>
              {selectedCatFilter !== 'all' && activeCategoryObj
                ? `Tag: ${activeCategoryObj.name}`
                : 'Tags'}
            </span>
            {(showTagFilterRow || selectedCatFilter !== 'all') && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCatFilter('all');
                  setShowTagFilterRow(false);
                }}
                className="ml-0.5 hover:text-brand-coral cursor-pointer p-0.5 text-xs font-bold"
                title="Clear tag filter & close"
              >
                ✕
              </span>
            )}
          </button>

          {/* 3. Custom App-Styled Date Picker Chip */}
          <CustomDatePicker
            value={searchQuery.match(/^\d{4}-\d{2}-\d{2}$/) ? searchQuery : ''}
            onChange={(selectedDate) => setSearchQuery(selectedDate)}
            className="shrink-0"
          />

          {/* 4. Hide/Show Charts Chip Button */}
          <button
            type="button"
            onClick={() => setShowCharts(!showCharts)}
            className={`px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              !showCharts
                ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
            <span>{showCharts ? 'Hide Charts' : 'Show Charts'}</span>
          </button>

          {/* 5. View Mode Switcher Chip Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowViewMenu(!showViewMenu)}
              className={`px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                viewMode !== 'compact'
                  ? 'border-brand-purple text-brand-purple font-bold shadow-sm bg-surface-soft'
                  : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
              }`}
              title="Change timeline view layout"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-brand-purple shrink-0" />
              <span className="capitalize">{viewMode}</span>
            </button>

            {/* Dropdown Options */}
            {showViewMenu && (
              <div className="absolute top-full right-0 mt-1 z-40 bg-surface-card/95 backdrop-blur-2xl border border-hairline rounded-xl shadow-2xl p-1.5 space-y-1 w-32 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/10">
                <button
                  onClick={() => { handleSetViewMode('compact'); setShowViewMenu(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                    viewMode === 'compact' ? 'bg-brand-purple/15 text-brand-purple font-bold' : 'text-ink hover:bg-surface-soft'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                  <span>Compact</span>
                </button>

                <button
                  onClick={() => { handleSetViewMode('list'); setShowViewMenu(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                    viewMode === 'list' ? 'bg-brand-purple/15 text-brand-purple font-bold' : 'text-ink hover:bg-surface-soft'
                  }`}
                >
                  <List className="w-3.5 h-3.5 shrink-0" />
                  <span>List</span>
                </button>

                <button
                  onClick={() => { handleSetViewMode('grid'); setShowViewMenu(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                    viewMode === 'grid' ? 'bg-brand-purple/15 text-brand-purple font-bold' : 'text-ink hover:bg-surface-soft'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5 shrink-0" />
                  <span>Grid</span>
                </button>
              </div>
            )}
          </div>



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

      {/* Category Tag Filter Pill Rail (Collapsible) */}
      {(showTagFilterRow || selectedCatFilter !== 'all') && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar animate-in fade-in duration-150">
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
              <div className="flex items-center gap-1.5 px-1 border-b border-hairline/60 pb-1.5 text-xs font-mono text-ink">
                <Calendar className="w-3.5 h-3.5 text-muted-custom shrink-0" />
                <span className="font-bold uppercase whitespace-nowrap">
                  {formatDayHeader(group.date)}
                </span>
                <span className="text-muted-custom whitespace-nowrap ml-2">
                  Spend: <span className="text-ink font-bold">{formatCurrency(group.dayTotal, baseCurrency)}</span>
                </span>
              </div>

              {/* Transactions List */}
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 gap-2.5' : viewMode === 'list' ? 'space-y-1.5' : 'space-y-2'}>
                {group.transactions.map(tx => {
                  const isSelected = selectedTxIds.includes(tx.id);
                  return (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      categories={categories}
                      trips={trips}
                      onSelect={t => setSelectedTxDetail(t)}
                      onEdit={t => onEditTransaction(t)}
                      onDelete={id => deleteTx(id)}
                      isSelectMode={isSelectMode}
                      isSelected={isSelected}
                      onToggleSelect={handleToggleSelect}
                      viewMode={viewMode}
                    />
                  );
                })}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Visual Charts Overview */}
      {showCharts && (
        <div className="animate-in fade-in duration-200 mt-6">
          <LiveSpendChart />
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

      {/* Compact Floating Selection Pill Overlay */}
      {isSelectMode && selectedTxIds.length > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-surface-card/95 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-full shadow-2xl px-3.5 py-1.5 flex items-center gap-2.5 ring-1 ring-white/15 animate-in slide-in-from-bottom-2 duration-200 cursor-default">
          {/* Close cross */}
          <button
            onClick={() => {
              setIsSelectMode(false);
              setSelectedTxIds([]);
            }}
            className="p-1 text-muted-custom hover:text-ink transition-colors cursor-pointer rounded-full"
            title="Clear Selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Count Badge (just the number) */}
          <span className="w-5 h-5 rounded-full bg-brand-blue/20 text-brand-blue font-mono font-bold text-xs flex items-center justify-center shrink-0">
            {selectedTxIds.length}
          </span>

          <div className="h-3.5 w-px bg-hairline shrink-0" />

          {/* Edit Action Button */}
          <button
            onClick={() => setIsBulkEditOpen(true)}
            className="flex items-center gap-1.5 text-brand-blue hover:text-ink font-mono text-xs font-bold px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          {/* Delete Action Button */}
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 text-brand-coral hover:opacity-80 font-mono text-xs font-bold px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={isBulkEditOpen}
        onClose={() => setIsBulkEditOpen(false)}
        selectedCount={selectedTxIds.length}
        categories={categories}
        trips={trips}
        onSave={handleBulkSave}
      />

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setShowDeleteConfirmModal(false)}>
          <div className="bg-surface-card/90 backdrop-blur-2xl border border-hairline rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4 text-center ring-1 ring-white/10 animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-brand-coral/15 text-brand-coral flex items-center justify-center mx-auto border border-brand-coral/30">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-display font-bold text-ink">Delete {selectedTxIds.length} Transactions?</h3>
              <p className="text-xs font-mono text-muted-custom">This action is permanent and cannot be undone.</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setShowDeleteConfirmModal(false)}
                className="flex-1 py-2 rounded-xl border border-hairline bg-surface-soft text-ink font-mono text-xs font-bold hover:border-ink transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkDelete}
                className="flex-1 py-2 rounded-xl bg-brand-coral text-white font-mono text-xs font-bold shadow-md hover:bg-brand-coral/90 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

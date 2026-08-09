import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Transaction, TimelineViewMode, PeriodNote } from '../../types';
import { TransactionCard } from './TransactionCard';
import { TransactionDetailModal } from './TransactionDetailModal';
import { LiveSpendChart } from './LiveSpendChart';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { QuickLogBar } from './QuickLogBar';
import { loadPeriodNotes, savePeriodNote, deletePeriodNote } from '../../services/db';
import {
  Search,
  Sparkles,
  Calendar,
  Tag,
  X,
  Edit2,
  Trash2,
  ListPlus,
  CheckSquare,
  LayoutGrid,
  List,
  Grid,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Eye,
  CalendarRange,
  CalendarDays,
  TrendingUp,
  Flame,
  Filter,
  ArrowRight,
  Copy,
  FileText,
  Plus,
} from 'lucide-react';
import { BulkEditModal } from './BulkEditModal';
import { formatCurrency, convertCurrencyAmount } from '../../services/currency';

interface DailyTimelineProps {
  onOpenQuickAdd?: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export type PeriodMode = 'day' | 'week' | 'month' | 'year';

interface DrilledFilter {
  type: 'year' | 'month' | 'week';
  label: string;
  datePrefix?: string;
  dateRange?: [string, string];
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

function getWeekInfo(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diffToMon));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const tempDate = new Date(d.getTime());
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  const formatShort = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = monday.getFullYear();
  const dateRangeStr = `${formatShort(monday)} – ${formatShort(sunday)}, ${year}`;
  const key = `${year}-W${String(weekNo).padStart(2, '0')}`;

  return {
    key,
    weekNo,
    year,
    dateRangeStr,
    title: `Week ${weekNo}, ${year}`,
  };
}

export const DailyTimeline: React.FC<DailyTimelineProps> = ({ onOpenQuickAdd: _onOpenQuickAdd, onEditTransaction }) => {
  const { filteredTransactions, categories, trips, deleteTx, editTransaction, addTransaction, baseCurrency, forexRates } = useFinance();

  const chartRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('all');
  const [showCharts, setShowCharts] = useState(true);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [showTagFilterRow, setShowTagFilterRow] = useState(false);
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  // Period Notes state
  const [periodNotes, setPeriodNotes] = useState<PeriodNote[]>([]);
  const [activeNoteModal, setActiveNoteModal] = useState<{
    periodKey: string;
    periodType: 'month' | 'year';
    title: string;
  } | null>(null);
  const [noteEditContent, setNoteEditContent] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);

  useEffect(() => {
    loadPeriodNotes().then(notes => setPeriodNotes(notes));
  }, []);

  const handleOpenNoteModal = (periodKey: string, periodType: 'month' | 'year', title: string) => {
    const existing = periodNotes.find(n => n.periodKey === periodKey);
    setActiveNoteModal({ periodKey, periodType, title });
    setNoteEditContent(existing ? existing.content : '');
    setIsEditingNote(!existing);
  };

  const handleSaveActiveNote = async () => {
    if (!activeNoteModal) return;
    const newNote: PeriodNote = {
      id: `note-${activeNoteModal.periodKey}`,
      periodType: activeNoteModal.periodType,
      periodKey: activeNoteModal.periodKey,
      title: activeNoteModal.title,
      content: noteEditContent.trim(),
      updatedAt: Date.now(),
    };
    await savePeriodNote(newNote);
    const updated = await loadPeriodNotes();
    setPeriodNotes(updated);
    setIsEditingNote(false);
  };

  const handleDeleteActiveNote = async () => {
    if (!activeNoteModal) return;
    await deletePeriodNote(activeNoteModal.periodKey);
    const updated = await loadPeriodNotes();
    setPeriodNotes(updated);
    setActiveNoteModal(null);
    setNoteEditContent('');
  };

  // Drill-down filter state
  const [drilledFilter, setDrilledFilter] = useState<DrilledFilter | null>(null);

  // 30-Day Window limit for Day view
  const [dayWindowLimit, setDayWindowLimit] = useState(30);

  // Minimizable date groups state
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  const toggleDateCollapse = (dateStr: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  };

  // Floating View Menu state
  const [showViewMenu, setShowViewMenu] = useState(false);

  // Period Mode ('day' | 'week' | 'month' | 'year')
  const [periodMode, setPeriodMode] = useState<PeriodMode>(() => {
    try {
      const stored = localStorage.getItem('fa_timeline_period_mode');
      if (stored === 'day' || stored === 'week' || stored === 'month' || stored === 'year') {
        return stored;
      }
    } catch {}
    return 'day';
  });

  const handleSetPeriodMode = (mode: PeriodMode) => {
    setPeriodMode(mode);
    try {
      localStorage.setItem('fa_timeline_period_mode', mode);
    } catch {}
  };

  // Step-back navigation handler when clicking the View: <Label> banner text
  const handleStepBackFromBanner = () => {
    if (!drilledFilter) return;
    if (drilledFilter.type === 'month') {
      setDrilledFilter(null);
      handleSetPeriodMode('month');
    } else if (drilledFilter.type === 'year') {
      setDrilledFilter(null);
      handleSetPeriodMode('year');
    } else if (drilledFilter.type === 'week') {
      setDrilledFilter(null);
      handleSetPeriodMode('week');
    } else {
      setDrilledFilter(null);
    }
  };

  const handleSelectPeriodFromMenu = (mode: PeriodMode) => {
    setDrilledFilter(null);
    handleSetPeriodMode(mode);
  };

  // Drill-down handlers
  const handleDrillDownYear = (yearKey: string) => {
    setDrilledFilter({
      type: 'year',
      label: `Year ${yearKey}`,
      datePrefix: yearKey,
    });
    handleSetPeriodMode('month');
  };

  const handleDrillDownMonth = (monthKey: string, monthName: string) => {
    setDrilledFilter({
      type: 'month',
      label: monthName,
      datePrefix: monthKey,
    });
    handleSetPeriodMode('day');
  };

  const handleDrillDownWeek = (weekInfo: ReturnType<typeof getWeekInfo>) => {
    const d = new Date(weekInfo.year, 0, 1);
    const dayOffset = (weekInfo.weekNo - 1) * 7;
    d.setDate(d.getDate() + dayOffset);
    const day = d.getDay();
    const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diffToMon));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatISO = (dt: Date) => dt.toISOString().split('T')[0];

    setDrilledFilter({
      type: 'week',
      label: weekInfo.title,
      dateRange: [formatISO(monday), formatISO(sunday)],
    });
    handleSetPeriodMode('day');
  };

  // Multi-select bulk edit/delete states
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // Duplication Handlers
  const handleDuplicateSingle = (tx: Transaction) => {
    const duplicatedTx: Transaction = {
      ...tx,
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
    };
    onEditTransaction(duplicatedTx);
  };

  const handleBulkDuplicate = () => {
    if (selectedTxIds.length === 0) return;
    const targetId = selectedTxIds[0];
    const tx = filteredTransactions.find(t => t.id === targetId);
    if (tx) {
      handleDuplicateSingle(tx);
    }
    setSelectedTxIds([]);
    setIsSelectMode(false);
  };

  // Streamlined Multi-Log state
  const [isMultiLogActive, setIsMultiLogActive] = useState(false);
  const [batchDate, setBatchDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showMultiLogDatePickerModal, setShowMultiLogDatePickerModal] = useState(false);

  const handleToggleMultiLog = () => {
    if (isMultiLogActive) {
      setIsMultiLogActive(false);
      setBatchDate(new Date().toISOString().split('T')[0]);
    } else {
      setShowMultiLogDatePickerModal(true);
    }
  };

  const handleSelectMultiLogDate = (selectedDate: string) => {
    setBatchDate(selectedDate);
    setIsMultiLogActive(true);
    setShowMultiLogDatePickerModal(false);
  };

  // Persistent View Layout Mode ('compact' | 'list' | 'grid')
  const [viewMode, setViewMode] = useState<TimelineViewMode>(() => {
    try {
      const stored = localStorage.getItem('fa_timeline_view_mode');
      if (stored === 'list' || stored === 'grid' || stored === 'compact') {
        return stored;
      }
    } catch {}
    return 'compact';
  });

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

      let matchDrilled = true;
      if (drilledFilter) {
        if (drilledFilter.datePrefix) {
          matchDrilled = tx.date.startsWith(drilledFilter.datePrefix);
        } else if (drilledFilter.dateRange) {
          matchDrilled = tx.date >= drilledFilter.dateRange[0] && tx.date <= drilledFilter.dateRange[1];
        }
      }

      return matchCat && matchQuery && matchDrilled;
    });
  }, [filteredTransactions, selectedCatFilter, searchQuery, drilledFilter]);

  // 1. Grouped by Day
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

  // Visible daily groups (limited to 30 days unless searching/filtering/drilled)
  const visibleGroupedByDate = useMemo(() => {
    if (drilledFilter || searchQuery || selectedCatFilter !== 'all') {
      return groupedByDate;
    }
    return groupedByDate.slice(0, dayWindowLimit);
  }, [groupedByDate, dayWindowLimit, drilledFilter, searchQuery, selectedCatFilter]);

  const hasMoreDays = !drilledFilter && !searchQuery && selectedCatFilter === 'all' && groupedByDate.length > dayWindowLimit;

  // 2. Grouped by Week
  const groupedByWeek = useMemo(() => {
    const map = new Map<string, { weekInfo: ReturnType<typeof getWeekInfo>; transactions: Transaction[] }>();

    processedTransactions.forEach(tx => {
      const info = getWeekInfo(tx.date);
      if (!map.has(info.key)) {
        map.set(info.key, { weekInfo: info, transactions: [] });
      }
      map.get(info.key)!.transactions.push(tx);
    });

    const sortedKeys = Array.from(map.keys()).sort((a, b) => (b > a ? 1 : -1));

    return sortedKeys.map(key => {
      const item = map.get(key)!;
      const weekTotal = item.transactions.reduce((sum, t) => {
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);
      const uniqueDays = new Set(item.transactions.map(t => t.date)).size;

      return {
        key,
        weekInfo: item.weekInfo,
        transactions: item.transactions,
        weekTotal,
        txCount: item.transactions.length,
        daysWithSpend: uniqueDays,
      };
    });
  }, [processedTransactions, baseCurrency, forexRates]);

  // 3. Grouped by Month
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, Transaction[]>();

    processedTransactions.forEach(tx => {
      const monthKey = tx.date.substring(0, 7); // YYYY-MM
      if (!map.has(monthKey)) map.set(monthKey, []);
      map.get(monthKey)!.push(tx);
    });

    const sortedKeys = Array.from(map.keys()).sort((a, b) => (b > a ? 1 : -1));

    return sortedKeys.map(monthKey => {
      const dayTxs = map.get(monthKey)!;
      const monthTotal = dayTxs.reduce((sum, t) => {
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);

      const [year, month] = monthKey.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const uniqueDays = new Set(dayTxs.map(t => t.date)).size;
      const dailyAvg = uniqueDays > 0 ? monthTotal / uniqueDays : 0;

      return {
        monthKey,
        monthName,
        monthTotal,
        txCount: dayTxs.length,
        daysWithSpend: uniqueDays,
        dailyAvg,
      };
    });
  }, [processedTransactions, baseCurrency, forexRates]);

  // 4. Grouped by Year
  const groupedByYear = useMemo(() => {
    const map = new Map<string, Transaction[]>();

    processedTransactions.forEach(tx => {
      const yearKey = tx.date.substring(0, 4); // YYYY
      if (!map.has(yearKey)) map.set(yearKey, []);
      map.get(yearKey)!.push(tx);
    });

    const sortedKeys = Array.from(map.keys()).sort((a, b) => (b > a ? 1 : -1));

    return sortedKeys.map(yearKey => {
      const yearTxs = map.get(yearKey)!;
      const yearTotal = yearTxs.reduce((sum, t) => {
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);

      const monthTotalsMap = new Map<string, number>();
      yearTxs.forEach(t => {
        const mKey = t.date.substring(0, 7);
        const amt = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
        monthTotalsMap.set(mKey, (monthTotalsMap.get(mKey) || 0) + amt);
      });

      let highestMonthKey = '';
      let highestMonthTotal = 0;
      monthTotalsMap.forEach((amt, mKey) => {
        if (amt > highestMonthTotal) {
          highestMonthTotal = amt;
          highestMonthKey = mKey;
        }
      });

      let highestMonthName = '';
      if (highestMonthKey) {
        const [y, m] = highestMonthKey.split('-');
        highestMonthName = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      }

      return {
        yearKey,
        yearTotal,
        txCount: yearTxs.length,
        highestMonthName,
        highestMonthTotal,
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

  const handleBulkDelete = async () => {
    if (selectedTxIds.length === 0) return;
    if (selectedTxIds.length === 1) {
      await handleConfirmBulkDelete();
    } else {
      setShowDeleteConfirmModal(true);
    }
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
      <QuickLogBar
        isMultiLogActive={isMultiLogActive}
        onToggleMultiLog={handleToggleMultiLog}
        batchDate={batchDate}
        onBatchDateChange={setBatchDate}
      />

      {/* Active Drill-Down Filter Banner */}
      {drilledFilter && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-brand-purple/10 border border-brand-purple/30 text-xs font-mono text-brand-purple font-bold animate-in fade-in duration-150 shadow-sm">
          <span
            onClick={handleStepBackFromBanner}
            className="cursor-pointer hover:underline flex items-center gap-1.5"
            title="Click to go back to parent period view"
          >
            <span>View: {drilledFilter.label}</span>
          </span>
          <button
            type="button"
            onClick={() => setDrilledFilter(null)}
            className="hover:text-brand-coral cursor-pointer flex items-center gap-1 bg-surface-card px-2 py-0.5 rounded-md border border-hairline shrink-0 transition-colors text-ink font-bold"
          >
            <span>Reset</span>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 2. Controls Toolbar: Search, Chart Jump, Multi-Log & View Mode */}
      <div className="space-y-3 relative">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 py-0.5 w-full">
          {/* 1. Search Pill Button (Icon-Only) */}
          <button
            type="button"
            onClick={() => setShowSearchInput(!showSearchInput)}
            className={`p-2 rounded-xl border transition-all flex items-center justify-center cursor-pointer shrink-0 ${
              showSearchInput || searchQuery || selectedCatFilter !== 'all'
                ? 'border-brand-blue text-brand-blue font-bold shadow-sm bg-surface-soft'
                : 'bg-surface-card text-muted-custom border-hairline hover:border-ink hover:text-ink'
            }`}
            title="Search & filter logs"
          >
            <Search className="w-4 h-4 text-brand-blue shrink-0" />
            {(searchQuery || selectedCatFilter !== 'all') && (
              <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse shrink-0 ml-0.5" />
            )}
          </button>

          {/* 2. Chart Jump Button (Icon-Only) */}
          <button
            type="button"
            onClick={() => {
              setShowCharts(true);
              setTimeout(() => {
                chartRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
            className="p-2 rounded-xl border border-hairline bg-surface-card text-muted-custom hover:text-brand-yellow hover:border-brand-yellow transition-all flex items-center justify-center cursor-pointer shrink-0"
            title="Jump to Spending Trend Chart"
          >
            <BarChart2 className="w-4 h-4 shrink-0 text-brand-yellow" />
          </button>

          {/* 3. Multi-Log Chip Button */}
          <button
            type="button"
            onClick={handleToggleMultiLog}
            className={`shrink px-2.5 py-1.5 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer ${
              isMultiLogActive
                ? 'border-brand-purple text-brand-purple font-bold shadow-sm bg-surface-soft'
                : 'bg-surface-card text-muted-custom border-hairline hover:border-ink hover:text-ink'
            }`}
            title={isMultiLogActive ? 'Click to exit Multi-Log mode' : 'Click to select a date for Multi-Log session'}
          >
            <ListPlus className="w-3.5 h-3.5 text-brand-purple shrink-0" />
            <span>Multi-Log</span>
          </button>

          {/* 4. View Mode Switcher Chip Button ("View") */}
          <button
            type="button"
            onClick={() => setShowViewMenu(!showViewMenu)}
            className={`shrink px-2.5 py-1.5 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer ${
              showViewMenu || periodMode !== 'day' || viewMode !== 'compact'
                ? 'border-brand-purple text-brand-purple font-bold shadow-sm bg-surface-soft'
                : 'bg-surface-card text-muted-custom border-hairline hover:border-ink hover:text-ink'
            }`}
            title="Change view period (Day/Week/Month/Year) and layout"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-brand-purple shrink-0" />
            <span>View</span>
            {periodMode !== 'day' && (
              <span className="text-[10px] uppercase font-bold text-brand-purple bg-brand-purple/15 px-1 rounded">
                {periodMode}
              </span>
            )}
          </button>
        </div>

        {/* Floating Glassmorphic View Popover Menu */}
        {showViewMenu && (
          <>
            {/* Transparent backdrop to catch empty space clicks */}
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setShowViewMenu(false)}
            />
            <div
              className="absolute right-0 top-full mt-2 z-50 w-72 bg-surface-card/95 backdrop-blur-2xl border border-hairline rounded-2xl shadow-2xl p-3.5 space-y-3.5 ring-1 ring-white/15 animate-in fade-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
                <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-brand-purple" />
                  View Settings
                </span>
                <button
                  type="button"
                  onClick={() => setShowViewMenu(false)}
                  className="text-muted-custom hover:text-ink text-xs p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* 1. Time Period Selector (Day | Week | Month | Year) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-custom font-bold uppercase">Grouping Period</label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-surface-soft/80 rounded-xl border border-hairline">
                  {(['day', 'week', 'month', 'year'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleSelectPeriodFromMenu(mode)}
                      className={`py-1 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer font-bold ${
                        periodMode === mode
                          ? 'bg-brand-purple text-white shadow-sm'
                          : 'text-muted-custom hover:text-ink'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Layout Style Sub-Options (Compact | List | Grid) - ONLY for 'day' */}
              {periodMode === 'day' && (
                <div className="space-y-1.5 animate-in fade-in duration-100">
                  <label className="text-[10px] font-mono text-muted-custom font-bold uppercase">Layout Style</label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-surface-soft/80 rounded-xl border border-hairline">
                    {(['compact', 'list', 'grid'] as const).map(layout => (
                      <button
                        key={layout}
                        type="button"
                        onClick={() => handleSetViewMode(layout)}
                        className={`py-1 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer font-bold flex items-center justify-center gap-1 ${
                          viewMode === layout
                            ? 'bg-brand-purple text-white shadow-sm'
                            : 'text-muted-custom hover:text-ink'
                        }`}
                      >
                        {layout === 'compact' && <LayoutGrid className="w-3 h-3" />}
                        {layout === 'list' && <List className="w-3.5 h-3.5" />}
                        {layout === 'grid' && <Grid className="w-3.5 h-3.5" />}
                        <span>{layout}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Expandable Search Drawer (Search Input Bar + Filter Chips) */}
        {(showSearchInput || searchQuery || selectedCatFilter !== 'all') && (
          <div className="space-y-2.5 bg-surface-soft/60 backdrop-blur-md p-3 rounded-2xl border border-hairline animate-in fade-in zoom-in-95 duration-150 shadow-sm">
            {/* Search Input */}
            <div className="relative">
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

            {/* Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setShowTagFilterRow(!showTagFilterRow)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  showTagFilterRow || selectedCatFilter !== 'all'
                    ? 'border-brand-mint text-brand-mint font-bold shadow-sm bg-surface-soft'
                    : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
                }`}
                title="Filter by category tags"
              >
                <Tag className="w-3.5 h-3.5 text-brand-mint shrink-0" />
                <span>
                  {selectedCatFilter !== 'all' && activeCategoryObj ? `Tag: ${activeCategoryObj.name}` : 'Tags'}
                </span>
                {(showTagFilterRow || selectedCatFilter !== 'all') && (
                  <span
                    onClick={e => {
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

              <CustomDatePicker
                value={searchQuery.match(/^\d{4}-\d{2}-\d{2}$/) ? searchQuery : ''}
                onChange={selectedDate => setSearchQuery(selectedDate)}
                className="shrink-0"
              />

              <button
                type="button"
                onClick={() => setShowCharts(!showCharts)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  !showCharts
                    ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                    : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
                <span>{showCharts ? 'Hide Charts' : 'Show Charts'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category Tag Filter Pill Rail */}
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

      {/* ─── TIMELINE RENDERER (Day / Week / Month / Year) ────────────────── */}

      {processedTransactions.length === 0 ? (
        <div className="dotgui-card p-12 text-center space-y-3 my-8">
          <div className="text-muted-custom text-sm font-mono">No matching transactions found</div>
          {(searchQuery || drilledFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDrilledFilter(null);
              }}
              className="text-xs font-mono text-brand-blue underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* DAY MODE */}
          {periodMode === 'day' && (
            <div className="space-y-6">

              {visibleGroupedByDate.map(group => {
                const isCollapsed = collapsedDates.has(group.date);
                return (
                  <div key={group.date} className="space-y-2.5">
                    {/* Day Header with converted Daily Total */}
                    <div className="flex items-center justify-between px-1 border-b border-hairline/60 pb-1.5 text-xs font-mono text-ink">
                      <div
                        onClick={() => toggleDateCollapse(group.date)}
                        className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                        title={isCollapsed ? 'Click to expand logs for this day' : 'Click to collapse logs for this day'}
                      >
                        {isCollapsed ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-custom shrink-0" />
                        ) : (
                          <Calendar className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />
                        )}
                        <span className="font-bold uppercase whitespace-nowrap">
                          {formatDayHeader(group.date)}
                        </span>
                      </div>
                      <span className="text-muted-custom whitespace-nowrap ml-2">
                        Spend: <span className="text-ink font-bold">{formatCurrency(group.dayTotal, baseCurrency)}</span>
                      </span>
                    </div>

                    {/* Day Transactions List (Hidden if collapsed) */}
                    {!isCollapsed && (
                      <div
                        className={
                          viewMode === 'grid'
                            ? 'grid grid-cols-2 sm:grid-cols-3 gap-2.5'
                            : viewMode === 'list'
                            ? 'space-y-1.5'
                            : 'space-y-2'
                        }
                      >
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
                    )}
                  </div>
                );
              })}

              {/* 30-Day Window Pagination Banner */}
              {hasMoreDays && (
                <div className="text-center py-6 border-t border-hairline/40 space-y-2 animate-in fade-in duration-200">
                  <p className="text-xs font-mono text-muted-custom">
                    Showing last {dayWindowLimit} active days ({visibleGroupedByDate.reduce((sum, g) => sum + g.transactions.length, 0)} expenses) out of {groupedByDate.length} days total.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDayWindowLimit(prev => prev + 30)}
                    className="px-4 py-2 rounded-xl bg-surface-card border border-hairline hover:border-brand-purple text-brand-purple font-mono text-xs font-bold transition-all shadow-sm cursor-pointer hover:bg-surface-soft"
                  >
                    Load older history (+30 days)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* WEEK MODE */}
          {periodMode === 'week' && (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                  : 'space-y-2.5'
              }
            >
              {groupedByWeek.map(w => (
                <div
                  key={w.key}
                  onClick={() => handleDrillDownWeek(w.weekInfo)}
                  className="bg-surface-card border border-hairline rounded-2xl p-3.5 space-y-2 shadow-sm hover:border-brand-purple/60 cursor-pointer transition-all hover:scale-[1.005] group"
                  title="Click to view daily logs for this week"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarRange className="w-4 h-4 text-brand-purple shrink-0 group-hover:scale-110 transition-transform" />
                      <div>
                        <h4 className="text-xs font-mono font-bold text-ink uppercase group-hover:text-brand-purple transition-colors">{w.weekInfo.title}</h4>
                        <p className="text-[11px] font-mono text-muted-custom">{w.weekInfo.dateRangeStr}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-ink">
                        {formatCurrency(w.weekTotal, baseCurrency)}
                      </div>
                      <div className="text-[10px] font-mono text-muted-custom">
                        {w.txCount} logs ({w.daysWithSpend} active days)
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MONTH MODE */}
          {periodMode === 'month' && (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                  : 'space-y-2.5'
              }
            >
              {groupedByMonth.map(m => (
                <div
                  key={m.monthKey}
                  className="space-y-2"
                >
                  {/* Month Expense Card */}
                  <div
                    onClick={() => handleDrillDownMonth(m.monthKey, m.monthName)}
                    className="bg-surface-card border border-hairline rounded-2xl p-4 space-y-2.5 shadow-sm hover:border-brand-purple/60 cursor-pointer transition-all hover:scale-[1.005] group"
                    title="Click to view daily logs for this month"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-brand-purple/10 border border-brand-purple/20 text-brand-purple flex items-center justify-center font-mono font-bold text-xs shrink-0 group-hover:bg-brand-purple group-hover:text-white transition-colors">
                          <CalendarDays className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-mono font-bold text-ink group-hover:text-brand-purple transition-colors">{m.monthName}</h4>
                          <p className="text-[11px] font-mono text-muted-custom">
                            {m.txCount} total logs • ~{formatCurrency(m.dailyAvg, baseCurrency)}/day
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-mono font-bold text-brand-purple">
                          {formatCurrency(m.monthTotal, baseCurrency)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Month Note Card */}
                  <div
                    onClick={() => handleOpenNoteModal(m.monthKey, 'month', `${m.monthName} Note`)}
                    className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-surface-soft/70 border border-hairline hover:border-brand-purple text-xs font-mono cursor-pointer transition-colors group shadow-2xs"
                  >
                    <div className="flex items-center gap-2 text-brand-purple font-bold">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>{m.monthName} Note</span>
                    </div>
                    <span className="text-[10px] text-muted-custom font-mono">
                      {periodNotes.find(n => n.periodKey === m.monthKey)?.content ? 'Read Note' : '+ Add Note'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* YEAR MODE */}
          {periodMode === 'year' && (
            <div className="space-y-4">
              {groupedByYear.map(y => (
                <div key={y.yearKey} className="space-y-2">
                  {/* Year Expense Card */}
                  <div
                    onClick={() => handleDrillDownYear(y.yearKey)}
                    className="bg-surface-card border border-hairline rounded-2xl p-4 space-y-3 shadow-sm hover:border-brand-purple/60 cursor-pointer transition-all hover:scale-[1.005] group"
                    title="Click to view monthly breakdown for this year"
                  >
                    <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="px-2.5 py-1.5 rounded-2xl bg-brand-yellow/15 border border-brand-yellow/30 text-brand-yellow flex items-center justify-center font-mono font-bold text-xs shrink-0 tracking-wider group-hover:bg-brand-yellow group-hover:text-white transition-colors">
                          {y.yearKey}
                        </div>
                        <div>
                          <h4 className="text-base font-display font-bold text-ink group-hover:text-brand-purple transition-colors">Annual Summary</h4>
                          <p className="text-xs font-mono text-muted-custom">{y.txCount} total logged expenses</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-mono font-bold text-ink">
                          {formatCurrency(y.yearTotal, baseCurrency)}
                        </div>
                      </div>
                    </div>

                    {/* Highest Spending Month Highlight */}
                    {y.highestMonthName && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-soft/80 border border-hairline text-xs font-mono">
                        <span className="flex items-center gap-1.5 text-muted-custom font-bold">
                          <Flame className="w-3.5 h-3.5 text-brand-coral" />
                          Highest Spending Month
                        </span>
                        <span className="font-bold text-ink">
                          {y.highestMonthName} ({formatCurrency(y.highestMonthTotal, baseCurrency)})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Year Note Card */}
                  <div
                    onClick={() => handleOpenNoteModal(y.yearKey, 'year', `${y.yearKey} Note`)}
                    className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-surface-soft/70 border border-hairline hover:border-brand-purple text-xs font-mono cursor-pointer transition-colors group shadow-2xs"
                  >
                    <div className="flex items-center gap-2 text-brand-purple font-bold">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>{y.yearKey} Note</span>
                    </div>
                    <span className="text-[10px] text-muted-custom font-mono">
                      {periodNotes.find(n => n.periodKey === y.yearKey)?.content ? 'Read Note' : '+ Add Note'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Visual Charts Overview */}
      {showCharts && (
        <div ref={chartRef} id="spending-trend-chart" className="animate-in fade-in duration-200 mt-6">
          <LiveSpendChart />
        </div>
      )}

      {/* Period Note Popover / Modal */}
      {activeNoteModal && (
        <div
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
          onClick={() => setActiveNoteModal(null)}
        >
          <div
            className="max-w-md w-full bg-surface-card/95 backdrop-blur-2xl border border-hairline rounded-2xl p-5 shadow-2xl space-y-4 relative cursor-default ring-1 ring-white/10 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <span className="text-sm font-mono font-bold text-ink flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-purple" />
                {activeNoteModal.title}
              </span>
              <button
                type="button"
                onClick={() => setActiveNoteModal(null)}
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
                  placeholder="Add monthly or annual review notes, goals, or financial observations..."
                  rows={6}
                  autoFocus
                  className="w-full bg-surface-soft border border-hairline rounded-xl p-3 text-xs font-mono text-ink focus:outline-none focus:border-brand-purple leading-relaxed"
                />
              </div>
            ) : (
              <div className="bg-surface-soft p-4 rounded-xl border border-hairline min-h-[100px]">
                <p className="text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed">
                  {noteEditContent || 'No note recorded yet.'}
                </p>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-hairline">
              {periodNotes.some(n => n.periodKey === activeNoteModal.periodKey) ? (
                <button
                  type="button"
                  onClick={handleDeleteActiveNote}
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
                    onClick={handleSaveActiveNote}
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
          onDuplicate={t => {
            setSelectedTxDetail(null);
            handleDuplicateSingle(t);
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

          <span className="w-5 h-5 rounded-full bg-brand-blue/20 text-brand-blue font-mono font-bold text-xs flex items-center justify-center shrink-0">
            {selectedTxIds.length}
          </span>

          <div className="h-3.5 w-px bg-hairline shrink-0" />

          <button
            onClick={handleToggleSelectAll}
            className="flex items-center gap-1 text-muted-custom hover:text-ink font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer"
            title={isAllSelected ? 'Deselect All' : 'Select All'}
          >
            <CheckSquare className="w-3 h-3 text-brand-blue" />
            <span>{isAllSelected ? 'None' : 'All'}</span>
          </button>

          <div className="h-3.5 w-px bg-hairline shrink-0" />

          {/* Copy / Duplicate Action Button (Icon-Only, No Text) */}
          <button
            onClick={handleBulkDuplicate}
            className="p-1 text-muted-custom hover:text-ink transition-colors cursor-pointer"
            title="Duplicate expense in editor"
          >
            <Copy className="w-3.5 h-3.5 text-muted-custom hover:text-ink" />
          </button>

          <button
            onClick={() => setIsBulkEditOpen(true)}
            className="flex items-center gap-1.5 text-brand-blue hover:text-ink font-mono text-xs font-bold px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

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
        <div
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowDeleteConfirmModal(false)}
        >
          <div
            className="bg-surface-card/90 backdrop-blur-2xl border border-hairline rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4 text-center ring-1 ring-white/10 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
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

      {/* Direct CustomDatePicker portal trigger when clicking Multi-Log */}
      <CustomDatePicker
        value={batchDate}
        onChange={handleSelectMultiLogDate}
        isOpenControlled={showMultiLogDatePickerModal}
        onCloseControlled={() => setShowMultiLogDatePickerModal(false)}
        title="Select Multi-Log Date"
        subtitle="All expenses will be logged to the selected date"
      />
    </div>
  );
};

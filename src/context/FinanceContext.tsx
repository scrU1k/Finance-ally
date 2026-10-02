import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Transaction, Category, Trip, CurrencyCode, PeriodType } from '../types';
import { loadTransactions, saveTransaction, deleteTransaction, loadCategories, saveCategory, deleteCategory, loadTrips, saveTrip, deleteTrip } from '../services/db';
import { getStoredForexRates, fetchLiveExchangeRates, switchAppBaseCurrency, convertCurrencyAmount } from '../services/currency';
import { useAuth } from './AuthContext';
import { isPendingScheduledTx, isFutureDateTime } from '../utils/scheduledUtils';
import { requestNotificationPermission, triggerScheduledPaymentNotification, scheduleFutureNativeNotification, cancelScheduledNotification } from '../services/notificationService';
import { trainModel } from '../services/localInferenceEngine';
import { checkAndPerformLocalAutoBackup } from '../services/localAutoBackupService';
import { getLocalDateString, getWeekDateBounds, parseLocalDate } from '../utils/dateUtils';

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  trips: Trip[];
  period: PeriodType;
  baseCurrency: CurrencyCode;
  forexRates: Record<CurrencyCode, number>;
  activeTripVault: Trip | null;
  includeTripExpensesInTimeline: boolean;
  setIncludeTripExpensesInTimeline: (include: boolean) => void;
  setPeriod: (p: PeriodType) => void;
  setActiveTripVault: (trip: Trip | null) => void;
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  editTransaction: (tx: Transaction) => Promise<void>;
  deleteTx: (id: string) => Promise<void>;
  addCategoryItem: (cat: Omit<Category, 'id'>) => Promise<void>;
  updateCategoryItem: (cat: Category) => Promise<void>;
  deleteCategoryItem: (id: string) => Promise<void>;
  addTripItem: (trip: Omit<Trip, 'id' | 'createdAt'>) => Promise<void>;
  updateTripItem: (trip: Trip) => Promise<void>;
  removeTripItem: (id: string) => Promise<void>;
  switchBaseCurrency: (newCurrency: CurrencyCode, mode: 'convert' | 'keep') => Promise<void>;
  syncForexRates: () => Promise<boolean>;
  reloadAllData: () => Promise<void>;
  filteredTransactions: Transaction[];
  periodTotalSpent: number;
  viewedPeriodTotal: number;
  viewedPeriodLabel: string;
  topmostVisibleDate: string;
  setTopmostVisibleDate: (dateStr: string) => void;
  scheduledToast: { id: string; note: string; amount: number; currency: CurrencyCode; transaction: Transaction } | null;
  dismissScheduledToast: () => void;
  undoScheduledActivation: (id: string) => Promise<Transaction | null>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateUserCurrency } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [forexRates, setForexRates] = useState<Record<CurrencyCode, number>>(() => getStoredForexRates());
  const [activeTripVault, setActiveTripVaultState] = useState<Trip | null>(() => {
    try {
      const raw = localStorage.getItem('fa_active_trip_vault');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const setActiveTripVault = (trip: Trip | null) => {
    setActiveTripVaultState(trip);
    try {
      if (trip) {
        localStorage.setItem('fa_active_trip_vault', JSON.stringify(trip));
      } else {
        localStorage.removeItem('fa_active_trip_vault');
      }
    } catch (e) {
      console.warn('Failed to persist active trip vault:', e);
    }
  };

  const [includeTripExpensesInTimeline, setIncludeTripExpensesInTimelineState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('fa_include_trip_expenses');
      return stored !== null ? JSON.parse(stored) : true; // Default: true (included)
    } catch {
      return true;
    }
  });

  const setIncludeTripExpensesInTimeline = (include: boolean) => {
    setIncludeTripExpensesInTimelineState(include);
    try {
      localStorage.setItem('fa_include_trip_expenses', JSON.stringify(include));
    } catch (e) {
      console.warn('Failed to save fa_include_trip_expenses:', e);
    }
  };

  const baseCurrency: CurrencyCode = activeTripVault ? activeTripVault.currency : (user?.baseCurrency || 'INR');

  const reloadAllData = async () => {
    const txs = await loadTransactions();
    const cats = await loadCategories();
    const trps = await loadTrips();
    setTransactions(txs);
    setCategories(cats);
    setTrips(trps);
  };

  useEffect(() => {
    reloadAllData();
  }, []);

  // Train the Local ML Inference Engine whenever transactions are loaded/updated
  useEffect(() => {
    if (transactions.length > 0) {
      trainModel(transactions);
    }
  }, [transactions]);

  // Fix 10: Auto-refresh forex rates if they are too old on startup
  useEffect(() => {
    const lastSyncStr = localStorage.getItem('fa_rates_last_sync');
    if (lastSyncStr) {
      const lastSync = parseInt(lastSyncStr, 10);
      if (Date.now() - lastSync > 24 * 60 * 60 * 1000) {
        syncForexRates();
      }
    } else {
      syncForexRates(); // Initial sync
    }
  }, []);

  const syncForexRates = async (): Promise<boolean> => {
    try {
      const result = await fetchLiveExchangeRates();
      if (result.success) {
        setForexRates(result.rates);
      }
      return result.success;
    } catch {
      // Gracefully degrade and do not block the app
      return false;
    }
  };

  const [scheduledToast, setScheduledToast] = useState<{ id: string; note: string; amount: number; currency: CurrencyCode; transaction: Transaction } | null>(null);

  const dismissScheduledToast = () => setScheduledToast(null);

  const undoScheduledActivation = async (id: string): Promise<Transaction | null> => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return null;

    const revertedTx: Transaction = { ...tx, isScheduled: true };
    await saveTransaction(revertedTx);
    setTransactions(prev => prev.map(t => (t.id === id ? revertedTx : t)));
    setScheduledToast(null);
    return revertedTx;
  };

  // Targeted event-driven scheduler for scheduled payments (Zero 3s polling!)
  useEffect(() => {
    requestNotificationPermission();

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const runScheduledCheck = () => {
      const now = Date.now();

      // 1. Process any pending scheduled payments that are due now
      setTransactions(prevTxs => {
        let changed = false;
        const updatedList = prevTxs.map(t => {
          if (t.isScheduled) {
            const tDateStr = t.date;
            const tTimeStr = t.time && t.time.trim() ? t.time.trim() : '00:00';
            const targetDateTime = new Date(`${tDateStr}T${tTimeStr}:00`);
            const isDue = !isNaN(targetDateTime.getTime()) && targetDateTime.getTime() <= now;

            if (isDue) {
              triggerScheduledPaymentNotification(t, baseCurrency);
              setScheduledToast({
                id: t.id,
                note: t.note || 'Scheduled Payment',
                amount: t.amount,
                currency: t.currency || baseCurrency,
                transaction: t,
              });
              changed = true;
              const updatedTx = { ...t, isScheduled: false };
              saveTransaction(updatedTx);
              return updatedTx;
            }
          }
          return t;
        });

        return changed ? updatedList : prevTxs;
      });

      // 2. Find the earliest upcoming scheduled payment timestamp
      const upcomingTimestamps = transactions
        .filter(t => t.isScheduled)
        .map(t => {
          const tDateStr = t.date;
          const tTimeStr = t.time && t.time.trim() ? t.time.trim() : '00:00';
          return new Date(`${tDateStr}T${tTimeStr}:00`).getTime();
        })
        .filter(ts => !isNaN(ts) && ts > now)
        .sort((a, b) => a - b);

      if (upcomingTimestamps.length > 0) {
        const nextDueTime = upcomingTimestamps[0];
        const msUntilDue = Math.max(1000, nextDueTime - now + 1000); // 1 sec buffer past due time
        timerId = setTimeout(runScheduledCheck, msUntilDue);
      }
    };

    runScheduledCheck();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [transactions, baseCurrency]);

  const addTransaction = async (txData: Omit<Transaction, 'id' | 'createdAt'>) => {
    try {
      const isFuture = isFutureDateTime(txData.date, txData.time);
      const newTx: Transaction = {
        ...txData,
        isScheduled: txData.isScheduled !== undefined ? txData.isScheduled : isFuture,
        tripId: txData.tripId || activeTripVault?.id || undefined,
        id: `tx-${Date.now()}-${crypto.randomUUID().split('-')[0]}`,
        createdAt: Date.now(),
      };
      await saveTransaction(newTx);
      setTransactions(prev => [newTx, ...prev]);

      if (newTx.isScheduled) {
        scheduleFutureNativeNotification(newTx, baseCurrency);
      }

      checkAndPerformLocalAutoBackup(transactions.length + 1);
    } catch (e) {
      console.error('Failed to persist new transaction:', e);
      throw e;
    }
  };

  const editTransaction = async (tx: Transaction) => {
    try {
      const isFuture = isFutureDateTime(tx.date, tx.time);
      const updatedTx: Transaction = {
        ...tx,
        isScheduled: tx.isScheduled !== undefined ? tx.isScheduled : isFuture,
      };
      await saveTransaction(updatedTx);
      setTransactions(prev => prev.map(t => (t.id === updatedTx.id ? updatedTx : t)));

      // Cancel previous notification if date/time or scheduled status changed
      await cancelScheduledNotification(updatedTx.id);

      if (updatedTx.isScheduled) {
        scheduleFutureNativeNotification(updatedTx, baseCurrency);
      }
    } catch (e) {
      console.error('Failed to persist transaction edit:', e);
      throw e;
    }
  };

  const deleteTx = async (id: string) => {
    try {
      await cancelScheduledNotification(id);
      await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error('Failed to delete transaction:', e);
      throw e;
    }
  };

  const addCategoryItem = async (catData: Omit<Category, 'id'>) => {
    try {
      const newCat: Category = {
        ...catData,
        id: `cat-${Date.now()}`
      };
      await saveCategory(newCat);
      setCategories(prev => [...prev, newCat]);
    } catch (e) {
      console.error('Failed to save category:', e);
      throw e;
    }
  };

  const updateCategoryItem = async (category: Category) => {
    try {
      await saveCategory(category);
      setCategories(prev => prev.map(c => (c.id === category.id ? category : c)));
    } catch (e) {
      console.error('Failed to update category:', e);
      throw e;
    }
  };

  const deleteCategoryItem = async (id: string) => {
    try {
      const deletedCat = categories.find(c => c.id === id);
      await deleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));

      // Cascade reassign orphaned transactions to 'cat-others'
      const affected = transactions.filter(t => t.categoryId === id);
      if (affected.length > 0) {
        const updated = transactions.map(t => {
          if (t.categoryId === id) {
            const remapped: Transaction = {
              ...t,
              categoryId: 'cat-others',
              customCategoryName: t.customCategoryName || deletedCat?.name || 'Others'
            };
            saveTransaction(remapped).catch(err => console.error('Failed to persist remapped category tx:', err));
            return remapped;
          }
          return t;
        });
        setTransactions(updated);
      }
    } catch (e) {
      console.error('Failed to delete category:', e);
      throw e;
    }
  };

  const addTripItem = async (tripData: Omit<Trip, 'id' | 'createdAt'>) => {
    try {
      const newTrip: Trip = {
        ...tripData,
        id: `trip-${Date.now()}`,
        createdAt: Date.now()
      };
      await saveTrip(newTrip);
      setTrips(prev => [newTrip, ...prev]);
    } catch (e) {
      console.error('Failed to add trip:', e);
      throw e;
    }
  };

  const updateTripItem = async (trip: Trip) => {
    try {
      await saveTrip(trip);
      setTrips(prev => prev.map(t => (t.id === trip.id ? trip : t)));
      if (activeTripVault?.id === trip.id) {
        setActiveTripVault(trip);
      }
    } catch (e) {
      console.error('Failed to update trip:', e);
      throw e;
    }
  };

  const removeTripItem = async (id: string) => {
    try {
      await deleteTrip(id);
      setTrips(prev => prev.filter(t => t.id !== id));
      if (activeTripVault?.id === id) setActiveTripVault(null);
    } catch (e) {
      console.error('Failed to delete trip:', e);
      throw e;
    }
  };

  const switchBaseCurrency = async (newCurrency: CurrencyCode, mode: 'convert' | 'keep') => {
    const oldCurrency = user?.baseCurrency || 'INR';
    if (oldCurrency === newCurrency) return;

    const updatedTxs = switchAppBaseCurrency(transactions, oldCurrency, newCurrency, mode, forexRates);
    setTransactions(updatedTxs);
    updateUserCurrency(newCurrency);

    // Persist all converted transactions
    for (const tx of updatedTxs) {
      await saveTransaction(tx);
    }
  };

  const filteredTransactions = useMemo(() => {
    if (activeTripVault) {
      return transactions.filter(t => t.tripId === activeTripVault.id);
    }
    if (!includeTripExpensesInTimeline) {
      return transactions.filter(t => !t.tripId);
    }
    return transactions;
  }, [transactions, activeTripVault, includeTripExpensesInTimeline]);

  const [topmostVisibleDate, setTopmostVisibleDate] = useState<string>('');

  // Compute dynamic viewed total and label for the bottom bar based on topmostVisibleDate & period
  const { viewedPeriodTotal, viewedPeriodLabel } = useMemo(() => {
    const targetDateStr = topmostVisibleDate || getLocalDateString();
    const targetDate = parseLocalDate(targetDateStr);

    if (period === 'day') {
      const dayTxs = filteredTransactions.filter(t => t.date === targetDateStr);
      const total = dayTxs.reduce((sum, t) => {
        if (isPendingScheduledTx(t)) return sum;
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);
      const label = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return { viewedPeriodTotal: total, viewedPeriodLabel: label };
    }

    if (period === 'week') {
      const { monStr, sunStr, weekNo } = getWeekDateBounds(targetDateStr);
      const [monY] = monStr.split('-').map(Number);
      const weekTxs = filteredTransactions.filter(t => t.date >= monStr && t.date <= sunStr);
      const total = weekTxs.reduce((sum, t) => {
        if (isPendingScheduledTx(t)) return sum;
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);
      return { viewedPeriodTotal: total, viewedPeriodLabel: `Week ${weekNo}, ${monY}` };
    }

    if (period === 'month') {
      const monthPrefix = targetDateStr.substring(0, 7); // YYYY-MM
      const monthTxs = filteredTransactions.filter(t => t.date.startsWith(monthPrefix));
      const total = monthTxs.reduce((sum, t) => {
        if (isPendingScheduledTx(t)) return sum;
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);
      const label = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { viewedPeriodTotal: total, viewedPeriodLabel: label };
    }

    if (period === 'year') {
      const yearPrefix = targetDateStr.substring(0, 4); // YYYY
      const yearTxs = filteredTransactions.filter(t => t.date.startsWith(yearPrefix));
      const total = yearTxs.reduce((sum, t) => {
        if (isPendingScheduledTx(t)) return sum;
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);
      return { viewedPeriodTotal: total, viewedPeriodLabel: `Year ${yearPrefix}` };
    }

    // fallback for 'all'
    const total = filteredTransactions.reduce((sum, t) => {
      if (isPendingScheduledTx(t)) return sum;
      return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
    }, 0);
    return { viewedPeriodTotal: total, viewedPeriodLabel: 'All Time' };
  }, [topmostVisibleDate, period, filteredTransactions, baseCurrency, forexRates]);

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        categories,
        trips,
        period,
        baseCurrency,
        forexRates,
        activeTripVault,
        includeTripExpensesInTimeline,
        setIncludeTripExpensesInTimeline,
        setPeriod,
        setActiveTripVault,
        addTransaction,
        editTransaction,
        deleteTx,
        addCategoryItem,
        updateCategoryItem,
        deleteCategoryItem,
        addTripItem,
        updateTripItem,
        removeTripItem,
        switchBaseCurrency,
        syncForexRates,
        reloadAllData,
        filteredTransactions,
        periodTotalSpent: viewedPeriodTotal,
        viewedPeriodTotal,
        viewedPeriodLabel,
        topmostVisibleDate,
        setTopmostVisibleDate,
        scheduledToast,
        dismissScheduledToast,
        undoScheduledActivation,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
};

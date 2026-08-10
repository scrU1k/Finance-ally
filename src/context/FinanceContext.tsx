import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Transaction, Category, Trip, CurrencyCode, PeriodType } from '../types';
import { loadTransactions, saveTransaction, deleteTransaction, loadCategories, saveCategory, deleteCategory, loadTrips, saveTrip, deleteTrip } from '../services/db';
import { getStoredForexRates, fetchLiveExchangeRates, switchAppBaseCurrency, convertCurrencyAmount } from '../services/currency';
import { useAuth } from './AuthContext';
import { isPendingScheduledTx, isFutureDateTime } from '../utils/scheduledUtils';
import { requestNotificationPermission, triggerScheduledPaymentNotification, scheduleFutureNativeNotification } from '../services/notificationService';
import { trainModel } from '../services/localInferenceEngine';
import { checkAndPerformLocalAutoBackup } from '../services/localAutoBackupService';

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  trips: Trip[];
  period: PeriodType;
  baseCurrency: CurrencyCode;
  forexRates: Record<CurrencyCode, number>;
  activeTripVault: Trip | null;
  setPeriod: (p: PeriodType) => void;
  setActiveTripVault: (trip: Trip | null) => void;
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  editTransaction: (tx: Transaction) => Promise<void>;
  deleteTx: (id: string) => Promise<void>;
  addCategoryItem: (cat: Omit<Category, 'id'>) => Promise<void>;
  updateCategoryItem: (cat: Category) => Promise<void>;
  deleteCategoryItem: (id: string) => Promise<void>;
  addTripItem: (trip: Omit<Trip, 'id' | 'createdAt'>) => Promise<void>;
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
  };

  const editTransaction = async (tx: Transaction) => {
    const isFuture = isFutureDateTime(tx.date, tx.time);
    const updatedTx: Transaction = {
      ...tx,
      isScheduled: tx.isScheduled !== undefined ? tx.isScheduled : isFuture,
    };
    await saveTransaction(updatedTx);
    setTransactions(prev => prev.map(t => (t.id === updatedTx.id ? updatedTx : t)));

    if (updatedTx.isScheduled) {
      scheduleFutureNativeNotification(updatedTx, baseCurrency);
    }
  };

  const deleteTx = async (id: string) => {
    await deleteTransaction(id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const addCategoryItem = async (catData: Omit<Category, 'id'>) => {
    const newCat: Category = {
      ...catData,
      id: `cat-${Date.now()}`
    };
    await saveCategory(newCat);
    setCategories(prev => [...prev, newCat]);
  };

  const updateCategoryItem = async (category: Category) => {
    await saveCategory(category);
    setCategories(prev => prev.map(c => (c.id === category.id ? category : c)));
  };

  const deleteCategoryItem = async (id: string) => {
    await deleteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const addTripItem = async (tripData: Omit<Trip, 'id' | 'createdAt'>) => {
    const newTrip: Trip = {
      ...tripData,
      id: `trip-${Date.now()}`,
      createdAt: Date.now()
    };
    await saveTrip(newTrip);
    setTrips(prev => [newTrip, ...prev]);
  };

  const removeTripItem = async (id: string) => {
    await deleteTrip(id);
    setTrips(prev => prev.filter(t => t.id !== id));
    if (activeTripVault?.id === id) setActiveTripVault(null);
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
    return transactions;
  }, [transactions, activeTripVault]);

  const [topmostVisibleDate, setTopmostVisibleDate] = useState<string>('');

  // Compute dynamic viewed total and label for the bottom bar based on topmostVisibleDate & period
  const { viewedPeriodTotal, viewedPeriodLabel } = useMemo(() => {
    const targetDateStr = topmostVisibleDate || new Date().toISOString().split('T')[0];
    const targetDate = new Date(targetDateStr + 'T00:00:00');

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
      const d = new Date(targetDateStr + 'T00:00:00');
      const day = d.getDay();
      const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diffToMon));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const monStr = monday.toISOString().split('T')[0];
      const sunStr = sunday.toISOString().split('T')[0];

      const tempDate = new Date(targetDate.getTime());
      tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
      const yearStart = new Date(tempDate.getFullYear(), 0, 1);
      const weekNo = Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

      const weekTxs = filteredTransactions.filter(t => t.date >= monStr && t.date <= sunStr);
      const total = weekTxs.reduce((sum, t) => {
        if (isPendingScheduledTx(t)) return sum;
        return sum + convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      }, 0);
      return { viewedPeriodTotal: total, viewedPeriodLabel: `Week ${weekNo}, ${monday.getFullYear()}` };
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
        setPeriod,
        setActiveTripVault,
        addTransaction,
        editTransaction,
        deleteTx,
        addCategoryItem,
        updateCategoryItem,
        deleteCategoryItem,
        addTripItem,
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

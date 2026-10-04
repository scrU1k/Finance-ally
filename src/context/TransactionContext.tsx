import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Transaction, CurrencyCode, PeriodType } from '../types';
import { loadTransactions, saveTransaction, deleteTransaction, loadSubscriptions } from '../services/db';
import { getStoredForexRates, fetchLiveExchangeRates, switchAppBaseCurrency, convertCurrencyAmount } from '../services/currency';
import { useAuth } from './AuthContext';
import { useTrips } from './TripContext';
import { useCategories } from './CategoryContext';
import { isPendingScheduledTx, isFutureDateTime } from '../utils/scheduledUtils';
import { getLocalDateString, getWeekDateBounds, parseLocalDate } from '../utils/dateUtils';
import { requestNotificationPermission, triggerScheduledPaymentNotification, scheduleFutureNativeNotification, cancelScheduledNotification } from '../services/notificationService';
import { runStartupSync, triggerBackgroundBackup, scheduleModelRetraining, checkAndAutoSyncForex } from '../services/financeOrchestrator';

export interface TransactionContextType {
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  period: PeriodType;
  setPeriod: (p: PeriodType) => void;
  baseCurrency: CurrencyCode;
  forexRates: Record<CurrencyCode, number>;
  switchBaseCurrency: (newCurrency: CurrencyCode, mode: 'convert' | 'keep') => Promise<void>;
  syncForexRates: () => Promise<boolean>;
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  editTransaction: (tx: Transaction) => Promise<void>;
  deleteTx: (id: string) => Promise<void>;
  reloadTransactions: () => Promise<Transaction[]>;
  scheduledToast: { id: string; note: string; amount: number; currency: CurrencyCode; transaction: Transaction } | null;
  dismissScheduledToast: () => void;
  undoScheduledActivation: (id: string) => Promise<Transaction | null>;
  periodTotalSpent: number;
  viewedPeriodTotal: number;
  viewedPeriodLabel: string;
  topmostVisibleDate: string;
  setTopmostVisibleDate: (dateStr: string) => void;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateUserCurrency } = useAuth();
  const { activeTripVault, includeTripExpensesInTimeline } = useTrips();
  const { categories, reloadCategories } = useCategories();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [forexRates, setForexRates] = useState<Record<CurrencyCode, number>>(() => getStoredForexRates());
  const [scheduledToast, setScheduledToast] = useState<{ id: string; note: string; amount: number; currency: CurrencyCode; transaction: Transaction } | null>(null);

  const baseCurrency: CurrencyCode = activeTripVault ? activeTripVault.currency : (user?.baseCurrency || 'INR');

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

  const reloadTransactions = async (): Promise<Transaction[]> => {
    try {
      const txs = await loadTransactions();
      const subs = await loadSubscriptions().catch(() => []);
      setTransactions(txs);
      runStartupSync(txs, subs, categories, baseCurrency);
      return txs;
    } catch (e) {
      console.error('Failed to load transactions:', e);
      return [];
    }
  };

  useEffect(() => {
    reloadTransactions();
  }, []);

  // Train the Local ML Inference Engine whenever transactions are loaded/updated
  useEffect(() => {
    scheduleModelRetraining(transactions);
  }, [transactions]);

  // Auto-refresh forex rates if they are too old on startup
  useEffect(() => {
    checkAndAutoSyncForex(syncForexRates);
  }, []);

  const syncForexRates = async (): Promise<boolean> => {
    try {
      const result = await fetchLiveExchangeRates();
      if (result.success) {
        setForexRates(result.rates);
      }
      return result.success;
    } catch {
      return false;
    }
  };

  // Targeted event-driven scheduler for scheduled payments (Zero 3s polling)
  useEffect(() => {
    requestNotificationPermission();

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const runScheduledCheck = () => {
      const now = Date.now();

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
        // Cap timer to at most 24 hours (86,400,000 ms) to avoid 32-bit signed int overflow in setTimeout (>24.8 days causes immediate trigger & CPU spin)
        const msUntilDue = Math.min(86400000, Math.max(1000, nextDueTime - now + 1000));
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

      triggerBackgroundBackup(transactions.length + 1);
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

  const switchBaseCurrency = async (newCurrency: CurrencyCode, mode: 'convert' | 'keep') => {
    const oldCurrency = user?.baseCurrency || 'INR';
    if (oldCurrency === newCurrency) return;

    const updatedTxs = switchAppBaseCurrency(transactions, oldCurrency, newCurrency, mode, forexRates);
    setTransactions(updatedTxs);
    updateUserCurrency(newCurrency);

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

  // Compute dynamic viewed total and label for the bottom bar and live spend charts based on topmostVisibleDate & period
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
    <TransactionContext.Provider
      value={{
        transactions,
        filteredTransactions,
        period,
        setPeriod,
        baseCurrency,
        forexRates,
        switchBaseCurrency,
        syncForexRates,
        addTransaction,
        editTransaction,
        deleteTx,
        reloadTransactions,
        scheduledToast,
        dismissScheduledToast,
        undoScheduledActivation,
        periodTotalSpent: viewedPeriodTotal,
        viewedPeriodTotal,
        viewedPeriodLabel,
        topmostVisibleDate,
        setTopmostVisibleDate,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactions = () => {
  const ctx = useContext(TransactionContext);
  if (!ctx) throw new Error('useTransactions must be used within TransactionProvider');
  return ctx;
};

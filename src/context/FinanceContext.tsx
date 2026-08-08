import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Transaction, Category, Trip, CurrencyCode, PeriodType } from '../types';
import { loadTransactions, saveTransaction, deleteTransaction, loadCategories, saveCategory, deleteCategory, loadTrips, saveTrip, deleteTrip } from '../services/db';
import { getStoredForexRates, fetchLiveExchangeRates, switchAppBaseCurrency, convertCurrencyAmount } from '../services/currency';
import { useAuth } from './AuthContext';
import { isPendingScheduledTx } from '../utils/scheduledUtils';
import { requestNotificationPermission, triggerScheduledPaymentNotification } from '../services/notificationService';

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

  // Auto-request notification permissions & background ticker for scheduled payments
  const [, setTick] = useState(0);

  useEffect(() => {
    requestNotificationPermission();

    const interval = setInterval(() => {
      // Check if any scheduled transaction has arrived at its execution date/time
      const now = new Date();
      transactions.forEach(t => {
        if (t.isScheduled || isPendingScheduledTx(t)) {
          const tDateStr = t.date;
          const tTimeStr = t.time && t.time.trim() ? t.time.trim() : '00:00';
          const targetDateTime = new Date(`${tDateStr}T${tTimeStr}:00`);

          if (!isNaN(targetDateTime.getTime()) && targetDateTime.getTime() <= now.getTime()) {
            triggerScheduledPaymentNotification(t, baseCurrency);
          }
        }
      });
      setTick(prev => prev + 1);
    }, 10000);

    return () => clearInterval(interval);
  }, [transactions, baseCurrency]);

  const addTransaction = async (txData: Omit<Transaction, 'id' | 'createdAt'>) => {
    const isFuture = isPendingScheduledTx(txData as Transaction);
    const newTx: Transaction = {
      ...txData,
      isScheduled: txData.isScheduled !== undefined ? txData.isScheduled : isFuture,
      tripId: txData.tripId || activeTripVault?.id || undefined,
      id: `tx-${Date.now()}-${crypto.randomUUID().split('-')[0]}`,
      createdAt: Date.now(),
    };
    await saveTransaction(newTx);
    setTransactions(prev => [newTx, ...prev]);
  };

  const editTransaction = async (tx: Transaction) => {
    const isFuture = isPendingScheduledTx(tx);
    const updatedTx: Transaction = {
      ...tx,
      isScheduled: tx.isScheduled !== undefined ? tx.isScheduled : isFuture,
    };
    await saveTransaction(updatedTx);
    setTransactions(prev => prev.map(t => (t.id === updatedTx.id ? updatedTx : t)));
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

  // Filter transactions by period or active foreign trip vault
  const filteredTransactions = useMemo(() => {
    if (activeTripVault) {
      return transactions.filter(t => t.tripId === activeTripVault.id);
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];

    return transactions.filter(t => {
      if (period === 'all') return true;

      if (period === 'day') {
        return t.date === todayStr;
      }
      if (period === 'week') {
        return t.date >= oneWeekAgoStr && t.date <= todayStr;
      }
      
      const txDate = new Date(t.date);
      if (period === 'month') {
        return txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
      }
      if (period === 'year') {
        return txDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [transactions, period, activeTripVault]);

  // Calculate real-time period total spent converted to current active base currency
  // EXCLUDES pending scheduled transactions until their set date/time arrives!
  const periodTotalSpent = useMemo(() => {
    return filteredTransactions.reduce((total, tx) => {
      if (isPendingScheduledTx(tx)) return total;
      const converted = convertCurrencyAmount(tx.amount, tx.currency, baseCurrency, forexRates);
      return total + converted;
    }, 0);
  }, [filteredTransactions, baseCurrency, forexRates]);

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
        periodTotalSpent,
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

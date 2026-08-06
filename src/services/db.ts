import { Category, Transaction, Trip, UserProfile, CurrencyCode } from '../types';

const DB_NAME = 'FinanceAllyDB';
const DB_VERSION = 1;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-food', name: 'Food & Drinks', color: '#ee5f1c', icon: 'Utensils', isDefault: true, budgetLimit: 500 },
  { id: 'cat-groceries', name: 'Groceries', color: '#f2b300', icon: 'ShoppingCart', isDefault: true, budgetLimit: 400 },
  { id: 'cat-transport', name: 'Transport', color: '#2b6be4', icon: 'Car', isDefault: true, budgetLimit: 250 },
  { id: 'cat-electronics', name: 'Electronics', color: '#002688', icon: 'Laptop', isDefault: true, budgetLimit: 300 },
  { id: 'cat-clothing', name: 'Clothing', color: '#009efd', icon: 'Shirt', isDefault: true, budgetLimit: 200 },
  { id: 'cat-housing', name: 'Housing & Bills', color: '#717171', icon: 'Home', isDefault: true, budgetLimit: 1200 },
  { id: 'cat-entertainment', name: 'Entertainment', color: '#ff0073', icon: 'Film', isDefault: true, budgetLimit: 150 },
  { id: 'cat-health', name: 'Health', color: '#950000', icon: 'Activity', isDefault: true, budgetLimit: 150 },
  { id: 'cat-travel', name: 'Travel & Trips', color: '#009efd', icon: 'Plane', isDefault: true, budgetLimit: 800 },
  { id: 'cat-investments', name: 'Investments', color: '#34d399', icon: 'TrendingUp', isDefault: true },
  { id: 'cat-others', name: 'Others', color: '#652d1f', icon: 'Tag', isDefault: true },
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('date', 'date', { unique: false });
        txStore.createIndex('categoryId', 'categoryId', { unique: false });
        txStore.createIndex('tripId', 'tripId', { unique: false });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('userProfile')) {
        db.createObjectStore('userProfile', { keyPath: 'username' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// LocalStorage fallback for high performance or browser restrictions
const STORAGE_KEYS = {
  TRANSACTIONS: 'fa_transactions',
  CATEGORIES: 'fa_categories',
  TRIPS: 'fa_trips',
  PROFILE: 'fa_profile',
};

export async function loadTransactions(): Promise<Transaction[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          resolve(req.result);
        } else {
          // fallback to localStorage
          const local = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
          resolve(local ? JSON.parse(local) : seedInitialTransactions());
        }
      };
      req.onerror = () => {
        const local = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        resolve(local ? JSON.parse(local) : seedInitialTransactions());
      };
    });
  } catch {
    const local = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return local ? JSON.parse(local) : seedInitialTransactions();
  }
}

export async function saveTransaction(transaction: Transaction): Promise<void> {
  const all = await loadTransactions();
  const index = all.findIndex(t => t.id === transaction.id);
  if (index >= 0) {
    all[index] = transaction;
  } else {
    all.unshift(transaction);
  }
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(all));

  try {
    const db = await openDatabase();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    store.put(transaction);
  } catch {
    // LocalStorage saved
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const all = await loadTransactions();
  const filtered = all.filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(filtered));

  try {
    const db = await openDatabase();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    store.delete(id);
  } catch {
    // LocalStorage deleted
  }
}

export async function loadCategories(): Promise<Category[]> {
  const local = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
  if (local) return JSON.parse(local);
  localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
  return DEFAULT_CATEGORIES;
}

export async function saveCategory(category: Category): Promise<void> {
  const categories = await loadCategories();
  const idx = categories.findIndex(c => c.id === category.id);
  if (idx >= 0) categories[idx] = category;
  else categories.push(category);
  localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
}

export async function loadTrips(): Promise<Trip[]> {
  const local = localStorage.getItem(STORAGE_KEYS.TRIPS);
  return local ? JSON.parse(local) : [];
}

export async function saveTrip(trip: Trip): Promise<void> {
  const trips = await loadTrips();
  const idx = trips.findIndex(t => t.id === trip.id);
  if (idx >= 0) trips[idx] = trip;
  else trips.unshift(trip);
  localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
}

export async function deleteTrip(id: string): Promise<void> {
  const trips = await loadTrips();
  const filtered = trips.filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(filtered));
}

// Seed realistic initial transactions for seamless onboarding & testing
function seedInitialTransactions(): Transaction[] {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const threeDaysAgo = new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0];
  const lastWeek = new Date(Date.now() - 86400000 * 7).toISOString().split('T')[0];

  const seeds: Transaction[] = [
    {
      id: 'tx-seed-1',
      amount: 450,
      currency: 'INR',
      categoryId: 'cat-food',
      date: today,
      time: '14:30',
      note: 'Starbucks Coffee & Sandwich via UPI',
      paymentMethod: 'UPI (PhonePe)',
      isAutoParsed: true,
      confidenceScore: 98,
      createdAt: Date.now() - 3600000
    },
    {
      id: 'tx-seed-2',
      amount: 620,
      currency: 'INR',
      categoryId: 'cat-transport',
      date: today,
      time: '09:15',
      note: 'Uber cab ride to tech hub',
      paymentMethod: 'HDFC Card',
      isAutoParsed: true,
      confidenceScore: 94,
      createdAt: Date.now() - 7200000
    },
    {
      id: 'tx-seed-3',
      amount: 1850,
      currency: 'INR',
      categoryId: 'cat-groceries',
      date: yesterday,
      time: '19:00',
      note: 'Weekly organic groceries at supermarket',
      paymentMethod: 'UPI (GPay)',
      createdAt: Date.now() - 90000000
    },
    {
      id: 'tx-seed-4',
      amount: 3499,
      currency: 'INR',
      categoryId: 'cat-clothing',
      date: threeDaysAgo,
      time: '17:20',
      note: 'ZARA summer linen shirt',
      paymentMethod: 'Credit Card',
      createdAt: Date.now() - 86400000 * 3
    },
    {
      id: 'tx-seed-5',
      amount: 2490,
      currency: 'INR',
      categoryId: 'cat-housing',
      date: lastWeek,
      time: '11:00',
      note: 'Broadband Fiber internet bill auto-debit',
      paymentMethod: 'Bank Auto-Debit',
      createdAt: Date.now() - 86400000 * 7
    }
  ];

  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(seeds));
  return seeds;
}

export function exportFullDataBackup(): string {
  const data = {
    transactions: JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || '[]'),
    categories: JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES) || '[]'),
    trips: JSON.parse(localStorage.getItem(STORAGE_KEYS.TRIPS) || '[]'),
    profile: JSON.parse(localStorage.getItem('fa_user_profile') || '{}'),
    exportTimestamp: Date.now(),
    appVersion: '1.0.0'
  };
  return JSON.stringify(data, null, 2);
}

export function importFullDataBackup(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    if (data.transactions && Array.isArray(data.transactions)) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(data.transactions));
    }
    if (data.categories && Array.isArray(data.categories)) {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data.categories));
    }
    if (data.trips && Array.isArray(data.trips)) {
      localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(data.trips));
    }
    if (data.profile && typeof data.profile === 'object') {
      localStorage.setItem('fa_user_profile', JSON.stringify(data.profile));
    }
    return true;
  } catch {
    return false;
  }
}

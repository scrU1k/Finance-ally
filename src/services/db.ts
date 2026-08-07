import { Category, Transaction, Trip, UserProfile, CurrencyCode, Subscription } from '../types';

const DB_NAME = 'FinanceAllyDB';
const DB_VERSION = 3; // Incremented for subscriptions store

export interface SmsTemplate {
  id: string;
  name: string; // e.g. "HDFC Custom Alert"
  pattern: string; // e.g. "Debited INR {AMOUNT} at {MERCHANT} on {DATE}"
  createdAt: number;
}

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
      if (!db.objectStoreNames.contains('smsTemplates')) {
        db.createObjectStore('smsTemplates', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('subscriptions')) {
        db.createObjectStore('subscriptions', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── TRANSACTIONS (IndexedDB Primary, Async Operations) ─────────────────────────

export async function loadTransactions(): Promise<Transaction[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
        } else {
          // Check for legacy localStorage data or seed initial
          const legacy = localStorage.getItem('fa_transactions');
          const seeds = legacy ? JSON.parse(legacy) : seedInitialTransactions();
          // Populate IndexedDB asynchronously
          seedIndexedDBTransactions(db, seeds);
          resolve(seeds);
        }
      };
      req.onerror = () => resolve(seedInitialTransactions());
    });
  } catch {
    const local = localStorage.getItem('fa_transactions');
    return local ? JSON.parse(local) : seedInitialTransactions();
  }
}

async function seedIndexedDBTransactions(db: IDBDatabase, txs: Transaction[]): Promise<void> {
  try {
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    txs.forEach(t => store.put(t));
  } catch {
    // Non-blocking fallback
  }
}

export async function saveTransaction(transaction: Transaction): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    await new Promise<void>((resolve, reject) => {
      const req = store.put(transaction);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('IndexedDB saveTransaction failed:', e);
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('IndexedDB deleteTransaction failed:', e);
  }
}

// ─── CATEGORIES ────────────────────────────────────────────────────────────────

export async function loadCategories(): Promise<Category[]> {
  let categories: Category[] = [];
  try {
    const db = await openDatabase();
    categories = await new Promise<Category[]>((resolve) => {
      const tx = db.transaction('categories', 'readonly');
      const store = tx.objectStore('categories');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    const local = localStorage.getItem('fa_categories');
    categories = local ? JSON.parse(local) : [];
  }

  // Merge default categories
  let modified = false;
  DEFAULT_CATEGORIES.forEach(def => {
    const existingIdx = categories.findIndex(c => c.id === def.id);
    if (existingIdx >= 0) {
      categories[existingIdx] = { ...categories[existingIdx], color: def.color, name: def.name };
    } else {
      categories.push(def);
      modified = true;
    }
  });

  if (modified) {
    try {
      const db = await openDatabase();
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      categories.forEach(c => store.put(c));
    } catch {
      // Fallback
    }
  }

  return categories;
}

export async function saveCategory(category: Category): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    store.put(category);
  } catch (e) {
    console.error('IndexedDB saveCategory failed:', e);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    store.delete(id);
  } catch (e) {
    console.error('IndexedDB deleteCategory failed:', e);
  }
}

// ─── TRIPS ─────────────────────────────────────────────────────────────────────

export async function loadTrips(): Promise<Trip[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('trips', 'readonly');
      const store = tx.objectStore('trips');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    const local = localStorage.getItem('fa_trips');
    return local ? JSON.parse(local) : [];
  }
}

export async function saveTrip(trip: Trip): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('trips', 'readwrite');
    const store = tx.objectStore('trips');
    store.put(trip);
  } catch (e) {
    console.error('IndexedDB saveTrip failed:', e);
  }
}

export async function deleteTrip(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('trips', 'readwrite');
    const store = tx.objectStore('trips');
    store.delete(id);
  } catch (e) {
    console.error('IndexedDB deleteTrip failed:', e);
  }
}

// ─── SMS TEMPLATES (Dynamic Pattern Rules) ──────────────────────────────────────

export async function loadSmsTemplates(): Promise<SmsTemplate[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('smsTemplates', 'readonly');
      const store = tx.objectStore('smsTemplates');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveSmsTemplate(template: SmsTemplate): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('smsTemplates', 'readwrite');
    const store = tx.objectStore('smsTemplates');
    store.put(template);
  } catch (e) {
    console.error('IndexedDB saveSmsTemplate failed:', e);
  }
}

export async function deleteSmsTemplate(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('smsTemplates', 'readwrite');
    const store = tx.objectStore('smsTemplates');
    store.delete(id);
  } catch (e) {
    console.error('IndexedDB deleteSmsTemplate failed:', e);
  }
}

// ─── RECURRING SUBSCRIPTIONS ───────────────────────────────────────────────────

export async function loadSubscriptions(): Promise<Subscription[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('subscriptions', 'readonly');
      const store = tx.objectStore('subscriptions');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveSubscription(sub: Subscription): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('subscriptions', 'readwrite');
    const store = tx.objectStore('subscriptions');
    store.put(sub);
  } catch (e) {
    console.error('IndexedDB saveSubscription failed:', e);
  }
}

export async function deleteSubscription(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('subscriptions', 'readwrite');
    const store = tx.objectStore('subscriptions');
    store.delete(id);
  } catch (e) {
    console.error('IndexedDB deleteSubscription failed:', e);
  }
}

// ─── SEED INITIAL DATA ─────────────────────────────────────────────────────────

function seedInitialTransactions(): Transaction[] {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const threeDaysAgo = new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0];
  const lastWeek = new Date(Date.now() - 86400000 * 7).toISOString().split('T')[0];

  return [
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
}

// ─── FULL BACKUP EXPORT & IMPORT (Async IndexedDB Read/Write) ──────────────────

export async function exportFullDataBackup(): Promise<string> {
  const transactions = await loadTransactions();
  const categories = await loadCategories();
  const trips = await loadTrips();
  const smsTemplates = await loadSmsTemplates();
  const subscriptions = await loadSubscriptions();
  
  let profile = {};
  try {
    const db = await openDatabase();
    profile = await new Promise((resolve) => {
      const tx = db.transaction('userProfile', 'readonly');
      const store = tx.objectStore('userProfile');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result?.[0] || {});
      req.onerror = () => resolve({});
    });
  } catch {
    profile = JSON.parse(localStorage.getItem('fa_user_profile') || '{}');
  }

  const data = {
    transactions,
    categories,
    trips,
    smsTemplates,
    subscriptions,
    profile,
    exportTimestamp: Date.now(),
    appVersion: '1.2.0'
  };
  return JSON.stringify(data, null, 2);
}

export async function importFullDataBackup(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') return false;

    const db = await openDatabase();

    if (data.transactions && Array.isArray(data.transactions)) {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      store.clear();
      data.transactions.forEach((t: Transaction) => {
        if (t.id && typeof t.amount === 'number' && t.date) {
          store.put({
            ...t,
            note: String(t.note || '').substring(0, 500),
          });
        }
      });
      localStorage.setItem('fa_transactions', JSON.stringify(data.transactions));
    }
    if (data.categories && Array.isArray(data.categories)) {
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      store.clear();
      data.categories.forEach((c: Category) => {
        if (c.id && c.name) store.put(c);
      });
      localStorage.setItem('fa_categories', JSON.stringify(data.categories));
    }
    if (data.trips && Array.isArray(data.trips)) {
      const tx = db.transaction('trips', 'readwrite');
      const store = tx.objectStore('trips');
      store.clear();
      data.trips.forEach((t: Trip) => store.put(t));
      localStorage.setItem('fa_trips', JSON.stringify(data.trips));
    }
    if (data.smsTemplates && Array.isArray(data.smsTemplates)) {
      const tx = db.transaction('smsTemplates', 'readwrite');
      const store = tx.objectStore('smsTemplates');
      store.clear();
      data.smsTemplates.forEach((st: SmsTemplate) => store.put(st));
    }
    if (data.subscriptions && Array.isArray(data.subscriptions)) {
      const tx = db.transaction('subscriptions', 'readwrite');
      const store = tx.objectStore('subscriptions');
      store.clear();
      data.subscriptions.forEach((sub: Subscription) => store.put(sub));
    }
    if (data.profile && typeof data.profile === 'object' && data.profile.username) {
      const tx = db.transaction('userProfile', 'readwrite');
      const store = tx.objectStore('userProfile');
      store.put(data.profile);
      localStorage.setItem('fa_user_profile', JSON.stringify(data.profile));
    }
    return true;
  } catch (err) {
    console.error('Failed to import backup:', err);
    return false;
  }
}

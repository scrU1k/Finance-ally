import { Category, Transaction, Trip, Subscription, PeriodNote } from '../types';
import { loadUserRulesIntoTrie } from './userRuleService';
import { syncRulesToWorker } from '../workers/workerOrchestrator';

const DB_NAME = 'FinanceAllyDB';
const DB_VERSION = 3; // Incremented for subscriptions store

export interface SmsTemplate {
  id: string;
  name: string; // e.g. "HDFC Custom Alert"
  pattern: string; // e.g. "Debited INR {AMOUNT} at {MERCHANT} on {DATE}"
  createdAt: number;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-food', name: 'Food & Drinks', color: '#ee5f1c', icon: 'Utensils', isDefault: true },
  { id: 'cat-groceries', name: 'Groceries', color: '#f2b300', icon: 'ShoppingCart', isDefault: true },
  { id: 'cat-transport', name: 'Transport', color: '#2b6be4', icon: 'Car', isDefault: true },
  { id: 'cat-electronics', name: 'Electronics', color: '#002688', icon: 'Laptop', isDefault: true },
  { id: 'cat-clothing', name: 'Clothing', color: '#009efd', icon: 'Shirt', isDefault: true },
  { id: 'cat-housing', name: 'Housing & Bills', color: '#717171', icon: 'Home', isDefault: true },
  { id: 'cat-entertainment', name: 'Entertainment', color: '#ff0073', icon: 'Film', isDefault: true },
  { id: 'cat-health', name: 'Health', color: '#950000', icon: 'Activity', isDefault: true },
  { id: 'cat-travel', name: 'Travel & Trips', color: '#009efd', icon: 'Plane', isDefault: true },
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
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      store.put(category);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('IndexedDB saveCategory failed:', e);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trips', 'readwrite');
      const store = tx.objectStore('trips');
      store.put(trip);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('IndexedDB saveTrip failed:', e);
  }
}

export async function deleteTrip(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('trips', 'readwrite');
      const store = tx.objectStore('trips');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('smsTemplates', 'readwrite');
      const store = tx.objectStore('smsTemplates');
      store.put(template);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('IndexedDB saveSmsTemplate failed:', e);
  }
}

export async function deleteSmsTemplate(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('smsTemplates', 'readwrite');
      const store = tx.objectStore('smsTemplates');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      const store = tx.objectStore('subscriptions');
      store.put(sub);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('IndexedDB saveSubscription failed:', e);
  }
}

export async function deleteSubscription(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('subscriptions', 'readwrite');
      const store = tx.objectStore('subscriptions');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('IndexedDB deleteSubscription failed:', e);
  }
}

// ─── SEED INITIAL DATA ─────────────────────────────────────────────────────────

function seedInitialTransactions(): Transaction[] {
  return [];
}

// ─── FULL BACKUP EXPORT & IMPORT (Async IndexedDB Read/Write) ──────────────────

export async function exportFullDataBackup(): Promise<string> {
  const transactions = await loadTransactions();
  const categories = await loadCategories();
  const trips = await loadTrips();
  const smsTemplates = await loadSmsTemplates();
  const subscriptions = await loadSubscriptions();
  const periodNotes = await loadPeriodNotes();
  
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
    periodNotes,
    profile,
    exportPin: localStorage.getItem('fa_export_pin') || null,
    userTagRules: JSON.parse(localStorage.getItem('fa_user_tag_rules') || '[]'),
    customKnowledgeRules: JSON.parse(localStorage.getItem('fa_custom_knowledge_rules') || '[]'),
    passwordVaultItems: JSON.parse(localStorage.getItem('fa_password_vault_items') || '[]'),
    passwordVaultVerifier: localStorage.getItem('fa_pwd_vault_verifier') || null,
    exportTimestamp: Date.now(),
    appVersion: '2.2.0'
  };
  return JSON.stringify(data, null, 2);
}

export async function importFullDataBackup(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') return false;

    const db = await openDatabase();

    // 1. Transactions Store
    if (data.transactions && Array.isArray(data.transactions)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        store.clear();
        data.transactions.forEach((t: Transaction) => {
          if (t.id && typeof t.amount === 'number' && t.amount > 0 && t.date) {
            store.put({
              ...t,
              note: String(t.note || '').substring(0, 500),
            });
          }
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('fa_transactions', JSON.stringify(data.transactions));
    }

    if (data.userTagRules && Array.isArray(data.userTagRules)) {
      localStorage.setItem('fa_user_tag_rules', JSON.stringify(data.userTagRules));
      try {
        loadUserRulesIntoTrie();
        syncRulesToWorker(data.userTagRules);
      } catch (e) {
        console.warn('Rules trie sync failed on import:', e);
      }
    }

    if (data.customKnowledgeRules && Array.isArray(data.customKnowledgeRules)) {
      localStorage.setItem('fa_custom_knowledge_rules', JSON.stringify(data.customKnowledgeRules));
    }

    if (data.passwordVaultItems && Array.isArray(data.passwordVaultItems)) {
      localStorage.setItem('fa_password_vault_items', JSON.stringify(data.passwordVaultItems));
    }

    if (data.passwordVaultVerifier && typeof data.passwordVaultVerifier === 'string') {
      localStorage.setItem('fa_pwd_vault_verifier', data.passwordVaultVerifier);
    }

    // 2. Categories Store
    if (data.categories && Array.isArray(data.categories)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('categories', 'readwrite');
        const store = tx.objectStore('categories');
        store.clear();
        data.categories.forEach((c: Category) => {
          if (c.id && c.name) store.put(c);
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('fa_categories', JSON.stringify(data.categories));
    }

    // 3. Trips Store
    if (data.trips && Array.isArray(data.trips)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('trips', 'readwrite');
        const store = tx.objectStore('trips');
        store.clear();
        data.trips.forEach((t: Trip) => store.put(t));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('fa_trips', JSON.stringify(data.trips));
    }

    // 4. SMS Templates Store
    if (data.smsTemplates && Array.isArray(data.smsTemplates)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('smsTemplates', 'readwrite');
        const store = tx.objectStore('smsTemplates');
        store.clear();
        data.smsTemplates.forEach((st: SmsTemplate) => store.put(st));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // 5. Subscriptions Store
    if (data.subscriptions && Array.isArray(data.subscriptions)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('subscriptions', 'readwrite');
        const store = tx.objectStore('subscriptions');
        store.clear();
        data.subscriptions.forEach((sub: Subscription) => store.put(sub));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // 6. Period Notes Store
    if (data.periodNotes && Array.isArray(data.periodNotes)) {
      localStorage.setItem('fa_period_notes', JSON.stringify(data.periodNotes));
    }

    // 7. User Profile Store
    if (data.profile && typeof data.profile === 'object' && data.profile.username) {
      // Force isUnlocked:false so the lock screen is shown after reload
      const restoredProfile = { ...data.profile, isUnlocked: false };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('userProfile', 'readwrite');
        const store = tx.objectStore('userProfile');
        store.put(restoredProfile);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('fa_user_profile', JSON.stringify(restoredProfile));
    }

    // 8. Export PIN (snapshot/backup encryption PIN)
    if (data.exportPin && typeof data.exportPin === 'string') {
      localStorage.setItem('fa_export_pin', data.exportPin);
    }

    return true;
  } catch (err) {
    console.error('Failed to import backup:', err);
    return false;
  }
}

// ─── PERIOD NOTES API ─────────────────────────────────────────────────────────

export async function loadPeriodNotes(): Promise<PeriodNote[]> {
  try {
    const raw = localStorage.getItem('fa_period_notes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function savePeriodNote(note: PeriodNote): Promise<void> {
  try {
    const notes = await loadPeriodNotes();
    const existingIndex = notes.findIndex(n => n.periodKey === note.periodKey);
    if (existingIndex >= 0) {
      notes[existingIndex] = note;
    } else {
      notes.push(note);
    }
    localStorage.setItem('fa_period_notes', JSON.stringify(notes));
  } catch (e) {
    console.error('Failed to save period note:', e);
  }
}

export async function deletePeriodNote(periodKey: string): Promise<void> {
  try {
    const notes = await loadPeriodNotes();
    const filtered = notes.filter(n => n.periodKey !== periodKey);
    localStorage.setItem('fa_period_notes', JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete period note:', e);
  }
}

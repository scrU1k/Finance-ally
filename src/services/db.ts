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

export function openDatabase(): Promise<IDBDatabase> {
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
    throw e;
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
    throw e;
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
    throw e;
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
    throw e;
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
    throw e;
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
    throw e;
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
    throw e;
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
    throw e;
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
  
  let profile: any = {};
  try {
    const raw = localStorage.getItem('fa_user_profile');
    if (raw) {
      profile = JSON.parse(raw);
    } else {
      const db = await openDatabase();
      profile = await new Promise((resolve) => {
        const tx = db.transaction('userProfile', 'readonly');
        const store = tx.objectStore('userProfile');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result?.[0] || {});
        req.onerror = () => resolve({});
      });
    }
  } catch {
    profile = {};
  }

  // Password Vault Envelope & Items
  let passwordVaultEnvelope: any = null;
  let passwordVaultItems: any[] = [];
  try {
    const rawEnv = localStorage.getItem('fa_password_vault_envelope');
    if (rawEnv) {
      passwordVaultEnvelope = JSON.parse(rawEnv);
      passwordVaultItems = passwordVaultEnvelope.items || [];
    } else {
      passwordVaultItems = JSON.parse(localStorage.getItem('fa_password_vault_items') || '[]');
      if (passwordVaultItems.length > 0) {
        passwordVaultEnvelope = { version: '2.2', checksum: 'uncalculated', items: passwordVaultItems };
      }
    }
  } catch {
    passwordVaultItems = [];
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
    passwordVaultItems,
    passwordVaultEnvelope,
    passwordVaultVerifier: localStorage.getItem('fa_pwd_vault_verifier') || null,
    globalRecoveryVerifier: localStorage.getItem('fa_global_recovery_verifier') || null,
    pwdVaultRecoveryEscrow: localStorage.getItem('fa_pwd_vault_recovery_escrow') || null,
    exportTimestamp: Date.now(),
    appVersion: '3.0.0'
  };
  return JSON.stringify(data, null, 2);
}

const IMPORT_JOURNAL_DB_NAME = 'FinanceAlly_Import_Journal';

async function openImportJournalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMPORT_JOURNAL_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('journal')) {
        db.createObjectStore('journal', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearImportJournal(): Promise<void> {
  try {
    const jDb = await openImportJournalDatabase();
    await new Promise<void>((resolve) => {
      const tx = jDb.transaction('journal', 'readwrite');
      tx.objectStore('journal').delete('active_import');
      tx.oncomplete = () => { jDb.close(); resolve(); };
      tx.onerror = () => { jDb.close(); resolve(); };
    });
  } catch {}
}

export async function checkAndRecoverStaleImportJournal(): Promise<boolean> {
  try {
    const jDb = await openImportJournalDatabase();
    const entry = await new Promise<any>((resolve) => {
      const tx = jDb.transaction('journal', 'readonly');
      const req = tx.objectStore('journal').get('active_import');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (!entry || entry.state !== 'in_progress') {
      jDb.close();
      return false;
    }

    console.warn('[Import Crash Guard] Interrupted import detected on startup. Performing rollback to pre-import snapshot...');

    // 1. Roll back localStorage
    if (entry.previousLocalStorage) {
      for (const [key, val] of Object.entries(entry.previousLocalStorage)) {
        if (val !== null && typeof val === 'string') {
          localStorage.setItem(key, val);
        } else {
          localStorage.removeItem(key);
        }
      }
    }

    // 2. Roll back IndexedDB stores
    if (entry.existingDbBackup) {
      const mainDb = await openDatabase();
      const storesToLock = ['transactions', 'categories', 'trips', 'smsTemplates', 'subscriptions', 'userProfile'];
      await new Promise<void>((resolve) => {
        const tx = mainDb.transaction(storesToLock, 'readwrite');
        for (const storeName of storesToLock) {
          const s = tx.objectStore(storeName);
          s.clear();
          const items = entry.existingDbBackup[storeName] || [];
          items.forEach((item: any) => s.put(item));
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      mainDb.close();
    }

    // Clear journal once restored
    const cTx = jDb.transaction('journal', 'readwrite');
    cTx.objectStore('journal').delete('active_import');
    await new Promise<void>((resolve) => {
      cTx.oncomplete = () => resolve();
      cTx.onerror = () => resolve();
    });
    jDb.close();

    console.info('[Import Crash Guard] Rollback complete. App restored to pre-import consistent state.');
    return true;
  } catch (err) {
    console.error('[Import Crash Guard] Failed to recover stale import journal:', err);
    return false;
  }
}

// Check and recover interrupted import on startup
try {
  checkAndRecoverStaleImportJournal().catch(() => {});
} catch {}

export interface ImportBackupResult {
  success: boolean;
  droppedTransactions: number;
  storageError: boolean;
  errorMessage?: string;
}

export async function importFullDataBackup(jsonString: string): Promise<ImportBackupResult> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid backup JSON payload' };
    }

    // Strict schema & type validation before mutating any storage
    if (data.transactions && !Array.isArray(data.transactions)) {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid transactions array format' };
    }
    if (data.categories && !Array.isArray(data.categories)) {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid categories array format' };
    }
    if (data.trips && !Array.isArray(data.trips)) {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid trips array format' };
    }
    if (data.subscriptions && !Array.isArray(data.subscriptions)) {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid subscriptions array format' };
    }
    if (data.smsTemplates && !Array.isArray(data.smsTemplates)) {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid smsTemplates array format' };
    }
    if (data.periodNotes && !Array.isArray(data.periodNotes)) {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid periodNotes array format' };
    }
    if (data.profile && typeof data.profile !== 'object') {
      return { success: false, droppedTransactions: 0, storageError: false, errorMessage: 'Invalid profile object format' };
    }

    const db = await openDatabase();
    const storesToLock = ['transactions', 'categories', 'trips', 'smsTemplates', 'subscriptions', 'userProfile'];

    // --- Phase 0: Take strict snapshot of existing state for atomic rollback ---
    const keysToProtect = [
      'fa_transactions', 'fa_categories', 'fa_trips', 'fa_period_notes', 'fa_user_profile',
      'fa_export_pin', 'fa_user_tag_rules', 'fa_custom_knowledge_rules',
      'fa_password_vault_envelope', 'fa_password_vault_items',
      'fa_pwd_vault_verifier', 'fa_global_recovery_verifier', 'fa_pwd_vault_recovery_escrow'
    ];
    const previousLocalStorage: Record<string, string | null> = {};
    for (const key of keysToProtect) {
      previousLocalStorage[key] = localStorage.getItem(key);
    }

    const existingDbBackup: Record<string, any[]> = {};
    for (const storeName of storesToLock) {
      try {
        existingDbBackup[storeName] = await new Promise<any[]>((resolve, reject) => {
          const rTx = db.transaction(storeName, 'readonly');
          rTx.onerror = () => reject(rTx.error || new Error(`Transaction error reading ${storeName}`));
          const rStore = rTx.objectStore(storeName);
          const req = rStore.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error || new Error(`Failed to read store ${storeName}`));
        });
      } catch (readErr) {
        console.error(`Pre-import snapshot failed for store ${storeName}:`, readErr);
        return {
          success: false,
          droppedTransactions: 0,
          storageError: false,
          errorMessage: `Pre-import snapshot failed for store "${storeName}". Existing database unchanged.`
        };
      }
    }

    // Persist durable crash-safe rollback journal to IndexedDB before modifying any live state
    try {
      const jDb = await openImportJournalDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = jDb.transaction('journal', 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => { jDb.close(); resolve(); };
        tx.objectStore('journal').put({
          id: 'active_import',
          state: 'in_progress',
          timestamp: Date.now(),
          previousLocalStorage,
          existingDbBackup
        });
      });
    } catch (jErr) {
      console.error('Failed to write durable import journal, aborting import for safety:', jErr);
      return {
        success: false,
        droppedTransactions: 0,
        storageError: false,
        errorMessage: 'Unable to establish crash-safe rollback journal. Import aborted to prevent data loss.'
      };
    }

    const rollbackAll = async () => {
      // Revert localStorage
      for (const [key, val] of Object.entries(previousLocalStorage)) {
        if (val !== null) localStorage.setItem(key, val);
        else localStorage.removeItem(key);
      }
      // Revert IndexedDB
      try {
        const rbTx = db.transaction(storesToLock, 'readwrite');
        for (const storeName of storesToLock) {
          const s = rbTx.objectStore(storeName);
          s.clear();
          (existingDbBackup[storeName] || []).forEach(item => s.put(item));
        }
        await new Promise<void>((resolve) => {
          rbTx.oncomplete = () => resolve();
          rbTx.onerror = () => resolve();
        });
      } catch (rbErr) {
        console.error('IndexedDB rollback failed:', rbErr);
      }
      await clearImportJournal();
    };

    // Filter valid transactions
    const validTransactions: Transaction[] = [];
    if (data.transactions && Array.isArray(data.transactions)) {
      data.transactions.forEach((t: Transaction) => {
        if (t && t.id && typeof t.amount === 'number' && t.amount > 0 && t.date) {
          validTransactions.push({
            ...t,
            note: String(t.note || '').substring(0, 500),
          });
        }
      });
    }
    const droppedTransactions = Array.isArray(data.transactions)
      ? Math.max(0, data.transactions.length - validTransactions.length)
      : 0;

    // --- Phase 1: Write and verify required localStorage metadata and credentials ---
    try {
      if (data.categories && Array.isArray(data.categories)) {
        localStorage.setItem('fa_categories', JSON.stringify(data.categories));
      }
      if (data.trips && Array.isArray(data.trips)) {
        localStorage.setItem('fa_trips', JSON.stringify(data.trips));
      }
      if (data.periodNotes && Array.isArray(data.periodNotes)) {
        localStorage.setItem('fa_period_notes', JSON.stringify(data.periodNotes));
      }
      if (data.profile && typeof data.profile === 'object' && data.profile.username) {
        const restoredProfile = { ...data.profile, isUnlocked: false };
        localStorage.setItem('fa_user_profile', JSON.stringify(restoredProfile));
      }
      if (data.exportPin && typeof data.exportPin === 'string') {
        localStorage.setItem('fa_export_pin', data.exportPin);
      }
      if (data.userTagRules && Array.isArray(data.userTagRules)) {
        localStorage.setItem('fa_user_tag_rules', JSON.stringify(data.userTagRules));
      }
      if (data.customKnowledgeRules && Array.isArray(data.customKnowledgeRules)) {
        localStorage.setItem('fa_custom_knowledge_rules', JSON.stringify(data.customKnowledgeRules));
      }

      // Reconcile Password Vault Envelope & Items
      if (data.passwordVaultEnvelope && typeof data.passwordVaultEnvelope === 'object') {
        localStorage.setItem('fa_password_vault_envelope', JSON.stringify(data.passwordVaultEnvelope));
        if (data.passwordVaultEnvelope.items && Array.isArray(data.passwordVaultEnvelope.items)) {
          localStorage.setItem('fa_password_vault_items', JSON.stringify(data.passwordVaultEnvelope.items));
        }
      } else if (data.passwordVaultItems && Array.isArray(data.passwordVaultItems)) {
        localStorage.setItem('fa_password_vault_items', JSON.stringify(data.passwordVaultItems));
        const fallbackEnvelope = {
          version: '2.2',
          checksum: 'uncalculated',
          items: data.passwordVaultItems
        };
        localStorage.setItem('fa_password_vault_envelope', JSON.stringify(fallbackEnvelope));
      }

      if (data.passwordVaultVerifier && typeof data.passwordVaultVerifier === 'string') {
        localStorage.setItem('fa_pwd_vault_verifier', data.passwordVaultVerifier);
      }
      if (data.globalRecoveryVerifier && typeof data.globalRecoveryVerifier === 'string') {
        localStorage.setItem('fa_global_recovery_verifier', data.globalRecoveryVerifier);
      }
      if (data.pwdVaultRecoveryEscrow && typeof data.pwdVaultRecoveryEscrow === 'string') {
        localStorage.setItem('fa_pwd_vault_recovery_escrow', data.pwdVaultRecoveryEscrow);
      }
    } catch (storageErr) {
      console.error('LocalStorage write failed during backup import, rolling back:', storageErr);
      await rollbackAll();
      return {
        success: false,
        droppedTransactions: 0,
        storageError: true,
        errorMessage: 'Storage quota exceeded while writing profile or security credentials. Import aborted and existing database safely preserved.'
      };
    }

    // --- Phase 2: Atomic IndexedDB Transaction ---
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storesToLock, 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => resolve();

        // 1. Transactions Store
        const txStore = tx.objectStore('transactions');
        txStore.clear();
        validTransactions.forEach(t => txStore.put(t));

        // 2. Categories Store
        if (data.categories && Array.isArray(data.categories)) {
          const store = tx.objectStore('categories');
          store.clear();
          data.categories.forEach((c: Category) => {
            if (c.id && c.name) store.put(c);
          });
        }

        // 3. Trips Store
        if (data.trips && Array.isArray(data.trips)) {
          const store = tx.objectStore('trips');
          store.clear();
          data.trips.forEach((t: Trip) => {
            if (t.id && t.name) store.put(t);
          });
        }

        // 4. SMS Templates Store
        if (data.smsTemplates && Array.isArray(data.smsTemplates)) {
          const store = tx.objectStore('smsTemplates');
          store.clear();
          data.smsTemplates.forEach((st: SmsTemplate) => {
            if (st.id && st.name) store.put(st);
          });
        }

        // 5. Subscriptions Store
        if (data.subscriptions && Array.isArray(data.subscriptions)) {
          const store = tx.objectStore('subscriptions');
          store.clear();
          data.subscriptions.forEach((sub: Subscription) => {
            if (sub.id && sub.name) store.put(sub);
          });
        }

        // 6. User Profile Store
        if (data.profile && typeof data.profile === 'object' && data.profile.username) {
          const restoredProfile = { ...data.profile, isUnlocked: false };
          const store = tx.objectStore('userProfile');
          store.clear();
          store.put(restoredProfile);
        }
      });
    } catch (idbErr) {
      console.error('IndexedDB transaction failed during backup import, rolling back:', idbErr);
      await rollbackAll();
      return {
        success: false,
        droppedTransactions: 0,
        storageError: false,
        errorMessage: 'Database write error. Import aborted and existing state safely restored.'
      };
    }

    // --- Phase 3: Legacy transaction mirror update (non-blocking fallback) ---
    try {
      if (data.transactions && Array.isArray(data.transactions)) {
        localStorage.setItem('fa_transactions', JSON.stringify(validTransactions));
      }
    } catch {
      // If transactions mirror exceeds localStorage 5MB quota, clear mirror key so stale data isn't loaded
      // (IndexedDB is already the authoritative store with all validTransactions)
      try {
        localStorage.removeItem('fa_transactions');
      } catch {}
    }

    // Sync NLP rules trie
    if (data.userTagRules && Array.isArray(data.userTagRules)) {
      try {
        loadUserRulesIntoTrie();
        syncRulesToWorker(data.userTagRules);
      } catch (e) {
        console.warn('Rules trie sync failed on import:', e);
      }
    }

    // Success: Disarm and clear durable crash journal
    await clearImportJournal();

    return {
      success: true,
      droppedTransactions,
      storageError: false
    };
  } catch (err: any) {
    console.error('Failed to import backup atomically:', err);
    await clearImportJournal();
    return {
      success: false,
      droppedTransactions: 0,
      storageError: false,
      errorMessage: err?.message || 'Database import error'
    };
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

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CAD' | 'AUD' | 'CHF' | 'CNY' | 'SGD';

/** One of three scored audit dimensions shown when baseline (≥3 months) exists */
export interface AuditDimensionScore {
  score: number;                               // 0–100
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  detail: string;                              // Human-readable one-liner
}

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
  rateToBaseUSD: number; // exchange rate relative to USD base
}

export type PeriodType = 'day' | 'week' | 'month' | 'year' | 'all';
export type TimelineViewMode = 'compact' | 'list' | 'grid';

export interface Category {
  id: string;
  name: string;
  color: string; // Hex or HSL token
  icon: string; // Lucide icon name or emoji
  isDefault?: boolean;
  budgetLimit?: number;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: CurrencyCode;
  originalAmount?: number;
  originalCurrency?: CurrencyCode;
  categoryId: string;
  customCategoryName?: string; // Independent custom tag name for Others category
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  note: string;
  paymentMethod?: string;
  tripId?: string; // Optional foreign trip tag
  isAutoParsed?: boolean;
  confidenceScore?: number; // Arctic-embed categorization score (0-100)
  isScheduled?: boolean; // Future scheduled payment designation
  scheduledAt?: string; // ISO timestamp or YYYY-MM-DDTHH:mm for scheduled notification
  createdAt: number;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: CurrencyCode;
  color: string;
  coverImage?: string;
  isVaultWindowActive?: boolean;
  createdAt: number;
}

export interface UserProfile {
  username: string;
  passwordHash: string; // PBKDF2 derived hash (Base64)
  passwordSalt?: string; // Unique random salt for PBKDF2 (Base64)
  baseCurrency: CurrencyCode;
  theme: 'dotgui-dark' | 'dotgui-light' | 'cyberpunk' | 'emerald' | 'sunset' | 'system';
  fontFamily: 'geist' | 'inter' | 'mono' | 'outfit' | 'space';
  emailForReport?: string;
  reportFrequency?: 'weekly' | 'monthly' | 'annually' | 'none';
  monthlyBudget?: number;
  requirePassword?: boolean; // If false, skips lock screen on startup
  isUnlocked: boolean;
}

export interface ParsedNotification {
  rawText: string;
  amount: number | null;
  currency: CurrencyCode;
  merchant: string;
  date: string;
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  confidence: number;
  referenceId?: string;
}

export interface SplitMember {
  id: string;
  name: string;
  amount: number;
  isPaid: boolean;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  billingCycle: 'monthly' | 'bi-monthly' | 'tri-monthly' | 'annually';
  nextDueDate: string; // YYYY-MM-DD
  lastProcessedDate?: string; // YYYY-MM-DD
  categoryId: string;
  paymentMethod: string;
  autoLog: boolean;
  createdAt: number;
}

export interface EndOfMonthAuditReport {
  monthKey: string; // YYYY-MM
  totalSpent: number;
  currencySymbol: string;
  transactionCount: number;
  highestSpendDay: { date: string; amount: number };
  topCategories: { categoryId: string; categoryName: string; color: string; amount: number; percentage: number }[];

  /** True when the user has ≥3 distinct calendar months of transaction data */
  hasBaseline: boolean;
  /** Count of distinct calendar months that have at least one transaction */
  monthsOfData: number;

  /**
   * Two-dimension scores — null when hasBaseline is false.
   * Scores are always percentage-based against the user's own history;
   * they are fully currency-agnostic.
   */
  volatilityScore: AuditDimensionScore | null;
  savingsPressureScore: AuditDimensionScore | null;

  /**
   * Computed from the average of the three dimension scores when hasBaseline is true.
   * 'O' = Uninitialized — fewer than 3 months of data; no grade yet.
   */
  budgetHealthScore: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'O';
  keyInsights: string[];
  anomalies: string[];
}

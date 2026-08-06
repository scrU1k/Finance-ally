export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CAD' | 'AUD' | 'CHF' | 'CNY' | 'SGD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
  rateToBaseUSD: number; // exchange rate relative to USD base
}

export type PeriodType = 'day' | 'week' | 'month' | 'year' | 'all';

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
  passwordHash: string; // Salted local SHA-256 hash
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

export interface EndOfMonthAuditReport {
  monthKey: string; // YYYY-MM
  totalSpent: number;
  currencySymbol: string;
  transactionCount: number;
  highestSpendDay: { date: string; amount: number };
  topCategories: { categoryId: string; categoryName: string; color: string; amount: number; percentage: number }[];
  budgetHealthScore: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  keyInsights: string[];
  anomalies: string[];
}

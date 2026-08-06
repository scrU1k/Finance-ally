import { CurrencyCode, CurrencyConfig, Transaction } from '../types';

export const TOP_CURRENCIES: CurrencyConfig[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', rateToBaseUSD: 1.0 },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', rateToBaseUSD: 0.92 },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', rateToBaseUSD: 0.79 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', rateToBaseUSD: 83.5 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', rateToBaseUSD: 155.2 },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦', rateToBaseUSD: 1.37 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', rateToBaseUSD: 1.52 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', flag: '🇨🇭', rateToBaseUSD: 0.90 },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan', flag: '🇨🇳', rateToBaseUSD: 7.24 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', rateToBaseUSD: 1.35 },
];

const LOCAL_RATES_KEY = 'finance_ally_forex_rates';

export function getStoredForexRates(): Record<CurrencyCode, number> {
  const cached = localStorage.getItem(LOCAL_RATES_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // fallback
    }
  }
  const defaultRates: Partial<Record<CurrencyCode, number>> = {};
  TOP_CURRENCIES.forEach(c => {
    defaultRates[c.code] = c.rateToBaseUSD;
  });
  return defaultRates as Record<CurrencyCode, number>;
}

export async function fetchLiveExchangeRates(): Promise<{ success: boolean; rates: Record<CurrencyCode, number>; timestamp: number }> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('API failed');
    const data = await res.json();
    if (data && data.rates) {
      const updatedRates: Record<CurrencyCode, number> = { ...getStoredForexRates() };
      TOP_CURRENCIES.forEach(c => {
        if (data.rates[c.code]) {
          updatedRates[c.code] = data.rates[c.code];
        }
      });
      localStorage.setItem(LOCAL_RATES_KEY, JSON.stringify(updatedRates));
      return { success: true, rates: updatedRates, timestamp: Date.now() };
    }
  } catch {
    // Offline fallback
  }
  return { success: false, rates: getStoredForexRates(), timestamp: Date.now() };
}

export function convertCurrencyAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates?: Record<CurrencyCode, number>
): number {
  if (from === to) return amount;
  const currentRates = rates || getStoredForexRates();
  const rateFromUSD = currentRates[from] || 1;
  const rateToUSD = currentRates[to] || 1;
  // Convert from currency -> USD -> to currency
  const inUSD = amount / rateFromUSD;
  const converted = inUSD * rateToUSD;
  return Math.round(converted * 100) / 100;
}

export function formatCurrency(amount: number, code: CurrencyCode): string {
  const config = TOP_CURRENCIES.find(c => c.code === code) || TOP_CURRENCIES[0];
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 2,
  }).format(amount).replace(code, config.symbol);
}

export function switchAppBaseCurrency(
  transactions: Transaction[],
  oldCurrency: CurrencyCode,
  newCurrency: CurrencyCode,
  mode: 'convert' | 'keep',
  rates?: Record<CurrencyCode, number>
): Transaction[] {
  if (oldCurrency === newCurrency) return transactions;

  return transactions.map(tx => {
    if (mode === 'keep') {
      // Just switch symbol, keep numeric amount
      return {
        ...tx,
        currency: newCurrency
      };
    } else {
      // Convert past amounts using exchange rate
      const newAmount = convertCurrencyAmount(tx.amount, oldCurrency, newCurrency, rates);
      return {
        ...tx,
        originalAmount: tx.originalAmount || tx.amount,
        originalCurrency: tx.originalCurrency || tx.currency,
        amount: newAmount,
        currency: newCurrency
      };
    }
  });
}

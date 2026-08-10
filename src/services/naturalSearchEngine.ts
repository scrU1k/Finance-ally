import { Transaction, Category, Trip } from '../types';
import { dispatchSpeculativeRace } from '../workers/workerOrchestrator';

export interface SearchFilterCriteria {
  dateStart?: string; // YYYY-MM-DD
  dateEnd?: string;   // YYYY-MM-DD
  minAmount?: number;
  maxAmount?: number;
  exactAmount?: number;
  categoryId?: string;
  tripId?: string;
  paymentMethod?: string;
  isScheduled?: boolean;
  textTokens: string[];
}

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses raw natural text into structured SearchFilterCriteria.
 * Ultra-fast client-side execution using regex and tokenization.
 */
export function parseSearchQuery(
  rawQuery: string,
  categories: Category[] = [],
  trips: Trip[] = []
): SearchFilterCriteria {
  let q = rawQuery.toLowerCase().trim();
  const criteria: SearchFilterCriteria = { textTokens: [] };

  if (!q) return criteria;

  const now = new Date();

  // 1. FUZZY & RELATIVE DATES
  if (/\b(?:a\s+)?few\s+weeks?\s+ago\b/.test(q)) {
    const start = new Date(now);
    start.setDate(now.getDate() - 35);
    const end = new Date(now);
    end.setDate(now.getDate() - 14);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(end);
    q = q.replace(/\b(?:a\s+)?few\s+weeks?\s+ago\b/g, '');
  } else if (/\b(?:a\s+)?few\s+days?\s+ago\b/.test(q)) {
    const start = new Date(now);
    start.setDate(now.getDate() - 5);
    const end = new Date(now);
    end.setDate(now.getDate() - 2);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(end);
    q = q.replace(/\b(?:a\s+)?few\s+days?\s+ago\b/g, '');
  } else if (/\b(?:a\s+)?few\s+months?\s+ago\b/.test(q)) {
    const start = new Date(now);
    start.setDate(now.getDate() - 120);
    const end = new Date(now);
    end.setDate(now.getDate() - 45);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(end);
    q = q.replace(/\b(?:a\s+)?few\s+months?\s+ago\b/g, '');
  } else if (/\btoday\b|\bnow\b/.test(q)) {
    criteria.dateStart = formatDateISO(now);
    criteria.dateEnd = formatDateISO(now);
    q = q.replace(/\btoday\b|\bnow\b/g, '');
  } else if (/\byesterday\b/.test(q)) {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    criteria.dateStart = formatDateISO(y);
    criteria.dateEnd = formatDateISO(y);
    q = q.replace(/\byesterday\b/g, '');
  } else if (/\bthis\s+week\b/.test(q)) {
    const start = new Date(now);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    start.setDate(diff);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(now);
    q = q.replace(/\bthis\s+week\b/g, '');
  } else if (/\blast\s+week\b/.test(q)) {
    const start = new Date(now);
    const day = start.getDay();
    const diff = start.getDate() - day - 6; // Last week's Monday
    start.setDate(diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(end);
    q = q.replace(/\blast\s+week\b/g, '');
  } else if (/\bthis\s+month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(now);
    q = q.replace(/\bthis\s+month\b/g, '');
  } else if (/\blast\s+month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(end);
    q = q.replace(/\blast\s+month\b/g, '');
  } else if (/\bthis\s+year\b/.test(q)) {
    const start = new Date(now.getFullYear(), 0, 1);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(now);
    q = q.replace(/\bthis\s+year\b/g, '');
  } else if (/\blast\s+year\b/.test(q)) {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31);
    criteria.dateStart = formatDateISO(start);
    criteria.dateEnd = formatDateISO(end);
    q = q.replace(/\blast\s+year\b/g, '');
  }

  // Check for Specific Day + Month (e.g. "17 july", "july 17", "17th july", "july 17th", "17 july 2025")
  const dayMonthMatch = q.match(/\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)|([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?)(?:\s+(20\d{2}))?\b/i);
  if (dayMonthMatch) {
    const rawDay = dayMonthMatch[1] || dayMonthMatch[4];
    const rawMonth = (dayMonthMatch[2] || dayMonthMatch[3] || '').toLowerCase();
    const rawYear = dayMonthMatch[5];

    if (rawDay && rawMonth && MONTH_NAMES[rawMonth] !== undefined) {
      const dayNum = parseInt(rawDay, 10);
      const mIdx = MONTH_NAMES[rawMonth];
      const yearNum = rawYear ? parseInt(rawYear, 10) : now.getFullYear();

      if (dayNum >= 1 && dayNum <= 31) {
        const targetDate = new Date(yearNum, mIdx, dayNum);
        const iso = formatDateISO(targetDate);
        criteria.dateStart = iso;
        criteria.dateEnd = iso;
        q = q.replace(dayMonthMatch[0], '').trim();
      }
    }
  }

  // Check for Month Names alone (e.g., "january", "in august", "aug")
  if (!criteria.dateStart) {
    for (const [mName, mIdx] of Object.entries(MONTH_NAMES)) {
      const rx = new RegExp(`\\b${mName}\\b`, 'i');
      if (rx.test(q)) {
        // Check if a year is near it e.g. "january 2024" or "jan 24"
        const yearMatch = q.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : now.getFullYear();
        const start = new Date(year, mIdx, 1);
        const end = new Date(year, mIdx + 1, 0);
        criteria.dateStart = formatDateISO(start);
        criteria.dateEnd = formatDateISO(end);
        q = q.replace(rx, '');
        if (yearMatch) q = q.replace(yearMatch[0], '');
        break;
      }
    }
  }

  // Check for Weekday Names (e.g. "last friday", "on monday")
  for (const [dName, dIdx] of Object.entries(DAY_NAMES)) {
    const rx = new RegExp(`\\b(?:last\\s+)?${dName}\\b`, 'i');
    if (rx.test(q) && !criteria.dateStart) {
      const d = new Date(now);
      const currentDay = d.getDay();
      let diff = currentDay - dIdx;
      if (diff < 0) diff += 7;
      // diff === 0 means today
      d.setDate(d.getDate() - diff);
      criteria.dateStart = formatDateISO(d);
      criteria.dateEnd = formatDateISO(d);
      q = q.replace(rx, '');
      break;
    }
  }

  // Exact YYYY-MM-DD or YYYY-MM
  const isoMatch = q.match(/\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/);
  if (isoMatch && !criteria.dateStart) {
    if (isoMatch[3]) {
      criteria.dateStart = isoMatch[0];
      criteria.dateEnd = isoMatch[0];
    } else {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10) - 1;
      criteria.dateStart = formatDateISO(new Date(y, m, 1));
      criteria.dateEnd = formatDateISO(new Date(y, m + 1, 0));
    }
    q = q.replace(isoMatch[0], '');
  }

  // 2. AMOUNT OPERATORS & RANGES
  // Between: "between 50 and 100", "50 to 100", "50-100"
  const betweenMatch = q.match(/\b(?:between\s+)?\$?₹?(\d+(?:\.\d{1,2})?)\s*(?:to|-|and)\s*\$?₹?(\d+(?:\.\d{1,2})?)\b/);
  if (betweenMatch) {
    criteria.minAmount = parseFloat(betweenMatch[1]);
    criteria.maxAmount = parseFloat(betweenMatch[2]);
    q = q.replace(betweenMatch[0], '');
  } else {
    // Over / Greater than / >
    const overMatch = q.match(/(?:>|over|above|more\s+than|greater\s+than)\s*\$?₹?(\d+(?:\.\d{1,2})?)/);
    if (overMatch) {
      criteria.minAmount = parseFloat(overMatch[1]);
      q = q.replace(overMatch[0], '');
    }

    // Under / Less than / <
    const underMatch = q.match(/(?:<|under|below|less\s+than)\s*\$?₹?(\d+(?:\.\d{1,2})?)/);
    if (underMatch) {
      criteria.maxAmount = parseFloat(underMatch[1]);
      q = q.replace(underMatch[0], '');
    }

    // Exactly / =
    const exactMatch = q.match(/(?:=|exactly|costing|for)\s*\$?₹?(\d+(?:\.\d{1,2})?)/);
    if (exactMatch) {
      criteria.exactAmount = parseFloat(exactMatch[1]);
      q = q.replace(exactMatch[0], '');
    }
  }

  // Standalone numbers if not matched yet
  if (criteria.minAmount === undefined && criteria.maxAmount === undefined && criteria.exactAmount === undefined) {
    const numMatch = q.match(/\b\$?₹?(\d+(?:\.\d{1,2})?)\b/);
    if (numMatch) {
      const val = parseFloat(numMatch[1]);
      // If query is just a number or "$50", treat as exact/inclusive amount filter
      if (val > 0) {
        criteria.exactAmount = val;
        q = q.replace(numMatch[0], '');
      }
    }
  }

  // 3. CATEGORY & TRIP MATCHING
  if (categories.length > 0) {
    for (const cat of categories) {
      const catNameLower = cat.name.toLowerCase();
      if (q.includes(catNameLower)) {
        criteria.categoryId = cat.id;
        q = q.replace(catNameLower, '');
        break;
      }
    }
  }

  if (trips.length > 0) {
    for (const trip of trips) {
      const tripNameLower = trip.name.toLowerCase();
      if (q.includes(tripNameLower)) {
        criteria.tripId = trip.id;
        q = q.replace(tripNameLower, '');
        break;
      }
    }
  }

  // 4. PAYMENT METHODS
  const pmMatches: Array<[string, string]> = [
    ['credit card', 'Credit Card'],
    ['debit card', 'Debit Card'],
    ['card', 'Card'],
    ['cash', 'Cash'],
    ['upi', 'UPI'],
    ['bank transfer', 'Bank Transfer'],
    ['bank', 'Bank Transfer'],
    ['transfer', 'Bank Transfer'],
    ['netbanking', 'Bank Transfer'],
    ['wallet', 'Wallet'],
  ];
  for (const [pmKey, pmVal] of pmMatches) {
    const rx = new RegExp(`\\b${pmKey}\\b`, 'i');
    if (rx.test(q)) {
      criteria.paymentMethod = pmVal;
      q = q.replace(rx, '');
      break;
    }
  }

  // 5. SCHEDULED / RECURRING
  if (/\b(?:scheduled|recurring|future)\b/.test(q)) {
    criteria.isScheduled = true;
    q = q.replace(/\b(?:scheduled|recurring|future)\b/g, '');
  }

  // 6. REMAINING TEXT TOKENS
  const cleanTokens = q
    .split(/\s+/)
    .map(t => t.trim().replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter(t => t.length > 0 && !['in', 'on', 'at', 'for', 'the', 'a', 'an', 'of', 'to', 'and', 'from', 'with'].includes(t));

  criteria.textTokens = cleanTokens;

  return criteria;
}

/**
 * High-performance, zero-latency transaction search function.
 * Filters transactions against parsed natural search criteria.
 */
export function searchTransactions(
  transactions: Transaction[],
  rawQuery: string,
  categories: Category[] = [],
  trips: Trip[] = [],
  semanticCategoryId?: string | null
): Transaction[] {
  if (!rawQuery || !rawQuery.trim()) return transactions;

  const criteria = parseSearchQuery(rawQuery, categories, trips);
  if (semanticCategoryId && !criteria.categoryId) {
    criteria.categoryId = semanticCategoryId;
  }

  return transactions.filter(tx => {
    // 1. Date Range
    if (criteria.dateStart && tx.date < criteria.dateStart) return false;
    if (criteria.dateEnd && tx.date > criteria.dateEnd) return false;

    // 2. Amount Filters
    if (criteria.minAmount !== undefined && tx.amount < criteria.minAmount) return false;
    if (criteria.maxAmount !== undefined && tx.amount > criteria.maxAmount) return false;
    if (criteria.exactAmount !== undefined && Math.abs(tx.amount - criteria.exactAmount) > 0.01) {
      // Allow partial match on string if exact amount doesn't match floating point directly
      const amtStr = tx.amount.toString();
      const targetStr = criteria.exactAmount.toString();
      if (!amtStr.includes(targetStr)) return false;
    }

    // 3. Category Filter
    const matchesCategory = criteria.categoryId ? tx.categoryId === criteria.categoryId : true;

    // 4. Trip Filter
    if (criteria.tripId && tx.tripId !== criteria.tripId) return false;

    // 5. Payment Method Filter
    if (criteria.paymentMethod && tx.paymentMethod && !tx.paymentMethod.toLowerCase().includes(criteria.paymentMethod.toLowerCase())) {
      return false;
    }

    // 6. Scheduled Filter
    if (criteria.isScheduled !== undefined && Boolean(tx.isScheduled) !== criteria.isScheduled) {
      return false;
    }

    // 7. Text Tokens (Note / Custom Category / Details)
    if (criteria.textTokens.length > 0) {
      const noteLower = (tx.note || '').toLowerCase();
      const catCustomLower = (tx.customCategoryName || '').toLowerCase();
      const pmLower = (tx.paymentMethod || '').toLowerCase();

      for (const token of criteria.textTokens) {
        const matchesNote = noteLower.includes(token);
        const matchesCustomCat = catCustomLower.includes(token);
        const matchesPm = pmLower.includes(token);

        if (!matchesNote && !matchesCustomCat && !matchesPm) {
          // If the token didn't match text, but we have a semantic category match from NLP, allow it
          if (!matchesCategory || !criteria.categoryId) {
            return false;
          }
        }
      }
    }

    if (criteria.categoryId && !matchesCategory && criteria.textTokens.length === 0) {
       return false;
    }

    return true;
  });
}

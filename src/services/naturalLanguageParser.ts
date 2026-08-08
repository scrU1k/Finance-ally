import { categorizeNoteWithArcticFTS5 } from './semanticClassifier';
import { CurrencyCode } from '../types';

export interface ParsedNaturalExpense {
  amount: number;
  currency: CurrencyCode;
  description: string;
  categoryId: string;
  categoryName: string;
  date: string; // YYYY-MM-DD
  dateLabel: string;
  time: string; // HH:mm
  timeLabel: string;
  confidence: number;
  isNewCustomTag?: boolean;
}

// ─── Exhaustive Time Parser ────────────────────────────────────────────────────
/**
 * Parses an exhaustive set of time formats from a lowercased string.
 * Returns { h24: string, label: string } or null if no time found.
 *
 * Supported (case-insensitive):
 *  8pm / 08pm / 8 pm / 08 pm
 *  8.00pm / 8.00 pm / 8:00pm / 8:00 pm / 8-00pm / 8-00 pm
 *  08-30pm / 8-30pm / 8-30 pm / 08-30 pm
 *  8-pm   (hyphen with no minutes = on the hour)
 *  AM/am/Am, PM/pm/Pm
 */
function parseExhaustiveTime(lower: string): { h24: string; label: string; matchText: string } | null {
  // Build a comprehensive regex:
  // Groups:
  //  1: hour (1-2 digits)
  //  2: separator character (. : -)  [optional]
  //  3: minutes (2 digits)           [optional, only when separator present]
  //  4: am/pm (always required here for these patterns)
  //
  // Pattern: \b(\d{1,2})(?:([\.\:\-])(\d{2}))?\s*(am|pm)\b
  const ampmRegex = /\b(\d{1,2})(?:([\.\:\-])(\d{2}))?\s*(am|pm)\b/i;

  const m = lower.match(ampmRegex);
  if (m) {
    let h = parseInt(m[1], 10);
    const sep = m[2] || '';
    const minStr = m[3];
    const ampm = m[4].toLowerCase();

    // Special: "8-pm" means 8:00 pm (hyphen + no minutes)
    // "8-30pm" means 8:30pm
    let mins = 0;
    if (minStr) {
      mins = parseInt(minStr, 10);
    }

    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;

    const h24 = `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    const displayH = h % 12 || 12;
    const label = `${displayH}:${mins.toString().padStart(2, '0')} ${ampm.toUpperCase()}`;
    return { h24, label, matchText: m[0] };
  }

  // 24-hour explicit: "at 14:30" or "at 1430"
  const at24 = lower.match(/\bat\s+(\d{1,2}):(\d{2})\b/) ||
               lower.match(/\bat\s+(\d{2})(\d{2})\b/);
  if (at24) {
    const h = parseInt(at24[1], 10);
    const mins = parseInt(at24[2], 10);
    if (h < 24 && mins < 60) {
      const h24 = `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
      return { h24, label: h24, matchText: at24[0] };
    }
  }

  return null;
}

// ─── Exhaustive Date Parser ────────────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Parses an exhaustive set of date formats.
 * Returns { dateStr: 'YYYY-MM-DD', label: string } or null.
 *
 * Supported:
 *  2nd August / 2nd august / 2nd Aug / 1st jan
 *  August 2nd / august 2nd / August 2 / aug 2
 *  2 aug / 02 aug / Aug 2 / Aug 02
 *  2nd of August / 2nd of aug
 *  2/08 or 2/08/26 or 2/08/2026
 *  02/08 or 02/08/26 or 02/08/2026
 *  2/8 or 2/8/26 or 2/8/2026
 *  All slash variants with - or . as separator too
 */
function parseExhaustiveDate(lower: string): { dateStr: string; label: string; matchText: string } | null {
  const currentYear = new Date().getFullYear();

  // Helper to build date string from d/m/y
  const toDateStr = (d: number, m: number, y: number): string | null => {
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  };

  const monthNames = Object.keys(MONTH_MAP).join('|');
  const ordinalSuffix = '(?:st|nd|rd|th)?';

  // 1. "2nd August" / "2nd aug" / "2nd of august" / "2 aug" / "2aug" (allowing optional space)
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})${ordinalSuffix}\\s*(?:of\\s+)?(${monthNames})\\b`, 'i'
  );
  let m = lower.match(dayFirst);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = MONTH_MAP[m[2].toLowerCase()];
    const ds = toDateStr(d, mo, currentYear);
    if (ds) return { dateStr: ds, label: `${d} ${m[2]}`, matchText: m[0] };
  }

  // 2. "August 2nd" / "Aug 2" / "august 2" / "aug2" (allowing optional space)
  const monthFirst = new RegExp(
    `\\b(${monthNames})\\s*(\\d{1,2})${ordinalSuffix}\\b`, 'i'
  );
  m = lower.match(monthFirst);
  if (m) {
    const mo = MONTH_MAP[m[1].toLowerCase()];
    const d = parseInt(m[2], 10);
    const ds = toDateStr(d, mo, currentYear);
    if (ds) return { dateStr: ds, label: `${m[1]} ${d}`, matchText: m[0] };
  }

  // 3. DD/MM/YYYY or DD/MM/YY or DD/MM (also supports - and . as separators)
  const slashDate = /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/;
  m = lower.match(slashDate);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = currentYear;
    if (m[3]) {
      const raw = parseInt(m[3], 10);
      y = raw < 100 ? 2000 + raw : raw;
    }
    const ds = toDateStr(d, mo, y);
    if (ds) return { dateStr: ds, label: m[0], matchText: m[0] };
  }

  return null;
}

/**
 * Safely adds or subtracts months from a date while preserving the day of month.
 * Handles month length mismatch edge cases:
 * e.g., 31 July - 1 month -> 30 June
 * e.g., 30 Sept - 1 month -> 31 August
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== originalDay) {
    result.setDate(0); // Sets to last day of target month
  }
  return result;
}

export function parseNaturalLanguageExpense(
  inputText: string,
  baseCurrency: CurrencyCode = 'INR',
  existingCategories: Array<{ id: string; name: string }> = []
): ParsedNaturalExpense {
  const text = inputText.trim();
  const lower = text.toLowerCase();

  // 0. EXPLICIT USER TYPED TAG EXTRACTION
  // Matches: tag-..., tag:..., tag...., tag/..., '...', "...", <...>
  let explicitTagName: string | null = null;
  let explicitTagMatchText: string | null = null;

  const tagKeywordRegex = /\btag\s*[\:\-\.\/]\s*([a-z0-9\s\&]+)/i;
  const matchTagKeyword = text.match(tagKeywordRegex);

  if (matchTagKeyword) {
    explicitTagName = matchTagKeyword[1].trim();
    explicitTagMatchText = matchTagKeyword[0];
  } else {
    const quoteTagRegex = /(?:'([^']+)'|"([^"]+)"|<([^>]+)>)/;
    const matchQuoteTag = text.match(quoteTagRegex);
    if (matchQuoteTag) {
      explicitTagName = (matchQuoteTag[1] || matchQuoteTag[2] || matchQuoteTag[3]).trim();
      explicitTagMatchText = matchQuoteTag[0];
    }
  }

  // 1. EXTRACT DATE & TIME
  const now = new Date();
  let targetDate = new Date();
  let dateLabel = 'Today';
  let matchedRelativeDateText = '';

  let currentHour = now.getHours().toString().padStart(2, '0');
  let currentMin = now.getMinutes().toString().padStart(2, '0');
  let timeStr = `${currentHour}:${currentMin}`;
  let timeLabel = 'Now';

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Try exhaustive date parser first
  const parsedDate = parseExhaustiveDate(lower);
  if (parsedDate) {
    dateLabel = parsedDate.label;
    targetDate = new Date(parsedDate.dateStr + 'T12:00:00');
  } else if (lower.includes('day after tomorrow') || lower.includes('day after')) {
    targetDate.setDate(targetDate.getDate() + 2);
    dateLabel = 'Day after tomorrow';
    matchedRelativeDateText = lower.includes('day after tomorrow') ? 'day after tomorrow' : 'day after';
  } else if (lower.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
    dateLabel = 'Tomorrow';
    matchedRelativeDateText = 'tomorrow';
  } else if (lower.includes('yesterday')) {
    targetDate.setDate(targetDate.getDate() - 1);
    dateLabel = 'Yesterday';
    matchedRelativeDateText = 'yesterday';
  } else if (lower.includes('2 days ago')) {
    targetDate.setDate(targetDate.getDate() - 2);
    dateLabel = '2 days ago';
    matchedRelativeDateText = '2 days ago';
  } else if (lower.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
    dateLabel = 'Next week';
    matchedRelativeDateText = 'next week';
  } else if (lower.includes('last week')) {
    targetDate.setDate(targetDate.getDate() - 7);
    dateLabel = 'Last week';
    matchedRelativeDateText = 'last week';
  } else if (lower.includes('next month')) {
    targetDate = addMonths(targetDate, 1);
    dateLabel = 'Next month';
    matchedRelativeDateText = 'next month';
  } else if (lower.includes('last month')) {
    targetDate = addMonths(targetDate, -1);
    dateLabel = 'Last month';
    matchedRelativeDateText = 'last month';
  } else if (lower.includes('now') || lower.includes('today')) {
    dateLabel = 'Today';
    matchedRelativeDateText = lower.includes('now') ? 'now' : 'today';
  } else {
    let foundDay = false;
    for (let i = 0; i < dayNames.length; i++) {
      const dayName = dayNames[i];
      if (lower.includes(dayName)) {
        const currentDayIndex = targetDate.getDay();
        const targetDayIndex = i;
        let diff = currentDayIndex - targetDayIndex;
        if (diff <= 0) diff += 7;
        targetDate.setDate(targetDate.getDate() - diff);
        dateLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        foundDay = true;
        matchedRelativeDateText = dayName;
        break;
      }
    }
    if (!foundDay) {
      dateLabel = 'Today';
    }
  }

  const yearStr = targetDate.getFullYear();
  const monthStr = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const dayNumStr = targetDate.getDate().toString().padStart(2, '0');
  const dateStr = `${yearStr}-${monthStr}-${dayNumStr}`;

  // Time parsing
  if (!lower.includes('now')) {
    if (lower.includes('morning') && !parseExhaustiveTime(lower)) {
      timeStr = '09:00';
      timeLabel = 'Morning';
    } else if (lower.includes('afternoon') && !parseExhaustiveTime(lower)) {
      timeStr = '13:00';
      timeLabel = 'Afternoon';
    } else if (lower.includes('evening') && !parseExhaustiveTime(lower)) {
      timeStr = '19:00';
      timeLabel = 'Evening';
    } else if (lower.includes('night') && !parseExhaustiveTime(lower)) {
      timeStr = '22:00';
      timeLabel = 'Night';
    } else {
      const parsedTime = parseExhaustiveTime(lower);
      if (parsedTime) {
        timeStr = parsedTime.h24;
        timeLabel = parsedTime.label;
      }
    }
  }

  // 2. EXTRACT AMOUNT & CURRENCY
  let amount = 0;
  let currency: CurrencyCode = baseCurrency;

  const currencyMap: Record<string, CurrencyCode> = {
    rs: 'INR',
    inr: 'INR',
    rupees: 'INR',
    rupee: 'INR',
    '₹': 'INR',
    usd: 'USD',
    dollar: 'USD',
    dollars: 'USD',
    '$': 'USD',
    eur: 'EUR',
    euro: 'EUR',
    euros: 'EUR',
    '€': 'EUR',
    gbp: 'GBP',
    pound: 'GBP',
    pounds: 'GBP',
    '£': 'GBP',
    jpy: 'JPY',
    yen: 'JPY',
    '¥': 'JPY',
  };

  const patterns = [
    /([\d,]+(?:\.\d{1,2})?)[\s]*(pounds?|rupees?|rupee|dollars?|euros?|euro|yen|rs\.?|inr|usd|eur|gbp|jpy|¥|€|£|\$|₹)\b/i,
    /(pounds?|rupees?|rupee|dollars?|euros?|euro|yen|rs\.?|inr|usd|eur|gbp|jpy|¥|€|£|\$|₹)[\s]*([\d,]+(?:\.\d{1,2})?)/i,
    /\b(?:for|cost|costing|at|of)\s+([\d,]+(?:\.\d{1,2})?)/i
  ];

  // Pre-process text to remove matched date/time components so they don't corrupt amount extraction
  let amountText = lower;
  if (parsedDate) {
    amountText = amountText.replace(parsedDate.matchText.toLowerCase(), ' ');
  }
  if (matchedRelativeDateText) {
    amountText = amountText.replace(matchedRelativeDateText.toLowerCase(), ' ');
  }
  const timeMatch = parseExhaustiveTime(lower);
  if (timeMatch) {
    amountText = amountText.replace(timeMatch.matchText.toLowerCase(), ' ');
  }

  let amountFound = false;

  let match = amountText.match(patterns[0]);
  if (match) {
    amount = parseFloat(match[1].replace(/,/g, ''));
    const currStr = match[2].toLowerCase();
    if (currencyMap[currStr]) currency = currencyMap[currStr];
    amountFound = true;
  }

  if (!amountFound) {
    match = amountText.match(patterns[1]);
    if (match) {
      amount = parseFloat(match[2].replace(/,/g, ''));
      const currStr = match[1].toLowerCase();
      if (currencyMap[currStr]) currency = currencyMap[currStr];
      amountFound = true;
    }
  }

  if (!amountFound) {
    match = amountText.match(patterns[2]);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      amountFound = true;
    }
  }

  // Fallback: pick first standalone number
  if (!amountFound) {
    const allNumbers = amountText.match(/\b\d+(?:\.\d{1,2})?/g);
    if (allNumbers) {
      for (const numStr of allNumbers) {
        const idx = amountText.indexOf(numStr);
        const postText = amountText.substring(idx + numStr.length, idx + numStr.length + 15);
        // Exclude quantity units like '3l', '3 l', '3 kg' and any letter directly attached to the number
        if (!/^\s*(litres?|liters?|ltrs?|l|kgs?|g|pcs|pieces?|box(?:es)?|cans?|x)\b/i.test(postText) && !/^[a-z]/i.test(postText)) {
          amount = parseFloat(numStr);
          amountFound = true;
          break;
        }
      }
    }
  }

  if (!amountFound) {
    const firstNum = amountText.match(/\d+(?:\.\d{1,2})?/);
    if (firstNum) amount = parseFloat(firstNum[0]);
  }

  // 3. CLEAN DESCRIPTION
  let cleanDesc = text;

  if (amount > 0) {
    const amtStr = amount.toString().replace('.', '\\.');
    const removeRegexes = [
      new RegExp(`\\b${amtStr}\\s*(?:pounds?|rupees?|rupee|dollars?|euros?|euro|yen|rs\\.?|inr|usd|eur|gbp|jpy|¥|€|£|\\$|₹)\\b`, 'gi'),
      new RegExp(`(?:pounds?|rupees?|rupee|dollars?|euros?|euro|yen|rs\\.?|inr|usd|eur|gbp|jpy|¥|€|£|\\$|₹)\\s*${amtStr}\\b`, 'gi'),
      new RegExp(`\\bfor\\s+${amtStr}\\b`, 'gi'),
      new RegExp(`\\b${amtStr}\\b`, 'gi')
    ];
    for (const rx of removeRegexes) {
      cleanDesc = cleanDesc.replace(rx, '');
    }
  }

  // Strip explicit tag text from description
  if (explicitTagMatchText) {
    cleanDesc = cleanDesc.replace(new RegExp(explicitTagMatchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }

  // Remove date/time patterns from description
  const monthNames2 = Object.keys(MONTH_MAP).join('|');
  cleanDesc = cleanDesc
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s*(?:of\\s+)?(?:${monthNames2})\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:${monthNames2})\\s*\\d{1,2}(?:st|nd|rd|th)?\\b`, 'gi'), ' ')
    .replace(/\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{1,2}(?:[\.\:\-]\d{2})?\s*(?:am|pm)\b/gi, ' ')
    .replace(/\b(?:spent|on|at|for|paid|bought|cost|was)\b/gi, ' ')
    .replace(/\b(?:today|yesterday|now|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night)\b/gi, ' ')
    .replace(/\b(?:rs|inr|rupees|rupee|usd|dollar|dollars|\$|eur|euro|euros|€|gbp|pounds?|£|jpy|yen|¥)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanDesc || cleanDesc.length < 2) {
    cleanDesc = 'General Expenditure';
  } else {
    cleanDesc = cleanDesc
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // 4. CATEGORY CLASSIFICATION
  let categoryId = '';
  let categoryName = '';
  let confidence = 99;
  let isNewCustomTag = false;

  if (explicitTagName) {
    const titleCasedTag = explicitTagName
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    const lowerTag = explicitTagName.toLowerCase();
    const matchedCategory = existingCategories.find(
      c => c.name.toLowerCase() === lowerTag || c.name.toLowerCase().includes(lowerTag)
    );

    if (matchedCategory) {
      categoryId = matchedCategory.id;
      categoryName = matchedCategory.name;
      confidence = 100;
    } else {
      categoryId = `cat-custom-${Date.now()}`;
      categoryName = titleCasedTag;
      isNewCustomTag = true;
      confidence = 100;
    }
  } else {
    const catResult = categorizeNoteWithArcticFTS5(text + ' ' + cleanDesc);
    categoryId = catResult.categoryId;
    categoryName = catResult.categoryName;
    confidence = catResult.confidence;
  }

  return {
    amount: amount || 100,
    currency,
    description: cleanDesc,
    categoryId,
    categoryName,
    date: dateStr,
    dateLabel,
    time: timeStr,
    timeLabel,
    confidence,
    isNewCustomTag,
  };
}

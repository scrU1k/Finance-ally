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
}

export function parseNaturalLanguageExpense(
  inputText: string,
  baseCurrency: CurrencyCode = 'INR'
): ParsedNaturalExpense {
  const text = inputText.trim();
  const lower = text.toLowerCase();

  // 1. EXTRACT DATE & TIME (NOW handling)
  const now = new Date();
  let targetDate = new Date();
  let dateLabel = 'Today';
  
  // default to current system hours/minutes instead of midnight
  let currentHour = now.getHours().toString().padStart(2, '0');
  let currentMin = now.getMinutes().toString().padStart(2, '0');
  let timeStr = `${currentHour}:${currentMin}`;
  let timeLabel = 'Now';

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  if (lower.includes('yesterday')) {
    targetDate.setDate(targetDate.getDate() - 1);
    dateLabel = 'Yesterday';
  } else if (lower.includes('2 days ago')) {
    targetDate.setDate(targetDate.getDate() - 2);
    dateLabel = '2 days ago';
  } else if (lower.includes('now') || lower.includes('today')) {
    dateLabel = 'Today';
  } else {
    // Check day of week (e.g. Wednesday)
    let foundDay = false;
    for (let i = 0; i < dayNames.length; i++) {
      const dayName = dayNames[i];
      if (lower.includes(dayName)) {
        const currentDayIndex = targetDate.getDay(); // 0-6
        const targetDayIndex = i; // 0-6
        let diff = currentDayIndex - targetDayIndex;
        if (diff <= 0) diff += 7; // Previous week's day
        targetDate.setDate(targetDate.getDate() - diff);
        dateLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        foundDay = true;
        break;
      }
    }
    if (!foundDay) {
      dateLabel = 'Today';
    }
  }

  const dateStr = targetDate.toISOString().split('T')[0];

  // Specific time parsing (if not 'now')
  if (!lower.includes('now')) {
    if (lower.includes('morning')) {
      timeStr = '09:00';
      timeLabel = 'Morning';
    } else if (lower.includes('afternoon')) {
      timeStr = '13:00';
      timeLabel = 'Afternoon';
    } else if (lower.includes('evening')) {
      timeStr = '19:00';
      timeLabel = 'Evening';
    } else if (lower.includes('night')) {
      timeStr = '22:00';
      timeLabel = 'Night';
    } else {
      // Check for explicit time like 12.30pm, at 14:30, at 1430
      const timeMatch = lower.match(/\bat\s+(\d{1,2})[.:](\d{2})\s*(am|pm)?\b/i) ||
                        lower.match(/\b(\d{1,2})[.:](\d{2})\s*(am|pm)\b/i) ||
                        lower.match(/\b(\d{1,2})\s*(am|pm)\b/i) ||
                        lower.match(/\bat\s+(\d{1,2}):(\d{2})\b/i) ||
                        lower.match(/\bat\s+(\d{2})(\d{2})\b/i);

      if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        let m = parseInt(timeMatch[2] || '0', 10);
        // If it's the 12am/pm format (no minutes group, but am/pm group is at index 2)
        let ampm = (timeMatch[3] || '').toLowerCase();
        if (!timeMatch[2] && (timeMatch[2] === 'am' || timeMatch[2] === 'pm')) {
          ampm = timeMatch[2].toLowerCase();
          m = 0;
        }
        
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        timeLabel = ampm ? `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm.toUpperCase()}` : timeStr;
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
    // Pattern A: <number> <currency_word> e.g. "1.8 pounds" or "300 rupees" or "1.8 GBP"
    /(\d+(?:\.\d{1,2})?)\s*(pounds?|rupees?|rupee|dollars?|euros?|euro|yen|rs\.?|inr|usd|eur|gbp|jpy|¥|€|£|\$|₹)\b/i,
    // Pattern B: <currency_word> <number> e.g. "£1.8" or "rs 300" or "usd 50"
    /(pounds?|rupees?|rupee|dollars?|euros?|euro|yen|rs\.?|inr|usd|eur|gbp|jpy|¥|€|£|\$|₹)\s*(\d+(?:\.\d{1,2})?)/i,
    // Pattern C: number after prepositions like "for", "costing", "cost", "at" e.g. "for 1.8", "at 300"
    /\b(?:for|cost|costing|at|of)\s+(\d+(?:\.\d{1,2})?)/i
  ];

  let amountFound = false;

  // Let's test Pattern A:
  let match = lower.match(patterns[0]);
  if (match) {
    amount = parseFloat(match[1]);
    const currStr = match[2].toLowerCase();
    if (currencyMap[currStr]) {
      currency = currencyMap[currStr];
    }
    amountFound = true;
  }

  // Let's test Pattern B if A is not matched:
  if (!amountFound) {
    match = lower.match(patterns[1]);
    if (match) {
      amount = parseFloat(match[2]);
      const currStr = match[1].toLowerCase();
      if (currencyMap[currStr]) {
        currency = currencyMap[currStr];
      }
      amountFound = true;
    }
  }

  // Let's test Pattern C if neither matched:
  if (!amountFound) {
    match = lower.match(patterns[2]);
    if (match) {
      amount = parseFloat(match[1]);
      amountFound = true;
    }
  }

  // Fallback: any float/integer in the string that isn't connected to unit like "litre", "kg", "x"
  if (!amountFound) {
    const allNumbers = lower.match(/\b\d+(?:\.\d{1,2})?\b/g);
    if (allNumbers) {
      for (const numStr of allNumbers) {
        const idx = lower.indexOf(numStr);
        const postText = lower.substring(idx + numStr.length, idx + numStr.length + 15);
        if (!/^\s*(litre|liters?|ltr|kg|g|pcs|pieces?|box|can|x)\b/i.test(postText)) {
          amount = parseFloat(numStr);
          amountFound = true;
          break;
        }
      }
    }
  }

  // If still no amount found, fallback to first number
  if (!amountFound) {
    const firstNum = lower.match(/\d+(?:\.\d{1,2})?/);
    if (firstNum) {
      amount = parseFloat(firstNum[0]);
    }
  }

  // 3. CLEAN DESCRIPTION / MERCHANT
  let cleanDesc = text;

  // Remove the specific matched amount & currency phrase first to prevent leaking
  if (amount > 0) {
    const amtStr = amount.toString();
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

  // Clean generic leftover prepositions, date, time words
  cleanDesc = cleanDesc
    .replace(/\b(?:spent|on|at|for|paid|bought|cost|was)\b/gi, ' ')
    .replace(/\b(?:today|yesterday|now|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night)\b/gi, ' ')
    .replace(/\b(?:rs|inr|rupees|rupee|usd|dollar|dollars|\$|eur|euro|euros|€|gbp|pounds?|£|jpy|yen|¥)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanDesc || cleanDesc.length < 2) {
    cleanDesc = 'General Expenditure';
  } else {
    // Capitalize words nicely
    cleanDesc = cleanDesc
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // 5. VECTOR / TRIGRAM CATEGORY CLASSIFICATION
  const catResult = categorizeNoteWithArcticFTS5(text + ' ' + cleanDesc);

  return {
    amount: amount || 100,
    currency,
    description: cleanDesc,
    categoryId: catResult.categoryId,
    categoryName: catResult.categoryName,
    date: dateStr,
    dateLabel,
    time: timeStr,
    timeLabel,
    confidence: catResult.confidence,
  };
}

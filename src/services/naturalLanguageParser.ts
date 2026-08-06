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

  // 1. EXTRACT AMOUNT & CURRENCY
  let amount = 0;
  let currency: CurrencyCode = baseCurrency;

  // Regex patterns for currency & amount
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
    '£': 'GBP',
    jpy: 'JPY',
    yen: 'JPY',
    '¥': 'JPY',
  };

  // Match e.g. "300Rs", "Rs 300", "$50", "50 USD", "1200"
  const amountMatch = lower.match(/(?:(?:rs|inr|usd|\$|eur|€|gbp|£|jpy|¥)\s*)?(\d+(?:\.\d{1,2})?)(?:\s*(rs|inr|rupees|rupee|usd|dollar|dollars|\$|eur|euro|euros|€|gbp|pound|£|jpy|yen|¥))?/i);

  if (amountMatch) {
    amount = parseFloat(amountMatch[1]) || 0;
    const currSymbol = (amountMatch[2] || '').toLowerCase();
    if (currSymbol && currencyMap[currSymbol]) {
      currency = currencyMap[currSymbol];
    }
  }

  // 2. EXTRACT DATE
  let targetDate = new Date();
  let dateLabel = 'Today';

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  if (lower.includes('yesterday')) {
    targetDate.setDate(targetDate.getDate() - 1);
    dateLabel = 'Yesterday';
  } else if (lower.includes('2 days ago')) {
    targetDate.setDate(targetDate.getDate() - 2);
    dateLabel = '2 days ago';
  } else {
    // Check day of week (e.g. Wednesday)
    for (let i = 0; i < dayNames.length; i++) {
      const dayName = dayNames[i];
      if (lower.includes(dayName)) {
        const currentDayIndex = targetDate.getDay(); // 0-6
        const targetDayIndex = i; // 0-6
        let diff = currentDayIndex - targetDayIndex;
        if (diff <= 0) diff += 7; // Previous week's day
        targetDate.setDate(targetDate.getDate() - diff);
        dateLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        break;
      }
    }
  }

  const dateStr = targetDate.toISOString().split('T')[0];

  // 3. EXTRACT TIME
  let timeStr = '12:00';
  let timeLabel = 'Afternoon';

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
    // Check for explicit time like 3pm, 14:30
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && (timeMatch[3] || timeMatch[2])) {
      let h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2] || '0', 10);
      const ampm = (timeMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      timeLabel = `${h}:${m.toString().padStart(2, '0')} ${ampm.toUpperCase()}`;
    }
  }

  // 4. CLEAN DESCRIPTION / MERCHANT
  let cleanDesc = text
    .replace(/(?:rs|inr|usd|\$|eur|€|gbp|£|jpy|¥)\s*\d+(?:\.\d{1,2})?/gi, '')
    .replace(/\d+(?:\.\d{1,2})?\s*(?:rs|inr|rupees|rupee|usd|dollar|dollars|\$|eur|euro|euros|€|gbp|pound|£|jpy|yen|¥)/gi, '')
    .replace(/\b(?:spent|on|at|for|paid|bought|cost|was|rs|inr)\b/gi, ' ')
    .replace(/\b(?:today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night)\b/gi, ' ')
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

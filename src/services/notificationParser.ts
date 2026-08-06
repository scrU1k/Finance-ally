import { CurrencyCode, ParsedNotification } from '../types';
import { categorizeNoteWithArcticFTS5 } from './semanticClassifier';

export function parseNotificationText(rawText: string, defaultCurrency: CurrencyCode = 'INR'): ParsedNotification {
  const text = rawText.trim();
  let amount: number | null = null;
  let currency: CurrencyCode = defaultCurrency;
  let merchant = 'Unknown Merchant';
  let referenceId: string | undefined = undefined;
  const date = new Date().toISOString().split('T')[0];

  // 1. Currency Detection
  if (text.includes('₹') || /INR|Rs|Rs\.|Rupees/i.test(text)) currency = 'INR';
  else if (text.includes('$') || /USD|Dollars/i.test(text)) currency = 'USD';
  else if (text.includes('€') || /EUR|Euros/i.test(text)) currency = 'EUR';
  else if (text.includes('£') || /GBP|Pounds/i.test(text)) currency = 'GBP';
  else if (text.includes('¥') || /JPY|Yen/i.test(text)) currency = 'JPY';

  // 2. Amount Extraction (Regex matches amount patterns e.g. "spent Rs 450", "Paid $35.50", "Debited INR 1,200.00", "sent ₹350.00")
  const amountRegexes = [
    /(?:paid|spent|debited|sent|purchase|vpa|amt|amount|cost)\s*(?:of|for)?\s*(?:[₹$€£¥]|INR|USD|EUR|GBP|JPY|Rs\.?|Rs)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:[₹$€£¥]|INR|USD|EUR|GBP|JPY|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:debited|spent|paid|used|sent)/i,
    /(?:[₹$€£¥]|INR|USD|EUR|GBP|JPY|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:INR|USD|EUR|GBP|JPY|Rs\.?)/i
  ];

  for (const regex of amountRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsedVal = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsedVal) && parsedVal > 0) {
        amount = parsedVal;
        break;
      }
    }
  }

  // 3. Merchant / Note Extraction
  const merchantRegexes = [
    /(?:to|at|for|vpa)\s+([A-Za-z0-9\s&'-]{3,30}?)(?:\s+on|\s+via|\s+ref|\s+txn|\s+at|\.|$)/i,
    /(?:paid|spent)\s+(?:to|at)?\s*([A-Za-z0-9\s&'-]{3,30}?)(?:\s+on|\s+via|\s+amt|\.|$)/i,
    /info[:\s]*([A-Za-z0-9\s&'-]{3,30}?)(?:\s+on|\.|$)/i
  ];

  for (const regex of merchantRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate.length > 2 && !/bank|account|upi|debited|credited|debit|card/i.test(candidate)) {
        merchant = candidate;
        break;
      }
    }
  }

  if (merchant === 'Unknown Merchant') {
    // Clean text snippet as merchant note
    const cleanText = text.replace(/(?:debited|credited|account|card|bank|txn|ref)[^\.\,]*/gi, '').trim();
    merchant = cleanText.substring(0, 35) || 'Store Purchase';
  }

  // 4. Reference / Txn ID
  const refMatch = text.match(/(?:ref|txn|rrn|id)[:\s]*([A-Za-z0-9]{6,16})/i);
  if (refMatch && refMatch[1]) {
    referenceId = refMatch[1];
  }

  // 5. Arctic-Embed + FTS5 Auto-Categorization
  const classification = categorizeNoteWithArcticFTS5(merchant + ' ' + text);

  return {
    rawText,
    amount: amount || 0,
    currency,
    merchant,
    date,
    suggestedCategoryId: classification.categoryId,
    suggestedCategoryName: classification.categoryName,
    confidence: classification.confidence,
    referenceId
  };
}

// Sandbox Test Samples
export const SAMPLE_NOTIFICATIONS = [
  {
    title: 'Google Pay UPI Alert',
    text: 'Paid ₹450.00 to Starbucks Coffee via UPI Ref: GPAY-94102910 on 06-Aug.'
  },
  {
    title: 'HDFC Bank SMS Alert',
    text: 'HDFC Bank: Rs 1,200.00 debited from A/C **4912 at UBER RIDES on 06-AUG-26. Txn ID: 9481920.'
  },
  {
    title: 'PhonePe Food Alert',
    text: 'Debited ₹380 to Swiggy Food Delivery. Txn RRN: 8391024.'
  },
  {
    title: 'Amex Card Alert',
    text: 'USD $89.99 spent at Apple Store Online on 06/08/2026.'
  },
  {
    title: 'Utility Bill Alert',
    text: 'Rs 2,450.00 paid for State Electricity Power Bill on 05-Aug via NetBanking.'
  }
];

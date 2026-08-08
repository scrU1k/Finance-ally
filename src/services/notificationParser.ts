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
  if (text.includes('₹') || /INR|Rs|Rs\.|Rupees|Paise/i.test(text)) currency = 'INR';
  else if (text.includes('$') || /USD|Dollars|Bucks|CA\$|A\$|S\$/i.test(text)) {
    if (/CAD|CA\$/i.test(text)) currency = 'CAD';
    else if (/AUD|A\$/i.test(text)) currency = 'AUD';
    else if (/SGD|S\$/i.test(text)) currency = 'SGD';
    else currency = 'USD';
  }
  else if (text.includes('€') || /EUR|Euros/i.test(text)) currency = 'EUR';
  else if (text.includes('£') || /GBP|Pounds/i.test(text)) currency = 'GBP';
  else if (text.includes('¥') || /JPY|Yen|CNY|Yuan|RMB/i.test(text)) {
    if (/CNY|Yuan|RMB/i.test(text)) currency = 'CNY';
    else currency = 'JPY';
  }
  else if (/CHF|Franc/i.test(text)) currency = 'CHF';
  else if (/CAD/i.test(text)) currency = 'CAD';
  else if (/AUD/i.test(text)) currency = 'AUD';
  else if (/SGD/i.test(text)) currency = 'SGD';

  // 2. Amount Extraction
  const amountRegexes = [
    /(?:paid|spent|debited|sent|purchase|vpa|amt|amount|cost|charged)\s*(?:of|for)?\s*(?:[₹$€£¥]|INR|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|SGD|Rs\.?|Rs)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:[₹$€£¥]|INR|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|SGD|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:debited|spent|paid|used|sent|charged)/i,
    /(?:[₹$€£¥]|INR|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|SGD|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:INR|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|SGD|Rs\.?)/i
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
    const cleanText = text.replace(/(?:debited|credited|account|card|bank|txn|ref)[^.,]*/gi, '').trim();
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

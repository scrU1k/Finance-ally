import { SmsTemplate } from './db';
import { CurrencyCode, ParsedNotification } from '../types';
import { categorizeNoteWithArcticFTS5 } from './semanticClassifier';
import { parseNotificationText } from './notificationParser';

export const DEFAULT_SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: 'tpl-hdfc-standard',
    name: 'HDFC Bank Alert',
    pattern: 'Rs {AMOUNT} debited from A/C at {MERCHANT}',
    createdAt: Date.now(),
  },
  {
    id: 'tpl-icici-upi',
    name: 'ICICI UPI Alert',
    pattern: 'Paid {CURRENCY} {AMOUNT} to {MERCHANT}',
    createdAt: Date.now(),
  },
  {
    id: 'tpl-sbi-card',
    name: 'SBI Card Alert',
    pattern: 'Spent {CURRENCY} {AMOUNT} at {MERCHANT}',
    createdAt: Date.now(),
  },
  {
    id: 'tpl-phonepe-vpa',
    name: 'PhonePe UPI',
    pattern: 'Debited {CURRENCY} {AMOUNT} to {MERCHANT}',
    createdAt: Date.now(),
  },
];

/**
 * Converts a template string with placeholders ({AMOUNT}, {MERCHANT}, etc.)
 * into a valid RegExp pattern.
 */
export function compileTemplateToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except placeholders
    .replace(/\\\{AMOUNT\\\}/gi, '([0-9,]+(?:\\.[0-9]{1,2})?)')
    .replace(/\\\{CURRENCY\\\}/gi, '([₹$€£¥]|INR|USD|EUR|GBP|JPY|Rs\\.?|Rs|dollars?|euros?|pounds?|rupees?)')
    .replace(/\\\{MERCHANT\\\}/gi, '([A-Za-z0-9\\s&\'\\-]{2,35}?)')
    .replace(/\\\{DATE\\\}/gi, '([A-Za-z0-9\\/\\-\\.\\s]{3,15}?)')
    .replace(/\\\{REF\\\}/gi, '([A-Za-z0-9]{6,16})');

  return new RegExp(escaped, 'i');
}

/**
 * Attempts to parse raw SMS text using active custom user templates.
 * Falls back to default notification parser if no custom template matches.
 */
export function parseSmsWithDynamicTemplates(
  rawText: string,
  userTemplates: SmsTemplate[],
  defaultCurrency: CurrencyCode = 'INR'
): ParsedNotification {
  const allTemplates = [...userTemplates, ...DEFAULT_SMS_TEMPLATES];

  for (const tpl of allTemplates) {
    try {
      const rx = compileTemplateToRegex(tpl.pattern);
      const match = rawText.match(rx);

      if (match) {
        let amount: number | null = null;
        let merchant = 'Unknown Merchant';
        let currency: CurrencyCode = defaultCurrency;

        // Check positional matches from placeholders in pattern
        const placeholders = (tpl.pattern.match(/\{[A-Z]+\}/gi) || []).map(p => p.toUpperCase());

        placeholders.forEach((ph, idx) => {
          const matchedVal = match[idx + 1];
          if (!matchedVal) return;

          if (ph === '{AMOUNT}') {
            const val = parseFloat(matchedVal.replace(/,/g, ''));
            if (!isNaN(val) && val > 0) amount = val;
          } else if (ph === '{MERCHANT}') {
            merchant = matchedVal.trim();
          } else if (ph === '{CURRENCY}') {
            const curStr = matchedVal.toUpperCase();
            if (curStr.includes('₹') || curStr.includes('INR') || curStr.includes('RS')) currency = 'INR';
            else if (curStr.includes('$') || curStr.includes('USD')) currency = 'USD';
            else if (curStr.includes('€') || curStr.includes('EUR')) currency = 'EUR';
            else if (curStr.includes('£') || curStr.includes('GBP')) currency = 'GBP';
            else if (curStr.includes('¥') || curStr.includes('JPY')) currency = 'JPY';
          }
        });

        if (amount && amount > 0) {
          const classification = categorizeNoteWithArcticFTS5(merchant + ' ' + rawText);
          return {
            rawText,
            amount,
            currency,
            merchant: merchant || 'Store Purchase',
            date: new Date().toISOString().split('T')[0],
            suggestedCategoryId: classification.categoryId,
            suggestedCategoryName: classification.categoryName,
            confidence: Math.max(90, classification.confidence),
          };
        }
      }
    } catch {
      // Continue to next template if compile/match fails
    }
  }

  // Fallback to core parser if custom templates don't match
  return parseNotificationText(rawText, defaultCurrency);
}

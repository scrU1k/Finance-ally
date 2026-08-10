/**
 * cfgParser.ts
 * Context-Free Grammar (CFG) Slot-Filling Parser for Personal Finance Queries.
 * Formally parses inputs into structured intent and slot entities.
 */

import { globalFinancialTrie } from './trieDictionary';

export type CFGIntentType =
  | 'TOTAL_SPEND'
  | 'HIGHEST_EXPENSE'
  | 'LOWEST_EXPENSE'
  | 'TRANSACTION_COUNT'
  | 'AVERAGE_SPEND'
  | 'TOP_CATEGORY'
  | 'BOTTOM_CATEGORY'
  | 'WEEKEND_VS_WEEKDAY'
  | 'MONTH_COMPARISON'
  | 'PAYMENT_METHOD_QUERY'
  | 'RECENT_LIST'
  | 'STREAK'
  | 'REMAINING_BUDGET'
  | 'UNKNOWN';

export interface CFGSlotParseResult {
  intent: CFGIntentType;
  entitySlot?: string;       // e.g. "coffee", "groceries", "starbucks"
  periodSlot?: string;       // e.g. "2nd august", "yesterday", "july"
  paymentMethodSlot?: string;// e.g. "UPI", "Cash", "Card"
  thresholdSlot?: { operator: '>' | '<' | '='; amount: number };
  confidence: number;
}

export function parseCFGQuerySlots(text: string): CFGSlotParseResult {
  const normalized = text.toLowerCase().trim();
  if (!normalized) {
    return { intent: 'UNKNOWN', confidence: 0 };
  }

  // 1. Extract tokens via Trie Dictionary
  const extractedTokens = globalFinancialTrie.extractMatchingTokens(normalized);
  let paymentMethodSlot: string | undefined;
  let entitySlot: string | undefined;

  extractedTokens.forEach(t => {
    if (t.metadata.paymentMethod) {
      paymentMethodSlot = t.metadata.paymentMethod;
    }
    if (t.metadata.category && !entitySlot) {
      entitySlot = t.word;
    }
  });

  // 2. CFG Non-Terminal Intent Production Rules
  let intent: CFGIntentType = 'UNKNOWN';
  let confidence = 0;

  if (
    normalized.includes('what did i buy') ||
    normalized.includes('what did i spend') ||
    normalized.includes('show my purchases') ||
    normalized.includes('list transactions') ||
    normalized.includes('what expenses')
  ) {
    intent = 'RECENT_LIST';
    confidence = 98;
  } else if (
    normalized.includes('highest') ||
    normalized.includes('biggest') ||
    normalized.includes('max') ||
    normalized.includes('most expensive') ||
    normalized.includes('largest')
  ) {
    intent = 'HIGHEST_EXPENSE';
    confidence = 98;
  } else if (
    normalized.includes('least') ||
    normalized.includes('lowest') ||
    normalized.includes('smallest') ||
    normalized.includes('cheapest') ||
    normalized.includes('min')
  ) {
    intent = 'LOWEST_EXPENSE';
    confidence = 98;
  } else if (
    normalized.includes('how many times') ||
    normalized.includes('how many transactions') ||
    normalized.includes('number of times') ||
    normalized.includes('count of')
  ) {
    intent = 'TRANSACTION_COUNT';
    confidence = 98;
  } else if (
    normalized.includes('average') ||
    normalized.includes('avg') ||
    normalized.includes('per day') ||
    normalized.includes('daily average')
  ) {
    intent = 'AVERAGE_SPEND';
    confidence = 98;
  } else if (
    normalized.includes('how much') ||
    normalized.includes('total') ||
    normalized.includes('spent on') ||
    normalized.includes('spend on') ||
    normalized.includes('sum of')
  ) {
    intent = 'TOTAL_SPEND';
    confidence = 95;
  } else if (normalized.includes('streak') || normalized.includes('consecutive')) {
    intent = 'STREAK';
    confidence = 98;
  } else if (normalized.includes('budget') || normalized.includes('leftover') || normalized.includes('remaining')) {
    intent = 'REMAINING_BUDGET';
    confidence = 98;
  }

  // 3. Extract Threshold Slot (e.g. "above 500", "over 1000", "below 200")
  let thresholdSlot: { operator: '>' | '<' | '='; amount: number } | undefined;
  const threshMatch = normalized.match(/(above|over|more than|greater than|below|under|less than)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);
  if (threshMatch) {
    const opStr = threshMatch[1].toLowerCase();
    const amount = parseFloat(threshMatch[2]);
    const isGreater = opStr.includes('above') || opStr.includes('over') || opStr.includes('more') || opStr.includes('greater');
    thresholdSlot = {
      operator: isGreater ? '>' : '<',
      amount
    };
  }

  return {
    intent,
    entitySlot,
    paymentMethodSlot,
    thresholdSlot,
    confidence
  };
}

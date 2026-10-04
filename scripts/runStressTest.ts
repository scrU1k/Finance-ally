import './setupNodeEnv';
import { convertCurrencyAmount, formatCurrency, TOP_CURRENCIES } from '../src/services/currency';
import { isValidCalendarDate, isValidDateString, parseLocalDate, getWeekDateBounds, getLocalDateString } from '../src/utils/dateUtils';
import { isPendingScheduledTx, isFutureDateTime } from '../src/utils/scheduledUtils';
import { importTransactionsFromCSV } from '../src/services/csvParser';
import { generateRecoveryKey, normalizeRecoveryKey } from '../src/services/recoveryService';
import { computeFinancialProfile, computeProjections } from '../src/services/statisticalProfiler';
import { runExpertSystem } from '../src/services/expertSystem';
import { parseAndExecuteLocalQuery } from '../src/services/localQueryParser';
import { generateEndOfMonthAudit } from '../src/services/insightsEngine';
import { Transaction, Category, CurrencyCode, Subscription } from '../src/types';

// Polyfill for Node.js environment if needed
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
  const nodeCrypto = require('crypto');
  globalThis.crypto = nodeCrypto.webcrypto;
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

console.log('====================================================');
console.log('   FINANCE-ALLY v3.0 PRODUCTION STRESS TEST SUITE   ');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST SUITE 1: CURRENCY CALCULATIONS & FOREX RATES
// ----------------------------------------------------
console.log('[SUITE 1] Currency Calculations & Forex Safeguards');
{
  const convertedZero = convertCurrencyAmount(0, 'USD', 'EUR');
  assert(convertedZero === 0, 'Zero amount conversion returns 0');

  const convertedNaN = convertCurrencyAmount(NaN, 'USD', 'EUR');
  assert(convertedNaN === 0, 'NaN input gracefully returns 0 without crashing');

  const convertedInf = convertCurrencyAmount(Infinity, 'USD', 'EUR');
  assert(convertedInf === 0, 'Infinity input gracefully returns 0 without crashing');

  const sameCurrency = convertCurrencyAmount(123.45, 'INR', 'INR');
  assert(sameCurrency === 123.45, 'Identical currency returns exact original amount');

  // Multi-currency cross conversions
  const mockRates: Record<CurrencyCode, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    INR: 83.5,
    JPY: 155.2,
    CAD: 1.37,
    AUD: 1.52,
    CHF: 0.90,
    CNY: 7.24,
    SGD: 1.35
  };

  // Convert 100 USD to INR -> 8350.00
  const usdToInr = convertCurrencyAmount(100, 'USD', 'INR', mockRates);
  assert(Math.abs(usdToInr - 8350) < 0.01, `USD to INR conversion accurate: ${usdToInr} (expected 8350)`);

  // Convert 8350 INR to USD -> 100.00
  const inrToUsd = convertCurrencyAmount(8350, 'INR', 'USD', mockRates);
  assert(Math.abs(inrToUsd - 100) < 0.01, `INR to USD conversion accurate: ${inrToUsd} (expected 100)`);

  // Convert 100 EUR to GBP: 100 / 0.92 * 0.79 = 85.87
  const eurToGbp = convertCurrencyAmount(100, 'EUR', 'GBP', mockRates);
  assert(Math.abs(eurToGbp - 85.87) < 0.05, `EUR to GBP cross conversion accurate: ${eurToGbp} (expected 85.87)`);

  // Rounding precision check
  const rounded = convertCurrencyAmount(10.55555, 'USD', 'USD');
  assert(rounded === 10.55555, 'Preserves precision when from === to');

  // Format currency tests
  const formattedUsd = formatCurrency(1234.5, 'USD');
  assert(formattedUsd.includes('$') || formattedUsd.includes('1,234.50'), `Format USD: ${formattedUsd}`);

  const formattedInr = formatCurrency(50000, 'INR');
  assert(formattedInr.includes('₹') || formattedInr.includes('50,000'), `Format INR: ${formattedInr}`);
}

// ----------------------------------------------------
// TEST SUITE 2: CALENDAR DATES & LEAP YEAR BOUNDARIES
// ----------------------------------------------------
console.log('\n[SUITE 2] Date Utils & Calendar Boundary Stress');
{
  // Leap year Feb 29
  assert(isValidCalendarDate(2024, 2, 29) === true, '2024-02-29 is a valid leap year date');
  assert(isValidCalendarDate(2028, 2, 29) === true, '2028-02-29 is a valid leap year date');
  assert(isValidCalendarDate(2000, 2, 29) === true, '2000-02-29 is a valid century leap year date');
  assert(isValidCalendarDate(1900, 2, 29) === false, '1900-02-29 is an invalid century non-leap date');

  // Non-leap year Feb 29
  assert(isValidCalendarDate(2023, 2, 29) === false, '2023-02-29 rejected (non-leap year)');
  assert(isValidCalendarDate(2025, 2, 29) === false, '2025-02-29 rejected (non-leap year)');
  assert(isValidCalendarDate(2026, 2, 29) === false, '2026-02-29 rejected (non-leap year)');

  // 30-day months with 31 days
  assert(isValidCalendarDate(2024, 4, 31) === false, 'April 31 rejected');
  assert(isValidCalendarDate(2024, 6, 31) === false, 'June 31 rejected');
  assert(isValidCalendarDate(2024, 9, 31) === false, 'September 31 rejected');
  assert(isValidCalendarDate(2024, 11, 31) === false, 'November 31 rejected');

  // 31-day months
  assert(isValidCalendarDate(2024, 1, 31) === true, 'January 31 valid');
  assert(isValidCalendarDate(2024, 3, 31) === true, 'March 31 valid');
  assert(isValidCalendarDate(2024, 5, 31) === true, 'May 31 valid');
  assert(isValidCalendarDate(2024, 7, 31) === true, 'July 31 valid');
  assert(isValidCalendarDate(2024, 8, 31) === true, 'August 31 valid');
  assert(isValidCalendarDate(2024, 10, 31) === true, 'October 31 valid');
  assert(isValidCalendarDate(2024, 12, 31) === true, 'December 31 valid');

  // String format validation
  assert(isValidDateString('2024-02-29') === true, 'Valid string: 2024-02-29');
  assert(isValidDateString('2023-02-29') === false, 'Invalid string: 2023-02-29');
  assert(isValidDateString('2024-02-30') === false, 'Invalid string: 2024-02-30');
  assert(isValidDateString('not-a-date') === false, 'Invalid string: not-a-date');
  assert(isValidDateString('2024-13-01') === false, 'Invalid month 13 rejected');
  assert(isValidDateString('2024-00-15') === false, 'Invalid month 0 rejected');

  // Week bounds
  const bounds = getWeekDateBounds('2026-10-04');
  assert(isValidDateString(bounds.monStr), `Week Monday valid: ${bounds.monStr}`);
  assert(isValidDateString(bounds.sunStr), `Week Sunday valid: ${bounds.sunStr}`);
  assert(bounds.weekNo >= 1 && bounds.weekNo <= 53, `Week number valid: ${bounds.weekNo}`);
}

// ----------------------------------------------------
// TEST SUITE 3: RECURRING SUBSCRIPTION ANCHOR ADVANCEMENT
// ----------------------------------------------------
console.log('\n[SUITE 3] Recurring Subscription Anchor Day Preservation');
{
  const advanceDueDate = (currentDueDateStr: string, cycle: Subscription['billingCycle'], anchorDay?: number): string => {
    const [curY, curM, curD] = currentDueDateStr.split('-').map(Number);
    let targetY = curY;
    let targetM = curM - 1; // 0-indexed
    const originalDay = anchorDay || curD;

    if (cycle === 'monthly') targetM += 1;
    else if (cycle === 'bi-monthly') targetM += 2;
    else if (cycle === 'tri-monthly') targetM += 3;
    else if (cycle === 'annually') targetY += 1;

    if (targetM >= 12) {
      targetY += Math.floor(targetM / 12);
      targetM = targetM % 12;
    }

    const maxDays = new Date(targetY, targetM + 1, 0).getDate();
    const targetD = Math.min(originalDay, maxDays);
    return `${targetY}-${String(targetM + 1).padStart(2, '0')}-${String(targetD).padStart(2, '0')}`;
  };

  // Monthly subscription created on Jan 31 (anchor = 31)
  const febDate = advanceDueDate('2024-01-31', 'monthly', 31);
  assert(febDate === '2024-02-29', `Jan 31 (2024 leap) advances to Feb 29: ${febDate}`);

  // From Feb 29, next cycle should restore anchor 31 -> Mar 31!
  const marDate = advanceDueDate(febDate, 'monthly', 31);
  assert(marDate === '2024-03-31', `Feb 29 restores anchor day 31 to March 31: ${marDate}`);

  // From Mar 31 -> Apr 30 (April has 30 days)
  const aprDate = advanceDueDate(marDate, 'monthly', 31);
  assert(aprDate === '2024-04-30', `Mar 31 advances to Apr 30: ${aprDate}`);

  // From Apr 30 -> May 31 (May has 31 days)
  const mayDate = advanceDueDate(aprDate, 'monthly', 31);
  assert(mayDate === '2024-05-31', `Apr 30 restores anchor day 31 to May 31: ${mayDate}`);

  // Year boundary rollover: Nov 30 monthly -> Dec 30 -> Jan 30
  const decDate = advanceDueDate('2024-11-30', 'monthly', 30);
  assert(decDate === '2024-12-30', `Nov 30 advances to Dec 30: ${decDate}`);
  const nextJanDate = advanceDueDate(decDate, 'monthly', 30);
  assert(nextJanDate === '2025-01-30', `Dec 30 advances to Jan 30 next year: ${nextJanDate}`);

  // Annual subscription on Leap Day (Feb 29, 2024)
  const nextYearLeapSub = advanceDueDate('2024-02-29', 'annually', 29);
  assert(nextYearLeapSub === '2025-02-28', `Annual leap day sub in non-leap year falls to Feb 28: ${nextYearLeapSub}`);
}

// ----------------------------------------------------
// TEST SUITE 4: PENDING SCHEDULED TRANSACTION FILTERING
// ----------------------------------------------------
console.log('\n[SUITE 4] Pending Scheduled Transaction Filtering');
{
  const now = new Date();
  const pastDate = new Date(now.getTime() - 86400000); // 1 day ago
  const futureDate = new Date(now.getTime() + 86400000 * 5); // 5 days ahead

  const pastTx: Transaction = {
    id: 'tx-past',
    amount: 100,
    date: getLocalDateString(pastDate),
    time: '10:00',
    categoryId: 'food',
    paymentMethod: 'UPI',
    isAutoParsed: false,
    createdAt: pastDate.getTime(),
    isScheduled: true
  };

  const futureTx: Transaction = {
    id: 'tx-future',
    amount: 500,
    date: getLocalDateString(futureDate),
    time: '12:00',
    categoryId: 'rent',
    paymentMethod: 'NetBanking',
    isAutoParsed: false,
    createdAt: Date.now(),
    isScheduled: true
  };

  const futureNonScheduledTx: Transaction = {
    id: 'tx-future-explicit-false',
    amount: 250,
    date: getLocalDateString(futureDate),
    time: '12:00',
    categoryId: 'shopping',
    paymentMethod: 'Card',
    isAutoParsed: false,
    createdAt: Date.now(),
    isScheduled: false
  };

  assert(isPendingScheduledTx(pastTx) === false, 'Past transaction with isScheduled=true is SETTLED (not pending)');
  assert(isPendingScheduledTx(futureTx) === true, 'Future transaction with isScheduled=true is PENDING');
  assert(isPendingScheduledTx(futureNonScheduledTx) === false, 'Explicit isScheduled=false is SETTLED even if date is future');
}

// ----------------------------------------------------
// TEST SUITE 5: CSV PARSER RIGOROUS INPUT STRESS
// ----------------------------------------------------
console.log('\n[SUITE 5] CSV Parser Edge Cases & Impossible Dates');
{
  const categories: Category[] = [
    { id: 'cat-1', name: 'Food', color: '#ff0000' },
    { id: 'cat-2', name: 'Travel', color: '#00ff00' }
  ];

  // CSV with impossible calendar date (Feb 30)
  const csvWithFeb30 = `Date,Amount,Category,Note
2024-02-30,500,Food,Impossible date test
2024-02-28,250,Food,Valid date test`;

  const res1 = importTransactionsFromCSV(csvWithFeb30, categories, 'INR');
  assert(res1.transactions.length === 1, `Rejected Feb 30: parsed ${res1.transactions.length}/2 transactions`);
  assert(res1.errors.length >= 1, `Reported error for invalid calendar date: "${res1.errors[0]}"`);

  // CSV with negative/zero amount
  const csvWithBadAmounts = `Date,Amount,Category,Note
2024-01-15,-50,Food,Negative
2024-01-16,0,Food,Zero
2024-01-17,100,Food,Valid`;

  const res2 = importTransactionsFromCSV(csvWithBadAmounts, categories, 'INR');
  assert(res2.transactions.length === 1, `Rejected negative & zero: parsed ${res2.transactions.length}/3 transactions`);

  // CSV with diverse currencies
  const csvMultiCurr = `Date,Amount,Category,Currency,Note
2024-03-01,15.50,Food,USD,US lunch
2024-03-02,20.00,Food,EUR,Euro lunch
2024-03-03,500,Travel,INR,Auto rickshaw`;

  const res3 = importTransactionsFromCSV(csvMultiCurr, categories, 'INR');
  assert(res3.transactions.length === 3, `Parsed all 3 multi-currency rows`);
  assert(res3.transactions[0].currency === 'USD', `Preserved USD currency`);
  assert(res3.transactions[1].currency === 'EUR', `Preserved EUR currency`);
  assert(res3.transactions[2].currency === 'INR', `Preserved INR currency`);
}

// ----------------------------------------------------
// TEST SUITE 6: GLOBAL RECOVERY KEY ENTROPY & INTEGRITY
// ----------------------------------------------------
console.log('\n[SUITE 6] Global Recovery Key Entropy & Formatting');
{
  const keys = new Set<string>();
  const KEY_COUNT = 500;
  for (let i = 0; i < KEY_COUNT; i++) {
    const k = generateRecoveryKey();
    keys.add(k);
    if (i === 0) {
      assert(/^FAK-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}$/.test(k), `Format matches FAK-xxxx-xxxx-xxxx-xxxx: ${k}`);
    }
  }
  assert(keys.size === KEY_COUNT, `Generated ${KEY_COUNT} unique keys with 0 collisions`);

  const trimmed = normalizeRecoveryKey('  FAK-1234-abcd-5678-efgh  \n');
  assert(trimmed === 'FAK-1234-abcd-5678-efgh', 'Normalizes recovery key cleanly');
}

// ----------------------------------------------------
// TEST SUITE 7: FINANCIAL PROFILER & HIGH-VOLUME STRESS
// ----------------------------------------------------
console.log('\n[SUITE 7] High-Volume Data Stress (5,000 Transactions)');
{
  const mockCategories: Category[] = [
    { id: 'cat-groceries', name: 'Groceries', color: '#10B981' },
    { id: 'cat-rent', name: 'Rent', color: '#EF4444' },
    { id: 'cat-dining', name: 'Dining', color: '#F59E0B' },
    { id: 'cat-transport', name: 'Transport', color: '#3B82F6' },
    { id: 'cat-utilities', name: 'Utilities', color: '#8B5CF6' },
  ];

  const syntheticTxs: Transaction[] = [];
  const startMs = Date.now() - 180 * 86400000; // 6 months of data

  for (let i = 0; i < 5000; i++) {
    const txTime = startMs + (i * (180 * 86400000 / 5000));
    const d = new Date(txTime);
    const cat = mockCategories[i % mockCategories.length];
    const isFuture = txTime > Date.now();

    syntheticTxs.push({
      id: `tx-syn-${i}`,
      amount: 50 + (i % 500),
      date: getLocalDateString(d),
      time: '14:30',
      categoryId: cat.id,
      paymentMethod: i % 2 === 0 ? 'UPI' : 'Card',
      isAutoParsed: i % 3 === 0,
      createdAt: txTime,
      currency: i % 10 === 0 ? 'USD' : (i % 20 === 0 ? 'EUR' : 'INR'),
      isScheduled: isFuture
    });
  }

  const t0 = performance.now();
  const profile = computeFinancialProfile(syntheticTxs, 'INR');
  const t1 = performance.now();

  assert(profile.dataMonthsCount >= 5, `Financial profile identified ${profile.dataMonthsCount} months`);
  assert(profile.avgMonthlySpend > 0, `Average monthly spend calculated: ${profile.avgMonthlySpend}`);
  assert(profile.spendBands.low <= profile.spendBands.median, 'Percentiles: low <= median');
  assert(profile.spendBands.median <= profile.spendBands.high, 'Percentiles: median <= high');
  assert(t1 - t0 < 150, `Profiler calculated 5,000 txs in ${(t1 - t0).toFixed(2)}ms (< 150ms target)`);

  // Projections
  const proj = computeProjections(syntheticTxs, profile, 'INR');
  assert(proj !== null, 'Projection generated successfully');
  if (proj) {
    assert(proj.projectedTotal > 0, `Projected total: ${proj.projectedTotal}`);
    assert(proj.daysPassed >= 1 && proj.daysPassed <= 31, `Days passed in month: ${proj.daysPassed}`);
  }

  // End of Month Audit
  const audit = generateEndOfMonthAudit(syntheticTxs, mockCategories, getLocalDateString().slice(0, 7), 'INR');
  assert(audit.totalSpent > 0, `Audit total spent: ${audit.totalSpent}`);
  assert(audit.topCategories.length > 0, `Audit top categories: ${audit.topCategories.length}`);
  assert(['A+', 'A', 'B', 'C', 'D', 'F', 'O'].includes(audit.budgetHealthScore), `Audit grade valid: ${audit.budgetHealthScore}`);
}

// ----------------------------------------------------
// TEST SUITE 8: LOCAL QUERY PARSER & INTENT RESOLUTION
// ----------------------------------------------------
console.log('\n[SUITE 8] Local Query Parser & Intent Engine');
async function runQuerySuite() {
  const categories: Category[] = [
    { id: 'cat-groceries', name: 'Groceries', color: '#10B981' },
    { id: 'cat-dining', name: 'Dining', color: '#F59E0B' },
  ];

  const todayStr = getLocalDateString();
  const sampleTxs: Transaction[] = [
    { id: 't1', amount: 350, date: todayStr, time: '12:00', categoryId: 'cat-dining', paymentMethod: 'UPI', isAutoParsed: false, createdAt: Date.now() },
    { id: 't2', amount: 1200, date: todayStr, time: '15:00', categoryId: 'cat-groceries', paymentMethod: 'Card', isAutoParsed: false, createdAt: Date.now() },
    { id: 't3', amount: 9999, date: '2099-01-01', time: '10:00', categoryId: 'cat-dining', paymentMethod: 'UPI', isAutoParsed: false, createdAt: Date.now(), isScheduled: true },
  ];

  // Query: total spent today
  const resToday = await parseAndExecuteLocalQuery('how much did i spend today', sampleTxs, categories, 'INR');
  assert(resToday.matched === true, 'Query "how much did i spend today" matched');
  assert(resToday.answer.includes('1,550'), `Excluded scheduled ₹9999, correct total ₹1,550: ${resToday.answer}`);

  // Query: dining spend
  const resDining = await parseAndExecuteLocalQuery('spend on dining', sampleTxs, categories, 'INR');
  assert(resDining.matched === true, 'Query "spend on dining" matched');
  assert(resDining.answer.includes('350'), `Correct dining spend ₹350: ${resDining.answer}`);

  // Expert Intent: Consultation
  const expertAns = runExpertSystem('can i afford 2000 watch', sampleTxs, categories, 'INR');
  assert(expertAns.matched === true, 'Expert system answered afford query');

  console.log('\n====================================================');
  console.log(`STRESS TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runQuerySuite().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});

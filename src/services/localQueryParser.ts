import { Transaction, Category, CurrencyCode } from '../types';
import { formatCurrency } from './currency';

export interface LocalQueryResult {
  matched: boolean;
  answer: string;
  detail?: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  january: '01', jan: '01', february: '02', feb: '02',
  march: '03', mar: '03', april: '04', apr: '04', may: '05',
  june: '06', jun: '06', july: '07', jul: '07',
  august: '08', aug: '08', september: '09', sep: '09',
  october: '10', oct: '10', november: '11', nov: '11',
  december: '12', dec: '12'
};

const MONTH_NUM_TO_NAME: Record<string, string> = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December'
};

const STOP_WORDS = new Set([
  'when', 'did', 'i', 'pay', 'paid', 'for', 'how', 'much', 'spend', 'spent',
  'on', 'in', 'last', 'this', 'month', 'the', 'a', 'an', 'at', 'was', 'my',
  'total', 'mode', 'method', 'way', 'date', 'time', 'day', 'cost', 'where',
  'category', 'what', 'which', 'buy', 'bought', 'purchase', 'purchases',
  'list', 'show', 'me', 'all', 'have', 'had', 'been', 'any', 'by', 'of',
  'do', 'does', 'is', 'are', 'transaction', 'transactions', 'expense', 'expenses'
]);

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function isSameDate(txDate: string, y: number, m: number, d: number): boolean {
  if (!txDate) return false;
  const clean = txDate.split('T')[0];
  const parts = clean.split(/[-/.]/);
  if (parts.length < 3) return false;
  return parseInt(parts[0], 10) === y && parseInt(parts[1], 10) === m && parseInt(parts[2], 10) === d;
}

function sumTxs(txs: Transaction[]): number {
  return txs.reduce((sum, t) => sum + t.amount, 0);
}

function avgTxs(txs: Transaction[]): number {
  return txs.length === 0 ? 0 : sumTxs(txs) / txs.length;
}

function topCategories(
  txs: Transaction[],
  categories: Category[],
  n = 3
): Array<{ name: string; amount: number; count: number }> {
  const map: Record<string, { amount: number; count: number }> = {};
  txs.forEach(t => {
    if (!map[t.categoryId]) map[t.categoryId] = { amount: 0, count: 0 };
    map[t.categoryId].amount += t.amount;
    map[t.categoryId].count += 1;
  });
  return Object.entries(map)
    .map(([id, v]) => ({
      name: categories.find(c => c.id === id)?.name ?? 'General',
      amount: v.amount,
      count: v.count
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

function uniqueActiveDays(txs: Transaction[]): number {
  return new Set(txs.map(t => t.date.split('T')[0])).size;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────

export function parseAndExecuteLocalQuery(
  query: string,
  transactions: Transaction[],
  categories: Category[],
  baseCurrency: CurrencyCode
): LocalQueryResult {

  const fmt = (amt: number) => formatCurrency(amt, baseCurrency);
  const cleanQ = query.toLowerCase().replace(/[?.,!/\\`~()]/g, ' ').trim();
  const q = cleanQ;

  if (transactions.length === 0) {
    return {
      matched: true,
      answer: "You haven't logged any transactions yet.",
      detail: "Add a few expenses first and I'll be able to answer questions about your spending."
    };
  }

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const currentMonthKey = monthKey(thisYear, thisMonth);
  const prevMonthKey = monthKey(
    thisMonth === 1 ? thisYear - 1 : thisYear,
    thisMonth === 1 ? 12 : thisMonth - 1
  );

  // ── PERIOD HELPERS ──────────────────────────
  function txsForPeriod(label: 'thisMonth' | 'lastMonth' | 'thisWeek' | 'lastWeek' | 'today' | 'yesterday' | 'allTime'): Transaction[] {
    const today = new Date();
    switch (label) {
      case 'thisMonth': return transactions.filter(t => t.date.startsWith(currentMonthKey));
      case 'lastMonth': return transactions.filter(t => t.date.startsWith(prevMonthKey));
      case 'today': return transactions.filter(t =>
        isSameDate(t.date, thisYear, thisMonth, today.getDate()));
      case 'yesterday': {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return transactions.filter(t => isSameDate(t.date, y.getFullYear(), y.getMonth() + 1, y.getDate()));
      }
      case 'thisWeek': {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return transactions.filter(t => new Date(t.date) >= startOfWeek);
      }
      case 'lastWeek': {
        const startOfLastWeek = new Date(today);
        startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
        startOfLastWeek.setHours(0, 0, 0, 0);
        const endOfLastWeek = new Date(startOfLastWeek);
        endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
        endOfLastWeek.setHours(23, 59, 59, 999);
        return transactions.filter(t => {
          const d = new Date(t.date);
          return d >= startOfLastWeek && d <= endOfLastWeek;
        });
      }
      case 'allTime': return transactions;
    }
  }

  function detectPeriod(): {
    txs: Transaction[];
    label: string;
    key?: string;
  } {
    if (q.includes('today')) return { txs: txsForPeriod('today'), label: 'today' };
    if (q.includes('yesterday')) return { txs: txsForPeriod('yesterday'), label: 'yesterday' };
    if (q.includes('last week')) return { txs: txsForPeriod('lastWeek'), label: 'last week' };
    if (q.includes('this week') || q.includes('current week')) return { txs: txsForPeriod('thisWeek'), label: 'this week' };
    if (q.includes('last month')) return { txs: txsForPeriod('lastMonth'), label: 'last month' };
    if (q.includes('this month') || q.includes('current month')) return { txs: txsForPeriod('thisMonth'), label: 'this month' };

    // Named month: "in july", "during august", "for june"
    for (const [name, num] of Object.entries(MONTH_NAMES)) {
      if (new RegExp(`\\b${name}\\b`).test(q)) {
        const mk = `${thisYear}-${num}`;
        return {
          txs: transactions.filter(t => t.date.startsWith(mk)),
          label: MONTH_NUM_TO_NAME[num] ?? name,
          key: mk
        };
      }
    }

    // Default: this month if available, else all-time
    const thisMonthTxs = txsForPeriod('thisMonth');
    return thisMonthTxs.length > 0
      ? { txs: thisMonthTxs, label: 'this month' }
      : { txs: transactions, label: 'all time' };
  }

  // ── 0. SPECIFIC DATE QUERY ───────────────────
  const monthRegex = '(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)';
  const dateMatch1 = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${monthRegex}\\b`, 'i'));
  const dateMatch2 = q.match(new RegExp(`\\b${monthRegex}\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));

  let targetYear: number | null = null;
  let targetMonthNum: number | null = null;
  let targetDayNum: number | null = null;
  let displayDateLabel = '';

  if (dateMatch1) {
    const day = parseInt(dateMatch1[1], 10);
    const mStr = MONTH_NAMES[dateMatch1[2].toLowerCase()];
    if (mStr && !isNaN(day)) {
      targetYear = thisYear; targetMonthNum = parseInt(mStr, 10); targetDayNum = day;
      displayDateLabel = `${dateMatch1[2]} ${day}, ${thisYear}`;
    }
  } else if (dateMatch2) {
    const mStr = MONTH_NAMES[dateMatch2[1].toLowerCase()];
    const day = parseInt(dateMatch2[2], 10);
    if (mStr && !isNaN(day)) {
      targetYear = thisYear; targetMonthNum = parseInt(mStr, 10); targetDayNum = day;
      displayDateLabel = `${dateMatch2[1]} ${day}, ${thisYear}`;
    }
  } else if (q.includes('yesterday') && (q.includes('what') || q.includes('show') || q.includes('list') || q.includes('bought') || q.includes('spent'))) {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    targetYear = y.getFullYear(); targetMonthNum = y.getMonth() + 1; targetDayNum = y.getDate();
    displayDateLabel = 'Yesterday';
  } else if (q.includes('today') && (q.includes('what') || q.includes('show') || q.includes('list') || q.includes('bought') || q.includes('spent'))) {
    targetYear = thisYear; targetMonthNum = thisMonth; targetDayNum = now.getDate();
    displayDateLabel = 'Today';
  }

  if (targetYear !== null && targetMonthNum !== null && targetDayNum !== null) {
    const dateTxs = transactions.filter(t =>
      isSameDate(t.date, targetYear!, targetMonthNum!, targetDayNum!));
    if (dateTxs.length > 0) {
      const total = sumTxs(dateTxs);
      const items = dateTxs.map(t => {
        const cat = categories.find(c => c.id === t.categoryId);
        return `${t.note || cat?.name || 'Expense'} (${fmt(t.amount)})`;
      }).join(', ');
      return {
        matched: true,
        answer: `On ${displayDateLabel}, you spent ${fmt(total)} across ${dateTxs.length} transaction${dateTxs.length > 1 ? 's' : ''}.`,
        detail: `Items: ${items}.`
      };
    } else {
      return {
        matched: true,
        answer: `No transactions logged on ${displayDateLabel}.`,
        detail: undefined
      };
    }
  }

  // ── 1. TOTAL SPEND FOR PERIOD ────────────────
  const isTotalQuery = q.includes('total') || q.includes('how much') || q.includes('spent') ||
    q.includes('spend') || (q.includes('what') && q.includes('spend'));

  if (isTotalQuery && !q.includes('average') && !q.includes('avg')) {
    // Category-specific total: "how much on food this month"
    for (const cat of categories) {
      if (q.includes(cat.name.toLowerCase())) {
        const { txs, label } = detectPeriod();
        const catTxs = txs.filter(t => t.categoryId === cat.id);
        const total = sumTxs(catTxs);
        if (catTxs.length > 0) {
          return {
            matched: true,
            answer: `You spent ${fmt(total)} on ${cat.name} (${label}).`,
            detail: `${catTxs.length} transaction${catTxs.length > 1 ? 's' : ''} in this category.`
          };
        } else {
          return {
            matched: true,
            answer: `No ${cat.name} transactions found for ${label}.`,
            detail: undefined
          };
        }
      }
    }

    // General total
    const { txs, label } = detectPeriod();
    const total = sumTxs(txs);
    if (txs.length > 0) {
      const tops = topCategories(txs, categories, 2);
      const topStr = tops.map(c => `${c.name} (${fmt(c.amount)})`).join(', ');
      return {
        matched: true,
        answer: `You spent ${fmt(total)} ${label}.`,
        detail: tops.length > 0 ? `Top categories: ${topStr}.` : undefined
      };
    }
  }

  // ── 2. AVERAGE SPEND QUERIES ─────────────────
  if (q.includes('average') || q.includes('avg') || q.includes('per day') || q.includes('daily')) {
    const { txs, label } = detectPeriod();
    if (txs.length === 0) {
      return { matched: true, answer: `No transactions found for ${label}.` };
    }

    if (q.includes('per transaction') || q.includes('per expense') || q.includes('each')) {
      const avg = avgTxs(txs);
      return {
        matched: true,
        answer: `Your average transaction amount is ${fmt(avg)} (${label}).`,
        detail: `Based on ${txs.length} transactions totaling ${fmt(sumTxs(txs))}.`
      };
    }

    // Daily average
    const activeDays = uniqueActiveDays(txs);
    const dailyAvg = activeDays > 0 ? sumTxs(txs) / activeDays : 0;
    return {
      matched: true,
      answer: `Your average daily spend is ${fmt(dailyAvg)} (${label}).`,
      detail: `You spent on ${activeDays} out of the tracked days. Total: ${fmt(sumTxs(txs))}.`
    };
  }

  // ── 3. TRANSACTION COUNT ─────────────────────
  if (q.includes('how many') || q.includes('count') || q.includes('number of') || q.includes('times')) {
    const { txs, label } = detectPeriod();

    // Category-specific count
    for (const cat of categories) {
      if (q.includes(cat.name.toLowerCase())) {
        const catTxs = txs.filter(t => t.categoryId === cat.id);
        return {
          matched: true,
          answer: `You logged ${catTxs.length} ${cat.name} transaction${catTxs.length !== 1 ? 's' : ''} (${label}).`,
          detail: catTxs.length > 0 ? `Total: ${fmt(sumTxs(catTxs))}.` : undefined
        };
      }
    }

    // Merchant-specific count
    const tokens = q.split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length >= 2);
    if (tokens.length > 0) {
      const matches = txs.filter(t =>
        tokens.some(tok => (t.note || '').toLowerCase().includes(tok)));
      if (matches.length > 0) {
        return {
          matched: true,
          answer: `You made ${matches.length} matching transaction${matches.length !== 1 ? 's' : ''} (${label}).`,
          detail: `Total spent: ${fmt(sumTxs(matches))}.`
        };
      }
    }

    return {
      matched: true,
      answer: `You logged ${txs.length} transaction${txs.length !== 1 ? 's' : ''} (${label}).`,
      detail: `Total: ${fmt(sumTxs(txs))}.`
    };
  }

  // ── 4. HIGHEST / LARGEST SINGLE TRANSACTION ──
  const isHighestTxQuery =
    (q.includes('biggest') || q.includes('largest') || q.includes('highest') || q.includes('most expensive')) &&
    (q.includes('purchase') || q.includes('transaction') || q.includes('expense') || q.includes('bought') || q.includes('spent') || q.includes('buy'));

  if (isHighestTxQuery) {
    const { txs, label } = detectPeriod();
    if (txs.length === 0) return { matched: true, answer: `No transactions found for ${label}.` };
    const top = txs.reduce((a, b) => a.amount > b.amount ? a : b);
    const cat = categories.find(c => c.id === top.categoryId);
    return {
      matched: true,
      answer: `Your largest single expense (${label}) was ${fmt(top.amount)} for "${top.note || cat?.name || 'Expense'}".`,
      detail: `Category: ${cat?.name ?? 'General'} | Date: ${top.date}${top.time ? ' at ' + top.time : ''}.`
    };
  }

  // ── 5. BIGGEST SPENDING CATEGORY ─────────────
  if ((q.includes('biggest') || q.includes('largest') || q.includes('top') || q.includes('most')) &&
    (q.includes('category') || q.includes('categories'))) {
    const { txs, label } = detectPeriod();
    const tops = topCategories(txs, categories, 3);
    if (tops.length === 0) return { matched: true, answer: `No category data for ${label}.` };
    const [first, ...rest] = tops;
    return {
      matched: true,
      answer: `Your top spending category (${label}) is "${first.name}" at ${fmt(first.amount)}.`,
      detail: rest.length > 0
        ? `Runner-up: ${rest.map(c => `${c.name} (${fmt(c.amount)})`).join(', ')}.`
        : undefined
    };
  }

  // ── 6. LOWEST / SMALLEST ─────────────────────
  const isLeastQuery = q.includes('least') || q.includes('lowest') || q.includes('smallest') ||
    q.includes('minimum') || q.includes('cheapest');

  if (isLeastQuery) {
    const { txs, label } = detectPeriod();
    if (txs.length === 0) return { matched: true, answer: `No transactions found for ${label}.` };

    if (q.includes('category')) {
      const catMap: Record<string, number> = {};
      txs.forEach(t => { catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; });
      const [lowestId, lowestAmt] = Object.entries(catMap).reduce((a, b) => a[1] < b[1] ? a : b);
      const cat = categories.find(c => c.id === lowestId);
      return {
        matched: true,
        answer: `Your lowest spending category (${label}) is "${cat?.name ?? 'General'}" at ${fmt(lowestAmt)}.`,
        detail: undefined
      };
    }

    const smallest = txs.reduce((a, b) => a.amount < b.amount ? a : b);
    const cat = categories.find(c => c.id === smallest.categoryId);
    return {
      matched: true,
      answer: `Your smallest transaction (${label}) was ${fmt(smallest.amount)} for "${smallest.note || cat?.name || 'Expense'}".`,
      detail: `Date: ${smallest.date} | Category: ${cat?.name ?? 'General'}.`
    };
  }

  // ── 7. WEEKEND VS WEEKDAY ────────────────────
  if (q.includes('weekend') || q.includes('weekday')) {
    const { txs, label } = detectPeriod();
    let weekendSpend = 0; let weekdaySpend = 0;
    let weekendCount = 0; let weekdayCount = 0;
    txs.forEach(t => {
      const day = new Date(t.date).getDay();
      if (day === 0 || day === 6) { weekendSpend += t.amount; weekendCount++; }
      else { weekdaySpend += t.amount; weekdayCount++; }
    });
    const higher = weekendSpend > weekdaySpend ? 'weekends' : 'weekdays';
    return {
      matched: true,
      answer: `You spend more on ${higher} (${label}).`,
      detail: `Weekends: ${fmt(weekendSpend)} across ${weekendCount} transactions | Weekdays: ${fmt(weekdaySpend)} across ${weekdayCount} transactions.`
    };
  }

  // ── 8. DAY OF WEEK PATTERN ───────────────────
  if (q.includes('which day') || q.includes('what day') || (q.includes('day') && (q.includes('most') || q.includes('highest')))) {
    const { txs, label } = detectPeriod();
    const dayTotals: number[] = Array(7).fill(0);
    txs.forEach(t => { dayTotals[new Date(t.date).getDay()] += t.amount; });
    const maxDay = dayTotals.indexOf(Math.max(...dayTotals));
    return {
      matched: true,
      answer: `You spend the most on ${DAY_NAMES[maxDay]}s (${label}).`,
      detail: DAY_NAMES.map((d, i) => `${d}: ${fmt(dayTotals[i])}`).join(' | ')
    };
  }

  // ── 9. MONTH COMPARISON ──────────────────────
  if (q.includes('compared to') || q.includes('vs last month') || q.includes('versus') ||
    q.includes('diff') || q.includes('difference') || q.includes('more than last') || q.includes('less than last')) {
    const thisM = txsForPeriod('thisMonth');
    const lastM = txsForPeriod('lastMonth');
    const thisTotal = sumTxs(thisM);
    const lastTotal = sumTxs(lastM);
    const diff = thisTotal - lastTotal;
    const pct = lastTotal > 0 ? Math.abs((diff / lastTotal) * 100).toFixed(1) : null;
    const direction = diff > 0 ? 'more' : 'less';
    return {
      matched: true,
      answer: `You've spent ${fmt(Math.abs(diff))} ${direction} this month vs last month${pct ? ` (${pct}% ${diff > 0 ? 'increase' : 'decrease'})` : ''}.`,
      detail: `This month: ${fmt(thisTotal)} | Last month: ${fmt(lastTotal)}.`
    };
  }

  // ── 10. TWO SPECIFIC MONTH COMPARISON ────────
  const monthMatches: string[] = [];
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(q)) {
      if (!monthMatches.includes(num)) monthMatches.push(num);
    }
  }
  if (monthMatches.length === 2) {
    const [m1, m2] = monthMatches;
    const k1 = `${thisYear}-${m1}`;
    const k2 = `${thisYear}-${m2}`;
    const t1 = sumTxs(transactions.filter(t => t.date.startsWith(k1)));
    const t2 = sumTxs(transactions.filter(t => t.date.startsWith(k2)));
    const n1 = MONTH_NUM_TO_NAME[m1]; const n2 = MONTH_NUM_TO_NAME[m2];
    const higher = t1 > t2 ? n1 : n2;
    return {
      matched: true,
      answer: `You spent more in ${higher} (${fmt(Math.max(t1, t2))} vs ${fmt(Math.min(t1, t2))}).`,
      detail: `${n1}: ${fmt(t1)} | ${n2}: ${fmt(t2)}.`
    };
  }

  // ── 11. PAYMENT METHOD QUERIES ───────────────
  if (q.includes('upi') || q.includes('cash') || q.includes('card') || q.includes('credit') ||
    q.includes('debit') || q.includes('netbanking') || q.includes('payment method') || q.includes('how did i pay')) {
    const methods = ['upi', 'cash', 'credit card', 'debit card', 'netbanking', 'wallet'];
    const { txs, label } = detectPeriod();
    const methodMap: Record<string, { total: number; count: number }> = {};
    txs.forEach(t => {
      const m = (t.paymentMethod || 'other').toLowerCase();
      if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 };
      methodMap[m].total += t.amount;
      methodMap[m].count += 1;
    });

    // Specific method asked
    for (const method of methods) {
      if (q.includes(method)) {
        const data = methodMap[method];
        if (data) {
          return {
            matched: true,
            answer: `You paid ${fmt(data.total)} via ${method} (${label}).`,
            detail: `${data.count} transaction${data.count !== 1 ? 's' : ''} using this method.`
          };
        } else {
          return {
            matched: true,
            answer: `No ${method} transactions found for ${label}.`,
            detail: undefined
          };
        }
      }
    }

    // General breakdown
    const breakdown = Object.entries(methodMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([m, v]) => `${m}: ${fmt(v.total)} (${v.count} txns)`)
      .join(' | ');
    return {
      matched: true,
      answer: `Payment method breakdown (${label}):`,
      detail: breakdown || 'No payment method data available.'
    };
  }

  // ── 12. RECENT TRANSACTIONS ──────────────────
  if (q.includes('recent') || q.includes('latest') || q.includes('last 5') || q.includes('last five') ||
    q.includes('show my') || q.includes('list my')) {
    const countMatch = q.match(/last\s+(\d+)/);
    const n = countMatch ? Math.min(parseInt(countMatch[1], 10), 10) : 5;
    const recent = [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, n);
    const items = recent.map(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      return `${t.note || cat?.name || 'Expense'} — ${fmt(t.amount)} on ${t.date}`;
    }).join('\n');
    return {
      matched: true,
      answer: `Your last ${recent.length} transaction${recent.length !== 1 ? 's' : ''}:`,
      detail: items
    };
  }

  // ── 13. ABOVE / BELOW THRESHOLD ──────────────
  const thresholdMatch = q.match(/(?:above|over|more than|greater than|below|under|less than)\s+(?:rs\.?|₹|inr)?\s*(\d+[\d,]*)/i);
  if (thresholdMatch) {
    const amount = parseFloat(thresholdMatch[1].replace(/,/g, ''));
    const isAbove = /above|over|more than|greater than/.test(q);
    const { txs, label } = detectPeriod();
    const filtered = txs.filter(t => isAbove ? t.amount > amount : t.amount < amount);
    if (filtered.length > 0) {
      const total = sumTxs(filtered);
      const topItems = filtered
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map(t => `${t.note || 'Expense'} (${fmt(t.amount)})`)
        .join(', ');
      return {
        matched: true,
        answer: `Found ${filtered.length} transaction${filtered.length !== 1 ? 's' : ''} ${isAbove ? 'above' : 'below'} ${fmt(amount)} (${label}).`,
        detail: `Total: ${fmt(total)}. Examples: ${topItems}.`
      };
    } else {
      return {
        matched: true,
        answer: `No transactions ${isAbove ? 'above' : 'below'} ${fmt(amount)} found for ${label}.`,
        detail: undefined
      };
    }
  }

  // ── 14. ACTIVE DAYS / SPENDING STREAK ────────
  if (q.includes('how many days') || q.includes('days did i spend') || q.includes('spending streak') || q.includes('active days')) {
    const { txs, label } = detectPeriod();
    const days = uniqueActiveDays(txs);
    return {
      matched: true,
      answer: `You logged expenses on ${days} day${days !== 1 ? 's' : ''} (${label}).`,
      detail: `Total spend: ${fmt(sumTxs(txs))} across ${txs.length} transactions.`
    };
  }

  // ── 15. MERCHANT / NOTE SPECIFIC ─────────────
  const isSpendQuery = q.includes('how much') || q.includes('spent') || q.includes('spend') ||
    q.includes('pay') || q.includes('paid') || q.includes('cost') || q.includes('what') ||
    q.includes('which') || q.includes('where') || q.includes('buy') || q.includes('bought');
  const isWhenQuery = q.includes('when') || q.includes('date') || q.includes('time') || q.includes('day');
  const isHowPayQuery = q.includes('how did') || q.includes('payment') || q.includes('mode') || q.includes('method');

  if (isWhenQuery || isHowPayQuery || isSpendQuery) {
    const tokens = q.split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length >= 2);
    if (tokens.length > 0) {
      const { txs, label } = detectPeriod();
      const matches = txs.filter(t => {
        const noteLower = (t.note || '').toLowerCase();
        const customCatLower = (t.customCategoryName || '').toLowerCase();
        const catObj = categories.find(c => c.id === t.categoryId);
        const catNameLower = catObj ? catObj.name.toLowerCase() : '';
        return tokens.some(tok =>
          noteLower.includes(tok) || customCatLower.includes(tok) || catNameLower.includes(tok));
      });

      if (matches.length > 0) {
        const total = sumTxs(matches);
        const displayLabel = matches[0].note || tokens.join(' ');

        if (isWhenQuery) {
          const datesList = matches.map(m => {
            const d = new Date(m.date);
            return `${m.date}${!isNaN(d.getTime()) ? ' (' + DAY_NAMES[d.getDay()] + ')' : ''}${m.time ? ' at ' + m.time : ''}`;
          });
          return {
            matched: true,
            answer: matches.length === 1
              ? `You paid ${fmt(matches[0].amount)} for "${displayLabel}" on ${datesList[0]}.`
              : `You paid for "${displayLabel}" ${matches.length} times (${label}), totaling ${fmt(total)}.`,
            detail: matches.length > 1
              ? `Dates: ${datesList.slice(0, 3).join(', ')}${matches.length > 3 ? ` and ${matches.length - 3} more` : ''}.`
              : `Payment: ${matches[0].paymentMethod || 'Default'}.`
          };
        }

        if (isHowPayQuery) {
          const modes = Array.from(new Set(matches.map(m => m.paymentMethod || 'Default'))).join(', ');
          return {
            matched: true,
            answer: `You paid for "${displayLabel}" using ${modes}.`,
            detail: `Total: ${fmt(total)} across ${matches.length} transaction${matches.length !== 1 ? 's' : ''}.`
          };
        }

        return {
          matched: true,
          answer: `You spent ${fmt(total)} on "${displayLabel}" (${label}).`,
          detail: `${matches.length} matching transaction${matches.length !== 1 ? 's' : ''}.`
        };
      }
    }
  }

  // ── 16. SAVINGS / LEFT OVER ──────────────────
  if (q.includes('saved') || q.includes('saving') || q.includes('left') || q.includes('remaining')) {
    const { txs, label } = detectPeriod();
    const total = sumTxs(txs);
    return {
      matched: true,
      answer: `You've spent ${fmt(total)} (${label}).`,
      detail: `Set a monthly budget in your profile to track how much you have remaining.`
    };
  }

  // ── NO MATCH ─────────────────────────────────
  return { matched: false, answer: '' };
}

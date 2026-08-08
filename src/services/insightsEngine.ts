import {
  Transaction,
  Category,
  EndOfMonthAuditReport,
  AuditDimensionScore,
  CurrencyCode,
  Subscription,
} from '../types';
import { formatCurrency } from './currency';

// ─── Pure Helpers ────────────────────────────────────────────────────────────

/**
 * Returns the previous N calendar month keys (YYYY-MM) before monthKey,
 * in descending order (most recent first).
 */
function getPreviousMonthKeys(monthKey: string, count: number): string[] {
  const [y, m] = monthKey.split('-').map(Number);
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    let pm = m - i;
    let py = y;
    while (pm <= 0) { pm += 12; py--; }
    result.push(`${py}-${String(pm).padStart(2, '0')}`);
  }
  return result;
}

function scoreToLabel(score: number): 'Excellent' | 'Good' | 'Fair' | 'Poor' {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function avgScoreToGrade(scores: number[]): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'O' {
  if (scores.length === 0) return 'O';
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  if (avg >= 90) return 'A+';
  if (avg >= 75) return 'A';
  if (avg >= 60) return 'B';
  if (avg >= 45) return 'C';
  if (avg >= 30) return 'D';
  return 'F';
}

// ─── Category Classification ─────────────────────────────────────────────────

const DISCRETIONARY_KEYWORDS = [
  'food', 'dining', 'restaurant', 'cafe', 'coffee', 'snack', 'eat',
  'entertainment', 'movie', 'game', 'gaming', 'hobby', 'leisure',
  'clothing', 'fashion', 'apparel', 'shoes', 'shopping',
  'electronics', 'gadget', 'device',
  'travel', 'vacation', 'holiday', 'trip',
  'bar', 'nightclub', 'alcohol',
];

const ESSENTIAL_KEYWORDS = [
  'housing', 'rent', 'mortgage', 'home',
  'transport', 'commute', 'fuel', 'petrol', 'metro', 'bus', 'cab', 'auto',
  'health', 'medical', 'doctor', 'pharmacy', 'medicine',
  'groceries', 'grocery', 'supermarket', 'vegetable', 'fruit',
  'utilities', 'electricity', 'water', 'gas', 'internet', 'phone', 'bill',
  'insurance', 'education', 'school', 'college', 'tuition',
];

function classifyCategory(
  catId: string,
  categories: Category[]
): 'discretionary' | 'essential' | 'other' {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return 'other';
  const name = cat.name.toLowerCase();
  if (DISCRETIONARY_KEYWORDS.some(k => name.includes(k))) return 'discretionary';
  if (ESSENTIAL_KEYWORDS.some(k => name.includes(k))) return 'essential';
  return 'other';
}

// ─── Dimension Scorers ───────────────────────────────────────────────────────

/**
 * Volatility Score: How erratic is spending week-to-week within categories?
 * Uses coefficient of variation (CV = σ/μ), weighted by spend share.
 * Fully percentage-based — no absolute thresholds.
 */
function computeVolatilityScore(monthTxs: Transaction[]): AuditDimensionScore {
  if (monthTxs.length === 0) {
    return { score: 100, label: 'Excellent', detail: 'No transactions to evaluate' };
  }

  // Bucket transactions into week-of-month (1-indexed)
  const weeklyMap: Record<number, Record<string, number>> = {};
  monthTxs.forEach(t => {
    const weekNum = Math.ceil(new Date(t.date).getDate() / 7);
    if (!weeklyMap[weekNum]) weeklyMap[weekNum] = {};
    weeklyMap[weekNum][t.categoryId] = (weeklyMap[weekNum][t.categoryId] || 0) + t.amount;
  });

  const weeks = Object.keys(weeklyMap).map(Number);
  if (weeks.length < 2) {
    return { score: 85, label: 'Excellent', detail: 'Not enough weeks to measure volatility' };
  }

  const totalSpent = monthTxs.reduce((s, t) => s + t.amount, 0);
  const allCatIds = new Set(monthTxs.map(t => t.categoryId));

  let weightedCV = 0;
  let totalWeight = 0;

  allCatIds.forEach(catId => {
    const weeklyAmounts = weeks.map(w => weeklyMap[w][catId] || 0);
    const mean = weeklyAmounts.reduce((s, v) => s + v, 0) / weeklyAmounts.length;
    if (mean === 0) return;

    const variance =
      weeklyAmounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / weeklyAmounts.length;
    const cv = Math.sqrt(variance) / mean;

    const catTotal = monthTxs
      .filter(t => t.categoryId === catId)
      .reduce((s, t) => s + t.amount, 0);
    const weight = catTotal / totalSpent;

    weightedCV += cv * weight;
    totalWeight += weight;
  });

  const avgCV = totalWeight > 0 ? weightedCV / totalWeight : 0;

  // Map CV → score: lower CV = better = higher score
  let score: number;
  if (avgCV <= 0.3)      score = Math.round(90 + ((0.3 - avgCV) / 0.3) * 10);
  else if (avgCV <= 0.6) score = Math.round(70 + ((0.6 - avgCV) / 0.3) * 20);
  else if (avgCV <= 1.0) score = Math.round(45 + ((1.0 - avgCV) / 0.4) * 25);
  else                   score = Math.max(0, Math.round(45 - (avgCV - 1.0) * 30));
  score = Math.max(0, Math.min(100, score));

  const label = scoreToLabel(score);
  const detail =
    score >= 80
      ? 'Consistent week-to-week spending pattern'
      : score >= 60
      ? 'Moderate variation in weekly spending'
      : 'High week-to-week spending swings detected';

  return { score, label, detail };
}

/**
 * Savings Pressure Score: What fraction of spend is discretionary?
 * When baseline exists, compared % vs user's own 3-month average.
 * Never uses absolute currency amounts — fully currency-agnostic.
 */
function computeSavingsPressureScore(
  monthTxs: Transaction[],
  categories: Category[],
  allTransactions: Transaction[],
  hasBaseline: boolean,
  monthKey: string
): AuditDimensionScore {
  const totalSpent = monthTxs.reduce((s, t) => s + t.amount, 0);
  if (totalSpent === 0) {
    return { score: 100, label: 'Excellent', detail: 'No spending recorded' };
  }

  const discretionarySpent = monthTxs
    .filter(t => classifyCategory(t.categoryId, categories) === 'discretionary')
    .reduce((s, t) => s + t.amount, 0);
  const discPct = (discretionarySpent / totalSpent) * 100;

  let score: number;
  let detail: string;

  if (hasBaseline) {
    // Compare vs own 3-month historical average
    const prevKeys = getPreviousMonthKeys(monthKey, 3);
    const prevTxs = allTransactions.filter(t => prevKeys.some(m => t.date.startsWith(m)));
    const prevTotal = prevTxs.reduce((s, t) => s + t.amount, 0);
    const prevDisc = prevTxs
      .filter(t => classifyCategory(t.categoryId, categories) === 'discretionary')
      .reduce((s, t) => s + t.amount, 0);
    const avgPrevPct = prevTotal > 0 ? (prevDisc / prevTotal) * 100 : discPct;
    const delta = discPct - avgPrevPct;

    if (delta <= 0) {
      score = 100;
      detail = `Discretionary at ${Math.round(discPct)}% — below your ${Math.round(avgPrevPct)}% average`;
    } else if (delta <= 5) {
      score = 80;
      detail = `Discretionary at ${Math.round(discPct)}% (+${Math.round(delta)}% vs your average)`;
    } else if (delta <= 15) {
      score = 60;
      detail = `Discretionary at ${Math.round(discPct)}% (+${Math.round(delta)}% vs average) — trending up`;
    } else if (delta <= 25) {
      score = 40;
      detail = `Discretionary at ${Math.round(discPct)}% (+${Math.round(delta)}% vs average) — elevated`;
    } else {
      score = 20;
      detail = `Discretionary at ${Math.round(discPct)}% (+${Math.round(delta)}% vs average) — significantly high`;
    }
  } else {
    // No baseline: use absolute ratio as proxy
    if (discPct <= 40)      { score = 80; detail = `${Math.round(discPct)}% on discretionary spending`; }
    else if (discPct <= 55) { score = 60; detail = `${Math.round(discPct)}% on discretionary — moderate pressure`; }
    else if (discPct <= 70) { score = 40; detail = `${Math.round(discPct)}% on discretionary — high pressure`; }
    else                    { score = 20; detail = `${Math.round(discPct)}% on discretionary — very high pressure`; }
  }

  return { score, label: scoreToLabel(score), detail };
}

// ─── Smart Spending Suggestions ──────────────────────────────────────────────

export function generateSmartSpendingSuggestions(
  transactions: Transaction[],
  categories: Category[],
  currency: CurrencyCode
): string[] {
  const suggestions: string[] = [];

  if (transactions.length === 0) {
    return ['Log your daily expenses to unlock spending velocity insights and budget alerts!'];
  }

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));
  const monthTotal = monthTxs.reduce((acc, t) => acc + t.amount, 0);

  const prevMonthKeys = getPreviousMonthKeys(currentMonthKey, 3);
  const hasPrevData = prevMonthKeys.some(m => transactions.some(t => t.date.startsWith(m)));

  // Top category — with trend direction if history available
  const catMap: Record<string, number> = {};
  monthTxs.forEach(t => { catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; });

  let topCatId = '';
  let topCatAmount = 0;
  Object.entries(catMap).forEach(([id, amt]) => {
    if (amt > topCatAmount) { topCatAmount = amt; topCatId = id; }
  });

  const topCategoryObj = categories.find(c => c.id === topCatId);
  if (topCategoryObj && monthTotal > 0) {
    const pct = Math.round((topCatAmount / monthTotal) * 100);

    if (hasPrevData) {
      const prevPcts = prevMonthKeys
        .map(m => {
          const mTxs = transactions.filter(t => t.date.startsWith(m));
          const mTotal = mTxs.reduce((s, t) => s + t.amount, 0);
          const mCat = mTxs.filter(t => t.categoryId === topCatId).reduce((s, t) => s + t.amount, 0);
          return mTotal > 0 ? (mCat / mTotal) * 100 : null;
        })
        .filter((p): p is number => p !== null);

      if (prevPcts.length > 0) {
        const avgPrevPct = Math.round(prevPcts.reduce((s, p) => s + p, 0) / prevPcts.length);
        const delta = pct - avgPrevPct;
        if (delta >= 5) {
          suggestions.push(
            `${topCategoryObj.name} is up ${delta}% vs your ${prevPcts.length}-month average (${avgPrevPct}% → ${pct}% of spend).`
          );
        } else if (pct > 35) {
          suggestions.push(
            `${topCategoryObj.name} is ${pct}% of spend — consistent with your average of ${avgPrevPct}%.`
          );
        }
      }
    } else if (pct > 35) {
      suggestions.push(
        `${topCategoryObj.name} makes up ${pct}% of your monthly spend — consider reviewing this category.`
      );
    }
  }

  // Day-of-week pattern
  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dowSpend = [0, 0, 0, 0, 0, 0, 0];
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  monthTxs.forEach(t => {
    const dow = new Date(t.date).getDay();
    dowSpend[dow] += t.amount;
    dowCount[dow] += 1;
  });
  const dowAvg = dowSpend.map((s, i) => (dowCount[i] > 0 ? s / dowCount[i] : 0));
  const weekdayAmts = [1, 2, 3, 4, 5].map(i => dowAvg[i]).filter(v => v > 0);
  const weekdayAvg =
    weekdayAmts.length > 0 ? weekdayAmts.reduce((s, v) => s + v, 0) / weekdayAmts.length : 0;
  const maxDowIdx = dowAvg.indexOf(Math.max(...dowAvg));

  if (weekdayAvg > 0 && dowAvg[maxDowIdx] >= weekdayAvg * 2.5) {
    const multiplier = Math.round((dowAvg[maxDowIdx] / weekdayAvg) * 10) / 10;
    suggestions.push(
      `Your highest spend is on ${DOW_NAMES[maxDowIdx]}s — averaging ${multiplier}× your weekday spend.`
    );
  }

  // Auto-parsed transactions
  const autoParsedCount = monthTxs.filter(t => t.isAutoParsed).length;
  if (autoParsedCount > 0) {
    const autoPct = Math.round((autoParsedCount / (monthTxs.length || 1)) * 100);
    suggestions.push(
      `Notification Parser handled ${autoParsedCount} transactions automatically (${autoPct}% of this month's logging).`
    );
  }

  // Daily burn rate (factual)
  suggestions.push(
    `Daily average: ${formatCurrency(Math.round(monthTotal / (now.getDate() || 1)), currency)}/day — ${monthTxs.length} transactions logged this month.`
  );

  return suggestions;
}

// ─── End-of-Month Audit ──────────────────────────────────────────────────────

export function generateEndOfMonthAudit(
  allTransactions: Transaction[],
  categories: Category[],
  monthKey: string,
  currency: CurrencyCode,
  subscriptions?: Subscription[]
): EndOfMonthAuditReport {
  const monthTxs = allTransactions.filter(t => t.date.startsWith(monthKey));
  const totalSpent = monthTxs.reduce((acc, t) => acc + t.amount, 0);

  // ── Baseline: require ≥3 distinct calendar months of data ─────────────────
  const distinctMonths = new Set(allTransactions.map(t => t.date.substring(0, 7)));
  const monthsOfData = distinctMonths.size;
  const hasBaseline = monthsOfData >= 3;

  // ── Peak spend day ────────────────────────────────────────────────────────
  const dayMap: Record<string, number> = {};
  monthTxs.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + t.amount; });

  let highestDate = monthKey + '-01';
  let highestAmount = 0;
  Object.entries(dayMap).forEach(([d, amt]) => {
    if (amt > highestAmount) { highestAmount = amt; highestDate = d; }
  });

  // ── Category breakdown ────────────────────────────────────────────────────
  const catMap: Record<string, number> = {};
  monthTxs.forEach(t => { catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; });

  const topCategories = Object.entries(catMap)
    .map(([catId, amount]) => {
      const catObj = categories.find(c => c.id === catId);
      return {
        categoryId: catId,
        categoryName: catObj?.name ?? 'Other',
        color: catObj?.color ?? '#8a867c',
        amount,
        percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // ── Two-dimension scores (always computed, used when baseline available) ──
  const volatilityScore = computeVolatilityScore(monthTxs);
  const savingsPressureScore = computeSavingsPressureScore(
    monthTxs, categories, allTransactions, hasBaseline, monthKey
  );

  const budgetHealthScore: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'O' = hasBaseline
    ? avgScoreToGrade([volatilityScore.score, savingsPressureScore.score])
    : 'O';

  // ── Smart Insights (always percentage-based) ──────────────────────────────
  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const insights: string[] = [];

  // Factual (shown regardless of baseline)
  insights.push(`${monthTxs.length} transactions audited for ${monthKey}.`);
  if (highestAmount > 0 && totalSpent > 0) {
    insights.push(
      `Peak spend on ${highestDate} — ${Math.round((highestAmount / totalSpent) * 100)}% of monthly total.`
    );
  }
  if (topCategories[0]) {
    insights.push(
      `Top category: ${topCategories[0].categoryName} (${topCategories[0].percentage}% of total spend).`
    );
  }

  // Trend direction per category — only with baseline
  if (hasBaseline) {
    const prevKeys = getPreviousMonthKeys(monthKey, 3);
    topCategories.slice(0, 3).forEach(cat => {
      const prevPcts = prevKeys
        .map(m => {
          const mTxs = allTransactions.filter(t => t.date.startsWith(m));
          const mTotal = mTxs.reduce((s, t) => s + t.amount, 0);
          const mCat = mTxs
            .filter(t => t.categoryId === cat.categoryId)
            .reduce((s, t) => s + t.amount, 0);
          return mTotal > 0 ? (mCat / mTotal) * 100 : null;
        })
        .filter((p): p is number => p !== null);

      if (prevPcts.length >= 2) {
        const avgPrevPct = prevPcts.reduce((s, p) => s + p, 0) / prevPcts.length;
        const delta = cat.percentage - avgPrevPct;
        if (Math.abs(delta) >= 5) {
          const dir = delta > 0 ? 'up' : 'down';
          const sign = delta > 0 ? '+' : '';
          insights.push(
            `${cat.categoryName} is ${dir} ${sign}${Math.round(delta)}% vs your ${prevPcts.length}-month average (${Math.round(avgPrevPct)}% → ${cat.percentage}%).`
          );
        }
      }
    });
  }

  // Day-of-week pattern
  const dowSpend = [0, 0, 0, 0, 0, 0, 0];
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  monthTxs.forEach(t => {
    const dow = new Date(t.date).getDay();
    dowSpend[dow] += t.amount;
    dowCount[dow] += 1;
  });
  const dowAvg = dowSpend.map((s, i) => (dowCount[i] > 0 ? s / dowCount[i] : 0));
  const wdAmts = [1, 2, 3, 4, 5].map(i => dowAvg[i]).filter(v => v > 0);
  const wdAvg = wdAmts.length > 0 ? wdAmts.reduce((s, v) => s + v, 0) / wdAmts.length : 0;
  const maxDowIdx = dowAvg.indexOf(Math.max(...dowAvg));
  if (wdAvg > 0 && dowAvg[maxDowIdx] >= wdAvg * 2.5) {
    const multiplier = Math.round((dowAvg[maxDowIdx] / wdAvg) * 10) / 10;
    insights.push(
      `${DOW_NAMES[maxDowIdx]}s are your highest-spend day — averaging ${multiplier}× weekday spend.`
    );
  }

  // ── Anomalies ─────────────────────────────────────────────────────────────
  const anomalies: string[] = [];

  // Large single transaction (>30% of monthly total)
  if (monthTxs.length > 3 && totalSpent > 0) {
    monthTxs.forEach(t => {
      const share = t.amount / totalSpent;
      if (share > 0.3) {
        anomalies.push(
          `Large transaction: "${t.note}" accounted for ${Math.round(share * 100)}% of total monthly spend.`
        );
      }
    });
  }

  // Subscription creep cross-reference (requires ≥2 months of data)
  if (monthsOfData >= 2) {
    const seen = new Set<string>(); // prevent duplicate anomalies
    const amountFreq: Record<string, { amount: number; months: Set<string>; catName: string }> = {};

    allTransactions.forEach(t => {
      // Fuzzy round to nearest 5 to catch minor variance
      const rounded = Math.round(t.amount / 5) * 5;
      const key = `${rounded}-${t.categoryId}`;
      if (!amountFreq[key]) {
        amountFreq[key] = {
          amount: t.amount,
          months: new Set(),
          catName: categories.find(c => c.id === t.categoryId)?.name ?? 'Unknown',
        };
      }
      amountFreq[key].months.add(t.date.substring(0, 7));
    });

    Object.values(amountFreq).forEach(({ amount, months, catName }) => {
      if (months.size >= 2) {
        const isKnown = subscriptions?.some(
          s => Math.abs(s.amount - amount) / Math.max(s.amount, 1) < 0.05
        );
        if (!isKnown) {
          const key = `${Math.round(amount)}-${catName}`;
          if (!seen.has(key)) {
            seen.add(key);
            anomalies.push(
              `Possible untracked subscription: ${formatCurrency(amount, currency)}/month in ${catName}.`
            );
          }
        }
      }
    });
  }

  return {
    monthKey,
    totalSpent,
    currencySymbol: currency,
    transactionCount: monthTxs.length,
    highestSpendDay: { date: highestDate, amount: highestAmount },
    topCategories,
    hasBaseline,
    monthsOfData,
    volatilityScore,
    savingsPressureScore,
    budgetHealthScore,
    keyInsights: insights,
    anomalies,
  };
}

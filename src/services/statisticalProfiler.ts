import { Transaction, Category, CurrencyCode } from '../types';
import { formatCurrency } from './currency';

export interface UserFinancialProfile {
  dataMonthsCount: number;
  avgMonthlySpend: number;
  spendBands: {
    low: number;   // 25th percentile
    median: number; // 50th percentile
    high: number;  // 75th percentile
  };
  categoryAverages: Record<string, number>;
  prevMonthCategoryTotals: Record<string, number>;
}

export interface FrictionPoint {
  id: string;
  type: 'merchant_concentration' | 'category_drift' | 'day_pattern';
  title: string;
  observation: string;
  suggestion: string;
  magnitude: number; // For sorting relevance
}

export interface ProjectionResult {
  projectedTotal: number;
  daysPassed: number;
  totalDays: number;
  dailyRate: number;
  summarySentence: string;
}

/**
 * Computes statistical percentiles for spending baseline
 */
function getPercentile(sortedArray: number[], percentile: number): number {
  if (sortedArray.length === 0) return 0;
  if (sortedArray.length === 1) return sortedArray[0];
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Builds the statistical financial profile from user transactions
 */
export function computeFinancialProfile(transactions: Transaction[]): UserFinancialProfile {
  if (transactions.length === 0) {
    return {
      dataMonthsCount: 0,
      avgMonthlySpend: 0,
      spendBands: { low: 0, median: 0, high: 0 },
      categoryAverages: {},
      prevMonthCategoryTotals: {}
    };
  }

  // Group by YYYY-MM
  const monthMap: Record<string, number> = {};
  const categoryMonthMap: Record<string, Record<string, number>> = {};

  transactions.forEach(t => {
    const monthKey = t.date.slice(0, 7);
    monthMap[monthKey] = (monthMap[monthKey] || 0) + t.amount;

    if (!categoryMonthMap[t.categoryId]) categoryMonthMap[t.categoryId] = {};
    categoryMonthMap[t.categoryId][monthKey] = (categoryMonthMap[t.categoryId][monthKey] || 0) + t.amount;
  });

  const monthKeys = Object.keys(monthMap);
  const dataMonthsCount = monthKeys.length;
  const monthlyTotals = Object.values(monthMap).sort((a, b) => a - b);

  const avgMonthlySpend = monthlyTotals.reduce((sum, v) => sum + v, 0) / (dataMonthsCount || 1);
  const low = getPercentile(monthlyTotals, 25);
  const median = getPercentile(monthlyTotals, 50);
  const high = getPercentile(monthlyTotals, 75);

  // Fix 4: Divide by months where that specific category was used, not total months
  const categoryAverages: Record<string, number> = {};
  Object.entries(categoryMonthMap).forEach(([catId, catMonths]) => {
    const sum = Object.values(catMonths).reduce((acc, v) => acc + v, 0);
    const monthsWithThisCategory = Object.keys(catMonths).length;
    categoryAverages[catId] = sum / (monthsWithThisCategory || 1);
  });

  // Surface previous month category totals for trend comparisons
  const now = new Date();
  const thisMonthNum = now.getMonth() + 1;
  const thisYearNum = now.getFullYear();
  const prevMonthKey = `${thisMonthNum === 1 ? thisYearNum - 1 : thisYearNum}-${String(thisMonthNum === 1 ? 12 : thisMonthNum - 1).padStart(2, '0')}`;

  const prevMonthCategoryTotals: Record<string, number> = {};
  Object.entries(categoryMonthMap).forEach(([catId, catMonths]) => {
    if (catMonths[prevMonthKey]) {
      prevMonthCategoryTotals[catId] = catMonths[prevMonthKey];
    }
  });

  return {
    dataMonthsCount,
    avgMonthlySpend,
    spendBands: { low, median, high },
    categoryAverages,
    prevMonthCategoryTotals
  };
}

/**
 * Calculates forward projections weighted by day of month and historical baseline
 */
export function computeProjections(
  transactions: Transaction[],
  profile: UserFinancialProfile,
  baseCurrency: CurrencyCode
): ProjectionResult | null {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));
  const currentSpend = currentMonthTxs.reduce((sum, t) => sum + t.amount, 0);

  if (currentSpend === 0) return null;

  // Fix 1: Blend historical baseline and current pace, weighted by how far into the month you are
  const naiveProjection = currentSpend / monthProgress;
  const trustWeight = Math.min(1, Math.max(0, (dayOfMonth - 1) / 20));
  const hasBaseline = profile.dataMonthsCount >= 2 && profile.spendBands.median > 0;

  const projectedTotal = hasBaseline
    ? Math.round(naiveProjection * trustWeight + profile.spendBands.median * (1 - trustWeight))
    : Math.round(naiveProjection);

  const dailyRate = currentSpend / dayOfMonth;

  let comparisonText = '';
  if (profile.dataMonthsCount >= 2 && profile.spendBands.median > 0) {
    const diff = projectedTotal - profile.spendBands.median;
    if (diff > 0) {
      comparisonText = `which is ${formatCurrency(diff, baseCurrency)} above your historical monthly median (${formatCurrency(profile.spendBands.median, baseCurrency)}).`;
    } else {
      comparisonText = `which is well within your typical spending baseline (${formatCurrency(profile.spendBands.median, baseCurrency)}).`;
    }
  } else {
    comparisonText = `at your current pace of ${formatCurrency(Math.round(dailyRate), baseCurrency)}/day (based on ${dayOfMonth} days elapsed).`;
  }

  const summarySentence = `Based on your pace so far this month, you're projected to spend approximately ${formatCurrency(projectedTotal, baseCurrency)} ${comparisonText}`;

  return {
    projectedTotal,
    daysPassed: dayOfMonth,
    totalDays: daysInMonth,
    dailyRate,
    summarySentence
  };
}

/**
 * Detects implicit financial friction points (patterns)
 */
export function detectFrictionPoints(
  transactions: Transaction[],
  categories: Category[],
  baseCurrency: CurrencyCode
): FrictionPoint[] {
  const frictionPoints: FrictionPoint[] = [];
  if (transactions.length < 5) return frictionPoints;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));

  // Fix 3: Extract first word as merchant identifier ("zomato biryani" and "zomato pizza" -> "zomato")
  const merchantMap: Record<string, { count: number; total: number }> = {};
  currentMonthTxs.forEach(t => {
    const noteClean = (t.note || '').trim().toLowerCase();
    const merchantKey = noteClean.split(/\s+/)[0];
    if (merchantKey && merchantKey.length >= 3) {
      if (!merchantMap[merchantKey]) merchantMap[merchantKey] = { count: 0, total: 0 };
      merchantMap[merchantKey].count += 1;
      merchantMap[merchantKey].total += t.amount;
    }
  });

  Object.entries(merchantMap).forEach(([merchant, data]) => {
    if (data.count >= 4 && data.total > 0) {
      const avg = Math.round(data.total / data.count);
      const titleCased = merchant.charAt(0).toUpperCase() + merchant.slice(1);
      frictionPoints.push({
        id: `fric-merch-${merchant}`,
        type: 'merchant_concentration',
        title: `Implicit Subscription: ${titleCased}`,
        observation: `You've logged ${data.count} transactions for "${titleCased}" this month averaging ${formatCurrency(avg, baseCurrency)} each (${formatCurrency(data.total, baseCurrency)} total).`,
        suggestion: `Check if these small frequent purchases align with your intentional spending goals.`,
        magnitude: data.total
      });
    }
  });

  // 2. Day of Week Pattern (Weekend vs Weekday)
  const dayTotals: number[] = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  const dayDates: Set<string>[] = [
    new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()
  ];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  currentMonthTxs.forEach(t => {
    const [y, m, d] = t.date.split('-').map(Number);
    if (y && m && d) {
      const dayIdx = new Date(y, m - 1, d).getDay();
      dayTotals[dayIdx] += t.amount;
      dayDates[dayIdx].add(t.date);
    }
  });

  const dayAverages = dayTotals.map((tot, idx) => (dayDates[idx].size > 0 ? tot / dayDates[idx].size : 0));
  const activeDaysTotal = dayDates.reduce((sum, set) => sum + set.size, 0);
  const totalMonthSpend = dayTotals.reduce((a, b) => a + b, 0);
  const overallDayAvg = activeDaysTotal > 0 ? totalMonthSpend / activeDaysTotal : 0;

  dayAverages.forEach((avg, idx) => {
    // Require at least 2 distinct calendar days of that weekday logged before flagging a pattern
    if (dayDates[idx].size >= 2 && overallDayAvg > 0 && avg > overallDayAvg * 2.2) {
      const mult = (avg / overallDayAvg).toFixed(1);
      frictionPoints.push({
        id: `fric-day-${idx}`,
        type: 'day_pattern',
        title: `${dayNames[idx]} Spending Pattern`,
        observation: `Your spending on ${dayNames[idx]}s averages ${formatCurrency(Math.round(avg), baseCurrency)}, which is ${mult}x your daily average (${formatCurrency(Math.round(overallDayAvg), baseCurrency)}/day).`,
        suggestion: `Weekend and leisure spending tends to clump on ${dayNames[idx]}s. Planning activities ahead can smooth this out.`,
        magnitude: dayTotals[idx]
      });
    }
  });

  // Fix 2: Category Drift Detection (category growing for 3+ consecutive months)
  const profile = computeFinancialProfile(transactions);
  if (profile.dataMonthsCount >= 3) {
    const categoryMonthMap: Record<string, Record<string, number>> = {};
    transactions.forEach(t => {
      const mk = t.date.slice(0, 7);
      if (!categoryMonthMap[t.categoryId]) categoryMonthMap[t.categoryId] = {};
      categoryMonthMap[t.categoryId][mk] = (categoryMonthMap[t.categoryId][mk] || 0) + t.amount;
    });

    Object.entries(categoryMonthMap).forEach(([catId, monthData]) => {
      const sortedMonths = Object.keys(monthData).sort();
      if (sortedMonths.length < 3) return;

      const last3Months = sortedMonths.slice(-3);
      const last3 = last3Months.map(m => monthData[m]);
      const isConsistentlyGrowing = last3[0] < last3[1] && last3[1] < last3[2];
      const growthRate = last3[0] > 0 ? ((last3[2] - last3[0]) / last3[0]) * 100 : 0;

      if (isConsistentlyGrowing && growthRate > 30 && last3[2] > 0) {
        const cat = categories.find(c => c.id === catId);
        const catName = cat?.name ?? 'Category';
        frictionPoints.push({
          id: `fric-drift-${catId}`,
          type: 'category_drift',
          title: `${catName} Spend Creeping Up`,
          observation: `Your ${catName} spend has grown for 3 consecutive months (${Math.round(growthRate)}% total increase).`,
          suggestion: `Consistent category growth often goes unnoticed until it becomes a significant expense.`,
          magnitude: last3[2]
        });
      }
    });
  }

  return frictionPoints.sort((a, b) => b.magnitude - a.magnitude);
}

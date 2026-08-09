import { Transaction, Category, CurrencyCode } from '../types';
import { KnowledgeRule } from './localKnowledgeBase';
import { formatCurrency } from './currency';
import { 
  computeFinancialProfile, 
  computeProjections, 
  detectFrictionPoints 
} from './statisticalProfiler';

let cachedRules: KnowledgeRule[] | null = null;
let cacheKey = '';

/**
 * Dynamically generates text-based rules reflecting the user's actual spending behavior.
 * Uses 2nd-person perspective ("You", "Your") and enforces data-sufficiency gates.
 * Results are memoized to avoid redundant O(N) recalculations on every query.
 */
export function generateDynamicUsageRules(
  transactions: Transaction[],
  categories: Category[],
  baseCurrency: CurrencyCode
): KnowledgeRule[] {
  // Fix 6: Memoize with cheap invalidation key
  const today = new Date().toDateString();
  const newKey = `${transactions.length}-${today}-${baseCurrency}`;
  if (cachedRules && cacheKey === newKey) {
    return cachedRules;
  }

  const rules: KnowledgeRule[] = [];
  if (transactions.length === 0) {
    rules.push({
      id: 'dyn-gate-empty',
      text: 'Keep logging transactions! Once you log a few expenses, I will calculate your personal spending baselines and projections.',
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
    cachedRules = rules;
    cacheKey = newKey;
    return rules;
  }

  const profile = computeFinancialProfile(transactions);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));
  const currentMonthTotal = currentMonthTxs.reduce((sum, t) => sum + t.amount, 0);

  // 1. DATA SUFFICIENCY GATE: < 1 Month
  // Fix 5: Ensure scope: 'personal_data' is present on dyn-total-month
  rules.push({
    id: 'dyn-total-month',
    text: `Your total spending for this month (${currentMonthKey}) is ${formatCurrency(currentMonthTotal, baseCurrency)}.`,
    isCustom: false,
    timestamp: Date.now(),
    scope: 'personal_data'
  });

  // Top Category Context (2nd Person with Fix 7: MoM Trend Direction)
  const catMap: Record<string, number> = {};
  currentMonthTxs.forEach(t => { catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; });

  let topCatId = '';
  let topCatAmount = 0;
  let lowestCatId = '';
  let lowestCatAmount = Infinity;

  Object.entries(catMap).forEach(([id, amt]) => {
    if (amt > topCatAmount) { topCatAmount = amt; topCatId = id; }
    if (amt < lowestCatAmount && amt > 0) { lowestCatAmount = amt; lowestCatId = id; }
  });

  const topCategoryObj = categories.find(c => c.id === topCatId);
  if (topCategoryObj) {
    const pct = Math.round((topCatAmount / (currentMonthTotal || 1)) * 100);
    const prevMonthCatTotal = profile.prevMonthCategoryTotals[topCatId] ?? 0;
    const trend = prevMonthCatTotal > 0
      ? Math.round(((topCatAmount - prevMonthCatTotal) / prevMonthCatTotal) * 100)
      : null;

    const trendText = trend !== null
      ? ` — ${trend > 0 ? 'up' : 'down'} ${Math.abs(trend)}% vs last month`
      : '';

    rules.push({
      id: 'dyn-top-cat',
      text: `Your highest spending category this month is ${topCategoryObj.name}, which accounts for ${pct}% of your total spending (${formatCurrency(topCatAmount, baseCurrency)})${trendText}.`,
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
  }

  const lowestCategoryObj = categories.find(c => c.id === lowestCatId);
  if (lowestCategoryObj && lowestCatId !== topCatId) {
    rules.push({
      id: 'dyn-low-cat',
      text: `Your lowest spending category this month is ${lowestCategoryObj.name}, totaling ${formatCurrency(lowestCatAmount, baseCurrency)}.`,
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
  }

  // Largest Expense (2nd Person)
  const biggestTx = currentMonthTxs.length > 0 
    ? currentMonthTxs.reduce((prev, curr) => (prev.amount > curr.amount ? prev : curr))
    : undefined;

  if (biggestTx) {
    rules.push({
      id: 'dyn-biggest-tx',
      text: `Your largest single expense this month was ${formatCurrency(biggestTx.amount, baseCurrency)}, logged under "${biggestTx.note || 'General'}" on ${biggestTx.date}.`,
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
  }

  // 2. FORWARD-LOOKING PROJECTIONS
  const projection = computeProjections(transactions, profile, baseCurrency);
  if (projection) {
    rules.push({
      id: 'dyn-projection',
      text: projection.summarySentence,
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
  }

  // 3. DATA SUFFICIENCY GATE: 2+ Months (Percentile Bands & Baseline Comparisons)
  if (profile.dataMonthsCount >= 2 && profile.spendBands.median > 0) {
    rules.push({
      id: 'dyn-percentile-baseline',
      text: `Your personal historical spending median is ${formatCurrency(profile.spendBands.median, baseCurrency)} per month. Your normal monthly range sits between ${formatCurrency(profile.spendBands.low, baseCurrency)} and ${formatCurrency(profile.spendBands.high, baseCurrency)}.`,
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
  } else if (profile.dataMonthsCount < 2) {
    rules.push({
      id: 'dyn-gate-notice',
      text: `Keep logging for one more month, and I will establish your personal spending percentile bands and historical averages!`,
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
  }

  // 4. FRICTION-POINT OBSERVATIONS (Pattern Mining)
  const frictionPoints = detectFrictionPoints(transactions, categories, baseCurrency);
  frictionPoints.slice(0, 2).forEach(fp => {
    rules.push({
      id: fp.id,
      text: `Observation: ${fp.observation} ${fp.suggestion}`,
      isCustom: false,
      timestamp: Date.now(),
      scope: 'personal_data'
    });
  });

  cachedRules = rules;
  cacheKey = newKey;
  return rules;
}

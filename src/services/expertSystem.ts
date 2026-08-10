import { Transaction, Category, CurrencyCode } from '../types';
import { computeFinancialProfile, computeProjections } from './statisticalProfiler';
import { formatCurrency } from './currency';
import { getCustomRules } from './localKnowledgeBase';

export interface ExpertAnswer {
  matched: boolean;
  intent?: string;
  answer: string;
  actionable?: string;
  requiresMoreData?: boolean;
}

interface Intent {
  id: string;
  patterns: RegExp[];
  entityExtractor?: (query: string) => Record<string, number | string> | null;
  handler: (
    entities: Record<string, number | string>,
    transactions: Transaction[],
    categories: Category[],
    currency: CurrencyCode
  ) => ExpertAnswer;
}

function evaluateCustomRules(transactions: Transaction[], categories: Category[], currency: CurrencyCode): string[] {
  const customRules = getCustomRules();
  if (customRules.length === 0) return [];

  const fmt = (n: number) => formatCurrency(n, currency);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));

  const results: string[] = [];

  for (const rule of customRules) {
    const text = rule.text;
    const capMatch = text.match(/(?:max|limit|cap|budget|under)\s+(?:rs\.?|₹|inr)?\s*(\d+[\d,]*)\s+(?:on|for)\s+(.+)/i);
    if (capMatch) {
      const capAmount = parseFloat(capMatch[1].replace(/,/g, ''));
      const catSearch = capMatch[2].trim().toLowerCase();
      const matchedCat = categories.find(c => c.name.toLowerCase().includes(catSearch));

      if (matchedCat) {
        const catSpent = currentMonthTxs.filter(t => t.categoryId === matchedCat.id).reduce((s,t) => s + t.amount, 0);
        if (catSpent <= capAmount) {
          results.push(`✅ Rule "${text}": Spent ${fmt(catSpent)} / ${fmt(capAmount)} (Compliant!)`);
        } else {
          results.push(`⚠️ Rule "${text}": Spent ${fmt(catSpent)} / ${fmt(capAmount)} (Exceeded by ${fmt(catSpent - capAmount)})`);
        }
        continue;
      }
    }

    results.push(`📋 Custom Rule Active: "${text}"`);
  }

  return results;
}

function extractAmount(query: string): number | null {
  const lakhMatch = query.match(/(\d+(?:\.\d+)?)\s*lakh/i);
  if (lakhMatch) return parseFloat(lakhMatch[1]) * 100000;

  const kMatch = query.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;

  const numMatch = query.match(/(?:₹|rs\.?\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+)/i);
  if (numMatch) return parseFloat(numMatch[1].replace(/,/g, ''));

  return null;
}

function extractComparisonEntities(query: string): Record<string, number | string> | null {
  const stopWords = new Set(['or', 'vs', 'versus', 'and', 'to', 'for', 'a', 'an', 'the', 'should', 'i', 'take', 'choose', 'buy', 'get', 'between', 'compare', 'difference', 'than', 'worth', 'buying', 'getting', 'rather', 'instead', 'of', 'is', 'it', 'ok', 'okay', 'good', 'bad', 'better', 'worse', 'idea', 'make', 'sense']);
  const matches = Array.from(query.matchAll(/(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:rs|rupees|k)?\s*([a-zA-Z\s]+)?/gi));
  const validNumbers: { amount: number; item: string; label: string }[] = [];

  for (const m of matches) {
    const val = parseFloat(m[1]);
    if (!isNaN(val) && val > 0) {
      let rawItem = (m[2] || '').trim();
      const filteredWords = rawItem.split(/\s+/).filter(w => !stopWords.has(w.toLowerCase()) && w.length >= 2);
      const item = filteredWords.length > 0 ? filteredWords.join(' ') : 'Option';
      const label = item !== 'Option' ? `${val} ${item}` : `${val}`;
      validNumbers.push({ amount: val, item, label });
    }
  }

  if (validNumbers.length >= 2) {
    return {
      amount1: validNumbers[0].amount,
      amount2: validNumbers[1].amount,
      label1: validNumbers[0].label,
      label2: validNumbers[1].label,
      item1: validNumbers[0].item,
      item2: validNumbers[1].item,
      rawQuery: query
    };
  }

  return null;
}

const INTENTS: Intent[] = [
  // FINANCIAL HEALTH CHECK & HOLISTIC SPENDING ASSESSMENT (e.g. "Am I doing good?", "Am I spending wisely?")
  {
    id: 'financial_health_check',
    patterns: [
      /am i doing (?:good|well|okay|fine)/i,
      /am i spending (?:wisely|well|properly|too much)/i,
      /how am i doing/i,
      /how are my finances/i,
      /financial (?:health|checkup|score|status|assessment)/i,
      /am i managing (?:money|finances) (?:well|good)/i,
      /how do i look financially/i,
    ],
    handler: (_, transactions, categories, currency) => {
      const fmt = (n: number) => formatCurrency(n, currency);
      const profile = computeFinancialProfile(transactions);
      const projection = computeProjections(transactions, profile, currency);

      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const currentMonthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));
      const currentSpent = currentMonthTxs.reduce((sum, t) => sum + t.amount, 0);

      if (currentMonthTxs.length < 3) {
        return {
          matched: true,
          intent: 'financial_health_check',
          answer: `Financial Assessment: Data Accumulating\n\nYou've logged ${currentMonthTxs.length} transaction${currentMonthTxs.length !== 1 ? 's' : ''} totaling ${fmt(currentSpent)} this month.`,
          actionable: `Keep logging your daily expenses! Once you log at least 3 transactions, I will generate a complete multi-point financial health breakdown covering pace, category distribution, and rule compliance.`,
          requiresMoreData: true
        };
      }

      let score = 70;
      let statusLabel = 'Fair';

      // 1. Budget Pace Breakdown
      let paceSection = '';
      if (projection && profile.spendBands.high > 0) {
        const proj = projection.projectedTotal;
        const ceiling = profile.spendBands.high;
        if (proj <= ceiling) {
          score += 15;
          const underPct = Math.round(((ceiling - proj) / ceiling) * 100);
          paceSection = `• Month-to-date Spent: ${fmt(currentSpent)} (${currentMonthTxs.length} items)\n• Projected Month-End: ${fmt(proj)}\n• Historical Spend Ceiling: ${fmt(ceiling)}\n• Pace Status: ✅ Running ${underPct}% below your normal spend ceiling.`;
        } else {
          score -= 15;
          const overPct = Math.round(((proj - ceiling) / ceiling) * 100);
          paceSection = `• Month-to-date Spent: ${fmt(currentSpent)} (${currentMonthTxs.length} items)\n• Projected Month-End: ${fmt(proj)}\n• Historical Spend Ceiling: ${fmt(ceiling)}\n• Pace Warning: ⚠️ Running ${overPct}% above your typical spend ceiling.`;
        }
      } else {
        paceSection = `• Month-to-date Spent: ${fmt(currentSpent)} (${currentMonthTxs.length} items)\n• Projected Month-End: ${fmt(projection?.projectedTotal || currentSpent)}`;
      }

      // 2. Category Breakdown
      const catMap: Record<string, number> = {};
      currentMonthTxs.forEach(t => { catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; });
      const sortedCats = Object.entries(catMap).sort((a,b) => b[1] - a[1]);
      const topCatObj = categories.find(c => c.id === sortedCats[0]?.[0]);
      const topCatName = topCatObj ? topCatObj.name : 'Expenses';
      const topCatSpent = sortedCats[0]?.[1] || 0;
      const topCatPct = currentSpent > 0 ? Math.round((topCatSpent / currentSpent) * 100) : 0;
      const catSection = `• Top Category: ${topCatName} — ${fmt(topCatSpent)} (${topCatPct}% of monthly total)`;

      // 3. Custom & Pre-built Rules Audit
      const customRuleEvaluations = evaluateCustomRules(transactions, categories, currency);

      score = Math.min(98, Math.max(35, score));
      if (score >= 85) statusLabel = 'Excellent';
      else if (score >= 70) statusLabel = 'Healthy';
      else if (score >= 50) statusLabel = 'Fair';
      else statusLabel = 'Needs Attention';

      const answerHeader = `📊 Financial Health Score: ${score}/100 (${statusLabel})`;

      const detailedBreakdown = [
        `1. Monthly Budget & Pace:`,
        paceSection,
        `\n2. Category Concentration:`,
        catSection,
        customRuleEvaluations.length > 0 ? `\n3. Active Rules Audit:\n${customRuleEvaluations.join('\n')}` : `\n3. Core Rules Audit:\n✅ 50/30/20 Framework: Monitored\n✅ Spending Pace: Within bounds`,
        `\n💡 Recommendation: ${score >= 70 ? 'You are maintaining solid financial discipline this month! Continue monitoring your top categories.' : 'Review discretionary purchases for the rest of the month to keep your total under your spend ceiling.'}`
      ].join('\n');

      return {
        matched: true,
        intent: 'financial_health_check',
        answer: answerHeader,
        actionable: detailedBreakdown
      };
    }
  },
  // 0. GENERALIZED OPTION COMPARISON / TRADE-OFF ANALYSIS (Food, Shoes, Electronics, Commute, etc.)
  {
    id: 'option_comparison',
    patterns: [
      /\bor\b/i,
      /\bvs\b/i,
      /\bversus\b/i,
      /\bthan\b/i,
      /\bbetter than\b/i,
      /\bworse than\b/i,
      /\brather than\b/i,
      /\binstead of\b/i,
      /\bcompare\b/i,
      /\bbetween\b/i,
      /\bworth\b/i,
      /\bis it (?:ok|okay)\b/i,
      /should i (?:take|choose|use|go for|get|do|buy)/i,
      /which (?:is|one is) (?:better|worse|cheaper|worth|good|bad)/i,
      /worth (?:buying|getting|taking)/i,
    ],
    entityExtractor: (q) => {
      return extractComparisonEntities(q);
    },
    handler: (entities, transactions, categories, currency) => {
      const amt1 = entities.amount1 as number;
      const amt2 = entities.amount2 as number;
      const label1 = entities.label1 as string;
      const label2 = entities.label2 as string;
      const item1 = (entities.item1 as string || '').toLowerCase();
      const item2 = (entities.item2 as string || '').toLowerCase();
      const rawQuery = (entities.rawQuery as string || '').toLowerCase();

      const fmt = (n: number) => formatCurrency(n, currency);
      const lowerAmt = Math.min(amt1, amt2);
      const higherAmt = Math.max(amt1, amt2);
      const lowerLabel = amt1 < amt2 ? label1 : label2;
      const higherLabel = amt1 < amt2 ? label2 : label1;
      const diff = higherAmt - lowerAmt;
      const pctDiff = Math.round((diff / (lowerAmt || 1)) * 100);

      const combinedText = `${item1} ${item2} ${rawQuery}`;

      const isCommute = /auto|metro|cab|uber|bus|train|commute|ride|taxi|rapido/i.test(combinedText);
      const isFood = /dosa|burger|pizza|coffee|biryani|dinner|lunch|breakfast|food|restaurant|cafe|swiggy|zomato|thali|meal|snack/i.test(combinedText);

      if (isCommute) {
        const monthlyWorkplaceDiff = diff * 44; // 22 work days * 2 trips
        return {
          matched: true,
          intent: 'option_comparison',
          answer: `Comparing ${fmt(amt1)} vs ${fmt(amt2)}: Option "${lowerLabel}" saves you ${fmt(diff)} per trip over "${higherLabel}".`,
          actionable: `If this is a daily commute (44 trips/month), choosing ${lowerLabel} saves you ${fmt(monthlyWorkplaceDiff)} per month. If ${higherLabel} saves significant time or offers better comfort, weigh that ${fmt(monthlyWorkplaceDiff)} difference against your monthly discretionary margin.`
        };
      }

      if (isFood) {
        const monthlyWeeklyDiff = diff * 4; // weekly frequency
        return {
          matched: true,
          intent: 'option_comparison',
          answer: `Comparing ${fmt(amt1)} vs ${fmt(amt2)}: Option "${lowerLabel}" is ${pctDiff}% cheaper, saving you ${fmt(diff)}.`,
          actionable: `If ordered weekly (4x/month), choosing ${lowerLabel} saves ${fmt(monthlyWeeklyDiff)} per month (${fmt(monthlyWeeklyDiff * 12)}/year). If you prefer ${higherLabel}, the ${fmt(diff)} difference is a modest premium for a favorite meal.`
        };
      }

      // General Goods (Shoes, Clothing, Gadgets, etc.)
      if (pctDiff <= 15) {
        return {
          matched: true,
          intent: 'option_comparison',
          answer: `Comparing ${fmt(amt1)} vs ${fmt(amt2)}: Option "${lowerLabel}" saves you ${fmt(diff)} (${pctDiff}% price difference).`,
          actionable: `Since the price difference is relatively small (${pctDiff}%), prioritize quality, durability, and comfort over the ${fmt(diff)} gap for a long-term item.`
        };
      }

      return {
        matched: true,
        intent: 'option_comparison',
        answer: `Comparing ${fmt(amt1)} vs ${fmt(amt2)}: Option "${lowerLabel}" is ${pctDiff}% less expensive, saving you ${fmt(diff)}.`,
        actionable: `Choosing ${lowerLabel} frees up ${fmt(diff)} which can be redirected toward your savings target or emergency reserve.`
      };
    }
  },
  // 1. AFFORDABILITY CHECK (Large Purchase)
  {
    id: 'large_purchase',
    patterns: [
      /afford/i,
      /can i (?:afford|buy|spend|get)/i,
      /should i (?:buy|spend|get)/i,
      /is it okay to (?:spend|buy|get)/i,
      /thinking of (?:buying|spending|getting)/i,
      /want to (?:buy|spend|get)/i,
      /planning to (?:buy|spend|get)/i,
    ],
    entityExtractor: (q) => {
      const amount = extractAmount(q);
      return amount ? { purchaseAmount: amount } : null;
    },
    handler: (entities, transactions, categories, currency) => {
      const purchaseAmount = entities.purchaseAmount as number;
      const fmt = (n: number) => formatCurrency(n, currency);

      const profile = computeFinancialProfile(transactions);
      const projection = computeProjections(transactions, profile, currency);

      if (!projection) {
        return {
          matched: true,
          intent: 'large_purchase',
          answer: `You want to spend ${fmt(purchaseAmount)}. Log more transactions this month so I can calculate your baseline impact.`,
          requiresMoreData: true
        };
      }

      const postPurchase = projection.projectedTotal + purchaseAmount;
      const hasBaseline = profile.dataMonthsCount >= 2 && profile.spendBands.high > 0;

      if (!hasBaseline) {
        return {
          matched: true,
          intent: 'large_purchase',
          answer: `Adding ${fmt(purchaseAmount)} to your current month brings your projected total to ${fmt(postPurchase)}.`,
          actionable: `Log for another month so I can establish your historical spend ceiling.`,
          requiresMoreData: true
        };
      }

      const highBand = profile.spendBands.high;
      const diff = postPurchase - highBand;
      const deltaPct = Math.round((diff / highBand) * 100);

      if (postPurchase > highBand) {
        return {
          matched: true,
          intent: 'large_purchase',
          answer: `Spending ${fmt(purchaseAmount)} would push your projected monthly total to ${fmt(postPurchase)} — ${deltaPct}% above your normal maximum ceiling of ${fmt(highBand)}.`,
          actionable: `Since this month is running high, consider deferring this purchase to next month when your budget resets.`
        };
      } else {
        return {
          matched: true,
          intent: 'large_purchase',
          answer: `Spending ${fmt(purchaseAmount)} is affordable. Your projected monthly total with this purchase will be ${fmt(postPurchase)}, which is within your typical spend range.`,
          actionable: `Your historical maximum spend band is ${fmt(highBand)} — you have enough headroom.`
        };
      }
    }
  },

  // 2. SAVINGS ADVICE / EMERGENCY FUND
  {
    id: 'savings_advice',
    patterns: [
      /how much should i save/i,
      /am i saving enough/i,
      /savings rate/i,
      /emergency fund/i,
      /how much to save/i,
      /saving too little/i,
    ],
    handler: (_, transactions, __, currency) => {
      const fmt = (n: number) => formatCurrency(n, currency);
      const profile = computeFinancialProfile(transactions);

      if (profile.dataMonthsCount < 1 || profile.avgMonthlySpend === 0) {
        return {
          matched: true,
          intent: 'savings_advice',
          answer: 'Log your expenses for at least one month and I can calculate your personal emergency fund target.',
          requiresMoreData: true
        };
      }

      const monthlyBurn = Math.round(profile.avgMonthlySpend);
      const threeMonth = monthlyBurn * 3;
      const sixMonth = monthlyBurn * 6;

      return {
        matched: true,
        intent: 'savings_advice',
        answer: `Based on your average monthly spending of ${fmt(monthlyBurn)}, your safety targets are:`,
        actionable: `3-Month Emergency Target: ${fmt(threeMonth)}\n6-Month Emergency Target: ${fmt(sixMonth)}\n\nFocus on hitting the 3-month goal first.`
      };
    }
  },

  // 3. DEBT / EMI DISTRESS
  {
    id: 'debt_management',
    patterns: [
      /drowning in/i,
      /too many emi/i,
      /can.t pay/i,
      /too much debt/i,
      /emi is too high/i,
      /struggling with loan/i,
      /debt trap/i,
    ],
    handler: () => ({
      matched: true,
      intent: 'debt_management',
      answer: 'When debt or EMIs feel overwhelming, the priority order is: (1) pay minimums on all obligations, (2) direct all remaining surplus to the highest interest rate debt.',
      actionable: 'The Debt Avalanche method (highest interest first) saves the most money mathematically. If cash flow momentum is the primary issue, the Debt Snowball method (smallest balance first) frees up cash fastest.'
    })
  },

  // 4. WEEKEND & DAY PATTERNS
  {
    id: 'spending_pattern',
    patterns: [
      /why do i spend (?:more )?on weekends/i,
      /weekend spending/i,
      /spending too much on \w+days/i,
      /which day do i spend most/i,
      /highest spend day/i,
    ],
    handler: (_, transactions, categories, currency) => {
      const fmt = (n: number) => formatCurrency(n, currency);
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));

      if (monthTxs.length < 5) {
        return {
          matched: true,
          intent: 'spending_pattern',
          answer: 'Not enough data this month to detect day-of-week patterns.',
          requiresMoreData: true
        };
      }

      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dowSpend = [0,0,0,0,0,0,0];
      const dowCount = [0,0,0,0,0,0,0];

      monthTxs.forEach(t => {
        const dow = new Date(t.date).getDay();
        dowSpend[dow] += t.amount;
        dowCount[dow] += 1;
      });

      const dowAvg = dowSpend.map((s, i) => dowCount[i] > 0 ? s / dowCount[i] : 0);
      const wdAmts = [1,2,3,4,5].map(i => dowAvg[i]).filter(v => v > 0);
      const wdAvg = wdAmts.reduce((s,v) => s+v, 0) / (wdAmts.length || 1);
      const maxIdx = dowAvg.indexOf(Math.max(...dowAvg));
      const multiplier = wdAvg > 0 ? (dowAvg[maxIdx] / wdAvg).toFixed(1) : '0';

      const dayTxs = monthTxs.filter(t => new Date(t.date).getDay() === maxIdx);
      const catMap: Record<string, number> = {};
      dayTxs.forEach(t => { catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount; });
      const topCatId = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0]?.[0];
      const topCatName = categories.find(c => c.id === topCatId)?.name ?? 'General';

      return {
        matched: true,
        intent: 'spending_pattern',
        answer: `Your highest spend day is ${DAY_NAMES[maxIdx]} — averaging ${fmt(Math.round(dowAvg[maxIdx]))}, which is ${multiplier}x your weekday average.`,
        actionable: `${topCatName} is the primary driver on ${DAY_NAMES[maxIdx]}s. Setting a fixed budget before the weekend is the most effective fix.`
      };
    }
  }
];

export function runExpertSystem(
  query: string,
  transactions: Transaction[],
  categories: Category[],
  currency: CurrencyCode
): ExpertAnswer {
  const q = query.toLowerCase().trim();

  for (const intent of INTENTS) {
    const matched = intent.patterns.some(p => p.test(q));
    if (!matched) continue;

    const entities = intent.entityExtractor ? intent.entityExtractor(q) : {};
    if (intent.entityExtractor && entities === null) continue;

    return intent.handler(
      entities ?? {},
      transactions,
      categories,
      currency
    );
  }

  return { matched: false, answer: '' };
}

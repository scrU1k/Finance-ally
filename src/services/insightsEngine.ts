import { Transaction, Category, EndOfMonthAuditReport, CurrencyCode } from '../types';
import { formatCurrency } from './currency';

export function generateSmartSpendingSuggestions(
  transactions: Transaction[],
  categories: Category[],
  currency: CurrencyCode
): string[] {
  const suggestions: string[] = [];
  if (transactions.length === 0) {
    return ['Log your daily expenses to unlock spending velocity insights and budget alerts!'];
  }

  // Calculate totals
  const total = transactions.reduce((acc, t) => acc + t.amount, 0);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const monthTxs = transactions.filter(t => t.date.startsWith(currentMonthKey));
  const monthTotal = monthTxs.reduce((acc, t) => acc + t.amount, 0);

  // Category totals
  const catMap: Record<string, number> = {};
  monthTxs.forEach(t => {
    catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
  });

  // Find top category
  let topCatId = '';
  let topCatAmount = 0;
  Object.entries(catMap).forEach(([id, amt]) => {
    if (amt > topCatAmount) {
      topCatAmount = amt;
      topCatId = id;
    }
  });

  const topCategoryObj = categories.find(c => c.id === topCatId);

  if (topCategoryObj && monthTotal > 0) {
    const pct = Math.round((topCatAmount / monthTotal) * 100);
    if (pct > 35) {
      suggestions.push(
        `High concentration: ${topCategoryObj.name} makes up ${pct}% of your monthly spend (${formatCurrency(topCatAmount, currency)}). Consider capping weekend outings.`
      );
    }
  }

  // Weekend vs Weekday analysis
  let weekendSpend = 0;
  let weekdaySpend = 0;
  monthTxs.forEach(t => {
    const day = new Date(t.date).getDay();
    if (day === 0 || day === 6) weekendSpend += t.amount;
    else weekdaySpend += t.amount;
  });

  if (monthTotal > 0 && weekendSpend > weekdaySpend * 0.8) {
    suggestions.push(
      `Weekend Spikes: You spend ${Math.round((weekendSpend / monthTotal) * 100)}% of your money on Saturday & Sunday alone.`
    );
  }

  // Auto-parsed velocity
  const autoParsedCount = monthTxs.filter(t => t.isAutoParsed).length;
  if (autoParsedCount > 0) {
    suggestions.push(
      `Local Notification Parser saved you manual data entry on ${autoParsedCount} transactions this month!`
    );
  }

  // Default encouraging insight
  suggestions.push(
    `Daily Average: Your current burn rate is ${formatCurrency(Math.round(monthTotal / (now.getDate() || 1)), currency)} per day.`
  );

  return suggestions;
}

export function generateEndOfMonthAudit(
  transactions: Transaction[],
  categories: Category[],
  monthKey: string, // YYYY-MM
  currency: CurrencyCode,
  userBudget?: number
): EndOfMonthAuditReport {
  const monthTxs = transactions.filter(t => t.date.startsWith(monthKey));
  const totalSpent = monthTxs.reduce((acc, t) => acc + t.amount, 0);

  // Daily spend map to find highest day
  const dayMap: Record<string, number> = {};
  monthTxs.forEach(t => {
    dayMap[t.date] = (dayMap[t.date] || 0) + t.amount;
  });

  let highestDate = monthKey + '-01';
  let highestAmount = 0;
  Object.entries(dayMap).forEach(([d, amt]) => {
    if (amt > highestAmount) {
      highestAmount = amt;
      highestDate = d;
    }
  });

  // Top categories breakdown
  const catMap: Record<string, number> = {};
  monthTxs.forEach(t => {
    catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
  });

  const topCategories = Object.entries(catMap)
    .map(([catId, amount]) => {
      const catObj = categories.find(c => c.id === catId);
      return {
        categoryId: catId,
        categoryName: catObj ? catObj.name : 'Other',
        color: catObj ? catObj.color : '#8a867c',
        amount,
        percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Health Score calculation
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'A+';
  
  if (userBudget && userBudget > 0) {
    const ratio = totalSpent / userBudget;
    if (ratio <= 0.5) grade = 'A+';
    else if (ratio <= 0.8) grade = 'A';
    else if (ratio <= 1.0) grade = 'B';
    else if (ratio <= 1.2) grade = 'C';
    else if (ratio <= 1.5) grade = 'D';
    else grade = 'F';
  } else {
    // Fallback if no budget set
    if (totalSpent > 0) grade = 'A';
  }

  const insights = [
    `Peak expenditure recorded on ${highestDate} with ${formatCurrency(highestAmount, currency)}.`,
    `Total of ${monthTxs.length} separate transactions audited for ${monthKey}.`,
    topCategories[0] ? `Top category was ${topCategories[0].categoryName} (${topCategories[0].percentage}% of total).` : 'No category data'
  ];

  const anomalies: string[] = [];
  monthTxs.forEach(t => {
    if (t.amount > totalSpent * 0.3 && monthTxs.length > 3) {
      anomalies.push(`Single large transaction: ${t.note} (${formatCurrency(t.amount, currency)}) accounted for >30% of total monthly spend.`);
    }
  });

  return {
    monthKey,
    totalSpent,
    currencySymbol: currency,
    transactionCount: monthTxs.length,
    highestSpendDay: { date: highestDate, amount: highestAmount },
    topCategories,
    budgetHealthScore: grade,
    keyInsights: insights,
    anomalies
  };
}

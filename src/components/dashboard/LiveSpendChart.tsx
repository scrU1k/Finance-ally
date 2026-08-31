import React, { useState, useMemo, useCallback } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Filler
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import { useFinance } from '../../context/FinanceContext';
import { convertCurrencyAmount, formatCurrency } from '../../services/currency';
import { PieChart, TrendingUp, Calendar, BarChart3, LineChart } from 'lucide-react';
import { Transaction } from '../../types';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Filler
);

export type ChartTimeframeMode = 'day' | 'week' | 'month' | 'year' | 'all';

interface LiveSpendChartProps {
  transactions?: Transaction[];
}

export const LiveSpendChart: React.FC<LiveSpendChartProps> = ({ transactions: propTxs }) => {
  const { filteredTransactions: contextFilteredTxs, categories, baseCurrency, forexRates, period, topmostVisibleDate } = useFinance();
  
  // Use prop transactions if provided (e.g. from DailyTimeline with search/drilldown filters applied), else context
  const sourceTxs = propTxs || contextFilteredTxs;

  // Initialize timeframe mode to match FinanceContext period or 'month'
  const initialTimeframe: ChartTimeframeMode = (period === 'day' || period === 'week' || period === 'month' || period === 'year' || period === 'all')
    ? (period as ChartTimeframeMode)
    : 'month';

  // Independent timeframe states for Card 1 (Category Breakdown - no 'week') and Card 2 (Spending Trend)
  const [activeTimeframe1, setActiveTimeframe1] = useState<'day' | 'month' | 'year' | 'all'>(
    initialTimeframe === 'week' ? 'month' : (initialTimeframe as 'day' | 'month' | 'year' | 'all')
  );
  const [activeTimeframe2, setActiveTimeframe2] = useState<ChartTimeframeMode>(initialTimeframe);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  // Compute anchor date ISO string from topmostVisibleDate or today
  const anchorISO = useMemo(() => {
    return topmostVisibleDate || new Date().toISOString().split('T')[0];
  }, [topmostVisibleDate]);

  // Helper to filter transactions & compute label for Card 1 (Category Breakdown)
  const filterTxsForCard1 = useCallback((mode: 'day' | 'month' | 'year' | 'all') => {
    const anchorDate = new Date(anchorISO + 'T00:00:00');
    
    if (mode === 'day') {
      const dayTxs = sourceTxs.filter(t => t.date === anchorISO);
      const labelStr = anchorDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return { timeframeTxs: dayTxs, timeframeLabel: labelStr };
    }

    if (mode === 'month') {
      const monthPrefix = anchorISO.substring(0, 7);
      const monthTxs = sourceTxs.filter(t => t.date.startsWith(monthPrefix));
      const labelStr = anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { timeframeTxs: monthTxs, timeframeLabel: labelStr };
    }

    if (mode === 'year') {
      const yearPrefix = anchorISO.substring(0, 4);
      const yearTxs = sourceTxs.filter(t => t.date.startsWith(yearPrefix));
      const labelStr = `Year ${yearPrefix}`;
      return { timeframeTxs: yearTxs, timeframeLabel: labelStr };
    }

    // 'all'
    return { timeframeTxs: sourceTxs, timeframeLabel: 'All Time' };
  }, [anchorISO, sourceTxs]);

  // Helper to filter transactions & compute label for Card 2 (Spending Trend)
  const filterTxsForCard2 = useCallback((mode: ChartTimeframeMode) => {
    const anchorDate = new Date(anchorISO + 'T00:00:00');
    
    if (mode === 'day') {
      const dayTxs = sourceTxs.filter(t => t.date === anchorISO);
      const labelStr = anchorDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return { timeframeTxs: dayTxs, timeframeLabel: labelStr };
    }

    if (mode === 'week') {
      const labelStr = 'Weekly Breakdown';
      return { timeframeTxs: sourceTxs, timeframeLabel: labelStr };
    }

    if (mode === 'month') {
      const monthPrefix = anchorISO.substring(0, 7);
      const monthTxs = sourceTxs.filter(t => t.date.startsWith(monthPrefix));
      const labelStr = anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { timeframeTxs: monthTxs, timeframeLabel: labelStr };
    }

    if (mode === 'year') {
      const yearPrefix = anchorISO.substring(0, 4);
      const yearTxs = sourceTxs.filter(t => t.date.startsWith(yearPrefix));
      const labelStr = `Year ${yearPrefix}`;
      return { timeframeTxs: yearTxs, timeframeLabel: labelStr };
    }

    // 'all'
    return { timeframeTxs: sourceTxs, timeframeLabel: 'All Time' };
  }, [anchorISO, sourceTxs]);

  // Card 1 (Category Breakdown) Data & Timeframe
  const { timeframeTxs: timeframeTxs1, timeframeLabel: timeframeLabel1 } = useMemo(
    () => filterTxsForCard1(activeTimeframe1),
    [activeTimeframe1, filterTxsForCard1]
  );

  // Card 2 (Spending Trend) Data & Timeframe
  const { timeframeTxs: timeframeTxs2, timeframeLabel: timeframeLabel2 } = useMemo(
    () => filterTxsForCard2(activeTimeframe2),
    [activeTimeframe2, filterTxsForCard2]
  );

  // 1. Prepare Category Doughnut Data for Card 1
  const catTotals: Record<string, number> = {};
  timeframeTxs1.forEach(t => {
    const amtInBase = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
    catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + amtInBase;
  });

  const activeCategories = categories.filter(c => (catTotals[c.id] || 0) > 0);
  const doughnutLabels = activeCategories.map(c => c.name);
  const doughnutValues = activeCategories.map(c => catTotals[c.id]);
  const doughnutColors = activeCategories.map(c => c.color);
  const totalDoughnutSpend = doughnutValues.reduce((sum, val) => sum + val, 0);

  const doughnutData = {
    labels: doughnutLabels,
    datasets: [
      {
        data: doughnutValues,
        backgroundColor: doughnutColors.length > 0 ? doughnutColors : ['#8a867c'],
        borderColor: 'rgba(0, 0, 0, 0.1)',
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  // 2. Prepare Dynamic Trend Data for Card 2
  const { trendLabels, trendValues } = useMemo(() => {
    if (activeTimeframe2 === 'week') {
      // Group all transactions by ISO week number (e.g., W30, W31, W32)
      const weekMap: Record<string, { label: string; amount: number }> = {};
      
      timeframeTxs2.forEach(t => {
        const [y, m, d] = t.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const target = new Date(dateObj.valueOf());
        const dayNr = (dateObj.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        target.setMonth(0, 1);
        if (target.getDay() !== 4) {
          target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
        }
        const weekNo = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
        const yearNo = target.getFullYear();
        const weekKey = `${yearNo}-W${String(weekNo).padStart(2, '0')}`;
        const weekLabel = `W${weekNo}`;

        const amtInBase = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
        if (!weekMap[weekKey]) {
          weekMap[weekKey] = { label: weekLabel, amount: 0 };
        }
        weekMap[weekKey].amount += amtInBase;
      });

      const sortedKeys = Object.keys(weekMap).sort();
      const labels = sortedKeys.map(k => weekMap[k].label);
      const values = sortedKeys.map(k => weekMap[k].amount);
      return { trendLabels: labels, trendValues: values };
    }

    const spendMap: Record<string, number> = {};

    if (activeTimeframe2 === 'year' || activeTimeframe2 === 'all') {
      // Group by Month (YYYY-MM)
      timeframeTxs2.forEach(t => {
        const mKey = t.date.substring(0, 7);
        const amtInBase = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
        spendMap[mKey] = (spendMap[mKey] || 0) + amtInBase;
      });

      const sortedMonths = Object.keys(spendMap).sort();
      const labels = sortedMonths.map(m => {
        const [y, mon] = m.split('-');
        const d = new Date(parseInt(y), parseInt(mon) - 1, 1);
        return d.toLocaleDateString('en-US', { month: 'short', year: sortedMonths.length > 12 ? '2-digit' : undefined });
      });
      const values = sortedMonths.map(m => spendMap[m]);
      return { trendLabels: labels, trendValues: values };
    }

    if (activeTimeframe2 === 'day') {
      // Group by item note or note snippet
      timeframeTxs2.forEach(t => {
        const itemLabel = (t.note || 'Expense').slice(0, 15);
        const amtInBase = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
        spendMap[itemLabel] = (spendMap[itemLabel] || 0) + amtInBase;
      });
      const labels = Object.keys(spendMap);
      const values = labels.map(k => spendMap[k]);
      return { trendLabels: labels, trendValues: values };
    }

    // Default (month): Group by Date (YYYY-MM-DD)
    timeframeTxs2.forEach(t => {
      const amtInBase = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
      spendMap[t.date] = (spendMap[t.date] || 0) + amtInBase;
    });

    const sortedDates = Object.keys(spendMap).sort();
    const labels = sortedDates.map(d => d.slice(5)); // MM-DD
    const values = sortedDates.map(d => spendMap[d]);
    return { trendLabels: labels, trendValues: values };
  }, [timeframeTxs2, activeTimeframe2, baseCurrency, forexRates]);

  const barData = {
    labels: trendLabels,
    datasets: [
      {
        label: `Spent (${baseCurrency})`,
        data: trendValues,
        backgroundColor: '#2b6be4',
        borderRadius: 6,
      },
    ],
  };

  const lineData = {
    labels: trendLabels,
    datasets: [
      {
        label: `Spent (${baseCurrency})`,
        data: trendValues,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2.5,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#10b981',
        pointRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8a867c' },
        grid: { display: false },
      },
      y: {
        ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8a867c' },
        grid: { color: 'rgba(128,128,128,0.1)' },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
      
      {/* Chart 1: Category Breakdown Doughnut */}
      <div className="dotgui-card p-5 space-y-3 flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-hairline pb-2.5">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-brand-blue shrink-0" />
            <h3 className="text-xs font-mono font-bold text-ink uppercase">Category Breakdown</h3>
          </div>
          <span className="text-[10px] font-mono text-muted-custom">
            {activeCategories.length} category{activeCategories.length !== 1 ? 's' : ''} ({timeframeLabel1})
          </span>
        </div>

        {timeframeTxs1.length === 0 ? (
          <div className="h-52 text-center text-muted-custom flex flex-col items-center justify-center space-y-1">
            <PieChart className="w-7 h-7 mx-auto text-muted-custom/40" />
            <p className="text-xs font-mono">No expenses for {timeframeLabel1}.</p>
          </div>
        ) : (
          <div className="h-52 relative flex items-center justify-center">
            <Doughnut
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      boxWidth: 10,
                      font: { family: 'JetBrains Mono', size: 10 },
                      color: '#8a867c',
                    },
                  },
                  tooltip: {
                    callbacks: {
                      label: (context: any) => {
                        const val = context.parsed || 0;
                        const pct = totalDoughnutSpend > 0 ? ((val / totalDoughnutSpend) * 100).toFixed(1) : '0.0';
                        const formatted = formatCurrency(val, baseCurrency);
                        return ` ${context.label}: ${formatted} (${pct}%)`;
                      }
                    }
                  }
                },
              }}
            />
          </div>
        )}

        {/* Minimal Single-Row Timeframe Toggle at Bottom of Card 1 (No 'Week') */}
        <div className="pt-2 border-t border-hairline/50">
          <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline">
            {(['day', 'month', 'year', 'all'] as const).map((mode) => {
              const isActive = activeTimeframe1 === mode;
              const labels: Record<string, string> = {
                day: 'Day',
                month: 'Month',
                year: 'Year',
                all: 'All-time'
              };
              return (
                <button
                  key={mode}
                  onClick={() => setActiveTimeframe1(mode)}
                  className={`flex-1 py-1 px-1 text-[11px] font-mono font-bold rounded-lg transition-all duration-150 text-center whitespace-nowrap ${
                    isActive
                      ? 'bg-surface-card text-ink border border-hairline shadow-xs ring-1 ring-brand-purple/40 font-bold'
                      : 'text-muted-custom hover:text-ink hover:bg-surface-card/40 border border-transparent font-medium'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart 2: Spending Trend Bar/Line Chart */}
      <div className="dotgui-card p-5 space-y-3 flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-hairline pb-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-mint shrink-0" />
            <h3 className="text-xs font-mono font-bold text-ink uppercase">Spending Trend</h3>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-custom">
              {trendLabels.length} point{trendLabels.length !== 1 ? 's' : ''} ({timeframeLabel2})
            </span>
            <button
              onClick={() => setChartType(prev => prev === 'bar' ? 'line' : 'bar')}
              className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-surface-soft border border-hairline text-ink hover:bg-brand-mint/10 hover:text-brand-mint transition-colors flex items-center gap-1"
              title="Toggle Bar / Line chart view"
            >
              {chartType === 'bar' ? <BarChart3 className="w-3 h-3 text-brand-mint" /> : <LineChart className="w-3 h-3 text-brand-mint" />}
              {chartType === 'bar' ? 'Bar' : 'Line'}
            </button>
          </div>
        </div>

        {timeframeTxs2.length === 0 ? (
          <div className="h-52 text-center text-muted-custom flex flex-col items-center justify-center space-y-1">
            <TrendingUp className="w-7 h-7 mx-auto text-muted-custom/40" />
            <p className="text-xs font-mono">No trend data for {timeframeLabel2}.</p>
          </div>
        ) : (
          <div className="h-52 relative flex items-center justify-center">
            {chartType === 'bar' ? (
              <Bar data={barData} options={chartOptions} />
            ) : (
              <Line data={lineData} options={chartOptions} />
            )}
          </div>
        )}

        {/* Minimal Single-Row Timeframe Toggle at Bottom of Card 2 (Includes 'Week') */}
        <div className="pt-2 border-t border-hairline/50">
          <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline">
            {(['day', 'week', 'month', 'year', 'all'] as const).map((mode) => {
              const isActive = activeTimeframe2 === mode;
              const labels: Record<string, string> = {
                day: 'Day',
                week: 'Week',
                month: 'Month',
                year: 'Year',
                all: 'All-time'
              };
              return (
                <button
                  key={mode}
                  onClick={() => setActiveTimeframe2(mode)}
                  className={`flex-1 py-1 px-1 text-[11px] font-mono font-bold rounded-lg transition-all duration-150 text-center whitespace-nowrap ${
                    isActive
                      ? 'bg-surface-card text-ink border border-hairline shadow-xs ring-1 ring-brand-purple/40 font-bold'
                      : 'text-muted-custom hover:text-ink hover:bg-surface-card/40 border border-transparent font-medium'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};

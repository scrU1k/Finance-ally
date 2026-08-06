import React from 'react';
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
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useFinance } from '../../context/FinanceContext';
import { convertCurrencyAmount } from '../../services/currency';
import { PieChart, TrendingUp } from 'lucide-react';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title
);

export const LiveSpendChart: React.FC = () => {
  const { filteredTransactions, categories, baseCurrency, forexRates } = useFinance();

  // 1. Prepare Category Doughnut Data (With Currency Conversion)
  const catTotals: Record<string, number> = {};
  filteredTransactions.forEach(t => {
    const amtInBase = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
    catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + amtInBase;
  });

  const activeCategories = categories.filter(c => (catTotals[c.id] || 0) > 0);
  const doughnutLabels = activeCategories.map(c => c.name);
  const doughnutValues = activeCategories.map(c => catTotals[c.id]);
  const doughnutColors = activeCategories.map(c => c.color);

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

  // 2. Prepare Daily Trend Bar Data (With Currency Conversion)
  const dailySpendMap: Record<string, number> = {};
  filteredTransactions.forEach(t => {
    const amtInBase = convertCurrencyAmount(t.amount, t.currency, baseCurrency, forexRates);
    dailySpendMap[t.date] = (dailySpendMap[t.date] || 0) + amtInBase;
  });

  const sortedDates = Object.keys(dailySpendMap).sort();
  const barLabels = sortedDates.map(d => d.slice(5)); // MM-DD
  const barValues = sortedDates.map(d => dailySpendMap[d]);

  const barData = {
    labels: barLabels,
    datasets: [
      {
        label: `Spent (${baseCurrency})`,
        data: barValues,
        backgroundColor: '#2b6be4',
        borderRadius: 6,
      },
    ],
  };

  if (filteredTransactions.length === 0) {
    return (
      <div className="dotgui-card p-6 text-center text-muted-custom space-y-2">
        <PieChart className="w-8 h-8 mx-auto text-muted-custom/50" />
        <p className="text-xs font-mono">No transactions recorded for this period yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
      
      {/* Category Breakdown Doughnut */}
      <div className="dotgui-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-brand-blue" />
            <h3 className="text-sm font-mono font-semibold text-ink uppercase">Category Breakdown</h3>
          </div>
          <span className="text-[10px] font-mono text-muted-custom">
            {activeCategories.length} categories
          </span>
        </div>

        <div className="h-56 relative flex items-center justify-center">
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
              },
            }}
          />
        </div>
      </div>

      {/* Daily Trend Bar */}
      <div className="dotgui-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-mint" />
            <h3 className="text-sm font-mono font-semibold text-ink uppercase">Daily Spending Trend</h3>
          </div>
          <span className="text-[10px] font-mono text-muted-custom">
            {sortedDates.length} days
          </span>
        </div>

        <div className="h-56 relative flex items-center justify-center">
          <Bar
            data={barData}
            options={{
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
            }}
          />
        </div>
      </div>

    </div>
  );
};

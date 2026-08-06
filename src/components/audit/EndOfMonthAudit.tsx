import React, { useState, useMemo } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { generateEndOfMonthAudit } from '../../services/insightsEngine';
import { formatCurrency } from '../../services/currency';
import { PieChart, Award, AlertTriangle, CheckCircle, Calendar, HelpCircle, Mail, Save, X } from 'lucide-react';
import { saveUserProfile } from '../../services/auth';
import { CustomSelect, SelectOption } from '../common/CustomSelect';

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const YEARS = ['2026', '2025', '2024', '2023'];

export const EndOfMonthAudit: React.FC = () => {
  const { transactions, categories, baseCurrency } = useFinance();
  const { user } = useAuth();
  const currentMonthKey = new Date().toISOString().substring(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [showGradeExplanation, setShowGradeExplanation] = useState(false);
  const [isMonthModalOpen, setIsMonthModalOpen] = useState(false);

  // Email Config State
  const [email, setEmail] = useState(user?.emailForReport || '');
  const [frequency, setFrequency] = useState(user?.reportFrequency || 'monthly');
  const [saveMsg, setSaveMsg] = useState('');

  const auditReport = useMemo(() => {
    return generateEndOfMonthAudit(transactions, categories, selectedMonth, baseCurrency);
  }, [transactions, categories, selectedMonth, baseCurrency]);

  const handleSaveEmailConfig = () => {
    if (user) {
      const updated = { ...user, emailForReport: email, reportFrequency: frequency as any };
      saveUserProfile(updated);
      setSaveMsg('Report email settings saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  const [year, month] = selectedMonth.split('-');
  const currentMonthObj = MONTHS.find(m => m.value === month);
  const currentMonthLabel = currentMonthObj ? currentMonthObj.label : 'Select Month';

  const frequencyOptions: SelectOption[] = [
    { value: 'weekly', label: 'Weekly Spending Summary' },
    { value: 'monthly', label: 'Monthly Spending Digest' },
    { value: 'annually', label: 'Annual Audit Report' },
    { value: 'none', label: 'Disabled' },
  ];

  return (
    <div className="space-y-6 pb-24 max-w-full overflow-hidden">
      
      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-hairline pb-3">
        <div>
          <h2 className="text-xl font-display font-bold text-ink flex items-center gap-2">
            <PieChart className="w-5 h-5 text-brand-purple" />
            <span>Financial Audit</span>
          </h2>
        </div>

        {/* Custom Styled Month & Year Chip */}
        <button
          type="button"
          onClick={() => setIsMonthModalOpen(true)}
          className="flex items-center gap-1.5 bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink cursor-pointer hover:border-ink"
        >
          <Calendar className="w-3.5 h-3.5 text-brand-purple" />
          <span>{currentMonthLabel} {year}</span>
        </button>
      </div>

      {/* Main Audit Card */}
      <div className="dotgui-card p-6 space-y-6 bg-surface-card relative overflow-hidden">
        
        {/* Top Grade Banner */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div>
            <div className="text-[10px] font-mono text-muted-custom uppercase">AUDIT PERIOD REPORT</div>
            <div className="text-2xl font-display font-bold text-ink">{currentMonthLabel} {year} Audit</div>
          </div>

          {/* Health Score Badge & Interactive Grade Explanation */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-brand-purple/10 border border-brand-purple/30 px-4 py-2 rounded-2xl">
              <Award className="w-6 h-6 text-brand-purple" />
              <div>
                <div className="text-[9px] font-mono text-muted-custom uppercase flex items-center gap-1">
                  <span>Health Grade</span>
                  <button
                    onClick={() => setShowGradeExplanation(!showGradeExplanation)}
                    className="text-brand-purple hover:underline cursor-pointer"
                    title="How is this grade decided?"
                  >
                    <HelpCircle className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xl font-display font-bold text-brand-purple">
                  {auditReport.budgetHealthScore}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grade Explanation Box */}
        {showGradeExplanation && (
          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-2 text-xs font-mono text-body-custom animate-in fade-in duration-150">
            <div className="font-bold text-ink flex items-center justify-between">
              <span>📊 How Financial Grade is Decided</span>
              <button onClick={() => setShowGradeExplanation(false)} className="text-muted-custom">✕</button>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-custom">
              <li><strong className="text-brand-mint">A+ / A</strong>: Low spending velocity, balanced category distribution, zero transaction spikes &gt;30%.</li>
              <li><strong className="text-brand-yellow">B / C</strong>: Moderate spending velocity or single category taking &gt;45% of total budget.</li>
              <li><strong className="text-brand-coral">D / F</strong>: High expenditure velocity or multiple severe single-transaction spending spikes (&gt;30% of total month spend).</li>
            </ul>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-1">
            <div className="text-[10px] font-mono text-muted-custom uppercase">Total Spend in Month</div>
            <div className="text-xl font-display font-bold text-ink">
              {formatCurrency(auditReport.totalSpent, baseCurrency)}
            </div>
          </div>

          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-1">
            <div className="text-[10px] font-mono text-muted-custom uppercase">Audited Transactions</div>
            <div className="text-xl font-display font-bold text-ink">
              {auditReport.transactionCount} items
            </div>
          </div>

          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-1">
            <div className="text-[10px] font-mono text-muted-custom uppercase">Peak Spend Day</div>
            <div className="text-sm font-mono font-bold text-ink">
              {auditReport.highestSpendDay.date}
            </div>
            <div className="text-xs font-mono text-brand-coral">
              {formatCurrency(auditReport.highestSpendDay.amount, baseCurrency)}
            </div>
          </div>

        </div>

        {/* Top Category Breakdown Table */}
        <div className="space-y-3">
          <h3 className="text-sm font-mono font-semibold text-ink uppercase">Category Distribution</h3>
          <div className="space-y-2">
            {auditReport.topCategories.map(cat => (
              <div key={cat.categoryId} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-ink font-semibold">{cat.categoryName}</span>
                  </span>
                  <span className="text-muted-custom">
                    {formatCurrency(cat.amount, baseCurrency)} ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-soft rounded-full overflow-hidden border border-hairline">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Insights & Anomalies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-hairline">
          
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-semibold text-ink uppercase flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-brand-mint" />
              <span>Key Audit Findings</span>
            </h4>
            <ul className="space-y-1 text-xs font-mono text-body-custom list-disc list-inside">
              {auditReport.keyInsights.map((ins, i) => (
                <li key={i}>{ins}</li>
              ))}
            </ul>
          </div>

          {auditReport.anomalies.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-mono font-semibold text-brand-coral uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-brand-coral" />
                <span>Detected Anomalies</span>
              </h4>
              <ul className="space-y-1 text-xs font-mono text-brand-coral/90 list-disc list-inside">
                {auditReport.anomalies.map((anom, i) => (
                  <li key={i}>{anom}</li>
                ))}
              </ul>
            </div>
          )}

        </div>

      </div>

      {/* Periodic Audit Report Email Settings */}
      <div className="dotgui-card p-5 bg-surface-card space-y-3">
        <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-brand-mint" />
          <span>Periodic Report Email Settings</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-custom uppercase">Delivery Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your.email@domain.com"
              className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-custom uppercase">Report Frequency</label>
            <CustomSelect
              direction="up"
              options={frequencyOptions}
              value={frequency}
              onChange={val => setFrequency(val as any)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {saveMsg ? (
            <span className="text-xs font-mono text-brand-mint font-bold">{saveMsg}</span>
          ) : <span />}

          <button
            onClick={handleSaveEmailConfig}
            className="border border-brand-blue text-brand-blue hover:bg-surface-soft text-xs font-mono font-bold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Save Email Settings
          </button>
        </div>
      </div>

      {/* Centered Glassmorphic Month & Year Selection Dialog */}
      {isMonthModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-canvas/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsMonthModalOpen(false)}
        >
          <div
            className="dotgui-glass border border-hairline rounded-2xl shadow-2xl p-5 space-y-4 bg-surface-card/95 backdrop-blur-xl w-80 max-w-[92vw]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-purple" /> Audit Month & Year
              </span>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Month Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Month</label>
                <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar border border-hairline/60 rounded-xl p-1 bg-surface-soft">
                  {MONTHS.map(m => {
                    const isSel = month === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setSelectedMonth(`${year}-${m.value}`)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                          isSel
                            ? 'border-brand-purple bg-surface-card text-brand-purple font-bold'
                            : 'text-body-custom hover:bg-surface-card'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Year Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Year</label>
                <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar border border-hairline/60 rounded-xl p-1 bg-surface-soft">
                  {YEARS.map(y => {
                    const isSel = year === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setSelectedMonth(`${y}-${month}`)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                          isSel
                            ? 'border-brand-purple bg-surface-card text-brand-purple font-bold'
                            : 'text-body-custom hover:bg-surface-card'
                        }`}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMonthModalOpen(false)}
              className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

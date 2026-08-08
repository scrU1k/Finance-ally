import React, { useState, useMemo, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { generateEndOfMonthAudit } from '../../services/insightsEngine';
import { loadSubscriptions } from '../../services/db';
import { formatCurrency } from '../../services/currency';
import {
  PieChart, Award, AlertTriangle, CheckCircle, Calendar, HelpCircle,
  Mail, Save, X, Activity, TrendingUp, Wallet, Clock,
} from 'lucide-react';
import { saveUserProfile } from '../../services/auth';
import { CustomSelect, SelectOption } from '../common/CustomSelect';
import { AuditDimensionScore, Subscription } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const LABEL_STYLE: Record<string, { text: string; bg: string; border: string; bar: string }> = {
  Excellent: { text: 'text-brand-mint',   bg: 'bg-brand-mint/10',   border: 'border-brand-mint/30',   bar: '#10B981' },
  Good:      { text: 'text-brand-blue',   bg: 'bg-brand-blue/10',   border: 'border-brand-blue/30',   bar: '#3B82F6' },
  Fair:      { text: 'text-yellow-400',   bg: 'bg-yellow-400/10',   border: 'border-yellow-400/30',   bar: '#FBBF24' },
  Poor:      { text: 'text-brand-coral',  bg: 'bg-brand-coral/10',  border: 'border-brand-coral/30',  bar: '#EF4444' },
};

const GRADE_STYLE: Record<string, string> = {
  'A+': 'text-brand-mint   border-brand-mint/30   bg-brand-mint/10',
  'A':  'text-brand-mint   border-brand-mint/30   bg-brand-mint/10',
  'B':  'text-brand-blue   border-brand-blue/30   bg-brand-blue/10',
  'C':  'text-yellow-400   border-yellow-400/30   bg-yellow-400/10',
  'D':  'text-brand-coral  border-brand-coral/30  bg-brand-coral/10',
  'F':  'text-brand-coral  border-brand-coral/30  bg-brand-coral/10',
  'O':  'text-muted-custom border-hairline         bg-surface-soft',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ScoreDimensionCardProps {
  title: string;
  icon: React.ReactNode;
  score: AuditDimensionScore;
}

const ScoreDimensionCard: React.FC<ScoreDimensionCardProps> = ({ title, icon, score }) => {
  const c = LABEL_STYLE[score.label] ?? LABEL_STYLE.Poor;
  return (
    <div className={`bg-surface-soft border ${c.border} rounded-2xl p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-1">
        <span className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase ${c.text}`}>
          {icon}
          {title}
        </span>
        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
          {score.label}
        </span>
      </div>

      <div className="text-3xl font-display font-bold text-ink leading-none">
        {score.score}
        <span className="text-sm text-muted-custom font-mono font-normal">/100</span>
      </div>

      <div className="w-full h-1.5 bg-surface-card rounded-full overflow-hidden border border-hairline">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score.score}%`, backgroundColor: c.bar }}
        />
      </div>

      <p className="text-[11px] font-mono text-muted-custom leading-relaxed">{score.detail}</p>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const EndOfMonthAudit: React.FC = () => {
  const { transactions, categories, baseCurrency } = useFinance();
  const { user } = useAuth();

  const currentMonthKey = new Date().toISOString().substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [showGradeExplanation, setShowGradeExplanation] = useState(false);
  const [isMonthModalOpen, setIsMonthModalOpen] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  // Email config
  const [email, setEmail] = useState(user?.emailForReport || '');
  const [frequency, setFrequency] = useState(user?.reportFrequency || 'monthly');
  const [saveMsg, setSaveMsg] = useState('');

  // Load subscriptions for creep detection
  useEffect(() => {
    loadSubscriptions().then(setSubscriptions).catch(() => setSubscriptions([]));
  }, []);

  const auditReport = useMemo(
    () => generateEndOfMonthAudit(transactions, categories, selectedMonth, baseCurrency, subscriptions),
    [transactions, categories, selectedMonth, baseCurrency, subscriptions]
  );

  const handleSaveEmailConfig = () => {
    if (user) {
      const updated = { ...user, emailForReport: email, reportFrequency: frequency as 'weekly' | 'monthly' | 'annually' | 'none' };
      saveUserProfile(updated);
      setSaveMsg('Report email settings saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  const [year, month] = selectedMonth.split('-');
  const currentMonthLabel = MONTHS.find(m => m.value === month)?.label ?? 'Select Month';

  const frequencyOptions: SelectOption[] = [
    { value: 'weekly',   label: 'Weekly Spending Summary' },
    { value: 'monthly',  label: 'Monthly Spending Digest' },
    { value: 'annually', label: 'Annual Audit Report' },
    { value: 'none',     label: 'Disabled' },
  ];

  const gradeStyle = GRADE_STYLE[auditReport.budgetHealthScore] ?? GRADE_STYLE.O;

  return (
    <div className="space-y-6 pb-24 max-w-full overflow-hidden">

      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-hairline pb-3">
        <h2 className="text-xl font-display font-bold text-ink flex items-center gap-2">
          <PieChart className="w-5 h-5 text-brand-purple" />
          Financial Audit
        </h2>

        <button
          type="button"
          onClick={() => setIsMonthModalOpen(true)}
          className="flex items-center gap-1.5 bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink cursor-pointer hover:border-ink transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-brand-purple" />
          <span>{currentMonthLabel} {year}</span>
        </button>
      </div>

      {/* Main Audit Card */}
      <div className="dotgui-card p-6 space-y-6 bg-surface-card relative overflow-hidden">

        {/* Title row + Grade badge */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div>
            <div className="text-[10px] font-mono text-muted-custom uppercase">AUDIT PERIOD REPORT</div>
            <div className="text-2xl font-display font-bold text-ink">{currentMonthLabel} {year} Audit</div>
          </div>

          <div className={`flex items-center gap-2 border px-4 py-2 rounded-2xl ${gradeStyle}`}>
            <Award className="w-6 h-6" />
            <div>
              <div className="text-[9px] font-mono uppercase flex items-center gap-1 opacity-70">
                <span>Overall Grade</span>
                <button
                  onClick={() => setShowGradeExplanation(!showGradeExplanation)}
                  className="hover:opacity-80 cursor-pointer"
                  title="How is this grade decided?"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
              </div>
              <div className="text-xl font-display font-bold">{auditReport.budgetHealthScore}</div>
            </div>
          </div>
        </div>

        {/* Grade Explanation */}
        {showGradeExplanation && (
          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-2 text-xs font-mono text-body-custom animate-in fade-in duration-150">
            <div className="font-bold text-ink flex items-center justify-between">
              <span>How the Grade is Computed</span>
              <button onClick={() => setShowGradeExplanation(false)} className="text-muted-custom cursor-pointer">✕</button>
            </div>
            <p className="text-[11px] text-muted-custom">
              The grade is the average of three scored dimensions — each measured as a percentage of your
              own spending history, never against an absolute currency amount.
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-custom">
              <li><strong className="text-brand-mint">A+ / A (90–100 / 75–89)</strong>: Consistent daily logging, stable week-to-week spending, low discretionary pressure vs your average.</li>
              <li><strong className="text-brand-blue">B (60–74)</strong>: Mostly good habits — minor gaps or slight discretionary uptick.</li>
              <li><strong className="text-yellow-400">C (45–59)</strong>: Irregular logging or elevated discretionary spending vs your baseline.</li>
              <li><strong className="text-brand-coral">D / F (30–44 / &lt;30)</strong>: Significant logging gaps, high spending volatility, or heavy discretionary pressure.</li>
              <li><strong className="text-muted-custom">O — Uninitialized</strong>: Fewer than 3 months of data. Grades are meaningless without a baseline. Keep logging — your first score unlocks at month 3.</li>
            </ul>
          </div>
        )}

        {/* Baseline Lockout Banner (shown when < 3 months data) */}
        {!auditReport.hasBaseline && (
          <div className="bg-brand-purple/5 border border-brand-purple/20 rounded-2xl p-5 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-purple shrink-0" />
              <span className="text-sm font-mono font-bold text-brand-purple">
                Finance-Ally is learning your spending patterns
              </span>
            </div>
            <p className="text-xs font-mono text-muted-custom leading-relaxed">
              Audit scores need at least <strong>3 months of data</strong> to be meaningful. Grading you now would be inaccurate — you'd get an A+ for being new, which tells you nothing.
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-muted-custom">
                <span>{auditReport.monthsOfData} of 3 months logged</span>
                <span>{3 - auditReport.monthsOfData} month{3 - auditReport.monthsOfData !== 1 ? 's' : ''} to go</span>
              </div>
              <div className="w-full h-2 bg-surface-soft rounded-full overflow-hidden border border-hairline">
                <div
                  className="h-full rounded-full bg-brand-purple transition-all duration-700"
                  style={{ width: `${(auditReport.monthsOfData / 3) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Three Dimension Score Cards — only when baseline exists */}
        {auditReport.hasBaseline && auditReport.consistencyScore && auditReport.volatilityScore && auditReport.savingsPressureScore && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ScoreDimensionCard
              title="Consistency"
              icon={<Activity className="w-3.5 h-3.5" />}
              score={auditReport.consistencyScore}
            />
            <ScoreDimensionCard
              title="Volatility"
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              score={auditReport.volatilityScore}
            />
            <ScoreDimensionCard
              title="Savings Pressure"
              icon={<Wallet className="w-3.5 h-3.5" />}
              score={auditReport.savingsPressureScore}
            />
          </div>
        )}

        {/* KPI Grid (always shown — factual, not evaluative) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-1">
            <div className="text-[10px] font-mono text-muted-custom uppercase">Total Spend</div>
            <div className="text-xl font-display font-bold text-ink">
              {formatCurrency(auditReport.totalSpent, baseCurrency)}
            </div>
          </div>

          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-1">
            <div className="text-[10px] font-mono text-muted-custom uppercase">Transactions</div>
            <div className="text-xl font-display font-bold text-ink">
              {auditReport.transactionCount} items
            </div>
          </div>

          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-1">
            <div className="text-[10px] font-mono text-muted-custom uppercase">Peak Spend Day</div>
            <div className="text-sm font-mono font-bold text-ink">{auditReport.highestSpendDay.date}</div>
            <div className="text-xs font-mono text-brand-coral">
              {formatCurrency(auditReport.highestSpendDay.amount, baseCurrency)}
            </div>
          </div>
        </div>

        {/* Category Distribution (always shown) */}
        {auditReport.topCategories.length > 0 && (
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
        )}

        {/* Insights & Anomalies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-hairline">
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-semibold text-ink uppercase flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-brand-mint" />
              <span>Key Audit Findings</span>
            </h4>
            <ul className="space-y-1.5 text-xs font-mono text-body-custom list-disc list-inside">
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
              <ul className="space-y-1.5 text-xs font-mono text-brand-coral/90 list-disc list-inside">
                {auditReport.anomalies.map((anom, i) => (
                  <li key={i}>{anom}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Email Report Settings */}
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
              className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand-blue"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-custom uppercase">Report Frequency</label>
            <CustomSelect
              direction="up"
              options={frequencyOptions}
              value={frequency}
              onChange={val => setFrequency(val as 'weekly' | 'monthly' | 'annually' | 'none')}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {saveMsg ? (
            <span className="text-xs font-mono text-brand-mint font-bold">{saveMsg}</span>
          ) : <span />}
          <button
            onClick={handleSaveEmailConfig}
            className="border border-brand-blue text-brand-blue hover:bg-surface-soft text-xs font-mono font-bold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Save Email Settings
          </button>
        </div>
      </div>

      {/* Month & Year Selection Modal */}
      {isMonthModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsMonthModalOpen(false)}
        >
          <div
            className="bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl shadow-2xl shadow-black/20 p-5 space-y-4 w-80 max-w-[92vw] ring-1 ring-white/10"
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
              {/* Month */}
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
                            ? 'bg-surface-card text-brand-purple font-bold'
                            : 'text-body-custom hover:bg-surface-card'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Year */}
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
                            ? 'bg-surface-card text-brand-purple font-bold'
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

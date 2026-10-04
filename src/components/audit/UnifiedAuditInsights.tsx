import React, { useState, useMemo, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { generateEndOfMonthAudit, generateSmartSpendingSuggestions } from '../../services/insightsEngine';
import { loadSubscriptions, loadPeriodNotes, savePeriodNote, deletePeriodNote } from '../../services/db';
import { formatCurrency } from '../../services/currency';
import {
  getCustomRules,
  deleteKnowledgeRule,
  KnowledgeRule,
  attachKBWorkerListener,
  getAllRules,
} from '../../services/localKnowledgeBase';
import { runExpertSystem } from '../../services/expertSystem';
import { parseAndExecuteLocalQuery } from '../../services/localQueryParser';
import { getSemanticWorkerSingleton } from '../../workers/workerOrchestrator';
import { saveUserProfile } from '../../services/auth';
import { CustomSelect } from '../common/CustomSelect';
import { Subscription, PeriodNote, Transaction } from '../../types';
import { getLocalMonthKey } from '../../utils/dateUtils';
import { isPendingScheduledTx } from '../../utils/scheduledUtils';
import {
  Award,
  AlertTriangle,
  CheckCircle,
  Calendar,
  HelpCircle,
  Mail,
  Save,
  X,
  TrendingUp,
  Wallet,
  Clock,
  FileText,
  Edit2,
  Trash2,
  ShieldCheck,
  Lightbulb,
  Sparkles,
  BrainCircuit,
  ArrowRight,
  Terminal,
  PieChart,
} from 'lucide-react';

interface UnifiedAuditInsightsProps {
  onSelectTransaction?: (tx: Transaction) => void;
}

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

const LABEL_STYLE: Record<string, { text: string; bg: string; border: string; bar: string }> = {
  Excellent: { text: 'text-brand-mint', bg: 'bg-brand-mint/10', border: 'border-brand-mint/30', bar: '#10B981' },
  Good: { text: 'text-brand-blue', bg: 'bg-brand-blue/10', border: 'border-brand-blue/30', bar: '#3B82F6' },
  Fair: { text: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', bar: '#FBBF24' },
  Poor: { text: 'text-brand-coral', bg: 'bg-brand-coral/10', border: 'border-brand-coral/30', bar: '#EF4444' },
};

const GRADE_STYLE: Record<string, string> = {
  'A+': 'text-brand-mint border-brand-mint/30 bg-brand-mint/10',
  A: 'text-brand-mint border-brand-mint/30 bg-brand-mint/10',
  B: 'text-brand-blue border-brand-blue/30 bg-brand-blue/10',
  C: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  D: 'text-brand-coral border-brand-coral/30 bg-brand-coral/10',
  F: 'text-brand-coral border-brand-coral/30 bg-brand-coral/10',
  O: 'text-muted-custom border-hairline bg-surface-soft',
};

export const UnifiedAuditInsights: React.FC<UnifiedAuditInsightsProps> = ({ onSelectTransaction: _onSelectTransaction }) => {
  const { transactions, filteredTransactions, categories, baseCurrency, forexRates } = useFinance();
  const { user } = useAuth();

  // Top Section View Filter
  const [activeView, setActiveView] = useState<'all' | 'audit' | 'insights'>('all');

  // Month & Year Selection
  const currentMonthKey = getLocalMonthKey();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [isMonthModalOpen, setIsMonthModalOpen] = useState(false);
  const [showGradeExplanation, setShowGradeExplanation] = useState(false);

  // Dynamic available years
  const availableYears = useMemo(() => {
    const currentY = new Date().getFullYear();
    const yearSet = new Set<string>([
      String(currentY + 1),
      String(currentY),
      String(currentY - 1),
      String(currentY - 2),
      String(currentY - 3),
    ]);
    transactions.forEach(t => {
      if (t.date && t.date.length >= 4) {
        yearSet.add(t.date.substring(0, 4));
      }
    });
    return Array.from(yearSet).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  }, [transactions]);

  const [year, month] = selectedMonth.split('-');
  const currentMonthLabel = MONTHS.find(m => m.value === month)?.label ?? 'Select Month';

  // Subscriptions & Period Notes
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [periodNotes, setPeriodNotes] = useState<PeriodNote[]>([]);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteEditContent, setNoteEditContent] = useState('');
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);
  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);

  // Email Config
  const [email, setEmail] = useState(user?.emailForReport || '');
  const [frequency, setFrequency] = useState(user?.reportFrequency || 'monthly');
  const [saveMsg, setSaveMsg] = useState('');

  // AI Assistant State
  const [queryInput, setQueryInput] = useState('');
  const [answerResult, setAnswerResult] = useState<React.ReactNode | null>(null);
  const [showCommandsModal, setShowCommandsModal] = useState(false);
  const [showRulesOverlay, setShowRulesOverlay] = useState(false);
  const [currentRules, setCurrentRules] = useState<KnowledgeRule[]>([]);
  const [insightTimeframe, setInsightTimeframe] = useState<'week' | 'month' | 'year'>('month');

  useEffect(() => {
    loadSubscriptions().then(setSubscriptions).catch(() => setSubscriptions([]));
    loadPeriodNotes().then(setPeriodNotes).catch(() => setPeriodNotes([]));
    const worker = getSemanticWorkerSingleton();
    if (worker) attachKBWorkerListener(worker);
  }, []);

  useEffect(() => {
    const existing = periodNotes.find(n => n.periodKey === selectedMonth);
    setNoteEditContent(existing?.content || '');
    setIsEditingNote(false);
  }, [selectedMonth, periodNotes]);

  // Compute Audit Report
  const auditReport = useMemo(
    () => generateEndOfMonthAudit(transactions, categories, selectedMonth, baseCurrency, subscriptions, forexRates),
    [transactions, categories, selectedMonth, baseCurrency, subscriptions, forexRates]
  );

  // Compute Smart Suggestions
  const settledTransactions = useMemo(() => {
    return filteredTransactions.filter(t => !isPendingScheduledTx(t));
  }, [filteredTransactions]);

  const suggestions = useMemo(() => {
    return generateSmartSpendingSuggestions(settledTransactions, categories, baseCurrency, insightTimeframe, forexRates);
  }, [settledTransactions, categories, baseCurrency, insightTimeframe, forexRates]);

  const customRules = useMemo(() => getCustomRules(), []);

  // Handle Note Save / Delete
  const handleSaveNote = async () => {
    const newNote: PeriodNote = {
      id: `note-${selectedMonth}`,
      periodType: 'month',
      periodKey: selectedMonth,
      title: `${currentMonthLabel} ${year} Note`,
      content: noteEditContent.trim(),
      updatedAt: Date.now(),
    };
    await savePeriodNote(newNote);
    const updated = await loadPeriodNotes();
    setPeriodNotes(updated);
    setIsEditingNote(false);
  };

  const handleDeleteNote = async () => {
    await deletePeriodNote(selectedMonth);
    const updated = await loadPeriodNotes();
    setPeriodNotes(updated);
    setNoteEditContent('');
    setIsEditingNote(false);
  };

  const handleSaveEmailConfig = () => {
    if (user) {
      const updated = { ...user, emailForReport: email, reportFrequency: frequency as 'weekly' | 'monthly' | 'annually' | 'none' };
      saveUserProfile(updated);
      setSaveMsg('Email settings saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  // Assistant Query Handler
  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;

    const input = queryInput.trim();

    // 1. Local Query Parser
    const localQueryResult = await parseAndExecuteLocalQuery(input, settledTransactions, categories, baseCurrency, forexRates);
    if (localQueryResult.matched) {
      setAnswerResult(
        <div className="p-3.5 bg-brand-purple/10 border border-brand-purple/20 rounded-xl space-y-1.5 font-sans">
          <div className="flex items-center gap-2 text-brand-purple text-xs uppercase font-bold tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Personal Finance Assistant
          </div>
          <div className="text-xs font-sans font-medium text-ink whitespace-pre-line leading-relaxed">
            {localQueryResult.answer}
          </div>
          {localQueryResult.detail && (
            <p className="text-[11px] text-muted-custom font-sans pt-1 border-t border-hairline/30">{localQueryResult.detail}</p>
          )}
        </div>
      );
      setQueryInput('');
      return;
    }

    // 2. Expert System
    const expertResult = runExpertSystem(input, settledTransactions, categories, baseCurrency, forexRates);
    if (expertResult.matched) {
      setAnswerResult(
        <div className="p-3.5 bg-brand-purple/10 border border-brand-purple/20 rounded-xl space-y-1.5 font-sans">
          <div className="flex items-center gap-2 text-brand-purple text-xs uppercase font-bold tracking-wider">
            <BrainCircuit className="w-3.5 h-3.5" /> Financial Advisor
          </div>
          <div className="text-xs font-sans text-ink whitespace-pre-line leading-relaxed">
            {expertResult.answer}
          </div>
          {expertResult.actionable && (
            <p className="text-[11px] text-muted-custom font-sans pt-1 border-t border-hairline/30 leading-normal">
              💡 <strong>Recommendation:</strong> {expertResult.actionable}
            </p>
          )}
        </div>
      );
      setQueryInput('');
      return;
    }

    setAnswerResult(
      <div className="p-3 bg-surface-soft border border-hairline rounded-xl text-xs font-mono text-muted-custom">
        No direct query match. Try commands like <code className="text-brand-purple">list rules</code> or ask about spending trends.
      </div>
    );
  };

  const gradeStyle = GRADE_STYLE[auditReport.budgetHealthScore] ?? GRADE_STYLE.O;
  const existingNote = periodNotes.find(n => n.periodKey === selectedMonth);

  return (
    <div className="space-y-4 pb-0 max-w-full overflow-hidden">
      
      {/* Unified Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-display font-bold text-ink flex items-center gap-2">
            <PieChart className="w-5 h-5 text-brand-purple" />
            <span>Audit & Insights</span>
          </h2>
          <p className="text-xs font-mono text-muted-custom">Financial health evaluation, audits & smart AI guidance</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Filter Pill Switch */}
          <div className="flex items-center gap-1 bg-surface-card p-1 rounded-full border border-hairline shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveView('all')}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-full transition-all cursor-pointer ${
                activeView === 'all'
                  ? 'bg-ink text-canvas shadow-xs'
                  : 'text-muted-custom hover:text-ink'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActiveView('audit')}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-full transition-all cursor-pointer ${
                activeView === 'audit'
                  ? 'bg-brand-purple text-white shadow-xs'
                  : 'text-muted-custom hover:text-ink'
              }`}
            >
              Audit
            </button>
            <button
              type="button"
              onClick={() => setActiveView('insights')}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-full transition-all cursor-pointer ${
                activeView === 'insights'
                  ? 'bg-brand-yellow text-canvas shadow-xs'
                  : 'text-muted-custom hover:text-ink'
              }`}
            >
              Insights
            </button>
          </div>

          {/* Month & Year Picker Button */}
          {(activeView === 'all' || activeView === 'audit') && (
            <button
              type="button"
              onClick={() => setIsMonthModalOpen(true)}
              className="flex items-center gap-1.5 bg-surface-card border border-hairline rounded-full px-3 py-1 text-xs font-mono text-ink cursor-pointer hover:border-ink transition-colors shadow-2xs"
            >
              <Calendar className="w-3.5 h-3.5 text-brand-purple" />
              <span>{currentMonthLabel} {year}</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: FINANCIAL AUDIT & HEALTH EVALUATION */}
      {/* ========================================================================= */}
      {(activeView === 'all' || activeView === 'audit') && (
        <div className="space-y-3.5 animate-in fade-in duration-200">
          
          {/* Health Score & Grade Banner (Compact Horizontal Hero) */}
          <div className="dotgui-card p-4 bg-surface-card border border-hairline rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center gap-1.5 border px-3.5 py-1.5 rounded-2xl ${gradeStyle} shrink-0`}>
                <Award className="w-5 h-5" />
                <span className="text-xl font-display font-bold">{auditReport.budgetHealthScore}</span>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] font-mono font-bold text-muted-custom uppercase flex items-center gap-1">
                  <span>{currentMonthLabel} {year} Evaluation</span>
                  <button
                    onClick={() => setShowGradeExplanation(!showGradeExplanation)}
                    className="hover:opacity-80 cursor-pointer text-muted-custom"
                    title="How is this calculated?"
                  >
                    <HelpCircle className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xs font-mono font-semibold text-ink">
                  {auditReport.hasBaseline ? 'Health Assessment Active' : 'Establishing 3-Month Spending Baseline'}
                </div>
              </div>
            </div>

            {/* Quick KPI Strip (Total • Count • Peak) */}
            <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono text-ink divide-x divide-hairline/60 pt-2 sm:pt-0 border-t sm:border-t-0 border-hairline/40 w-full sm:w-auto justify-between sm:justify-end">
              <div>
                <span className="text-[10px] text-muted-custom block">TOTAL SPEND</span>
                <span className="font-bold text-ink">{formatCurrency(auditReport.totalSpent, baseCurrency)}</span>
              </div>
              <div className="pl-3 sm:pl-4">
                <span className="text-[10px] text-muted-custom block">TRANSACTIONS</span>
                <span className="font-bold text-ink">{auditReport.transactionCount} items</span>
              </div>
              <div className="pl-3 sm:pl-4">
                <span className="text-[10px] text-muted-custom block">PEAK DAY</span>
                <span className="font-bold text-brand-coral">{formatCurrency(auditReport.highestSpendDay.amount, baseCurrency)}</span>
              </div>
            </div>
          </div>

          {/* Grade Explanation Popover */}
          {showGradeExplanation && (
            <div className="bg-surface-soft p-3.5 rounded-xl border border-hairline space-y-1.5 text-xs font-mono text-body-custom animate-in fade-in duration-150">
              <div className="font-bold text-ink flex items-center justify-between text-xs">
                <span>Evaluation Criteria</span>
                <button onClick={() => setShowGradeExplanation(false)} className="text-muted-custom cursor-pointer">✕</button>
              </div>
              <p className="text-[11px] text-muted-custom">
                Scored on weekly consistency and discretionary spending ratio relative to your past history.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[10px]">
                <span className="text-brand-mint font-bold">A+/A: 75–100% disciplined</span>
                <span className="text-brand-blue font-bold">B: 60–74% stable</span>
                <span className="text-yellow-400 font-bold">C: 45–59% elevated</span>
                <span className="text-brand-coral font-bold">D/F: &lt;45% high swings</span>
              </div>
            </div>
          )}

          {/* Baseline Status if < 3 Months */}
          {!auditReport.hasBaseline && (
            <div className="bg-brand-purple/5 border border-brand-purple/20 rounded-xl p-3 flex items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-brand-purple font-semibold">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Building Baseline: {auditReport.monthsOfData} of 3 months logged</span>
              </div>
              <span className="text-muted-custom text-[11px]">{3 - auditReport.monthsOfData} month(s) remaining</span>
            </div>
          )}

          {/* Dimension Micro-Cards (Compact 2-col / 4-col responsive strip) */}
          {auditReport.hasBaseline && auditReport.volatilityScore && auditReport.savingsPressureScore && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { title: 'Spending Volatility', icon: <TrendingUp className="w-3.5 h-3.5" />, score: auditReport.volatilityScore },
                { title: 'Discretionary Pressure', icon: <Wallet className="w-3.5 h-3.5" />, score: auditReport.savingsPressureScore },
              ].map(({ title, icon, score }) => {
                const c = LABEL_STYLE[score.label] ?? LABEL_STYLE.Poor;
                return (
                  <div key={title} className={`bg-surface-soft border ${c.border} rounded-xl p-3 flex items-center justify-between gap-3`}>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase text-ink">
                        {icon}
                        <span>{title}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${c.bg} ${c.text}`}>{score.label}</span>
                      </div>
                      <p className="text-[11px] font-mono text-muted-custom truncate">{score.detail}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-display font-bold text-ink">{score.score}<span className="text-xs font-normal text-muted-custom">/100</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Category Distribution & Key Findings (Compact 2-Column Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            
            {/* Top Categories Progress Strip */}
            <div className="dotgui-card p-4 bg-surface-card border border-hairline rounded-2xl space-y-2.5">
              <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-brand-mint" />
                <span>Category Distribution</span>
              </h3>
              {auditReport.topCategories.length > 0 ? (
                <div className="space-y-2">
                  {auditReport.topCategories.slice(0, 5).map(cat => (
                    <div key={cat.categoryId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-ink font-semibold truncate">{cat.categoryName}</span>
                        </span>
                        <span className="text-muted-custom shrink-0 text-[11px]">
                          {formatCurrency(cat.amount, baseCurrency)} ({cat.percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-soft rounded-full overflow-hidden border border-hairline/60">
                        <div className="h-full rounded-full transition-all" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-muted-custom">No categorized transactions this month.</p>
              )}
            </div>

            {/* Findings & Anomalies Strip */}
            <div className="dotgui-card p-4 bg-surface-card border border-hairline rounded-2xl space-y-2.5">
              <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-brand-blue" />
                <span>Audit Takeaways & Anomalies</span>
              </h3>
              <ul className="space-y-1.5 text-xs font-sans text-body-custom list-disc list-inside">
                {auditReport.keyInsights.slice(0, 3).map((ins, i) => (
                  <li key={i} className="leading-snug">{ins}</li>
                ))}
                {auditReport.anomalies.map((anom, i) => (
                  <li key={`anom-${i}`} className="text-brand-coral leading-snug flex items-center gap-1.5 list-none">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{anom}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Expandable Auxiliary Drawers: Note, Rules Compliance, Email Report */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            
            {/* 1. Month Note Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowNoteDrawer(!showNoteDrawer)}
              className="p-3 bg-surface-card hover:bg-surface-soft border border-hairline rounded-xl text-left flex items-center justify-between text-xs font-mono cursor-pointer transition-colors shadow-2xs"
            >
              <span className="flex items-center gap-2 text-brand-purple font-bold">
                <FileText className="w-3.5 h-3.5" />
                <span>{currentMonthLabel} Note</span>
              </span>
              <span className="text-[10px] text-muted-custom">
                {existingNote?.content ? 'Read / Edit' : '+ Add Note'}
              </span>
            </button>

            {/* 2. Rules Compliance Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowRulesDrawer(!showRulesDrawer)}
              className="p-3 bg-surface-card hover:bg-surface-soft border border-hairline rounded-xl text-left flex items-center justify-between text-xs font-mono cursor-pointer transition-colors shadow-2xs"
            >
              <span className="flex items-center gap-2 text-brand-mint font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Rule Compliance</span>
              </span>
              <span className="text-[10px] text-muted-custom">
                {customRules.length} rules
              </span>
            </button>

            {/* 3. Email Settings Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowEmailDrawer(!showEmailDrawer)}
              className="p-3 bg-surface-card hover:bg-surface-soft border border-hairline rounded-xl text-left flex items-center justify-between text-xs font-mono cursor-pointer transition-colors shadow-2xs"
            >
              <span className="flex items-center gap-2 text-brand-blue font-bold">
                <Mail className="w-3.5 h-3.5" />
                <span>Email Reports</span>
              </span>
              <span className="text-[10px] text-muted-custom capitalize">{frequency}</span>
            </button>
          </div>

          {/* Month Note Expanded Card */}
          {showNoteDrawer && (
            <div className="dotgui-card p-4 bg-surface-card border border-hairline rounded-2xl space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-hairline pb-2">
                <h4 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-brand-purple" />
                  <span>{currentMonthLabel} {year} Personal Note</span>
                </h4>
                <div className="flex items-center gap-1.5">
                  {existingNote && !isEditingNote && (
                    <button type="button" onClick={handleDeleteNote} className="p-1 text-brand-coral hover:opacity-80 cursor-pointer" title="Delete note">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isEditingNote ? (
                    <button type="button" onClick={handleSaveNote} className="px-3 py-1 rounded-full bg-brand-purple text-white text-[10px] font-sans font-bold cursor-pointer">
                      Save
                    </button>
                  ) : (
                    <button type="button" onClick={() => setIsEditingNote(true)} className="p-1 text-muted-custom hover:text-ink cursor-pointer" title="Edit note">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {isEditingNote ? (
                <textarea
                  value={noteEditContent}
                  onChange={e => setNoteEditContent(e.target.value)}
                  placeholder="Record monthly milestones, unexpected expenses or thoughts..."
                  rows={3}
                  autoFocus
                  className="w-full bg-surface-soft border border-hairline rounded-xl p-2.5 text-xs font-sans text-ink focus:outline-none focus:border-brand-purple"
                />
              ) : (
                <p className="text-xs font-sans text-ink whitespace-pre-wrap leading-relaxed">
                  {noteEditContent || <span className="text-muted-custom italic">No note recorded yet for this month.</span>}
                </p>
              )}
            </div>
          )}

          {/* Rules Compliance Expanded Card */}
          {showRulesDrawer && (
            <div className="dotgui-card p-4 bg-surface-card border border-hairline rounded-2xl space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-hairline pb-2">
                <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-mint" />
                  <span>Rules Compliance Breakdown</span>
                </span>
                <span className="text-[10px] font-mono text-muted-custom">109 Pre-built + {customRules.length} Custom</span>
              </div>
              <div className="space-y-2">
                {customRules.map(r => (
                  <div key={r.id} className="p-2.5 bg-surface-soft rounded-xl text-xs font-mono flex items-center justify-between border border-hairline">
                    <span className="text-ink truncate">{r.text}</span>
                    <span className="text-[10px] text-brand-blue font-bold px-2 py-0.5 rounded-full bg-brand-blue/10 border border-brand-blue/20">Active</span>
                  </div>
                ))}
                {customRules.length === 0 && (
                  <p className="text-xs font-mono text-muted-custom">All 109 pre-built financial risk evaluators active.</p>
                )}
              </div>
            </div>
          )}

          {/* Email Settings Expanded Card */}
          {showEmailDrawer && (
            <div className="dotgui-card p-4 bg-surface-card border border-hairline rounded-2xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-hairline pb-2">
                <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-brand-blue" />
                  <span>Periodic Audit Email Digest</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-muted-custom uppercase">Delivery Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-brand-blue mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-custom uppercase">Frequency</label>
                  <div className="mt-1">
                    <CustomSelect
                      direction="down"
                      options={[
                        { value: 'weekly', label: 'Weekly Summary' },
                        { value: 'monthly', label: 'Monthly Digest' },
                        { value: 'annually', label: 'Annual Report' },
                        { value: 'none', label: 'Disabled' },
                      ]}
                      value={frequency}
                      onChange={val => setFrequency(val as any)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                {saveMsg ? <span className="text-xs font-mono text-brand-mint font-bold">{saveMsg}</span> : <div />}
                <button
                  type="button"
                  onClick={handleSaveEmailConfig}
                  className="border border-brand-blue text-brand-blue hover:bg-surface-soft text-xs font-mono font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: AI ASSISTANT & SPEND INSIGHTS */}
      {/* ========================================================================= */}
      {(activeView === 'all' || activeView === 'insights') && (
        <div className="space-y-3.5 pt-2 border-t border-hairline/60 animate-in fade-in duration-200">
          
          {/* AI Financial Assistant Input Bar */}
          <div className="dotgui-card p-4 bg-surface-card border border-hairline rounded-2xl space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-brand-purple" />
                <span>AI Financial Assistant</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCommandsModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-surface-soft border border-hairline hover:border-brand-purple text-[10px] font-mono font-bold text-brand-purple transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Terminal className="w-3 h-3" />
                  <span>Commands</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentRules(getAllRules());
                    setShowRulesOverlay(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-surface-soft border border-hairline hover:border-brand-mint text-[10px] font-mono font-bold text-brand-mint transition-colors cursor-pointer"
                >
                  Rules
                </button>
              </div>
            </div>

            <form onSubmit={handleQuerySubmit} className="relative flex items-center">
              <input
                type="text"
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                placeholder="Ask assistant or define rule (e.g. rule: 5% tax on dining)"
                className="w-full bg-surface-soft border border-hairline rounded-xl pl-3.5 pr-12 py-2.5 text-xs font-mono text-ink placeholder:text-muted-custom/60 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all outline-none"
              />
              <button
                type="submit"
                disabled={!queryInput.trim()}
                className="absolute right-1.5 bg-brand-purple/15 text-brand-purple hover:bg-brand-purple hover:text-white border border-brand-purple/30 p-1.5 rounded-lg disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center"
                title="Submit query"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {answerResult && (
              <div className="pt-2 animate-in fade-in duration-150">
                {answerResult}
              </div>
            )}
          </div>

          {/* Dynamic Spend Suggestions Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-brand-yellow" />
                <h3 className="text-sm font-mono font-bold text-ink">Smart Spending Suggestions</h3>
              </div>

              {/* Timeframe Filter Pill */}
              <div className="flex items-center gap-1 bg-surface-card p-0.5 rounded-lg border border-hairline">
                {(['week', 'month', 'year'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setInsightTimeframe(mode)}
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md capitalize transition-all cursor-pointer ${
                      insightTimeframe === mode
                        ? 'bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30'
                        : 'text-muted-custom hover:text-ink'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Suggestions List */}
            <div className="space-y-2.5">
              {suggestions.map((suggestion, idx) => (
                <div key={idx} className="dotgui-card p-3.5 bg-surface-card border border-hairline rounded-xl flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-brand-yellow/10 border border-brand-yellow/30 flex items-center justify-center text-brand-yellow shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-[9px] font-mono text-brand-yellow font-bold uppercase tracking-wider">
                      Insight #{idx + 1}
                    </div>
                    <p className="text-xs font-sans text-ink leading-relaxed">
                      {suggestion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Month & Year Selection Modal */}
      {isMonthModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsMonthModalOpen(false)}
        >
          <div
            className="bg-surface-card/90 backdrop-blur-2xl border border-hairline rounded-2xl shadow-2xl p-5 space-y-4 w-80 max-w-[92vw] ring-1 ring-white/10"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-purple" /> Select Month & Year
              </span>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                          isSel ? 'bg-surface-card text-brand-purple font-bold' : 'text-body-custom hover:bg-surface-card'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Year</label>
                <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar border border-hairline/60 rounded-xl p-1 bg-surface-soft">
                  {availableYears.map(y => {
                    const isSel = year === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setSelectedMonth(`${y}-${month}`)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                          isSel ? 'bg-surface-card text-brand-purple font-bold' : 'text-body-custom hover:bg-surface-card'
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
              className="w-full py-2 bg-ink text-surface-card rounded-xl text-xs font-mono font-bold cursor-pointer hover:opacity-90 shadow-sm"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Commands Reference Modal */}
      {showCommandsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-surface-card border border-hairline w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-hairline flex items-center justify-between bg-surface-soft/60">
              <h3 className="text-sm font-mono font-bold text-ink uppercase flex items-center gap-2">
                <Terminal className="w-4 h-4 text-brand-purple" />
                Assistant Commands
              </h3>
              <button
                type="button"
                onClick={() => setShowCommandsModal(false)}
                className="text-muted-custom hover:text-ink text-xs font-mono font-bold px-2 py-1 rounded-lg cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto font-mono text-xs text-ink max-h-[70vh]">
              {[
                { cmd: 'rule - dudh or dooth is groceries', title: 'Auto-Tag Word Rule', desc: 'Maps words to a category tag for Quick Log auto-detection.' },
                { cmd: 'list rules', title: 'List Active Rules', desc: 'Displays all active word auto-tag rules.' },
                { cmd: 'del rule - dudh', title: 'Delete Rule by Keyword', desc: 'Deletes a word rule matching your keyword.' },
                { cmd: 'list tags', title: 'List Category Tags', desc: 'Lists all category tags with transaction counts.' },
                { cmd: 'rule: 5% tax on dining', title: 'Save Knowledge Rule', desc: 'Saves a persistent financial observation to the vector engine.' },
              ].map(({ cmd, title, desc }) => (
                <div
                  key={cmd}
                  onClick={() => {
                    setQueryInput(cmd);
                    setShowCommandsModal(false);
                  }}
                  className="p-2.5 bg-surface-soft border border-hairline rounded-xl hover:border-brand-purple cursor-pointer transition-all space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-brand-purple">
                    <span>{title}</span>
                    <span className="text-[10px] text-muted-custom font-normal">Tap to insert</span>
                  </div>
                  <code className="block text-[11px] bg-surface-card px-2 py-1 rounded border border-hairline text-ink">
                    {cmd}
                  </code>
                  <p className="text-[11px] text-muted-custom font-sans">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rules Overlay Modal */}
      {showRulesOverlay && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-surface-card border border-hairline w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <h3 className="text-sm font-mono font-bold text-ink uppercase flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-brand-purple" />
                Knowledge Base Rules ({currentRules.length})
              </h3>
              <button
                onClick={() => setShowRulesOverlay(false)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2.5">
              {currentRules.length === 0 ? (
                <p className="text-xs font-mono text-muted-custom text-center py-6">No custom rules defined yet.</p>
              ) : (
                currentRules.map(rule => (
                  <div key={rule.id} className="p-2.5 bg-surface-soft border border-hairline rounded-xl flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-ink truncate">{rule.text}</span>
                    {rule.isCustom && (
                      <button
                        onClick={() => {
                          deleteKnowledgeRule(rule.id);
                          setCurrentRules(getAllRules());
                        }}
                        className="p-1 text-brand-coral hover:opacity-80 cursor-pointer shrink-0"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useMemo, useState, useEffect } from 'react';
import { Transaction } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { generateSmartSpendingSuggestions } from '../../services/insightsEngine';
import {
  addKnowledgeRule,
  getAllRules,
  deleteKnowledgeRule,
  deleteKnowledgeRuleByText,
  queryKnowledgeBase,
  attachKBWorkerListener,
  KnowledgeRule
} from '../../services/localKnowledgeBase';
import { runExpertSystem } from '../../services/expertSystem';
import { parseAndExecuteLocalQuery } from '../../services/localQueryParser';
import { getSemanticWorkerSingleton } from '../../workers/workerOrchestrator';
import { formatCurrency } from '../../services/currency';
import { Lightbulb, Sparkles, BrainCircuit, X, Trash2, ArrowRight, Tag, Terminal } from 'lucide-react';

interface SmartSuggestionsProps {
  onSelectTransaction?: (tx: Transaction) => void;
}

export const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({ onSelectTransaction }) => {
  const { filteredTransactions, categories, baseCurrency, addCategoryItem } = useFinance();

  const [insightTimeframe, setInsightTimeframe] = useState<'week' | 'month' | 'year'>('month');

  const suggestions = useMemo(() => {
    return generateSmartSpendingSuggestions(filteredTransactions, categories, baseCurrency, insightTimeframe);
  }, [filteredTransactions, categories, baseCurrency, insightTimeframe]);

  // Knowledge Base State
  const [queryInput, setQueryInput] = useState('');
  const [answerResult, setAnswerResult] = useState<React.ReactNode | null>(null);
  const [showRulesOverlay, setShowRulesOverlay] = useState(false);
  const [showCommandsModal, setShowCommandsModal] = useState(false);
  const [currentRules, setCurrentRules] = useState<KnowledgeRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Attach listener to worker singleton once on mount
  useEffect(() => {
    const worker = getSemanticWorkerSingleton();
    if (worker) {
      attachKBWorkerListener(worker);
    }
  }, []);

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;

    const input = queryInput.trim();
    setIsLoading(true);

    // LAYER 1: Check for Direct Local Command / Transaction Query (Instant Math & Rules Engine)
    const localQueryResult = await parseAndExecuteLocalQuery(input, filteredTransactions, categories, baseCurrency);
    if (localQueryResult.matched) {
      setAnswerResult(
        <div className="p-4 bg-brand-purple/10 border border-brand-purple/20 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-brand-purple font-mono text-xs uppercase font-bold tracking-wider">
            <Sparkles className="w-4 h-4" /> Personal Finance Assistant
          </div>
          <div className="text-sm font-mono font-medium text-ink whitespace-pre-line leading-relaxed">
            {localQueryResult.answer}
          </div>
          {localQueryResult.detail && (
            <p className="text-xs text-muted-custom font-mono pt-1 border-t border-hairline/30">{localQueryResult.detail}</p>
          )}
        </div>
      );
      setQueryInput('');
      setIsLoading(false);
      return;
    }

    // LAYER 2: Intent-Driven Expert System (Sync, Instant)
    const expertResult = runExpertSystem(input, filteredTransactions, categories, baseCurrency);
    if (expertResult.matched) {
      setAnswerResult(
        <div className="p-4 bg-brand-purple/10 border border-brand-purple/20 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-brand-purple font-mono text-xs uppercase font-bold tracking-wider">
            <BrainCircuit className="w-4 h-4" /> Financial Advisor
          </div>
          <div className="text-sm font-sans text-ink whitespace-pre-line leading-relaxed">
            {expertResult.answer}
          </div>
          {expertResult.actionable && (
            <p className="text-xs text-muted-custom font-sans pt-2 border-t border-hairline/30 leading-normal">
              💡 <strong>Recommendation:</strong> {expertResult.actionable}
            </p>
          )}
        </div>
      );
      setQueryInput('');
      setIsLoading(false);
      return;
    }

    // LAYER 3: Semantic Vector Search (Async via ONNX Worker)
    const worker = getSemanticWorkerSingleton();
    if (worker) {
      try {
        const results = await queryKnowledgeBase(input, worker, { maxResults: 1, similarityThreshold: 0.40 });
        if (results.length > 0) {
          const top = results[0];
          setAnswerResult(
            <div className="p-4 bg-surface-card border border-hairline rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-brand-purple font-mono text-xs uppercase font-bold tracking-wider">
                <BrainCircuit className="w-4 h-4" /> Knowledge Insight
              </div>
              <p className="text-sm text-ink leading-relaxed font-sans">{top.rule.text}</p>
              {top.rule.actionable && (
                <p className="text-xs text-muted-custom font-sans pt-2 border-t border-hairline/30">
                  💡 {top.rule.actionable}
                </p>
              )}
            </div>
          );
        } else {
          setAnswerResult(
            <div className="text-sm font-mono text-muted-custom p-3 bg-surface-card rounded-xl border border-hairline">
              No matching financial rule or concept found for your query.
            </div>
          );
        }
      } catch {
        setAnswerResult(
          <div className="text-sm font-mono text-muted-custom p-3 bg-surface-card rounded-xl border border-hairline">
            Could not process query. Please try again.
          </div>
        );
      }
    }

    setQueryInput('');
    setIsLoading(false);
  };

  const handleDeleteRule = (id: string) => {
    deleteKnowledgeRule(id);
    setCurrentRules(getAllRules());
  };

  // Helper to render suggestion text and highlight category names
  const renderStyledSuggestion = (text: string) => {
    let parts: React.ReactNode[] = [text];

    categories.forEach(cat => {
      const nextParts: React.ReactNode[] = [];
      parts.forEach(part => {
        if (typeof part === 'string' && part.includes(cat.name)) {
          const split = part.split(cat.name);
          split.forEach((s, idx) => {
            nextParts.push(s);
            if (idx < split.length - 1) {
              nextParts.push(
                <span
                  key={`${cat.id}-${idx}`}
                  className="font-bold px-1.5 py-0.5 rounded-md text-xs font-mono border border-hairline inline-flex items-center gap-1 mx-1"
                  style={{ backgroundColor: `${cat.color}15`, color: cat.color, borderColor: `${cat.color}40` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </span>
              );
            }
          });
        } else {
          nextParts.push(part);
        }
      });
      parts = nextParts;
    });

    return parts;
  };

  return (
    <div className="space-y-6 pb-24 max-w-full overflow-hidden relative">
      
      {/* Knowledge Base Interaction Area */}
      <div className="bg-surface-soft p-4 rounded-2xl border border-hairline shadow-sm">
        
        {/* Heading 1: Knowledge Engine */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-mono text-muted-custom uppercase font-bold tracking-wider flex items-center gap-1.5">
            <BrainCircuit className="w-4 h-4 text-brand-purple rotate-90" /> Knowledge Engine
          </h3>
        </div>

        <form onSubmit={handleQuerySubmit} className="relative flex items-center">
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Ask a question or define a rule (e.g. rule: 5% tax on dining)"
            className="w-full bg-surface-card border border-hairline rounded-xl pl-4 pr-14 py-3 text-sm font-mono text-ink placeholder:text-muted-custom/60 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all outline-none"
          />
          <button
            type="submit"
            disabled={!queryInput.trim()}
            className="absolute right-1.5 bg-brand-mint/15 text-brand-mint hover:bg-brand-mint hover:text-canvas border border-brand-mint/40 ring-2 ring-brand-mint/20 p-2.5 rounded-lg disabled:opacity-40 transition-all cursor-pointer shadow-md active:scale-95 flex items-center justify-center"
            title="Submit Query or Rule"
          >
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>

        {/* Commands Button */}
        <div className="flex items-center justify-between mt-2.5 px-0.5">
          <button
            type="button"
            onClick={() => setShowCommandsModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-card hover:bg-surface-soft border border-hairline hover:border-brand-purple text-xs font-mono font-bold text-brand-purple transition-all cursor-pointer shadow-2xs group"
          >
            <Terminal className="w-3.5 h-3.5 text-brand-purple group-hover:scale-110 transition-transform" />
            <span>Commands</span>
          </button>
          <span className="text-[10px] font-mono text-muted-custom">
            Tap for Assistant syntax & rules
          </span>
        </div>

        {/* Answer/Result Display Area */}
        {answerResult && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {answerResult}
          </div>
        )}
      </div>

      {/* Commands Reference Pop-over Modal */}
      {showCommandsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-surface-card border border-hairline w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-hairline flex items-center justify-between bg-surface-soft/60">
              <h3 className="text-sm font-mono font-bold text-ink uppercase flex items-center gap-2">
                <Terminal className="w-4 h-4 text-brand-purple" />
                Assistant Commands
              </h3>
              <button
                type="button"
                onClick={() => setShowCommandsModal(false)}
                className="text-muted-custom hover:text-ink text-xs font-mono font-bold px-2 py-1 rounded-lg hover:bg-surface-soft cursor-pointer transition-colors"
              >
                ✕ Close
              </button>
            </div>

            {/* Content List */}
            <div className="p-3 space-y-2.5 overflow-y-auto font-mono text-xs text-ink max-h-[70vh]">
              <p className="text-[11px] text-muted-custom font-normal mb-1">
                Tap any command below to insert it into the assistant:
              </p>

              {/* 1. Tagging Rule */}
              <div 
                onClick={() => { setQueryInput('rule - dudh or dooth is groceries'); setShowCommandsModal(false); }}
                className="p-3 bg-surface-soft/90 border border-hairline rounded-xl hover:border-brand-purple cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-brand-purple">Auto-Tag Word Rule</span>
                  <span className="text-[10px] text-brand-purple/70 font-mono font-bold group-hover:underline">Tap to insert</span>
                </div>
                <code className="block text-xs bg-surface-card px-2.5 py-1.5 rounded-lg border border-hairline text-ink font-mono font-semibold">
                  rule - dudh or dooth is groceries
                </code>
                <p className="text-[11px] text-muted-custom font-sans leading-tight">
                  Maps words or slang ("dudh") to a category tag ("Groceries") for instant Quick Log auto-detection.
                </p>
              </div>

              {/* 2. List Rules */}
              <div 
                onClick={() => { setQueryInput('list rules'); setShowCommandsModal(false); }}
                className="p-3 bg-surface-soft/90 border border-hairline rounded-xl hover:border-brand-purple cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-brand-purple">List Active Rules</span>
                  <span className="text-[10px] text-brand-purple/70 font-mono font-bold group-hover:underline">Tap to insert</span>
                </div>
                <code className="block text-xs bg-surface-card px-2.5 py-1.5 rounded-lg border border-hairline text-ink font-mono font-semibold">
                  list rules
                </code>
                <p className="text-[11px] text-muted-custom font-sans leading-tight">
                  Displays all active word auto-tag rules and saved knowledge base observations.
                </p>
              </div>

              {/* 3. Delete Rule */}
              <div 
                onClick={() => { setQueryInput('del rule - dudh'); setShowCommandsModal(false); }}
                className="p-3 bg-surface-soft/90 border border-hairline rounded-xl hover:border-brand-coral cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-brand-coral">Delete Rule by Keyword</span>
                  <span className="text-[10px] text-brand-coral/70 font-mono font-bold group-hover:underline">Tap to insert</span>
                </div>
                <code className="block text-xs bg-surface-card px-2.5 py-1.5 rounded-lg border border-hairline text-ink font-mono font-semibold">
                  del rule - dudh
                </code>
                <p className="text-[11px] text-muted-custom font-sans leading-tight">
                  Deletes a word rule or knowledge rule matching your specified keyword.
                </p>
              </div>

              {/* 4. List Tags */}
              <div 
                onClick={() => { setQueryInput('list tags'); setShowCommandsModal(false); }}
                className="p-3 bg-surface-soft/90 border border-hairline rounded-xl hover:border-brand-mint cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-brand-mint">List Category Tags</span>
                  <span className="text-[10px] text-brand-mint/70 font-mono font-bold group-hover:underline">Tap to insert</span>
                </div>
                <code className="block text-xs bg-surface-card px-2.5 py-1.5 rounded-lg border border-hairline text-ink font-mono font-semibold">
                  list tags
                </code>
                <p className="text-[11px] text-muted-custom font-sans leading-tight">
                  Lists all built-in and custom category tags along with transaction counts.
                </p>
              </div>

              {/* 5. Save Knowledge Observation */}
              <div 
                onClick={() => { setQueryInput('rule: 5% tax on dining'); setShowCommandsModal(false); }}
                className="p-3 bg-surface-soft/90 border border-hairline rounded-xl hover:border-brand-purple cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink">Save Knowledge Rule</span>
                  <span className="text-[10px] text-muted-custom font-mono font-bold group-hover:underline">Tap to insert</span>
                </div>
                <code className="block text-xs bg-surface-card px-2.5 py-1.5 rounded-lg border border-hairline text-ink font-mono font-semibold">
                  rule: 5% tax on dining
                </code>
                <p className="text-[11px] text-muted-custom font-sans leading-tight">
                  Saves a persistent financial observation to the local vector engine.
                </p>
              </div>

              {/* 6. Create Custom Tag */}
              <div 
                onClick={() => { setQueryInput('newtag: Books'); setShowCommandsModal(false); }}
                className="p-3 bg-surface-soft/90 border border-hairline rounded-xl hover:border-brand-purple cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink">Create Custom Tag</span>
                  <span className="text-[10px] text-muted-custom font-mono font-bold group-hover:underline">Tap to insert</span>
                </div>
                <code className="block text-xs bg-surface-card px-2.5 py-1.5 rounded-lg border border-hairline text-ink font-mono font-semibold">
                  newtag: Books
                </code>
                <p className="text-[11px] text-muted-custom font-sans leading-tight">
                  Creates a new custom category tag for tagging expenses.
                </p>
              </div>

              {/* 7. Filter by Tag */}
              <div 
                onClick={() => { setQueryInput('tag: Groceries'); setShowCommandsModal(false); }}
                className="p-3 bg-surface-soft/90 border border-hairline rounded-xl hover:border-brand-purple cursor-pointer transition-all space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink">Filter Expenses by Tag</span>
                  <span className="text-[10px] text-muted-custom font-mono font-bold group-hover:underline">Tap to insert</span>
                </div>
                <code className="block text-xs bg-surface-card px-2.5 py-1.5 rounded-lg border border-hairline text-ink font-mono font-semibold">
                  tag: Groceries
                </code>
                <p className="text-[11px] text-muted-custom font-sans leading-tight">
                  Lists all transactions logged under the specified category tag.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rules Overlay List (Pop-over) */}
      {showRulesOverlay && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-surface-soft border border-hairline w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <h3 className="text-sm font-mono font-bold text-ink uppercase flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-brand-purple" />
                Knowledge Base Rules
              </h3>
              <button
                onClick={() => setShowRulesOverlay(false)}
                className="p-1.5 rounded-full hover:bg-surface-card text-muted-custom hover:text-ink transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-3">
              {currentRules.length === 0 ? (
                <p className="text-sm font-mono text-muted-custom text-center py-8">No rules defined.</p>
              ) : (
                currentRules.map((rule) => (
                  <div key={rule.id} className="p-3 bg-surface-card border border-hairline rounded-xl flex items-start gap-3 group">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm text-ink">{rule.text}</p>
                      <div className="text-[10px] font-mono font-bold text-muted-custom uppercase">
                        {rule.isCustom ? 'User Defined' : 'Built-in (Inferred)'}
                      </div>
                    </div>
                    {rule.isCustom && (
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-muted-custom hover:text-brand-coral hover:bg-surface-soft rounded-lg transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Standard Spending Insights (Dynamic) */}
      <div>
        <div className="border-b border-hairline pb-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-brand-yellow" />
            <h2 className="text-lg sm:text-xl font-display font-bold text-ink">
              Spending Insights
            </h2>
          </div>

          {/* Timeframe Toggle Button: Week / Month / Year */}
          <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline">
            {(['week', 'month', 'year'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setInsightTimeframe(mode)}
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-all capitalize ${
                  insightTimeframe === mode
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'text-muted-custom hover:text-ink hover:bg-surface-card'
                }`}
              >
                {mode === 'month' ? 'Month' : mode === 'week' ? 'Week' : 'Year'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {suggestions.map((suggestion, idx) => (
            <div key={idx} className="dotgui-card p-5 bg-surface-card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand-yellow/10 border border-brand-yellow/30 flex items-center justify-center text-brand-yellow shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-brand-yellow font-bold uppercase tracking-wider">
                  Insight #{idx + 1}
                </div>
                <p className="text-sm font-sans-custom text-ink leading-relaxed">
                  {renderStyledSuggestion(suggestion)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

function CheckIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

import React, { useMemo, useState } from 'react';
import { Transaction } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { generateSmartSpendingSuggestions } from '../../services/insightsEngine';
import {
  addKnowledgeRule,
  getAllRules,
  deleteKnowledgeRule,
  deleteKnowledgeRuleByText,
  queryKnowledgeBase,
  KnowledgeRule
} from '../../services/localKnowledgeBase';
import { generateDynamicUsageRules } from '../../services/dynamicContextGenerator';
import { parseAndExecuteLocalQuery } from '../../services/localQueryParser';
import { formatCurrency } from '../../services/currency';
import { Lightbulb, Sparkles, BrainCircuit, X, Trash2, ArrowRight, Tag } from 'lucide-react';

interface SmartSuggestionsProps {
  onSelectTransaction?: (tx: Transaction) => void;
}

export const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({ onSelectTransaction }) => {
  const { filteredTransactions, categories, baseCurrency, addCategoryItem } = useFinance();

  const suggestions = useMemo(() => {
    return generateSmartSpendingSuggestions(filteredTransactions, categories, baseCurrency);
  }, [filteredTransactions, categories, baseCurrency]);

  // Knowledge Base State
  const [queryInput, setQueryInput] = useState('');
  const [answerResult, setAnswerResult] = useState<React.ReactNode | null>(null);
  const [showRulesOverlay, setShowRulesOverlay] = useState(false);
  const [currentRules, setCurrentRules] = useState<KnowledgeRule[]>([]);

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;

    const input = queryInput.trim();
    const lowerInput = input.toLowerCase();

    // 1. Check for Rule definition
    const ruleMatch = input.match(/^rule[:\-_=|]\s*(.+)/i);
    if (ruleMatch) {
      const ruleText = ruleMatch[1].trim();
      addKnowledgeRule(ruleText);
      setAnswerResult(
        <div className="text-brand-mint font-mono text-sm font-bold flex items-center gap-2">
          <CheckIcon className="w-4 h-4" /> Rule Confirmed.
        </div>
      );
      setQueryInput('');
      return;
    }

    // 2. Check for List Rules (matches "list rule" or "-list rule")
    if (lowerInput === 'list rule' || lowerInput === '-list rule') {
      setCurrentRules(getAllRules());
      setShowRulesOverlay(true);
      setQueryInput('');
      setAnswerResult(null);
      return;
    }

    // 3. Check for Delete Rule via text command (matches "del rule: [text]" or "-del rule: [text]")
    const delMatch = input.match(/^(?:-?del rule:)\s*(.+)/i);
    if (delMatch) {
      const targetText = delMatch[1].trim();
      const success = deleteKnowledgeRuleByText(targetText);
      if (success) {
        setAnswerResult(
          <div className="text-brand-coral font-mono text-sm font-bold flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> '{targetText}' deleted.
          </div>
        );
      } else {
        setAnswerResult(
          <div className="text-muted-custom font-mono text-sm">
            Rule not found.
          </div>
        );
      }
      setQueryInput('');
      return;
    }

    // 3.1 Check for New Tag Creation (newtag: [text])
    const newTagMatch = input.match(/^newtag:\s*(.+)/i);
    if (newTagMatch) {
      const tagName = newTagMatch[1].trim();
      if (tagName) {
        const titleCased = tagName.charAt(0).toUpperCase() + tagName.slice(1);
        await addCategoryItem({
          name: titleCased,
          color: '#A78BFA',
          icon: 'Tag'
        });
        setAnswerResult(
          <div className="text-brand-mint font-mono text-sm font-bold flex items-center gap-2">
            <Tag className="w-4 h-4 text-brand-mint" /> Custom tag '{titleCased}' created successfully!
          </div>
        );
      }
      setQueryInput('');
      return;
    }

    // 3.2 Check for Tag Search (tag: [text])
    const searchTagMatch = input.match(/^tag:\s*(.+)/i);
    if (searchTagMatch) {
      const targetTag = searchTagMatch[1].trim().toLowerCase();
      const matchedTxs = filteredTransactions.filter(t => {
        const customName = (t.customCategoryName || '').toLowerCase();
        const catObj = categories.find(c => c.id === t.categoryId);
        const catName = catObj ? catObj.name.toLowerCase() : '';
        const note = (t.note || '').toLowerCase();
        return customName.includes(targetTag) || catName.includes(targetTag) || note.includes(targetTag);
      });

      if (matchedTxs.length > 0) {
        const total = matchedTxs.reduce((sum, t) => sum + t.amount, 0);
        setAnswerResult(
          <div className="space-y-2 p-3 bg-surface-card rounded-xl border border-hairline">
            <div className="text-xs font-mono text-brand-purple font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-brand-purple" /> Tag Search: '{targetTag}'
            </div>
            <p className="text-sm font-semibold text-ink">
              Found {matchedTxs.length} transaction{matchedTxs.length > 1 ? 's' : ''} totaling {formatCurrency(total, baseCurrency)}.
            </p>
            <div className="space-y-1 pt-1 max-h-48 overflow-y-auto">
              {matchedTxs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTransaction?.(t)}
                  className="w-full text-left text-xs font-mono text-muted-custom flex justify-between border-b border-hairline/40 py-2 px-2 hover:bg-surface-soft hover:text-ink rounded-lg transition-colors cursor-pointer group"
                  title="Click to view/edit log in Expenditure tab"
                >
                  <span className="group-hover:text-brand-purple group-hover:font-semibold transition-colors">
                    {t.date} — {t.note || 'Expense'}
                  </span>
                  <span className="font-bold text-ink">{formatCurrency(t.amount, baseCurrency)}</span>
                </button>
              ))}
            </div>
          </div>
        );
      } else {
        setAnswerResult(
          <div className="text-sm font-mono text-muted-custom p-3 bg-surface-card rounded-xl border border-hairline">
            No transactions found matching tag '{targetTag}'.
          </div>
        );
      }
      setQueryInput('');
      return;
    }

    // 3.5 Check for Direct Local Transaction Query (Instant Math)
    const localQueryResult = parseAndExecuteLocalQuery(input, filteredTransactions, categories, baseCurrency);
    if (localQueryResult.matched) {
      setAnswerResult(
        <div className="p-4 bg-brand-purple/10 border border-brand-purple/20 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-brand-purple font-mono text-xs uppercase font-bold tracking-wider">
            <Sparkles className="w-4 h-4" /> Personal Finance Assistant
          </div>
          <p className="text-base font-semibold text-ink">{localQueryResult.answer}</p>
          {localQueryResult.detail && (
            <p className="text-xs text-muted-custom font-mono">{localQueryResult.detail}</p>
          )}
        </div>
      );
      setQueryInput('');
      return;
    }

    // 4. General LLM-lite Query
    // Generate dynamic context based on current transactions
    const dynamicRules = generateDynamicUsageRules(filteredTransactions, categories, baseCurrency);
    const results = queryKnowledgeBase(input, dynamicRules);
    
    if (results.length > 0) {
      setAnswerResult(
        <div className="space-y-3">
          <div className="text-xs font-mono text-muted-custom uppercase font-bold tracking-wider mb-2">
            Knowledge Engine Found:
          </div>
          {results.map((res, i) => (
            <div key={i} className="p-3 bg-surface-card rounded-xl border border-hairline flex items-start gap-3">
              <BrainCircuit className="w-4 h-4 text-brand-purple shrink-0 mt-0.5" />
              <p className="text-sm text-ink">{res.rule.text}</p>
            </div>
          ))}
        </div>
      );
    } else {
      setAnswerResult(
        <div className="text-sm font-mono text-muted-custom p-3 bg-surface-card rounded-xl border border-hairline">
          No matching rules found in your local knowledge base.
        </div>
      );
    }
    setQueryInput('');
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

        {/* Faint Sub-text Instructions (Exact 5 lines, dimmed command highlights + muted grey text) */}
        <div className="text-[11px] font-mono mt-3 px-1 space-y-1 text-muted-custom font-normal">
          <div><span className="text-brand-purple/75">rule: [text]</span> to save rule</div>
          <div><span className="text-brand-purple/75">list rule</span> to view rules</div>
          <div><span className="text-brand-purple/75">del rule: [text]</span> to delete rules</div>
          <div><span className="text-brand-mint/75">newtag: [text]</span> to create custom tag</div>
          <div><span className="text-brand-mint/75">tag: [text]</span> to seach tag</div>
        </div>

        {/* Answer/Result Display Area */}
        {answerResult && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {answerResult}
          </div>
        )}
      </div>

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

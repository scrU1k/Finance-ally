import React, { useMemo } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { generateSmartSpendingSuggestions } from '../../services/insightsEngine';
import { Lightbulb, Sparkles } from 'lucide-react';

export const SmartSuggestions: React.FC = () => {
  const { filteredTransactions, categories, baseCurrency } = useFinance();

  const suggestions = useMemo(() => {
    return generateSmartSpendingSuggestions(filteredTransactions, categories, baseCurrency);
  }, [filteredTransactions, categories, baseCurrency]);

  // Helper to render suggestion text and highlight category names with their exact tag colors
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
    <div className="space-y-6 pb-24 max-w-full overflow-hidden">
      
      {/* Header */}
      <div className="border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-brand-yellow" />
          <h2 className="text-xl font-display font-bold text-ink">
            Spending Insights
          </h2>
        </div>
      </div>

      {/* Suggestions Cards List */}
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
  );
};

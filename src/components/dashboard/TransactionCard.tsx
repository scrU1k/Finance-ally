import React from 'react';
import { Transaction, Category, Trip } from '../../types';
import { formatCurrency } from '../../services/currency';
import {
  Sparkles, Trash2, Edit2, Plane, CreditCard,
  // Category icons — explicit import so bundler can tree-shake unused Lucide icons
  Tag, Utensils, ShoppingCart, Car, Laptop, Shirt, Home, Film,
  Activity, TrendingUp, type LucideProps,
} from 'lucide-react';

// Explicit map of every icon used by DEFAULT_CATEGORIES + common extras.
// Never import `* as Icons` — that bundles all 1400+ Lucide SVGs.
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Tag, Utensils, ShoppingCart, Car, Laptop, Shirt, Home, Film,
  Activity, Plane, TrendingUp,
};

interface TransactionCardProps {
  transaction: Transaction;
  categories: Category[];
  trips: Trip[];
  onSelect?: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const TransactionCard: React.FC<TransactionCardProps> = ({
  transaction,
  categories,
  trips,
  onSelect,
  onEdit,
  onDelete,
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const category = categories.find(c => c.id === transaction.categoryId) || {
    id: 'unknown',
    name: 'General',
    color: '#8a867c',
    icon: 'Tag',
  };

  const trip = trips.find(t => t.id === transaction.tripId);

  // Dynamic icon lookup — falls back to Tag for any unknown icon names
  const IconComponent = CATEGORY_ICON_MAP[category.icon] ?? Tag;

  const timerRef = React.useRef<number | null>(null);
  const isLongPressRef = React.useRef(false);
  const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);
  const isScrolledRef = React.useRef(false);
  const lastTouchTimeRef = React.useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    isScrolledRef.current = false;
    isLongPressRef.current = false;
    if (e.touches.length > 0) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (!isScrolledRef.current) {
        isLongPressRef.current = true;
        onToggleSelect?.(transaction.id);
        try {
          navigator.vibrate?.(50);
        } catch {}
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    if (touchStartPos.current && e.touches.length > 0) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
      if (dx > 8 || dy > 8) {
        isScrolledRef.current = true;
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isScrolledRef.current) {
      return;
    }

    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }

    if (isSelectMode) {
      onToggleSelect?.(transaction.id);
    } else {
      onSelect?.(transaction);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTimeRef.current < 1000) return;
    if (e.button !== 0) return;

    isLongPressRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      isLongPressRef.current = true;
      onToggleSelect?.(transaction.id);
    }, 500);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTimeRef.current < 1000) return;
    if (e.button !== 0) return;

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }

    if (isSelectMode) {
      onToggleSelect?.(transaction.id);
    } else {
      onSelect?.(transaction);
    }
  };

  const handleMouseLeave = () => {
    if (Date.now() - lastTouchTimeRef.current < 1000) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`dotgui-card p-4 flex items-center justify-between gap-3 group hover:shadow-md transition-all cursor-pointer active:scale-[0.99] ${
        isSelected ? 'border-brand-blue ring-2 ring-brand-blue/40 bg-brand-blue/10 shadow-lg scale-[1.005]' : ''
      }`}
    >
      
      {/* Icon & Details */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        
        {/* Category Color Badge */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
          style={{ backgroundColor: category.color }}
        >
          <IconComponent className="w-5 h-5" />
        </div>

        {/* Note & Tag metadata */}
        <div className="min-w-0 space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-ink truncate font-sans-custom">
              {transaction.note || category.name}
            </h4>

            {/* Category Tag Pill (Truncate, No Wrap) */}
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full font-medium truncate whitespace-nowrap max-w-[110px]"
              style={{ backgroundColor: `${category.color}15`, color: category.color, border: `1px solid ${category.color}30` }}
            >
              {(category.id === 'cat-others' && transaction.customCategoryName) ? transaction.customCategoryName : category.name}
            </span>

            {/* Trip Tag Pill */}
            {trip && (
              <span className="text-[10px] font-mono bg-brand-coral/10 text-brand-coral border border-brand-coral/30 px-2 py-0.5 rounded-full flex items-center gap-1 truncate whitespace-nowrap max-w-[110px]">
                <Plane className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{trip.name}</span>
              </span>
            )}

            {/* Auto-parsed Badge */}
            {transaction.isAutoParsed && (
              <span className="text-[9px] font-mono bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30 px-1.5 py-0.2 rounded-full flex items-center gap-1 truncate whitespace-nowrap" title="Auto-parsed from notification">
                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                <span>{transaction.confidenceScore || 95}% accuracy</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-custom">
            <span>{transaction.time || '12:00'}</span>
            {transaction.paymentMethod && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 truncate">
                  <CreditCard className="w-3 h-3 text-muted-custom shrink-0" />
                  <span className="truncate">{transaction.paymentMethod}</span>
                </span>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Amount & Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <div className="text-sm sm:text-base font-display font-bold text-ink tracking-tight">
            -{formatCurrency(transaction.amount, transaction.currency)}
          </div>
          {transaction.originalAmount && (
            <div className="text-[10px] font-mono text-muted-custom">
              Orig: {formatCurrency(transaction.originalAmount, transaction.originalCurrency || transaction.currency)}
            </div>
          )}
        </div>

        {/* Hover Action Buttons */}
        {!isSelectMode && (
          <div className="opacity-80 sm:opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(transaction);
              }}
              className="p-1.5 text-muted-custom hover:text-ink hover:bg-surface-soft rounded-lg transition-colors"
              title="Edit Transaction"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(transaction.id);
              }}
              className="p-1.5 text-muted-custom hover:text-brand-coral hover:bg-surface-soft rounded-lg transition-colors"
              title="Delete Transaction"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

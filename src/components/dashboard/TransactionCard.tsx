import React from 'react';
import { Transaction, Category, Trip, TimelineViewMode } from '../../types';
import { formatCurrency } from '../../services/currency';
import { isPendingScheduledTx, getScheduledCountdownText } from '../../utils/scheduledUtils';
import {
  Trash2, Edit2, Plane, CreditCard, Clock,
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
  viewMode?: TimelineViewMode;
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
  viewMode = 'compact',
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

  const commonStyle: React.CSSProperties = {
    borderColor: isSelected ? 'var(--brand-blue)' : undefined,
    boxShadow: isSelected ? '0 0 0 2px var(--brand-blue), 0 8px 20px -4px rgba(0, 0, 0, 0.3)' : undefined,
    backgroundColor: isSelected ? 'rgba(45, 212, 191, 0.12)' : undefined,
  };

  const isScheduled = isPendingScheduledTx(transaction);

  /* ---------------- Grid View ---------------- */
  if (viewMode === 'grid') {
    return (
      <div
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={commonStyle}
        className={`dotgui-card p-2.5 flex flex-col justify-between min-h-[75px] group transition-all cursor-pointer active:scale-[0.98] ${
          isSelected ? 'scale-[1.02]' : ''
        } ${isScheduled ? 'border-brand-yellow/50 bg-brand-yellow/5' : ''}`}
      >
        {/* Top row: Icon + Tag + Scheduled Indicator */}
        <div className="flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0 shadow-sm"
              style={{ backgroundColor: category.color }}
            >
              <IconComponent className="w-3 h-3" />
            </div>

            <span
              className="text-[9px] font-mono px-1.5 py-0.2 rounded-full font-medium truncate max-w-[100px]"
              style={{ backgroundColor: `${category.color}15`, color: category.color, border: `1px solid ${category.color}30` }}
            >
              {(category.id === 'cat-others' && transaction.customCategoryName) ? transaction.customCategoryName : category.name}
            </span>
          </div>

          {isScheduled && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold bg-brand-yellow/15 border border-brand-yellow/30 text-brand-yellow shrink-0 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-brand-yellow" />
            </span>
          )}
        </div>

        {/* Note title */}
        <h4 className="text-xs font-semibold text-ink truncate font-sans-custom my-1">
          {transaction.note || category.name}
        </h4>

        {/* Bottom row: Trip & Amount */}
        <div className="flex items-center justify-between text-right border-t border-hairline/40 pt-1 mt-auto">
          <span className="text-[9px] font-mono text-muted-custom truncate max-w-[60px]">
            {isScheduled ? 'Scheduled' : (trip ? trip.name : '')}
          </span>
          <div className={`text-xs font-display font-bold tracking-tight ${isScheduled ? 'text-brand-yellow opacity-90' : 'text-ink'}`}>
            -{formatCurrency(transaction.amount, transaction.currency)}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- List View ---------------- */
  if (viewMode === 'list') {
    return (
      <div
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={commonStyle}
        className={`dotgui-card py-2 px-3 flex items-center justify-between gap-2.5 group transition-all cursor-pointer active:scale-[0.99] ${
          isSelected ? 'scale-[1.005]' : ''
        } ${isScheduled ? 'border-brand-yellow/50 bg-brand-yellow/5' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0 shadow-sm"
            style={{ backgroundColor: category.color }}
          >
            <IconComponent className="w-3 h-3" />
          </div>

          <h4 className="text-xs font-semibold text-ink truncate font-sans-custom min-w-0 flex-1">
            {transaction.note || category.name}
          </h4>

          {isScheduled && (
            <span className="text-[9px] font-mono bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-bold shrink-0">
              <Clock className="w-2.5 h-2.5 text-brand-yellow" />
              <span>Scheduled ({getScheduledCountdownText(transaction.date, transaction.time)})</span>
            </span>
          )}

          {/* Trip Tag in List View */}
          {!isScheduled && trip && (
            <span className="text-[9px] font-mono bg-brand-coral/10 text-brand-coral border border-brand-coral/30 px-1.5 py-0.2 rounded-full flex items-center gap-0.5 truncate whitespace-nowrap shrink-0 max-w-[90px]">
              <Plane className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{trip.name}</span>
            </span>
          )}

          {/* Category Tag in List View */}
          <span
            className="text-[9px] font-mono px-1.5 py-0.2 rounded-full font-medium truncate shrink-0 hidden sm:inline-block max-w-[85px]"
            style={{ backgroundColor: `${category.color}15`, color: category.color, border: `1px solid ${category.color}30` }}
          >
            {category.name}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[10px] font-mono text-muted-custom hidden xs:inline-block">
            {transaction.time}
          </span>
          <div className={`text-xs font-display font-bold tracking-tight ${isScheduled ? 'text-brand-yellow opacity-90' : 'text-ink'}`}>
            -{formatCurrency(transaction.amount, transaction.currency)}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Compact View (Structured 3-Line Layout) ---------------- */
  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={commonStyle}
      className={`dotgui-card p-2.5 sm:p-3 flex items-start justify-between gap-2.5 group hover:shadow-md transition-all cursor-pointer active:scale-[0.99] ${
        isSelected ? 'scale-[1.005]' : ''
      } ${isScheduled ? 'border-brand-yellow/50 bg-brand-yellow/5' : ''}`}
    >
      {/* Category Icon Badge */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5"
        style={{ backgroundColor: category.color }}
      >
        <IconComponent className="w-4 h-4" />
      </div>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 space-y-1">
        
        {/* LINE 1: Name (left) & Category Tag / Scheduled Badge (right) */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h4 className="text-xs sm:text-sm font-semibold text-ink truncate font-sans-custom min-w-0 flex-1 flex items-center gap-1.5">
            <span className="truncate">{transaction.note || category.name}</span>
          </h4>

          <div className="flex items-center gap-1 shrink-0">
            {isScheduled && (
              <span className="text-[9px] font-mono bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-bold shrink-0">
                <Clock className="w-2.5 h-2.5 text-brand-yellow" />
                <span>Scheduled</span>
              </span>
            )}

            {/* Category Tag Pill */}
            <span
              className="text-[9px] font-mono px-1.5 py-0.2 rounded-full font-medium truncate whitespace-nowrap shrink-0 max-w-[100px]"
              style={{ backgroundColor: `${category.color}15`, color: category.color, border: `1px solid ${category.color}30` }}
            >
              {(category.id === 'cat-others' && transaction.customCategoryName) ? transaction.customCategoryName : category.name}
            </span>
          </div>
        </div>

        {/* LINE 2: Scheduled Countdown / Trip Tag (left) & Amount (right) */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          {isScheduled ? (
            <div className="flex items-center gap-1 text-[10px] font-mono text-brand-yellow font-semibold truncate">
              <span>{getScheduledCountdownText(transaction.date, transaction.time)}</span>
              <span>•</span>
              <span>{transaction.date} {transaction.time || '00:00'}</span>
            </div>
          ) : trip ? (
            /* LINE 2 (With Trip): Trip Tag on Left */
            <span className="text-[9px] font-mono bg-brand-coral/10 text-brand-coral border border-brand-coral/30 px-1.5 py-0.2 rounded-full flex items-center gap-0.5 truncate whitespace-nowrap shrink-0 max-w-[120px]">
              <Plane className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{trip.name}</span>
            </span>
          ) : (
            /* LINE 2 (No Trip): Time & Payment Mode on Left */
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-custom truncate">
              <span>{transaction.time || '12:00'}</span>
              {transaction.paymentMethod && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 truncate">
                    <CreditCard className="w-2.5 h-2.5 text-muted-custom shrink-0" />
                    <span className="truncate">{transaction.paymentMethod}</span>
                  </span>
                </>
              )}
            </div>
          )}

          {/* Amount on Right of Line 2 */}
          <div className="text-right shrink-0">
            <div className={`text-sm sm:text-base font-display font-bold tracking-tight ${isScheduled ? 'text-brand-yellow' : 'text-ink'}`}>
              -{formatCurrency(transaction.amount, transaction.currency)}
            </div>
            {transaction.originalAmount && (
              <div className="text-[9px] font-mono text-muted-custom">
                Orig: {formatCurrency(transaction.originalAmount, transaction.originalCurrency || transaction.currency)}
              </div>
            )}
          </div>
        </div>

        {/* LINE 3: Time & Payment Mode (Only when Trip is present and not scheduled) */}
        {!isScheduled && trip && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-custom truncate pt-0.5">
            <span>{transaction.time || '12:00'}</span>
            {transaction.paymentMethod && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 truncate">
                  <CreditCard className="w-2.5 h-2.5 text-muted-custom shrink-0" />
                  <span className="truncate">{transaction.paymentMethod}</span>
                </span>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};


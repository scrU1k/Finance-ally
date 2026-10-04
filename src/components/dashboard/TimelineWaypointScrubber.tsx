import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { parseLocalDate, getWeekDateBounds } from '../../utils/dateUtils';
import { PeriodMode } from './DailyTimeline';
import { Transaction } from '../../types';

export interface WaypointItem {
  id: string;
  type: 'top' | 'middle' | 'chart';
  modeType: 'day' | 'week' | 'month' | 'year';
  label: string;
  subLabel?: string;
  badge: string;
  colorType: 'cyan' | 'green' | 'yellow';
  getElement: () => HTMLElement | null;
  scrollTo: () => void;
}

interface TimelineWaypointScrubberProps {
  periodMode: PeriodMode;
  visibleMonthsLimit: number;
  groupedByDate: Array<{ date: string; transactions: Transaction[]; dayTotal: number }>;
  groupedByWeek: Array<{ key: string; weekInfo: any; transactions: Transaction[]; weekTotal: number }>;
  groupedByMonth: Array<{ monthKey: string; monthName: string; monthTotal: number; txCount: number }>;
  groupedByYear: Array<{ yearKey: string; yearTotal: number; txCount: number }>;
  chartRef: React.RefObject<HTMLDivElement | null>;
  groupRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

export const TimelineWaypointScrubber: React.FC<TimelineWaypointScrubberProps> = ({
  periodMode,
  visibleMonthsLimit,
  groupedByDate,
  groupedByWeek,
  groupedByMonth,
  groupedByYear,
  chartRef,
  groupRefs,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  const isTouchingRef = useRef(false);
  const railRef = useRef<HTMLDivElement>(null);

  // Helper to scroll smoothly with header offset compensation
  const scrollToElement = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const headerOffset = 90;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
    window.scrollTo({
      top: Math.max(0, offsetPosition),
      behavior: 'smooth',
    });
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToChart = useCallback(() => {
    if (chartRef.current) {
      scrollToElement(chartRef.current);
    } else {
      const el = document.getElementById('spending-trend-chart');
      if (el) scrollToElement(el);
    }
  }, [chartRef, scrollToElement]);

  // Compute waypoints dynamically based on periodMode and pagination limits
  const waypoints = useMemo<WaypointItem[]>(() => {
    const items: WaypointItem[] = [];

    // --- 1. DAY MODE ---
    if (periodMode === 'day') {
      if (groupedByDate.length === 0) return [];

      // Top Node (Latest expense / Top)
      const topDate = groupedByDate[0]?.date;
      items.push({
        id: 'node-top',
        type: 'top',
        modeType: 'day',
        label: topDate
          ? parseLocalDate(topDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              weekday: 'short',
            })
          : 'Latest Expense',
        subLabel: 'Latest expense recorded',
        badge: 'LATEST',
        colorType: 'cyan',
        getElement: () => (topDate ? groupRefs.current.get(topDate) || null : null),
        scrollTo: scrollToTop,
      });

      // Middle Nodes:
      // When visibleMonthsLimit === 1: First day of the week (Mondays)
      // When visibleMonthsLimit > 1: Switches to first day of the month
      if (visibleMonthsLimit === 1) {
        const weeklyMap = new Map<string, { targetDate: string; isMonday: boolean }>();

        for (const group of groupedByDate) {
          const { monStr, weekNo } = getWeekDateBounds(group.date);
          const year = group.date.substring(0, 4);
          const weekKey = `${year}-W${weekNo}`;

          if (!weeklyMap.has(weekKey)) {
            const hasExactMonday = groupedByDate.some(g => g.date === monStr);
            weeklyMap.set(weekKey, {
              targetDate: hasExactMonday ? monStr : group.date,
              isMonday: hasExactMonday,
            });
          }
        }

        weeklyMap.forEach(({ targetDate }, weekKey) => {
          if (targetDate === topDate && items.length > 0) return;

          const dateObj = parseLocalDate(targetDate);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
          const formattedDate = dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });

          items.push({
            id: `node-week-${weekKey}`,
            type: 'middle',
            modeType: 'day',
            label: `${dayName}, ${formattedDate}`,
            subLabel: `Week milestone`,
            badge: 'WEEK',
            colorType: 'green',
            getElement: () => groupRefs.current.get(targetDate) || null,
            scrollTo: () => scrollToElement(groupRefs.current.get(targetDate) || null),
          });
        });
      } else {
        const uniqueMonthKeys = Array.from(new Set(groupedByDate.map(g => g.date.substring(0, 7))));

        uniqueMonthKeys.forEach(monthKey => {
          const firstOfMonthDate = `${monthKey}-01`;
          const monthGroups = groupedByDate.filter(g => g.date.startsWith(monthKey));
          const targetGroup =
            monthGroups.find(g => g.date === firstOfMonthDate) ||
            monthGroups[monthGroups.length - 1] ||
            monthGroups[0];

          if (!targetGroup) return;
          if (targetGroup.date === topDate && items.length > 0) return;

          const [y, m] = monthKey.split('-');
          const monthObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
          const monthLabel = monthObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          items.push({
            id: `node-month-${monthKey}`,
            type: 'middle',
            modeType: 'day',
            label: monthLabel,
            subLabel: `${monthGroups.length} days recorded`,
            badge: 'MONTH',
            colorType: 'green',
            getElement: () => groupRefs.current.get(targetGroup.date) || null,
            scrollTo: () => scrollToElement(groupRefs.current.get(targetGroup.date) || null),
          });
        });
      }

      // Chart Node (Bottom)
      items.push({
        id: 'node-chart',
        type: 'chart',
        modeType: 'day',
        label: 'Charts & Analytics',
        subLabel: 'Visual spend overview',
        badge: 'CHARTS',
        colorType: 'yellow',
        getElement: () => chartRef.current || document.getElementById('spending-trend-chart'),
        scrollTo: scrollToChart,
      });
    }

    // --- 2. WEEK MODE ---
    else if (periodMode === 'week') {
      if (groupedByWeek.length === 0) return [];

      const topWeek = groupedByWeek[0];
      items.push({
        id: 'node-top',
        type: 'top',
        modeType: 'week',
        label: topWeek ? topWeek.weekInfo.title : 'Latest Week',
        subLabel: topWeek ? topWeek.weekInfo.dateRangeStr : '',
        badge: 'LATEST',
        colorType: 'cyan',
        getElement: () => (topWeek ? groupRefs.current.get(topWeek.key) || null : null),
        scrollTo: scrollToTop,
      });

      const totalWeeks = groupedByWeek.length;
      const step = totalWeeks > 8 ? Math.ceil(totalWeeks / 7) : 1;

      for (let i = 1; i < totalWeeks; i += step) {
        const w = groupedByWeek[i];
        if (!w) continue;
        items.push({
          id: `node-week-${w.key}`,
          type: 'middle',
          modeType: 'week',
          label: `${w.weekInfo.title}`,
          subLabel: w.weekInfo.dateRangeStr,
          badge: `W${w.weekInfo.weekNo}`,
          colorType: 'green',
          getElement: () => groupRefs.current.get(w.key) || null,
          scrollTo: () => scrollToElement(groupRefs.current.get(w.key) || null),
        });
      }

      items.push({
        id: 'node-chart',
        type: 'chart',
        modeType: 'week',
        label: 'Charts & Analytics',
        subLabel: 'Visual spend overview',
        badge: 'CHARTS',
        colorType: 'yellow',
        getElement: () => chartRef.current || document.getElementById('spending-trend-chart'),
        scrollTo: scrollToChart,
      });
    }

    // --- 3. MONTH MODE ---
    else if (periodMode === 'month') {
      if (groupedByMonth.length === 0) return [];

      const topMonth = groupedByMonth[0];
      items.push({
        id: 'node-top',
        type: 'top',
        modeType: 'month',
        label: topMonth ? topMonth.monthName : 'Latest Month',
        subLabel: topMonth ? `${topMonth.txCount} transactions` : '',
        badge: 'LATEST',
        colorType: 'cyan',
        getElement: () => (topMonth ? groupRefs.current.get(topMonth.monthKey) || null : null),
        scrollTo: scrollToTop,
      });

      for (let i = 1; i < groupedByMonth.length; i++) {
        const m = groupedByMonth[i];
        items.push({
          id: `node-month-${m.monthKey}`,
          type: 'middle',
          modeType: 'month',
          label: m.monthName,
          subLabel: `${m.txCount} transactions`,
          badge: 'MONTH',
          colorType: 'green',
          getElement: () => groupRefs.current.get(m.monthKey) || null,
          scrollTo: () => scrollToElement(groupRefs.current.get(m.monthKey) || null),
        });
      }

      items.push({
        id: 'node-chart',
        type: 'chart',
        modeType: 'month',
        label: 'Charts & Analytics',
        subLabel: 'Visual spend overview',
        badge: 'CHARTS',
        colorType: 'yellow',
        getElement: () => chartRef.current || document.getElementById('spending-trend-chart'),
        scrollTo: scrollToChart,
      });
    }

    // --- 4. YEAR MODE ---
    else if (periodMode === 'year') {
      if (groupedByYear.length === 0) return [];

      const topYear = groupedByYear[0];
      items.push({
        id: 'node-top',
        type: 'top',
        modeType: 'year',
        label: topYear ? `${topYear.yearKey}` : 'Latest Year',
        subLabel: topYear ? `${topYear.txCount} transactions` : '',
        badge: 'LATEST',
        colorType: 'cyan',
        getElement: () => (topYear ? groupRefs.current.get(topYear.yearKey) || null : null),
        scrollTo: scrollToTop,
      });

      for (let i = 1; i < groupedByYear.length; i++) {
        const y = groupedByYear[i];
        items.push({
          id: `node-year-${y.yearKey}`,
          type: 'middle',
          modeType: 'year',
          label: `${y.yearKey}`,
          subLabel: `${y.txCount} transactions`,
          badge: 'YEAR',
          colorType: 'green',
          getElement: () => groupRefs.current.get(y.yearKey) || null,
          scrollTo: () => scrollToElement(groupRefs.current.get(y.yearKey) || null),
        });
      }

      items.push({
        id: 'node-chart',
        type: 'chart',
        modeType: 'year',
        label: 'Charts & Analytics',
        subLabel: 'Visual spend overview',
        badge: 'CHARTS',
        colorType: 'yellow',
        getElement: () => chartRef.current || document.getElementById('spending-trend-chart'),
        scrollTo: scrollToChart,
      });
    }

    return items;
  }, [
    periodMode,
    visibleMonthsLimit,
    groupedByDate,
    groupedByWeek,
    groupedByMonth,
    groupedByYear,
    chartRef,
    groupRefs,
    scrollToTop,
    scrollToChart,
    scrollToElement,
  ]);

  // Autohide timer logic: Scrubber only appears when scrolling or active interaction
  const triggerVisibilityOnScroll = useCallback(() => {
    setIsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveredRef.current && !isTouchingRef.current) {
        setIsVisible(false);
      }
    }, 1800);
  }, []);

  // Viewport tracking & dynamic moving ruler tick offset
  const updateScrollState = useCallback(() => {
    if (waypoints.length === 0) return;

    const scrollY = window.scrollY;

    // Moving ruler tick displacement (translates shorter lines with scroll)
    const tickStep = 8;
    const offset = (scrollY * 0.35) % tickStep;
    setScrollOffset(-offset);

    // Top boundary
    if (scrollY < 120) {
      setActiveNodeId(waypoints[0].id);
      return;
    }

    // Bottom boundary (close to document bottom)
    const isNearBottom =
      window.innerHeight + scrollY >= document.documentElement.scrollHeight - 160;
    if (isNearBottom) {
      setActiveNodeId(waypoints[waypoints.length - 1].id);
      return;
    }

    // Middle nodes calculation
    let currentActive = waypoints[0]?.id;
    for (const wp of waypoints) {
      const el = wp.getElement();
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 220) {
          currentActive = wp.id;
        }
      }
    }

    if (currentActive) {
      setActiveNodeId(currentActive);
    }
  }, [waypoints]);

  // Global scroll listener
  useEffect(() => {
    const handleScroll = () => {
      triggerVisibilityOnScroll();
      updateScrollState();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [triggerVisibilityOnScroll, updateScrollState]);

  // Touch & Drag handler for mobile scrubber tracking
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!railRef.current || waypoints.length === 0) return;
      const touch = e.touches[0];
      const rect = railRef.current.getBoundingClientRect();
      const clampedY = Math.max(0, Math.min(rect.height, touch.clientY - rect.top));
      const ratio = clampedY / rect.height;

      const closestIndex = Math.round(ratio * (waypoints.length - 1));
      const clampedIndex = Math.max(0, Math.min(waypoints.length - 1, closestIndex));
      const targetNode = waypoints[clampedIndex];

      if (targetNode && targetNode.id !== hoveredNodeId) {
        setHoveredNodeId(targetNode.id);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(8);
          } catch {}
        }
      }
    },
    [waypoints, hoveredNodeId]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isTouchingRef.current = true;
      setIsInteracting(true);
      setIsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      handleTouchMove(e);
    },
    [handleTouchMove]
  );

  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false;
    setIsInteracting(false);

    if (hoveredNodeId) {
      const targetNode = waypoints.find(w => w.id === hoveredNodeId);
      if (targetNode) {
        targetNode.scrollTo();
      }
      setTimeout(() => {
        setHoveredNodeId(null);
      }, 700);
    }

    triggerVisibilityOnScroll();
  }, [hoveredNodeId, waypoints, triggerVisibilityOnScroll]);

  // Desktop mouse enter/leave container
  const handleMouseEnterContainer = useCallback(() => {
    isHoveredRef.current = true;
    setIsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const handleMouseLeaveContainer = useCallback(() => {
    isHoveredRef.current = false;
    setHoveredNodeId(null);
    triggerVisibilityOnScroll();
  }, [triggerVisibilityOnScroll]);

  if (waypoints.length <= 1) {
    return null;
  }

  // Find currently focused or hovered node item for rendering hover card
  const focusedNode = waypoints.find(w => w.id === (hoveredNodeId || (isInteracting ? activeNodeId : null)));
  const focusedIndex = focusedNode ? waypoints.indexOf(focusedNode) : -1;
  const focusedPercent =
    focusedIndex >= 0 ? (focusedIndex / (waypoints.length - 1)) * 100 : 0;

  // Background ruler tick indices for the moving mechanical ruler track (34 ticks)
  const rulerTicks = Array.from({ length: 34 }, (_, i) => i);

  return (
    <div
      aria-label="Timeline Waypoint Scrubber"
      onMouseEnter={handleMouseEnterContainer}
      onMouseLeave={handleMouseLeaveContainer}
      className={`fixed right-2.5 sm:right-6 top-1/2 -translate-y-1/2 z-40 select-none transition-all duration-300 ease-out ${
        isVisible
          ? 'opacity-100 translate-x-0 pointer-events-auto'
          : 'opacity-0 translate-x-3 pointer-events-none'
      }`}
    >
      {/* Pill Capsule Container (inspired by the reference dial UI) */}
      <div
        ref={railRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-8 sm:w-9 h-[125px] sm:h-[210px] rounded-full bg-[#0a0a0c]/85 dark:bg-[#070709]/90 backdrop-blur-2xl border border-white/15 dark:border-white/10 shadow-2xl flex items-center justify-center p-1.5 cursor-pointer ring-1 ring-black/40 overflow-hidden"
      >
        {/* Moving Ruler Markings Track (The shorter lines denoting scroll behavior) */}
        <div
          style={{ transform: `translateY(${scrollOffset}px)` }}
          className="absolute inset-y-[-16px] inset-x-0 flex flex-col justify-between items-center pointer-events-none opacity-40 transition-opacity duration-200"
        >
          {rulerTicks.map(idx => {
            const isMajor = idx % 5 === 0;
            return (
              <div
                key={idx}
                className={`rounded-full transition-all duration-150 ${
                  isMajor
                    ? 'w-3.5 sm:w-4 h-[1.5px] bg-white/70 dark:bg-white/80'
                    : 'w-2 sm:w-2.5 h-[1.5px] bg-white/35 dark:bg-white/30'
                }`}
              />
            );
          })}
        </div>

        {/* The Colored Waypoint Nodes (Thick and slightly long lines of color) */}
        <div className="relative w-full h-full">
          {waypoints.map((node, index) => {
            const isTop = node.colorType === 'cyan';
            const isChart = node.colorType === 'yellow';

            const isActive = activeNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;
            const isAnyHovered = hoveredNodeId !== null;

            // Percentage down the rail (pinned from 6% to 94% to leave capsule rim padding)
            const topPercent = 6 + (index / (waypoints.length - 1)) * 88;

            // Color classes: Top is Pastel Cyan, Bottom is Pastel Yellow, Middle are Pastel Leaf Green
            let nodeBg = 'bg-emerald-300';
            let glowShadow = 'shadow-[0_0_12px_rgba(74,222,128,0.9)] ring-2 ring-emerald-300/40';

            if (isTop) {
              nodeBg = 'bg-cyan-300';
              glowShadow = 'shadow-[0_0_12px_rgba(56,189,248,0.95)] ring-2 ring-cyan-300/40';
            } else if (isChart) {
              nodeBg = 'bg-amber-300';
              glowShadow = 'shadow-[0_0_12px_rgba(253,224,71,0.95)] ring-2 ring-amber-300/40';
            }

            // Size & Opacity: Thick, slightly long rounded lines
            let sizeClass = 'w-4 sm:w-5 h-[3.5px] sm:h-[4px]';
            let opacityClass = 'opacity-85';

            if (isHovered) {
              // Hovered / long-pressed node glows brightly and widens
              sizeClass = 'w-5 sm:w-6 h-[4.5px] sm:h-[5px]';
              opacityClass = 'opacity-100 z-30 scale-110';
            } else if (isAnyHovered) {
              // Other nodes go slightly muted when another is hovered
              opacityClass = 'opacity-20 scale-90';
            } else if (isActive) {
              sizeClass = 'w-4.5 sm:w-5.5 h-[4px] sm:h-[4.5px]';
              opacityClass = 'opacity-100 z-20';
            }

            return (
              <div
                key={node.id}
                style={{ top: `${topPercent}%` }}
                onClick={e => {
                  e.stopPropagation();
                  node.scrollTo();
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 cursor-pointer flex items-center justify-center p-1"
              >
                {/* Thick, slightly long line of color */}
                <div
                  className={`rounded-full transition-all duration-200 ${nodeBg} ${sizeClass} ${opacityClass} ${
                    isHovered || isActive ? glowShadow : ''
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Floating Hover Card (Anime-style HUD pill appearing to the left of the node) */}
        {focusedNode && (
          <div
            style={{ top: `${6 + (focusedPercent * 0.88)}%` }}
            className="absolute right-full mr-3.5 -translate-y-1/2 pointer-events-none z-50 animate-in fade-in slide-in-from-right-1 duration-150"
          >
            <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0e0e11]/95 backdrop-blur-2xl border border-white/15 shadow-2xl ring-1 ring-white/10 whitespace-nowrap">
              {/* Badge */}
              <span
                className={`text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-md ${
                  focusedNode.colorType === 'cyan'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : focusedNode.colorType === 'yellow'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {focusedNode.badge}
              </span>

              {/* Title & Date */}
              <div className="flex flex-col text-left">
                <span className="text-xs font-mono font-bold text-white leading-tight">
                  {focusedNode.label}
                </span>
                {focusedNode.subLabel && (
                  <span className="text-[10px] font-mono text-zinc-400 leading-tight">
                    {focusedNode.subLabel}
                  </span>
                )}
              </div>

              {/* Right Arrow indicator pointing directly at the node line */}
              <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-[#0e0e11]/95" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

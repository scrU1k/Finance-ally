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
  const [isSeeking, setIsSeeking] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (!isHoveredRef.current && !isTouchingRef.current && !isSeeking) {
        setIsVisible(false);
      }
    }, 1800);
  }, [isSeeking]);

  // Viewport tracking & continuous scroll progress (0.0 to 1.0)
  const updateScrollState = useCallback(() => {
    const scrollY = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(1, scrollY / maxScroll));
    setScrollProgress(progress);

    // Determine active waypoint based on scroll progress
    if (waypoints.length > 0) {
      if (progress <= 0.05) {
        setActiveNodeId(waypoints[0].id);
      } else if (progress >= 0.95) {
        setActiveNodeId(waypoints[waypoints.length - 1].id);
      } else {
        let closest = waypoints[0];
        let minDiff = 1;
        waypoints.forEach((wp, idx) => {
          const wpProgress = idx / (waypoints.length - 1);
          const diff = Math.abs(progress - wpProgress);
          if (diff < minDiff) {
            minDiff = diff;
            closest = wp;
          }
        });
        setActiveNodeId(closest.id);
      }
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

  // Fast seek math: instantly scrolls the page according to screen clientY
  const updateSeekScroll = useCallback(
    (clientY: number) => {
      if (!railRef.current) return;
      const rect = railRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const targetScrollY = ratio * maxScroll;

      // Instant seeking update
      window.scrollTo(0, targetScrollY);

      // Update nearest waypoint for feedback
      if (waypoints.length > 0) {
        const closestIndex = Math.round(ratio * (waypoints.length - 1));
        const targetNode = waypoints[closestIndex];
        if (targetNode) {
          setHoveredNodeId(targetNode.id);
        }
      }
    },
    [waypoints]
  );

  // Global document pointer listeners while seeking is active
  useEffect(() => {
    if (!isSeeking) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      updateSeekScroll(e.clientY);
    };

    const handleGlobalMouseUp = () => {
      setIsSeeking(false);
      triggerVisibilityOnScroll();
      setTimeout(() => {
        setHoveredNodeId(null);
      }, 600);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        updateSeekScroll(e.touches[0].clientY);
      }
    };

    const handleGlobalTouchEnd = () => {
      setIsSeeking(false);
      triggerVisibilityOnScroll();
      setTimeout(() => {
        setHoveredNodeId(null);
      }, 600);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isSeeking, updateSeekScroll, triggerVisibilityOnScroll]);

  // Click anywhere on track to scroll to that exact proportion of the page
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!railRef.current || isSeeking) return;
      const rect = railRef.current.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const ratio = Math.max(0, Math.min(1, clickY / rect.height));

      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const targetScrollY = ratio * maxScroll;

      window.scrollTo({
        top: targetScrollY,
        behavior: 'smooth',
      });
    },
    [isSeeking]
  );

  // Touch & Drag handler for mobile scrubber tracking
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!railRef.current || waypoints.length === 0 || isSeeking) return;
      const touch = e.touches[0];
      const rect = railRef.current.getBoundingClientRect();
      const clampedY = Math.max(0, Math.min(rect.height, touch.clientY - rect.top));
      const ratio = clampedY / rect.height;

      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const targetScrollY = ratio * maxScroll;

      window.scrollTo({ top: targetScrollY });

      // Closest node for hover card display
      const closestIndex = Math.round(ratio * (waypoints.length - 1));
      const targetNode = waypoints[closestIndex];

      if (targetNode && targetNode.id !== hoveredNodeId) {
        setHoveredNodeId(targetNode.id);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(8);
          } catch {}
        }
      }
    },
    [waypoints, hoveredNodeId, isSeeking]
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

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    if (hoveredNodeId && !isSeeking) {
      setTimeout(() => {
        setHoveredNodeId(null);
      }, 700);
    }

    triggerVisibilityOnScroll();
  }, [hoveredNodeId, isSeeking, triggerVisibilityOnScroll]);

  // Desktop mouse enter/leave container
  const handleMouseEnterContainer = useCallback(() => {
    isHoveredRef.current = true;
    setIsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const handleMouseLeaveContainer = useCallback(() => {
    isHoveredRef.current = false;
    if (!isSeeking) {
      setHoveredNodeId(null);
    }
    triggerVisibilityOnScroll();
  }, [isSeeking, triggerVisibilityOnScroll]);

  // Handlers specifically for the active moving bar (Runner thumb)
  const handleRunnerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsSeeking(true);
      triggerVisibilityOnScroll();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(12);
        } catch {}
      }
    },
    [triggerVisibilityOnScroll]
  );

  const handleRunnerDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsSeeking(true);
      triggerVisibilityOnScroll();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(16);
        } catch {}
      }
    },
    [triggerVisibilityOnScroll]
  );

  const handleRunnerTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      triggerVisibilityOnScroll();
      // Long-press detection (~220ms) activates seeking
      longPressTimerRef.current = setTimeout(() => {
        setIsSeeking(true);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(16);
          } catch {}
        }
      }, 220);
    },
    [triggerVisibilityOnScroll]
  );

  const handleRunnerTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);

  if (waypoints.length <= 1) {
    return null;
  }

  // Find currently focused or hovered node item for rendering hover card
  const focusedNode = waypoints.find(w => w.id === (hoveredNodeId || (isInteracting ? activeNodeId : null)));
  const focusedIndex = focusedNode ? waypoints.indexOf(focusedNode) : -1;
  const focusedPercent =
    focusedIndex >= 0 ? (focusedIndex / (waypoints.length - 1)) * 100 : scrollProgress * 100;

  // Background ruler tick indices: 21 evenly distributed lines along the full scrollbar height
  const tickCount = 21;
  const rulerTicks = Array.from({ length: tickCount }, (_, i) => i);
  const isOnlyTwoNodes = waypoints.length === 2;

  // Current active runner indicator color based on scrollProgress
  const runnerColor =
    scrollProgress < 0.2
      ? 'var(--brand-blue)'
      : scrollProgress > 0.8
      ? 'var(--brand-yellow)'
      : 'var(--brand-mint)';

  return (
    <div
      aria-label="Timeline Waypoint Scrubber"
      onMouseEnter={handleMouseEnterContainer}
      onMouseLeave={handleMouseLeaveContainer}
      className={`fixed right-0.5 sm:right-2 top-1/2 -translate-y-1/2 z-40 select-none transition-all duration-300 ease-out ${
        isVisible || isSeeking
          ? 'opacity-100 translate-x-0 pointer-events-auto'
          : 'opacity-0 translate-x-3 pointer-events-none'
      }`}
    >
      {/* Floating Ruler Track directly over the page, pinned right against the edge */}
      <div
        ref={railRef}
        onClick={handleTrackClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-4 sm:w-8 h-[125px] sm:h-[210px] flex items-center justify-center cursor-pointer"
      >
        {/* Ruler Markings Track (Shorter lines evenly distributed across 0% to 100% of page) */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between items-center py-1">
          {rulerTicks.map(idx => {
            const isCenterTick = idx === Math.floor(tickCount / 2);
            // Single longer line in the center if there are only 2 nodes
            const isCenterLongLine = isOnlyTwoNodes && isCenterTick;

            return (
              <div
                key={idx}
                className={`rounded-full transition-all duration-150 ${
                  isCenterLongLine
                    ? 'w-2 sm:w-3.5 h-[1.5px] bg-ink/40'
                    : 'w-1 sm:w-2 h-[1.5px] bg-ink/20'
                }`}
              />
            );
          })}
        </div>

        {/* Dynamic Active Moving Bar (Seekable thumb: double-click / long-press / drag to seek fast) */}
        <div
          style={{ top: `${scrollProgress * 100}%` }}
          onMouseDown={handleRunnerMouseDown}
          onDoubleClick={handleRunnerDoubleClick}
          onTouchStart={handleRunnerTouchStart}
          onTouchEnd={handleRunnerTouchEnd}
          title="Drag, double-click or long-press to fast seek through timeline"
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-grab active:cursor-grabbing p-1.5 z-30 transition-transform duration-75"
        >
          <div
            style={{
              backgroundColor: runnerColor,
              boxShadow: isSeeking
                ? `0 0 8px ${runnerColor}`
                : `0 0 3px ${runnerColor}`,
            }}
            className={`rounded-full transition-all duration-150 ${
              isSeeking
                ? 'w-3 sm:w-6 h-[3.5px] sm:h-[4.5px] ring-2 ring-white/50 scale-125'
                : 'w-2 sm:w-4 h-[2px] sm:h-[2.5px] opacity-90'
            }`}
          />
        </div>

        {/* The Colored Waypoint Nodes (Slightly smaller in width, theme-attuned colors) */}
        <div className="relative w-full h-full pointer-events-none">
          {waypoints.map((node, index) => {
            const isTop = node.colorType === 'cyan';
            const isChart = node.colorType === 'yellow';

            const isActive = activeNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;
            const isAnyHovered = hoveredNodeId !== null || isSeeking;

            // Percentage down the rail (0% to 100%)
            const topPercent = (index / (waypoints.length - 1)) * 100;

            // Theme-attuned node color
            const nodeColor = isTop
              ? 'var(--brand-blue)'
              : isChart
              ? 'var(--brand-yellow)'
              : 'var(--brand-mint)';

            // Size: Refined, slightly smaller in width
            let sizeClass = 'w-2 sm:w-3.5 h-[2px] sm:h-[3px]';
            let opacityClass = 'opacity-85';

            if (isHovered) {
              sizeClass = 'w-3.5 sm:w-5.5 h-[3px] sm:h-[4px]';
              opacityClass = 'opacity-100 z-30 scale-110';
            } else if (isAnyHovered) {
              opacityClass = 'opacity-20 scale-90';
            } else if (isActive) {
              sizeClass = 'w-2.5 sm:w-4.5 h-[2.5px] sm:h-[3.5px]';
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
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 pointer-events-auto cursor-pointer flex items-center justify-center p-1"
              >
                <div
                  style={{
                    backgroundColor: nodeColor,
                    boxShadow: isHovered || isActive ? `0 0 8px ${nodeColor}` : undefined,
                  }}
                  className={`rounded-full transition-all duration-200 ${sizeClass} ${opacityClass}`}
                />
              </div>
            );
          })}
        </div>

        {/* Floating Hover / Seek Card */}
        {focusedNode && (
          <div
            style={{ top: `${focusedPercent}%` }}
            className="absolute right-full mr-2 -translate-y-1/2 pointer-events-none z-50 animate-in fade-in slide-in-from-right-1 duration-150"
          >
            <div className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface-card/95 backdrop-blur-2xl border border-hairline shadow-2xl ring-1 ring-hairline/60 whitespace-nowrap">
              {/* Badge */}
              <span
                style={{
                  backgroundColor: `color-mix(in srgb, ${
                    focusedNode.colorType === 'cyan'
                      ? 'var(--brand-blue)'
                      : focusedNode.colorType === 'yellow'
                      ? 'var(--brand-yellow)'
                      : 'var(--brand-mint)'
                  } 16%, transparent)`,
                  color:
                    focusedNode.colorType === 'cyan'
                      ? 'var(--brand-blue)'
                      : focusedNode.colorType === 'yellow'
                      ? 'var(--brand-yellow)'
                      : 'var(--brand-mint)',
                  borderColor: `color-mix(in srgb, ${
                    focusedNode.colorType === 'cyan'
                      ? 'var(--brand-blue)'
                      : focusedNode.colorType === 'yellow'
                      ? 'var(--brand-yellow)'
                      : 'var(--brand-mint)'
                  } 35%, transparent)`,
                }}
                className="text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-md border"
              >
                {focusedNode.badge}
              </span>

              {/* Title & Date */}
              <div className="flex flex-col text-left">
                <span className="text-xs font-mono font-bold text-ink leading-tight">
                  {focusedNode.label}
                </span>
                {focusedNode.subLabel && (
                  <span className="text-[10px] font-mono text-muted-custom leading-tight">
                    {focusedNode.subLabel}
                  </span>
                )}
              </div>

              {/* Right Arrow indicator pointing directly at the node line */}
              <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-surface-card" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

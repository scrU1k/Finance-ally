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
  const targetScrollNodeRef = useRef<string | null>(null);
  const targetScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        const weeklyMap = new Map<string, { targetDate: string }>();

        for (const group of groupedByDate) {
          const { weekNo } = getWeekDateBounds(group.date);
          const year = group.date.substring(0, 4);
          const weekKey = `${year}-W${weekNo}`;

          if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, {
              targetDate: group.date,
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
          const monthGroups = groupedByDate.filter(g => g.date.startsWith(monthKey));
          const targetGroup = monthGroups[0];

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

  // Compute target scroll positions of each waypoint for piecewise alignment
  const getWaypointScrollPositions = useCallback(() => {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if (waypoints.length <= 1) return [0];

    const positions: number[] = [];
    const headerOffset = 90;

    waypoints.forEach((wp, idx) => {
      if (idx === 0) {
        positions.push(0);
      } else {
        const el = wp.getElement();
        if (el) {
          const rect = el.getBoundingClientRect();
          const targetScroll = Math.max(0, Math.min(maxScroll, rect.top + window.pageYOffset - headerOffset));
          positions.push(targetScroll);
        } else if (idx === waypoints.length - 1) {
          positions.push(maxScroll);
        } else {
          positions.push((idx / (waypoints.length - 1)) * maxScroll);
        }
      }
    });

    for (let i = 1; i < positions.length; i++) {
      if (positions[i] < positions[i - 1]) {
        positions[i] = positions[i - 1];
      }
    }

    return positions;
  }, [waypoints]);

  // Viewport tracking & continuous scroll progress aligned to waypoint milestones
  const updateScrollState = useCallback(() => {
    const scrollY = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    if (waypoints.length <= 1) {
      setScrollProgress(0);
      return;
    }

    const count = waypoints.length;
    const positions = getWaypointScrollPositions();

    if (scrollY <= 5) {
      setScrollProgress(0);
      setActiveNodeId(waypoints[0].id);
      return;
    }

    if (scrollY >= maxScroll - 10) {
      setScrollProgress(1);
      setActiveNodeId(waypoints[count - 1].id);
      return;
    }

    // If user clicked a waypoint node, respect that target during smooth scroll
    if (targetScrollNodeRef.current) {
      const targetIdx = waypoints.findIndex(w => w.id === targetScrollNodeRef.current);
      if (targetIdx >= 0) {
        const targetPos = positions[targetIdx];
        if (Math.abs(scrollY - targetPos) < 35) {
          setScrollProgress(targetIdx / (count - 1));
          setActiveNodeId(targetScrollNodeRef.current);
          return;
        }
      }
    }

    let segIndex = 0;
    for (let i = 0; i < count - 1; i++) {
      if (scrollY >= positions[i]) {
        segIndex = i;
      } else {
        break;
      }
    }

    const sStart = positions[segIndex];
    const sEnd = positions[segIndex + 1];
    const tStart = segIndex / (count - 1);
    const tEnd = (segIndex + 1) / (count - 1);

    const span = sEnd - sStart;

    // Snapping logic: if within 25px of sStart or sEnd, or if span is very small, snap to the nearest node
    let progress: number;
    let activeIdx: number;

    if (span <= 35) {
      if (scrollY >= sStart + span * 0.5) {
        progress = tEnd;
        activeIdx = Math.min(count - 1, segIndex + 1);
      } else {
        progress = tStart;
        activeIdx = segIndex;
      }
    } else {
      const localRatio = Math.max(0, Math.min(1, (scrollY - sStart) / span));
      if (localRatio < 0.12 || Math.abs(scrollY - sStart) < 22) {
        progress = tStart;
        activeIdx = segIndex;
      } else if (localRatio > 0.88 || Math.abs(scrollY - sEnd) < 22) {
        progress = tEnd;
        activeIdx = Math.min(count - 1, segIndex + 1);
      } else {
        progress = tStart + localRatio * (tEnd - tStart);
        activeIdx = localRatio >= 0.5 ? Math.min(count - 1, segIndex + 1) : segIndex;
      }
    }

    setScrollProgress(progress);
    setActiveNodeId(waypoints[activeIdx].id);
  }, [waypoints, getWaypointScrollPositions]);

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
      if (targetScrollTimerRef.current) clearTimeout(targetScrollTimerRef.current);
    };
  }, [triggerVisibilityOnScroll, updateScrollState]);

  // Fast seek math: smoothly scrolls the page according to screen clientY
  const updateSeekScroll = useCallback(
    (clientY: number) => {
      if (!railRef.current || waypoints.length <= 1) return;
      const rect = railRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      const count = waypoints.length;
      const positions = getWaypointScrollPositions();

      const floatIndex = ratio * (count - 1);
      const segIndex = Math.min(count - 2, Math.floor(floatIndex));
      const localRatio = floatIndex - segIndex;

      const sStart = positions[segIndex];
      const sEnd = positions[segIndex + 1];
      const targetScrollY = sStart + localRatio * (sEnd - sStart);

      window.scrollTo(0, targetScrollY);

      const closestIndex = Math.round(floatIndex);
      const targetNode = waypoints[closestIndex];
      if (targetNode) {
        setHoveredNodeId(targetNode.id);
      }
    },
    [waypoints, getWaypointScrollPositions]
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
      e.stopPropagation();
      if (!railRef.current || isSeeking || waypoints.length <= 1) return;
      const rect = railRef.current.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const ratio = Math.max(0, Math.min(1, clickY / rect.height));

      const count = waypoints.length;
      const positions = getWaypointScrollPositions();

      const floatIndex = ratio * (count - 1);
      const segIndex = Math.min(count - 2, Math.floor(floatIndex));
      const localRatio = floatIndex - segIndex;

      const sStart = positions[segIndex];
      const sEnd = positions[segIndex + 1];
      const targetScrollY = sStart + localRatio * (sEnd - sStart);

      window.scrollTo({
        top: targetScrollY,
        behavior: 'smooth',
      });
    },
    [isSeeking, waypoints, getWaypointScrollPositions]
  );

  // Touch & Drag handler for mobile scrubber tracking
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      if (!railRef.current || waypoints.length <= 1 || isSeeking) return;
      const touch = e.touches[0];
      const rect = railRef.current.getBoundingClientRect();
      const clampedY = Math.max(0, Math.min(rect.height, touch.clientY - rect.top));
      const ratio = clampedY / rect.height;

      const count = waypoints.length;
      const positions = getWaypointScrollPositions();

      const floatIndex = ratio * (count - 1);
      const segIndex = Math.min(count - 2, Math.floor(floatIndex));
      const localRatio = floatIndex - segIndex;

      const sStart = positions[segIndex];
      const sEnd = positions[segIndex + 1];
      const targetScrollY = sStart + localRatio * (sEnd - sStart);

      window.scrollTo({ top: targetScrollY });

      // Closest node for hover card display
      const closestIndex = Math.round(floatIndex);
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
    [waypoints, hoveredNodeId, isSeeking, getWaypointScrollPositions]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      isTouchingRef.current = true;
      setIsInteracting(true);
      setIsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      handleTouchMove(e);
    },
    [handleTouchMove]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
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
      if (e.cancelable) e.preventDefault();
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

  const handleRunnerTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
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
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onMouseEnter={handleMouseEnterContainer}
      onMouseLeave={handleMouseLeaveContainer}
      className={`fixed right-1 sm:right-2.5 top-1/2 -translate-y-1/2 z-40 select-none transition-all duration-300 ease-out touch-none ${
        isVisible || isSeeking
          ? 'opacity-100 translate-x-0 pointer-events-auto'
          : 'opacity-0 translate-x-3 pointer-events-none'
      }`}
    >
      {/* Floating Ruler Track directly over the page, pinned right against the edge (Doubled width for mobile) */}
      <div
        ref={railRef}
        onClick={handleTrackClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-8 sm:w-10 h-[140px] sm:h-[220px] flex items-center justify-center cursor-pointer touch-none"
      >
        {/* Ruler Markings Track (Evenly distributed across 0% to 100% of page) */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between items-center py-1.5">
          {rulerTicks.map(idx => {
            const isCenterTick = idx === Math.floor(tickCount / 2);
            // Single longer line in the center if there are only 2 nodes
            const isCenterLongLine = isOnlyTwoNodes && isCenterTick;

            return (
              <div
                key={idx}
                className={`rounded-full transition-all duration-150 ${
                  isCenterLongLine
                    ? 'w-5 sm:w-7 h-[2px] bg-ink/40'
                    : 'w-2.5 sm:w-4 h-[1.5px] bg-ink/20'
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
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-grab active:cursor-grabbing p-2 z-30 transition-transform duration-75 touch-none"
        >
          <div
            style={{
              backgroundColor: runnerColor,
              boxShadow: isSeeking
                ? `0 0 10px ${runnerColor}`
                : `0 0 4px ${runnerColor}`,
            }}
            className={`rounded-full transition-all duration-150 ${
              isSeeking
                ? 'w-6 sm:w-8 h-[5px] sm:h-[6px] ring-2 ring-white/60 scale-125'
                : 'w-4 sm:w-6 h-[3px] sm:h-[3.5px] opacity-95'
            }`}
          />
        </div>

        {/* The Colored Waypoint Nodes (Refined, wider bars, theme-attuned colors) */}
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

            // Size: Doubled width for mobile clarity
            let sizeClass = 'w-4 sm:w-6.5 h-[3px] sm:h-[3.5px]';
            let opacityClass = 'opacity-85';

            if (isHovered) {
              sizeClass = 'w-6.5 sm:w-9 h-[4.5px] sm:h-[5.5px]';
              opacityClass = 'opacity-100 z-30 scale-110';
            } else if (isAnyHovered) {
              opacityClass = 'opacity-20 scale-90';
            } else if (isActive) {
              sizeClass = 'w-5 sm:w-7.5 h-[3.5px] sm:h-[4.5px]';
              opacityClass = 'opacity-100 z-20';
            }

            return (
              <div
                key={node.id}
                style={{ top: `${topPercent}%` }}
                onClick={e => {
                  e.stopPropagation();
                  setActiveNodeId(node.id);
                  setScrollProgress(topPercent / 100);
                  targetScrollNodeRef.current = node.id;
                  if (targetScrollTimerRef.current) clearTimeout(targetScrollTimerRef.current);
                  targetScrollTimerRef.current = setTimeout(() => {
                    targetScrollNodeRef.current = null;
                  }, 850);
                  node.scrollTo();
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 pointer-events-auto cursor-pointer flex items-center justify-center p-1.5 touch-none"
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

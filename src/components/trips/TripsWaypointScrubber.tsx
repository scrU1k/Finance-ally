import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TripsWaypointScrubberProps {
  splitSectionRef: React.RefObject<HTMLDivElement | null>;
}

interface Waypoint {
  id: string;
  label: string;
  subLabel: string;
  badge: string;
  color: string;
  colorType: 'cyan' | 'green';
  getTargetScroll: () => number;
}

export const TripsWaypointScrubber: React.FC<TripsWaypointScrubberProps> = ({ splitSectionRef }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<'node-top' | 'node-split'>('node-top');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const railRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  const isTouchingRef = useRef(false);
  const seekRafRef = useRef<number | null>(null);
  const pendingScrollYRef = useRef<number | null>(null);

  const getSplitScrollPosition = useCallback(() => {
    if (!splitSectionRef.current) {
      return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    }
    const headerOffset = 90;
    const rect = splitSectionRef.current.getBoundingClientRect();
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return Math.max(0, Math.min(maxScroll, rect.top + window.pageYOffset - headerOffset));
  }, [splitSectionRef]);

  const waypoints: Waypoint[] = [
    {
      id: 'node-top',
      label: 'Trips & Vaults',
      subLabel: 'Top of page',
      badge: 'TRIPS',
      color: 'var(--brand-blue)',
      colorType: 'cyan',
      getTargetScroll: () => 0,
    },
    {
      id: 'node-split',
      label: 'Split Bills',
      subLabel: 'Group Calculator',
      badge: 'SPLIT',
      color: 'var(--brand-mint)',
      colorType: 'green',
      getTargetScroll: getSplitScrollPosition,
    },
  ];

  // Auto-hide visibility timer
  const triggerVisibilityOnScroll = useCallback(() => {
    setIsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveredRef.current && !isTouchingRef.current && !isSeeking) {
        setIsVisible(false);
      }
    }, 1800);
  }, [isSeeking]);

  // Update scroll state based on actual window scroll
  const updateScrollState = useCallback(() => {
    const scrollY = window.scrollY;
    const splitTarget = getSplitScrollPosition();

    if (splitTarget <= 50) {
      // Not enough scroll distance
      setScrollProgress(0);
      setActiveNodeId('node-top');
      return;
    }

    const ratio = Math.max(0, Math.min(1, scrollY / splitTarget));
    setScrollProgress(ratio);
    setActiveNodeId(ratio >= 0.5 ? 'node-split' : 'node-top');
  }, [getSplitScrollPosition]);

  // Window scroll listener
  useEffect(() => {
    let rAFId: number | null = null;
    const handleScroll = () => {
      triggerVisibilityOnScroll();
      if (rAFId === null) {
        rAFId = window.requestAnimationFrame(() => {
          updateScrollState();
          rAFId = null;
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rAFId !== null) cancelAnimationFrame(rAFId);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [triggerVisibilityOnScroll, updateScrollState]);

  // Fast seek calculation
  const updateSeekScroll = useCallback(
    (clientY: number) => {
      if (!railRef.current) return;
      const rect = railRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      const splitTarget = getSplitScrollPosition();
      const targetScrollY = ratio * splitTarget;

      pendingScrollYRef.current = targetScrollY;
      setScrollProgress(ratio);

      if (seekRafRef.current === null) {
        seekRafRef.current = window.requestAnimationFrame(() => {
          if (pendingScrollYRef.current !== null) {
            window.scrollTo(0, pendingScrollYRef.current);
            pendingScrollYRef.current = null;
          }
          seekRafRef.current = null;
        });
      }

      const activeId = ratio >= 0.5 ? 'node-split' : 'node-top';
      if (activeId !== hoveredNodeId) {
        setHoveredNodeId(activeId);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(8);
          } catch {}
        }
      }
    },
    [getSplitScrollPosition, hoveredNodeId]
  );

  // Global pointer listeners while seeking is active
  useEffect(() => {
    if (!isSeeking) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      updateSeekScroll(e.clientY);
    };

    const handleGlobalMouseUp = () => {
      setIsSeeking(false);
      triggerVisibilityOnScroll();
      setTimeout(() => setHoveredNodeId(null), 600);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.touches[0]) {
        updateSeekScroll(e.touches[0].clientY);
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      setIsSeeking(false);
      triggerVisibilityOnScroll();
      setTimeout(() => setHoveredNodeId(null), 600);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    window.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      if (seekRafRef.current !== null) {
        cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = null;
      }
    };
  }, [isSeeking, updateSeekScroll, triggerVisibilityOnScroll]);

  // Track click to jump
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!railRef.current || isSeeking) return;
    const rect = railRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const targetScrollY = ratio * getSplitScrollPosition();
    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
  };

  const handleRunnerTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    isTouchingRef.current = true;
    setIsSeeking(true);
    setIsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch {}
    }
    if (e.touches[0]) {
      updateSeekScroll(e.touches[0].clientY);
    }
  };

  const handleRunnerMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSeeking(true);
    setIsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };

  const focusedNode = waypoints.find(w => w.id === (hoveredNodeId || (isSeeking ? activeNodeId : null)));
  const runnerColor = activeNodeId === 'node-top' ? 'var(--brand-blue)' : 'var(--brand-mint)';

  return (
    <div
      onMouseEnter={() => {
        isHoveredRef.current = true;
        setIsVisible(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      }}
      onMouseLeave={() => {
        isHoveredRef.current = false;
        if (!isSeeking) setHoveredNodeId(null);
        triggerVisibilityOnScroll();
      }}
      className={`fixed right-1.5 sm:right-3.5 top-1/2 -translate-y-1/2 z-30 transition-opacity duration-300 pointer-events-none select-none touch-none ${
        isVisible || isSeeking ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        ref={railRef}
        onClick={handleTrackClick}
        className="relative h-44 sm:h-52 w-10 sm:w-12 pointer-events-auto cursor-pointer flex items-center justify-center touch-none select-none"
      >
        {/* Subtle glass track capsule */}
        <div className="absolute inset-y-0 w-2.5 sm:w-3 rounded-full bg-surface-card/60 backdrop-blur-md border border-hairline/40 shadow-xs" />

        {/* Vertical Guide Line */}
        <div className="absolute inset-y-2 w-[1.5px] bg-hairline/70" />

        {/* Center milestone ruler ticks (11 ticks) */}
        <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 flex flex-col justify-between items-center pointer-events-none">
          {Array.from({ length: 11 }).map((_, idx) => {
            const isCenter = idx === 5;
            return (
              <div
                key={idx}
                className={`rounded-full transition-all duration-150 ${
                  isCenter ? 'w-4 sm:w-5 h-[2px] bg-ink/40' : 'w-2 sm:w-3 h-[1.5px] bg-ink/20'
                }`}
              />
            );
          })}
        </div>

        {/* Active Moving Runner Thumb */}
        <div
          style={{ top: `${scrollProgress * 100}%` }}
          onMouseDown={handleRunnerMouseDown}
          onTouchStart={handleRunnerTouchStart}
          title="Drag to scroll between Trips and Split Bills"
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-grab active:cursor-grabbing p-2.5 z-30 transition-transform duration-75 touch-none"
        >
          <div
            style={{
              backgroundColor: runnerColor,
              boxShadow: isSeeking ? `0 0 10px ${runnerColor}` : `0 0 4px ${runnerColor}`,
            }}
            className={`rounded-full transition-all duration-150 ${
              isSeeking
                ? 'w-6 sm:w-8 h-[5px] sm:h-[6px] ring-2 ring-white/60 scale-125'
                : 'w-4 sm:w-6 h-[3px] sm:h-[3.5px] opacity-95'
            }`}
          />
        </div>

        {/* The 2 Waypoint Nodes: Top and Split Bills */}
        <div className="relative w-full h-full pointer-events-none">
          {waypoints.map((node, index) => {
            const topPercent = index === 0 ? 0 : 100;
            const isActive = activeNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;

            let sizeClass = 'w-4 sm:w-6 h-[3px] sm:h-[3.5px]';
            let opacityClass = 'opacity-85';

            if (isHovered) {
              sizeClass = 'w-6 sm:w-8 h-[4.5px] sm:h-[5.5px]';
              opacityClass = 'opacity-100 z-30 scale-110';
            } else if (isActive) {
              sizeClass = 'w-5 sm:w-7 h-[3.5px] sm:h-[4.5px]';
              opacityClass = 'opacity-100 z-20';
            }

            return (
              <div
                key={node.id}
                style={{ top: `${topPercent}%` }}
                onClick={e => {
                  e.stopPropagation();
                  setActiveNodeId(node.id as any);
                  setScrollProgress(topPercent / 100);
                  const targetScroll = node.getTargetScroll();
                  window.scrollTo({ top: targetScroll, behavior: 'smooth' });
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer flex items-center justify-center p-2 touch-none"
              >
                <div
                  style={{
                    backgroundColor: node.color,
                    boxShadow: isHovered || isActive ? `0 0 8px ${node.color}` : undefined,
                  }}
                  className={`rounded-full transition-all duration-200 ${sizeClass} ${opacityClass}`}
                />
              </div>
            );
          })}
        </div>

        {/* Floating Tooltip Card */}
        {focusedNode && (
          <div
            style={{ top: `${scrollProgress * 100}%` }}
            className="absolute right-full mr-2 -translate-y-1/2 pointer-events-none z-50 animate-in fade-in slide-in-from-right-1 duration-150"
          >
            <div className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface-card/95 backdrop-blur-2xl border border-hairline shadow-2xl ring-1 ring-hairline/60 whitespace-nowrap">
              <span
                style={{
                  backgroundColor: `color-mix(in srgb, ${focusedNode.color} 16%, transparent)`,
                  color: focusedNode.color,
                  borderColor: `color-mix(in srgb, ${focusedNode.color} 35%, transparent)`,
                }}
                className="text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-md border"
              >
                {focusedNode.badge}
              </span>
              <div className="flex flex-col text-left">
                <span className="text-xs font-mono font-bold text-ink leading-tight">
                  {focusedNode.label}
                </span>
                <span className="text-[10px] font-mono text-muted-custom leading-tight">
                  {focusedNode.subLabel}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

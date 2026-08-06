import React, { useState, useRef } from 'react';
import { LayoutDashboard, Plane, Sparkles, PieChart, Users, Lightbulb, Menu, X } from 'lucide-react';

export type NavTab = 'dashboard' | 'trips' | 'scanner' | 'audit' | 'split' | 'insights';

interface SidebarNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ activeTab, setActiveTab }) => {
  const items = [
    { id: 'dashboard' as NavTab, label: 'Expense Log', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'trips' as NavTab, label: 'Trip Vaults', icon: <Plane className="w-5 h-5" /> },
    { id: 'scanner' as NavTab, label: 'Notif Scan', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'audit' as NavTab, label: 'Financial Audit', icon: <PieChart className="w-5 h-5" /> },
    { id: 'split' as NavTab, label: 'Split Bills', icon: <Users className="w-5 h-5" /> },
    { id: 'insights' as NavTab, label: 'Insights', icon: <Lightbulb className="w-5 h-5" /> },
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const pressTimerRef = useRef<any>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const startAngleRef = useRef(0);
  const currentRotationRef = useRef(0);

  // Long press detection helper
  const startPress = () => {
    pressTimerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 450);
  };

  const cancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }
  };

  const handleButtonClick = () => {
    // If not triggered by long press, single click also toggles it for convenience
    setIsOpen(prev => !prev);
  };

  // Wheel scroll to rotate
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 15 : -15;
    setRotation(prev => prev + delta);
  };

  // Pointer drag math
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!wheelRef.current) return;
    isDraggingRef.current = true;
    wheelRef.current.setPointerCapture(e.pointerId);

    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    
    startAngleRef.current = angle;
    currentRotationRef.current = rotation;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !wheelRef.current) return;

    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

    const diff = angle - startAngleRef.current;
    setRotation(currentRotationRef.current + diff);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const activeItem = items.find(item => item.id === activeTab) || items[0];

  return (
    <>
      {/* Floating Protruding Handle on the Right Side */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[100] flex items-center">
        <button
          type="button"
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onClick={handleButtonClick}
          className="pl-3.5 pr-2.5 py-4 bg-brand-blue text-white rounded-l-full shadow-2xl border-l border-y border-hairline/30 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center min-h-[48px]"
          title="Hold to open navigation wheel"
        >
          <Menu className="w-5 h-5 animate-pulse" />
        </button>
      </div>

      {/* Circular Telephone Dialer Overlay Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[120] bg-canvas/60 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="flex flex-col items-center space-y-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Instruction Banner */}
            <div className="text-center space-y-1">
              <span className="text-[10px] font-mono text-brand-blue uppercase font-bold tracking-wider">
                Rotary Dial Navigation
              </span>
              <p className="text-xs text-muted-custom font-mono">
                Drag/scroll wheel to rotate • Tap tab icon to navigate
              </p>
            </div>

            {/* Main Dialer Wheel Container */}
            <div
              ref={wheelRef}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                transform: `rotate(${rotation}deg)`,
                touchAction: 'none'
              }}
              className="w-72 h-72 sm:w-80 sm:h-80 rounded-full border-2 border-hairline bg-surface-card/90 backdrop-blur-2xl relative shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform duration-75"
            >
              {/* Central Display Ring */}
              <div
                style={{
                  transform: `rotate(${-rotation}deg)`
                }}
                className="w-32 h-32 rounded-full bg-surface-soft border border-hairline shadow-inner flex flex-col items-center justify-center text-center p-3 pointer-events-none transition-transform duration-75"
              >
                <span className="text-brand-blue">{activeItem.icon}</span>
                <span className="text-[11px] font-mono font-bold text-ink mt-1 truncate max-w-full">
                  {activeItem.label}
                </span>
                <span className="text-[9px] font-mono text-muted-custom mt-0.5 uppercase">
                  Active
                </span>
              </div>

              {/* Dialer Holes/Buttons around the circumference */}
              {items.map((item, index) => {
                const angleDegree = (360 / items.length) * index;
                const angleRad = (angleDegree * Math.PI) / 180;
                const radius = 105; // radius in pixels

                // Center position offset
                const x = radius * Math.cos(angleRad);
                const y = radius * Math.sin(angleRad);

                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsOpen(false);
                    }}
                    style={{
                      transform: `translate(${x}px, ${y}px) rotate(${-rotation}deg)`,
                      position: 'absolute'
                    }}
                    className={`w-12 h-12 rounded-full border flex items-center justify-center shadow-md transition-all cursor-pointer active:scale-90 ${
                      isActive
                        ? 'border-brand-blue text-brand-blue bg-surface-soft font-bold'
                        : 'border-hairline bg-surface-card text-body-custom hover:border-ink hover:text-ink'
                    }`}
                    title={item.label}
                  >
                    {item.icon}
                  </button>
                );
              })}
            </div>

            {/* Close Dialer Button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-full border border-hairline bg-surface-card hover:bg-surface-soft text-xs font-mono font-bold text-ink cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95"
            >
              <X className="w-4 h-4 text-brand-coral" />
              <span>Dismiss</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

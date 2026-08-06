import React, { useState, useRef } from 'react';
import { LayoutDashboard, Plane, Sparkles, PieChart, Users, Lightbulb, Menu } from 'lucide-react';

export type NavTab = 'dashboard' | 'trips' | 'scanner' | 'audit' | 'split' | 'insights';

interface SidebarNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ activeTab, setActiveTab }) => {
  const items = [
    { id: 'dashboard' as NavTab, label: 'Expense Log', icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
    { id: 'trips' as NavTab, label: 'Trip Vaults', icon: <Plane className="w-4.5 h-4.5" /> },
    { id: 'scanner' as NavTab, label: 'Notif Scan', icon: <Sparkles className="w-4.5 h-4.5" /> },
    { id: 'audit' as NavTab, label: 'Financial Audit', icon: <PieChart className="w-4.5 h-4.5" /> },
    { id: 'split' as NavTab, label: 'Split Bills', icon: <Users className="w-4.5 h-4.5" /> },
    { id: 'insights' as NavTab, label: 'Insights', icon: <Lightbulb className="w-4.5 h-4.5" /> },
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const startAngleRef = useRef(0);
  const currentRotationRef = useRef(0);

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
    <div
      className={`fixed right-0 top-1/2 -translate-y-1/2 z-[100] transition-all duration-300 ease-out flex items-center select-none ${
        isOpen ? 'translate-x-[40%]' : 'translate-x-[calc(100%-14px)]'
      }`}
    >
      {/* Toggle Button Handle protruding to the left */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-10 py-5 bg-brand-blue text-white rounded-l-2xl shadow-2xl border-l border-y border-hairline/30 hover:scale-105 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 min-h-[50px] shrink-0"
        title="Toggle Navigation Wheel"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 60% Visible Dialer Panel */}
      <div 
        className="dotgui-glass border-l border-y border-hairline p-4 rounded-l-3xl bg-surface-card/95 shadow-2xl flex items-center justify-start min-h-[300px] w-[300px] pl-6 overflow-visible select-none shrink-0"
      >
        {/* Active Tab Hover/Badge Floating to the left of the wheel */}
        {isOpen && (
          <div className="absolute -left-36 top-1/2 -translate-y-1/2 w-32 dotgui-glass border border-hairline rounded-xl p-2.5 space-y-1 bg-surface-soft/95 text-left shadow-lg pointer-events-none select-none animate-in fade-in duration-200">
            <span className="text-[9px] font-mono text-muted-custom uppercase font-bold">Active Tab</span>
            <div className="flex items-center gap-1.5 text-ink">
              <span className="text-brand-blue shrink-0">{activeItem.icon}</span>
              <span className="text-[10px] font-mono font-bold truncate max-w-full">{activeItem.label}</span>
            </div>
            <div className="text-[8px] font-mono text-muted-custom leading-normal">
              Scroll or drag wheel to spin.
            </div>
          </div>
        )}

        {/* Main Dialer Wheel */}
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
          className="w-64 h-64 rounded-full border-2 border-hairline bg-surface-soft/80 relative shadow-inner flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform duration-75 select-none"
        >
          {/* Center ring */}
          <div
            style={{
              transform: `rotate(${-rotation}deg)`
            }}
            className="w-24 h-24 rounded-full bg-surface-card border border-hairline shadow flex items-center justify-center pointer-events-none select-none"
          >
            <div className="text-center">
              <span className="text-[9px] font-mono text-muted-custom uppercase font-bold tracking-wider">Dial</span>
            </div>
          </div>

          {/* Holes/Buttons */}
          {items.map((item, index) => {
            const angleDegree = (360 / items.length) * index;
            const angleRad = (angleDegree * Math.PI) / 180;
            const radius = 88; // radius in pixels

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
                className={`w-10 h-10 rounded-full border flex items-center justify-center shadow transition-all cursor-pointer active:scale-90 ${
                  isActive
                    ? 'border-brand-blue text-brand-blue bg-surface-card font-bold scale-105 z-10'
                    : 'border-hairline bg-surface-soft/90 text-body-custom hover:border-ink hover:text-ink'
                }`}
                title={item.label}
              >
                {item.icon}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { LayoutDashboard, Plane, Sparkles, PieChart, Users, Lightbulb, CalendarCheck, ChevronDown, Check } from 'lucide-react';

export type NavTab = 'dashboard' | 'subscriptions' | 'trips' | 'scanner' | 'audit' | 'split' | 'insights';

interface SidebarNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ activeTab, setActiveTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Primary visible tabs
  const primaryTabs: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Expenditure', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <CalendarCheck className="w-4 h-4 shrink-0" /> },
    { id: 'trips', label: 'Trip Manager (Vault)', icon: <Plane className="w-4 h-4 shrink-0" /> },
  ];

  // Secondary tools dropdown items
  const secondaryTabs: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'scanner', label: 'Notification Scanner', icon: <Sparkles className="w-4 h-4 text-brand-yellow shrink-0" /> },
    { id: 'audit', label: 'Financial Audit', icon: <PieChart className="w-4 h-4 text-brand-mint shrink-0" /> },
    { id: 'split', label: 'Split Bills', icon: <Users className="w-4 h-4 text-brand-blue shrink-0" /> },
    { id: 'insights', label: 'Spend Insights', icon: <Lightbulb className="w-4 h-4 text-brand-coral shrink-0" /> },
  ];

  const activeSecondary = secondaryTabs.find(t => t.id === activeTab);
  const isSecondaryActive = Boolean(activeSecondary);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <nav className="relative mb-4 border-b border-hairline/60 pb-3" ref={containerRef}>
      <div className="flex items-center justify-between gap-2">
        
        {/* Primary Tabs (Scrollable container without clipping popover) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
          {primaryTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono whitespace-nowrap transition-all border cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-ink text-ink font-bold shadow-md bg-surface-card/90 backdrop-blur-xl ring-1 ring-white/10 animate-breathe'
                    : 'bg-surface-card/60 text-body-custom border-hairline hover:border-ink hover:text-ink'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Glassmorphic Chevron Dropdown Button (Outside scroll container to prevent clipping) */}
        <div className="relative shrink-0 z-30">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-mono whitespace-nowrap transition-all border cursor-pointer shadow-md ${
              isSecondaryActive || isOpen
                ? 'border-brand-blue text-brand-blue font-bold bg-surface-card/95 backdrop-blur-xl ring-1 ring-white/10 shadow-black/20'
                : 'bg-surface-card/80 text-body-custom border-hairline hover:border-ink hover:text-ink'
            }`}
            title="More Financial Tools"
          >
            {isSecondaryActive && activeSecondary ? (
              <span className="flex items-center gap-1.5 font-bold">
                {activeSecondary.icon}
                <span>{activeSecondary.label}</span>
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-muted-custom">More Tools</span>
            )}
            <ChevronDown className={`w-4 h-4 text-muted-custom transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-brand-blue' : ''}`} />
          </button>

          {/* Glassmorphic Popover Menu */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-2.5 z-50 w-64 bg-surface-card/90 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl shadow-2xl shadow-black/40 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-white/10">
              <span className="px-3 py-1 text-[9.5px] font-mono font-bold text-muted-custom uppercase block border-b border-hairline/60 pb-1 mb-1">
                Financial Management Tools
              </span>
              {secondaryTabs.map(item => {
                const isSelected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-mono text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border border-brand-blue text-brand-blue font-bold bg-surface-soft shadow-sm'
                        : 'text-body-custom hover:bg-surface-soft hover:text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {item.icon}
                      <span className="font-semibold">{item.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-brand-blue shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </nav>
  );
};

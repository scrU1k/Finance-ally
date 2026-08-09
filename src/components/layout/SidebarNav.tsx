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
    { id: 'scanner', label: 'Notification Extraction', icon: <Sparkles className="w-4 h-4 text-brand-yellow shrink-0" /> },
    { id: 'audit', label: 'Financial Audit', icon: <PieChart className="w-4 h-4 text-brand-mint shrink-0" /> },
    { id: 'split', label: 'Split Bills', icon: <Users className="w-4 h-4 text-brand-blue shrink-0" /> },
    { id: 'insights', label: 'Spend Insights', icon: <Lightbulb className="w-4 h-4 text-brand-coral shrink-0" /> },
  ];

  const isSecondaryActive = secondaryTabs.some(t => t.id === activeTab);

  const visibleTabs = isSecondaryActive ? secondaryTabs : primaryTabs;
  const dropdownTabs = isSecondaryActive ? primaryTabs : secondaryTabs;
  const dropdownTitle = isSecondaryActive ? "Core Features" : "Financial Management Tools";

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

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeTab]);

  return (
    <nav className="relative mb-3" ref={containerRef}>
      <div className="flex items-center justify-between gap-2">
        
        {/* Scrollable container for visible tabs */}
        <div ref={scrollContainerRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeTabRef : null}
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

        {/* Circular Glassmorphic Chevron FAB Dropdown Button */}
        <div className="relative shrink-0 z-30">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-9 h-9 rounded-full bg-surface-card/85 text-body-custom border border-hairline hover:border-ink hover:text-ink backdrop-blur-xl ring-1 ring-white/10 flex items-center justify-center transition-all cursor-pointer shadow-lg shrink-0"
            title={isSecondaryActive ? "Show Core Tabs" : "More Financial Tools"}
          >
            <ChevronDown className={`w-4 h-4 text-muted-custom transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-brand-blue' : ''}`} />
          </button>

          {/* Glassmorphic Popover Menu */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-2.5 z-50 w-64 bg-surface-card/90 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl shadow-2xl shadow-black/40 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-white/10">
              <span className="px-3 py-1 text-[9.5px] font-mono font-bold text-muted-custom uppercase block border-b border-hairline/60 pb-1 mb-1">
                {dropdownTitle}
              </span>
              {dropdownTabs.map(item => {
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

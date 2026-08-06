import React, { useRef, useEffect } from 'react';
import { LayoutDashboard, Plane, Sparkles, PieChart, Users, Lightbulb } from 'lucide-react';

export type NavTab = 'dashboard' | 'trips' | 'scanner' | 'audit' | 'split' | 'insights';

interface SidebarNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ activeTab, setActiveTab }) => {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const items: { id: NavTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'dashboard', label: 'Expense Log', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'trips', label: 'Trip Manager', icon: <Plane className="w-4 h-4" />, badge: 'Vault' },
    { id: 'scanner', label: 'Notif scan', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'audit', label: 'Financial Audit', icon: <PieChart className="w-4 h-4" /> },
    { id: 'split', label: 'Split Bills', icon: <Users className="w-4 h-4" /> },
    { id: 'insights', label: 'Spending Insights', icon: <Lightbulb className="w-4 h-4" /> },
  ];

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeTab]);

  return (
    <nav className="flex items-center gap-3 overflow-x-auto pb-4 pt-2 mb-6 border-b border-hairline no-scrollbar scroll-smooth w-full px-[25%] sm:px-[35%] relative">
      {items.map(item => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            ref={isActive ? activeRef : null}
            onClick={() => setActiveTab(item.id)}
            className={`flex items-center gap-2 rounded-full font-mono whitespace-nowrap border transition-all cursor-pointer ${
              isActive
                ? 'scale-105 px-5 py-2 text-xs font-bold shadow-lg opacity-100 z-10 border-ink bg-surface-soft text-ink'
                : 'scale-90 px-3.5 py-1.5 text-[11px] opacity-40 border-hairline bg-surface-card text-muted-custom hover:opacity-75'
            }`}
            style={{
              transform: isActive ? 'perspective(200px) translateZ(8px)' : 'perspective(200px) translateZ(-8px)',
              transition: 'all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)',
            }}
          >
            <span className={isActive ? 'text-ink' : 'text-muted-custom'}>
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.badge && (
              <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-bold border ${
                isActive ? 'border-brand-blue text-brand-blue' : 'border-hairline text-muted-custom'
              }`}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

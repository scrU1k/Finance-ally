import React from 'react';
import { LayoutDashboard, Plane, Sparkles, PieChart, Users, Lightbulb } from 'lucide-react';

export type NavTab = 'dashboard' | 'trips' | 'scanner' | 'audit' | 'split' | 'insights';

interface SidebarNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ activeTab, setActiveTab }) => {
  const items: { id: NavTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'dashboard', label: 'Expense Log', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'trips', label: 'Trip Manager', icon: <Plane className="w-4 h-4" />, badge: 'Vault' },
    { id: 'scanner', label: 'Notif scan', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'audit', label: 'Financial Audit', icon: <PieChart className="w-4 h-4" /> },
    { id: 'split', label: 'Split Bills', icon: <Users className="w-4 h-4" /> },
    { id: 'insights', label: 'Spending Insights', icon: <Lightbulb className="w-4 h-4" /> },
  ];

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 border-b border-hairline no-scrollbar">
      {items.map(item => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono whitespace-nowrap transition-all border ${
              isActive
                ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft animate-breathe'
                : 'bg-surface-card text-body-custom border-hairline hover:border-ink hover:text-ink'
            }`}
          >
            {item.icon}
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

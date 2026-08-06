import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FinanceProvider } from './context/FinanceContext';
import { OnboardingCurrency } from './components/auth/OnboardingCurrency';
import { AuthModal } from './components/auth/AuthModal';
import { Header } from './components/layout/Header';
import { SidebarNav, NavTab } from './components/layout/SidebarNav';
import { BottomPeriodBar } from './components/layout/BottomPeriodBar';
import { DailyTimeline } from './components/dashboard/DailyTimeline';
import { TransactionModal } from './components/dashboard/TransactionModal';
import { TripList } from './components/trips/TripList';
import { NotificationScannerModal } from './components/scanner/NotificationScannerModal';
import { EndOfMonthAudit } from './components/audit/EndOfMonthAudit';
import { SplitBillModal } from './components/tools/SplitBillModal';
import { SmartSuggestions } from './components/insights/SmartSuggestions';
import { SettingsModal } from './components/settings/SettingsModal';
import { Transaction } from './types';

const MainAppContent: React.FC = () => {
  const { needsOnboarding, isUnlocked } = useAuth();
  
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  if (needsOnboarding) {
    return <OnboardingCurrency />;
  }

  if (!isUnlocked) {
    return <AuthModal />;
  }

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col transition-colors overflow-x-hidden max-w-full">
      
      {/* Top Header */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenQuickAdd={() => {
          setEditingTransaction(null);
          setIsQuickAddOpen(true);
        }}
        onOpenScanner={() => setActiveTab('scanner')}
        onTitleClick={() => setActiveTab('dashboard')}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6">
        
        {/* Navigation Rail */}
        <SidebarNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Dynamic View Rendering */}
        {activeTab === 'dashboard' && (
          <DailyTimeline
            onOpenQuickAdd={() => {
              setEditingTransaction(null);
              setIsQuickAddOpen(true);
            }}
            onEditTransaction={tx => {
              setEditingTransaction(tx);
              setIsQuickAddOpen(true);
            }}
          />
        )}

        {activeTab === 'trips' && <TripList />}
        {activeTab === 'scanner' && <NotificationScannerModal />}
        {activeTab === 'audit' && <EndOfMonthAudit />}
        {activeTab === 'split' && <SplitBillModal />}
        {activeTab === 'insights' && <SmartSuggestions />}

      </main>

      {/* Sticky Bottom Total & Period Selector Toggle Bar */}
      <BottomPeriodBar
        onOpenQuickAdd={() => {
          setEditingTransaction(null);
          setIsQuickAddOpen(true);
        }}
      />

      {/* Transaction Modal (Add / Edit) */}
      <TransactionModal
        isOpen={isQuickAddOpen}
        onClose={() => {
          setIsQuickAddOpen(false);
          setEditingTransaction(null);
        }}
        initialData={editingTransaction}
      />

      {/* Settings & Currency Converter Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

    </div>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FinanceProvider>
          <MainAppContent />
        </FinanceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

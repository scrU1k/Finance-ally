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
import { CategoryManagerModal } from './components/categories/CategoryManagerModal';
import { SubscriptionPage } from './components/subscriptions/SubscriptionPage';

// Lazy load secondary views for bundle optimization
const LazySubscriptionPage = React.lazy(() => import('./components/subscriptions/SubscriptionPage').then(module => ({ default: module.SubscriptionPage })));
const LazyTripList = React.lazy(() => import('./components/trips/TripList').then(module => ({ default: module.TripList })));
const LazyNotificationScannerModal = React.lazy(() => import('./components/scanner/NotificationScannerModal').then(module => ({ default: module.NotificationScannerModal })));
const LazyEndOfMonthAudit = React.lazy(() => import('./components/audit/EndOfMonthAudit').then(module => ({ default: module.EndOfMonthAudit })));
const LazySplitBillModal = React.lazy(() => import('./components/tools/SplitBillModal').then(module => ({ default: module.SplitBillModal })));
const LazySmartSuggestions = React.lazy(() => import('./components/insights/SmartSuggestions').then(module => ({ default: module.SmartSuggestions })));
const LazySettingsModal = React.lazy(() => import('./components/settings/SettingsModal').then(module => ({ default: module.SettingsModal })));
const LazyCategoryManagerModal = React.lazy(() => import('./components/categories/CategoryManagerModal').then(module => ({ default: module.CategoryManagerModal })));
import { AutoSmsDetectorBanner } from './components/common/AutoSmsDetectorBanner';
import { Transaction } from './types';
import { checkAndPerformLocalAutoBackup } from './services/localAutoBackupService';

const MainAppContent: React.FC = () => {
  const { needsOnboarding, isUnlocked } = useAuth();
  
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  React.useEffect(() => {
    checkAndPerformLocalAutoBackup();
  }, []);

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
        onOpenCategories={() => setIsCategoryManagerOpen(true)}
        onOpenQuickAdd={() => {
          setEditingTransaction(null);
          setIsQuickAddOpen(true);
        }}
        onOpenScanner={() => setActiveTab('scanner')}
        onTitleClick={() => setActiveTab('dashboard')}
      />

      {/* Automatic SMS Transaction Detector Banner */}
      <AutoSmsDetectorBanner
        onEditDetectedTransaction={tx => {
          setEditingTransaction(tx);
          setIsQuickAddOpen(true);
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-3">
        
        {/* Navigation Rail */}
        <SidebarNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Dynamic View Rendering */}
        <React.Suspense fallback={
          <div className="flex items-center justify-center p-12 text-sm font-mono text-muted-custom">
            Loading view...
          </div>
        }>
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

          {activeTab === 'subscriptions' && <LazySubscriptionPage />}
          {activeTab === 'trips' && <LazyTripList />}
          {activeTab === 'scanner' && <LazyNotificationScannerModal />}
          {activeTab === 'audit' && <LazyEndOfMonthAudit />}
          {activeTab === 'split' && <LazySplitBillModal />}
          {activeTab === 'insights' && <LazySmartSuggestions />}
        </React.Suspense>
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

      <React.Suspense fallback={null}>
        {/* Category Budget Caps & Tag Palette Modal */}
        {isCategoryManagerOpen && (
          <LazyCategoryManagerModal
            isOpen={isCategoryManagerOpen}
            onClose={() => setIsCategoryManagerOpen(false)}
          />
        )}

        {/* Settings & Currency Converter Modal */}
        {isSettingsOpen && (
          <LazySettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </React.Suspense>

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

import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FinanceProvider } from './context/FinanceContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OnboardingCurrency } from './components/auth/OnboardingCurrency';
import { AuthModal } from './components/auth/AuthModal';
import { Header } from './components/layout/Header';
import { SidebarNav, NavTab } from './components/layout/SidebarNav';
import { BottomPeriodBar } from './components/layout/BottomPeriodBar';
import { DailyTimeline } from './components/dashboard/DailyTimeline';
import { TransactionModal } from './components/dashboard/TransactionModal';
import { AutoSmsDetectorBanner } from './components/common/AutoSmsDetectorBanner';
import { ScheduledPaymentToastBanner } from './components/common/ScheduledPaymentToastBanner';
import { Transaction } from './types';
import { checkAndPerformLocalAutoBackup } from './services/localAutoBackupService';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { SubscriptionPage } from './components/subscriptions/SubscriptionPage';
import { TripList } from './components/trips/TripList';
import { NotificationScannerModal } from './components/scanner/NotificationScannerModal';
import { EndOfMonthAudit } from './components/audit/EndOfMonthAudit';
import { SplitBillModal } from './components/tools/SplitBillModal';
import { SmartSuggestions } from './components/insights/SmartSuggestions';
import { PasswordManagerTab } from './components/tools/PasswordManagerTab';
import { SettingsModal } from './components/settings/SettingsModal';
import { CategoryManagerModal } from './components/categories/CategoryManagerModal';

const MainAppContent: React.FC = () => {
  const { needsOnboarding, isUnlocked } = useAuth();
  
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [tabHistory, setTabHistory] = useState<NavTab[]>(['dashboard']);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const navigateToTab = (newTab: NavTab) => {
    if (newTab === activeTab) return;
    setTabHistory(prev => [...prev, newTab]);
    setActiveTab(newTab);
  };

  React.useEffect(() => {
    // Request persistent storage (prevents eviction on iOS WebKit / PWA / Desktop)
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    if (!needsOnboarding && isUnlocked) {
      checkAndPerformLocalAutoBackup();
    }
  }, [needsOnboarding, isUnlocked]);

  // Native Android Hardware / Gesture Back Button Navigation Handler
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => void } | null = null;

    CapApp.addListener('backButton', () => {
      // 1. If QuickAdd or Edit Transaction modal is open -> close it
      if (isQuickAddOpen || editingTransaction) {
        setIsQuickAddOpen(false);
        setEditingTransaction(null);
        return;
      }

      // 2. If Category Manager modal is open -> close it
      if (isCategoryManagerOpen) {
        setIsCategoryManagerOpen(false);
        return;
      }

      // 3. If Settings modal is open -> close it
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        return;
      }

      // 4. If tab history has previous tabs -> go back to previous tab
      if (tabHistory.length > 1) {
        const updatedHistory = tabHistory.slice(0, -1);
        const previousTab = updatedHistory[updatedHistory.length - 1];
        setTabHistory(updatedHistory);
        setActiveTab(previousTab);
        return;
      }

      // 5. If activeTab is not dashboard -> return to dashboard
      if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
        setTabHistory(['dashboard']);
        return;
      }

      // 6. At root dashboard view -> minimize app safely instead of kill/lock
      CapApp.minimizeApp();
    }).then(handle => {
      listenerHandle = handle;
    }).catch(() => {});

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [isQuickAddOpen, editingTransaction, isCategoryManagerOpen, isSettingsOpen, activeTab, tabHistory]);

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
        onOpenScanner={() => navigateToTab('scanner')}
        onTitleClick={() => navigateToTab('dashboard')}
        onOpenSpendInsights={() => navigateToTab('insights')}
      />

      {/* Automatic SMS Transaction Detector Banner */}
      <AutoSmsDetectorBanner
        onEditDetectedTransaction={tx => {
          setEditingTransaction(tx);
          setIsQuickAddOpen(true);
        }}
      />

      {/* Scheduled Payment Live Toast Banner */}
      <ScheduledPaymentToastBanner
        onEditScheduledTx={tx => {
          setEditingTransaction(tx);
          setIsQuickAddOpen(true);
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-3 pb-32">
        
        {/* Navigation Rail */}
        <SidebarNav activeTab={activeTab} setActiveTab={navigateToTab} />

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

          {activeTab === 'subscriptions' && <SubscriptionPage />}
          {activeTab === 'trips' && <TripList setActiveTab={navigateToTab} />}
          {activeTab === 'scanner' && <NotificationScannerModal />}
          {activeTab === 'audit' && <EndOfMonthAudit />}
          {activeTab === 'split' && <SplitBillModal />}
          {activeTab === 'passwords' && <PasswordManagerTab />}
          {activeTab === 'insights' && (
            <SmartSuggestions
              onSelectTransaction={tx => {
                setEditingTransaction(tx);
                setIsQuickAddOpen(true);
                navigateToTab('dashboard');
              }}
            />
          )}
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

        {/* Category Budget Caps & Tag Palette Modal */}
        {isCategoryManagerOpen && (
          <CategoryManagerModal
            isOpen={isCategoryManagerOpen}
            onClose={() => setIsCategoryManagerOpen(false)}
          />
        )}

        {/* Settings & Currency Converter Modal */}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

      </div>
    );
  };

import { SplashScreen } from './components/common/SplashScreen';

export function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <FinanceProvider>
            <SplashScreen />
            <MainAppContent />
          </FinanceProvider>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;

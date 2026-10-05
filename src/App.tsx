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
import { ScheduledPaymentToastBanner } from './components/common/ScheduledPaymentToastBanner';
import { SplashScreen } from './components/common/SplashScreen';
import { checkAndRecoverStaleImportJournal } from './services/db';
import { Transaction } from './types';
import {
  checkAndPerformLocalAutoBackup,
  syncSnapshotsFromFilesystem,
  getLastBackupError,
  onBackupError,
  LastBackupError
} from './services/localAutoBackupService';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { SubscriptionPage } from './components/subscriptions/SubscriptionPage';
import { TripList } from './components/trips/TripList';
import { UnifiedAuditInsights } from './components/audit/UnifiedAuditInsights';
import { SplitBillModal } from './components/tools/SplitBillModal';
import { PasswordManagerTab } from './components/tools/PasswordManagerTab';
import { SettingsModal } from './components/settings/SettingsModal';
import { CategoryManagerModal } from './components/categories/CategoryManagerModal';
import { RecoveryKeyModal } from './components/common/RecoveryKeyModal';
import { BackupErrorModal } from './components/common/BackupErrorModal';
import {
  initializeGlobalRecoveryKey,
  checkAndRecoverStaleRotationJournal,
  getPendingRecoveryKey,
  finalizeRecoveryKeyRotation
} from './services/recoveryService';
import { executeBackAction } from './services/backButtonService';

const V3_RECOVERY_ONBOARDED_KEY = 'fa_v3_recovery_onboarded';

const MainAppContent: React.FC = () => {
  const { user, needsOnboarding, isUnlocked } = useAuth();
  const [v3RecoveryKey, setV3RecoveryKey] = useState<string | null>(null);
  const [pendingRotatedKey, setPendingRotatedKey] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<LastBackupError | null>(null);
  
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [tabHistory, setTabHistory] = useState<NavTab[]>(['dashboard']);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const navigateToTab = (newTab: NavTab) => {
    if (newTab === activeTab) return;
    setTabHistory(prev => (prev[prev.length - 1] === newTab ? prev : [...prev, newTab]));
    setActiveTab(newTab);
  };

  const stateRef = React.useRef({
    backupError,
    isQuickAddOpen,
    editingTransaction,
    isCategoryManagerOpen,
    isSettingsOpen,
    activeTab,
    tabHistory,
  });

  stateRef.current = {
    backupError,
    isQuickAddOpen,
    editingTransaction,
    isCategoryManagerOpen,
    isSettingsOpen,
    activeTab,
    tabHistory,
  };

  React.useEffect(() => {
    // Request persistent storage (prevents eviction on iOS WebKit / PWA / Desktop)
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    if (!needsOnboarding && isUnlocked) {
      checkAndRecoverStaleRotationJournal();
      checkAndPerformLocalAutoBackup();
      syncSnapshotsFromFilesystem().catch(() => {});

      const pendingErr = getLastBackupError();
      if (pendingErr) {
        setBackupError(pendingErr);
      }

      const unsubscribe = onBackupError(err => {
        setBackupError(err);
      });

      const unconfirmedRotatedKey = getPendingRecoveryKey();
      if (unconfirmedRotatedKey) {
        setPendingRotatedKey(unconfirmedRotatedKey);
      }

      // Purge any legacy plaintext keys from persistent or session storage
      localStorage.removeItem('fa_v3_recovery_pending_key');
      try {
        sessionStorage.removeItem('fa_v3_recovery_pending_key');
        sessionStorage.removeItem('fa_rotated_recovery_key_temp');
      } catch {}

      const alreadyOnboarded = localStorage.getItem(V3_RECOVERY_ONBOARDED_KEY);
      if (!alreadyOnboarded) {
        const username = user?.username || 'USER';
        initializeGlobalRecoveryKey(username).then(key => {
          setV3RecoveryKey(key);
        });
      }

      return () => {
        unsubscribe();
      };
    }
  }, [needsOnboarding, isUnlocked, user?.username]);

  // Native Android Hardware / Gesture Back Button Navigation Handler
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => void } | null = null;

    CapApp.addListener('backButton', () => {
      // 0. Check Centralized Priority Back Action Stack first (Modals, Sub-pages, Sheets)
      if (executeBackAction()) {
        return;
      }

      const state = stateRef.current;

      // 1. If Backup Error modal is open -> close it
      if (state.backupError) {
        setBackupError(null);
        return;
      }

      // 2. If QuickAdd or Edit Transaction modal is open -> close it
      if (state.isQuickAddOpen || state.editingTransaction) {
        setIsQuickAddOpen(false);
        setEditingTransaction(null);
        return;
      }

      // 3. If Category Manager modal is open -> close it
      if (state.isCategoryManagerOpen) {
        setIsCategoryManagerOpen(false);
        return;
      }

      // 4. If Settings modal is open -> close it
      if (state.isSettingsOpen) {
        setIsSettingsOpen(false);
        return;
      }

      // 5. If tab history has previous tabs -> step back through previously visited tabs
      if (state.tabHistory.length > 1) {
        const updatedHistory = state.tabHistory.slice(0, -1);
        const previousTab = updatedHistory[updatedHistory.length - 1];
        setTabHistory(updatedHistory);
        setActiveTab(previousTab);
        return;
      }

      // 6. If activeTab is not dashboard -> return to dashboard
      if (state.activeTab !== 'dashboard') {
        setActiveTab('dashboard');
        setTabHistory(['dashboard']);
        return;
      }

      // 7. At root dashboard view -> minimize app safely instead of kill/lock
      CapApp.minimizeApp();
    }).then(handle => {
      listenerHandle = handle;
    }).catch(() => {});

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
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
        onTitleClick={() => navigateToTab('dashboard')}
      />

      {/* Scheduled Payment Live Toast Banner */}
      <ScheduledPaymentToastBanner
        onEditScheduledTx={tx => {
          setEditingTransaction(tx);
          setIsQuickAddOpen(true);
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-2 sm:pt-2.5 pb-[88px] sm:pb-[92px]">
        
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
          {(activeTab === 'audit' || activeTab === 'insights') && (
            <UnifiedAuditInsights
              onSelectTransaction={tx => {
                setEditingTransaction(tx);
                setIsQuickAddOpen(true);
                navigateToTab('dashboard');
              }}
            />
          )}
          {activeTab === 'split' && <SplitBillModal />}
          {activeTab === 'passwords' && <PasswordManagerTab />}
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

        {/* v3.0 Global Recovery Key First-Launch Modal */}
        {v3RecoveryKey && (
          <RecoveryKeyModal
            recoveryKey={v3RecoveryKey}
            title="Welcome to Finance-Ally v3.0"
            subtitle="Global Security Recovery Key"
            noticeText="A new emergency recovery system has been added in v3.0 so you can recover your App Password, Password Vault PIN, or Backup PIN if you ever forget them. This key is generated strictly in-memory and is NEVER written to browser storage (neither localStorage nor sessionStorage). Save it safely!"
            onDismiss={() => {
              localStorage.setItem(V3_RECOVERY_ONBOARDED_KEY, 'true');
              setV3RecoveryKey(null);
            }}
          />
        )}

        {/* Unconfirmed Rotated Global Recovery Key Modal (Resumed within active session) */}
        {pendingRotatedKey && (
          <RecoveryKeyModal
            recoveryKey={pendingRotatedKey}
            title="New Global Recovery Key"
            subtitle="Rotated Security Key"
            noticeText="Your Recovery Key was recently rotated. This key is held in an ephemeral session strictly until confirmed below; it is NEVER written to persistent device storage. Please record this new key securely."
            onDismiss={() => {
              finalizeRecoveryKeyRotation();
              setPendingRotatedKey(null);
            }}
          />
        )}

        {/* Local Database Backup Error Modal */}
        {backupError && (
          <BackupErrorModal
            errorMessage={backupError.message}
            timestamp={backupError.timestamp}
            onDismiss={() => setBackupError(null)}
          />
        )}

      </div>
    );
  };

export function App() {
  const [isReady, setIsReady] = useState(false);

  React.useEffect(() => {
    checkAndRecoverStaleImportJournal().finally(() => {
      setIsReady(true);
    });
  }, []);

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <SplashScreen />
        {isReady && (
          <AuthProvider>
            <FinanceProvider>
              <MainAppContent />
            </FinanceProvider>
          </AuthProvider>
        )}
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;

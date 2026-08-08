import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useTheme, ThemeMode, FontFamily } from '../../context/ThemeContext';
import { TOP_CURRENCIES, convertCurrencyAmount, formatCurrency } from '../../services/currency';
import { exportFullDataBackup, importFullDataBackup } from '../../services/db';
import { exportTransactionsToCSV, importTransactionsFromCSV } from '../../services/csvParser';
import { encryptJSON, decryptJSON, isEncryptedBackup, saveExportPin, verifyExportPin, hasExportPin, clearExportPin } from '../../services/cryptoService';
import {
  getLocalAutoBackupConfig,
  saveLocalAutoBackupConfig,
  getLocalSnapshots,
  createLocalAutoBackup,
  getSnapshotPayload,
  deleteLocalSnapshot,
  LocalAutoBackupConfig,
  LocalSnapshotMetadata
} from '../../services/localAutoBackupService';
import { PinModal } from '../common/PinModal';
import { CustomSelect } from '../common/CustomSelect';
import { CurrencyCode } from '../../types';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import {
  X,
  Settings as SettingsIcon,
  RefreshCw,
  Palette,
  Database,
  RefreshCcw,
  ArrowRightLeft,
  Lock,
  Eye,
  EyeOff,
  Upload,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  FileSpreadsheet,
  Cloud,
  CheckCircle2,
  Calendar,
  Info
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsSubPage = 'main' | 'security' | 'csv' | 'backup';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, toggleRequirePassword, changePassword } = useAuth();
  const { baseCurrency, switchBaseCurrency, syncForexRates, forexRates, transactions, categories, addTransaction, reloadAllData } = useFinance();
  const { theme, setTheme, fontFamily, setFontFamily } = useTheme();

  // Active Sub-Page Navigation State
  const [activeSubPage, setActiveSubPage] = useState<SettingsSubPage>('main');

  // Always reset to main settings view whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSubPage('main');
    }
  }, [isOpen]);

  // Embedded Converter State
  const [calcAmount, setCalcAmount] = useState('100');
  const [calcFrom, setCalcFrom] = useState<CurrencyCode>('USD');
  const [calcTo, setCalcTo] = useState<CurrencyCode>(baseCurrency);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Currency Switch State
  const [targetCurrency, setTargetCurrency] = useState<CurrencyCode>(baseCurrency);
  const [switchMode, setSwitchMode] = useState<'convert' | 'keep'>('convert');
  const [switching, setSwitching] = useState(false);

  // Change Password State
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');

  // Backup State
  const [importStatus, setImportStatus] = useState('');
  const [exportModalData, setExportModalData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvStatus, setCsvStatus] = useState('');

  // Local Auto-Backup State
  const initialLocalConfig = getLocalAutoBackupConfig();
  const [localAutoConfig, setLocalAutoConfig] = useState<LocalAutoBackupConfig>(initialLocalConfig);
  const [localSnapshots, setLocalSnapshotsState] = useState<LocalSnapshotMetadata[]>(getLocalSnapshots());
  const [localBackupMsg, setLocalBackupMsg] = useState('');
  const [localBackupLoading, setLocalBackupLoading] = useState(false);

  // Export PIN / Encryption state
  const [pinEnabled, setPinEnabled] = useState<boolean>(hasExportPin);
  const [showSetPinModal, setShowSetPinModal] = useState<'set' | 'change' | null>(null);
  const [pinActionLoading, setPinActionLoading] = useState(false);
  const [pinActionError, setPinActionError] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  // Import-time PIN verification
  const [pendingImportContent, setPendingImportContent] = useState<string | null>(null);
  const [showVerifyPinModal, setShowVerifyPinModal] = useState(false);
  const [verifyPinLoading, setVerifyPinLoading] = useState(false);
  const [verifyPinError, setVerifyPinError] = useState('');

  if (!isOpen) return null;

  const convertedValue = convertCurrencyAmount(
    parseFloat(calcAmount) || 0,
    calcFrom,
    calcTo,
    forexRates
  );

  const handleSyncRates = async () => {
    setSyncing(true);
    setSyncMsg('');
    const success = await syncForexRates();
    setSyncing(false);
    if (success) {
      setSyncMsg('Live rates updated successfully from market API!');
    } else {
      setSyncMsg('Offline mode: Using cached forex rates.');
    }
  };

  const handleExecuteSwitchCurrency = async () => {
    if (targetCurrency === baseCurrency) return;
    setSwitching(true);
    await switchBaseCurrency(targetCurrency, switchMode);
    setSwitching(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg('');
    setPassError('');

    if (!newPass || newPass.length < 4) {
      setPassError('Password must be at least 4 characters long.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassError('Passwords do not match. Please re-check.');
      return;
    }

    const ok = await changePassword(newPass);
    if (ok) {
      setPassMsg('Password updated successfully!');
      setNewPass('');
      setConfirmPass('');
      setIsChangingPass(false);
    } else {
      setPassError('Error updating password.');
    }
  };

  const handleExport = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const backupStr = await exportFullDataBackup();
    if (pinEnabled && hasExportPin()) {
      setPendingImportContent(null);
      setExportModalData(backupStr);
    } else {
      setExportModalData(backupStr);
    }
  };

  const handleExportCSV = () => {
    const csvStr = exportTransactionsToCSV(transactions, categories);
    const filename = `finance-ally-export-${new Date().toISOString().split('T')[0]}.csv`;

    if (Capacitor.isNativePlatform()) {
      Filesystem.writeFile({
        path: `Finance-Ally/${filename}`,
        data: csvStr,
        directory: Directory.Documents,
        encoding: 'utf8' as any,
        recursive: true
      }).then(writeResult => {
        setCsvStatus(`CSV saved to Documents: Finance-Ally/${filename}`);
        Share.share({
          title: 'Finance-Ally CSV Export',
          url: writeResult.uri,
          dialogTitle: 'Save CSV Export'
        });
      }).catch((err) => {
        console.error('Failed to save CSV to Documents, trying cache:', err);
        Filesystem.writeFile({
          path: filename,
          data: csvStr,
          directory: Directory.Cache,
          encoding: 'utf8' as any
        }).then(writeResult => {
          Share.share({
            title: 'Finance-Ally CSV Export',
            url: writeResult.uri,
            dialogTitle: 'Save CSV Export'
          });
        }).catch(() => {
          navigator.clipboard.writeText(csvStr);
          setCsvStatus('CSV copied to clipboard!');
        });
      });
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvStr);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setCsvStatus('CSV export downloaded successfully!');
    }
  };

  const handleCSVFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const res = importTransactionsFromCSV(content, categories, baseCurrency);
      if (res.success) {
        for (const tx of res.transactions) {
          await addTransaction({
            amount: tx.amount,
            currency: tx.currency,
            categoryId: tx.categoryId,
            customCategoryName: tx.customCategoryName,
            date: tx.date,
            time: tx.time,
            note: tx.note,
            paymentMethod: tx.paymentMethod
          });
        }
        setCsvStatus(`Successfully imported ${res.count} transactions!`);
      } else {
        setCsvStatus(`Error: ${res.errors.join(', ')}`);
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (isEncryptedBackup(content)) {
        setPendingImportContent(content);
        setShowVerifyPinModal(true);
      } else {
        const ok = await importFullDataBackup(content);
        if (ok) {
          await reloadAllData();
          setImportStatus('Backup restored successfully!');
        } else {
          setImportStatus('Error: Invalid JSON backup file.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleVerifyPinAndImport = async (pin: string) => {
    if (!pendingImportContent) return;
    setVerifyPinLoading(true);
    setVerifyPinError('');
    try {
      const decrypted = await decryptJSON(pendingImportContent, pin);
      const ok = await importFullDataBackup(decrypted);
      setVerifyPinLoading(false);
      if (ok) {
        await reloadAllData();
        setShowVerifyPinModal(false);
        setImportStatus('Encrypted backup decrypted and restored!');
      } else {
        setVerifyPinError('Data decrypted but appears invalid. Wrong PIN?');
      }
    } catch {
      setVerifyPinLoading(false);
      setVerifyPinError('Incorrect PIN or corrupted file. Please try again.');
    }
  };

  const handleSavePin = async (pin: string) => {
    setPinActionLoading(true);
    setPinActionError('');
    try {
      await saveExportPin(pin);
      setPinEnabled(true);
      setPinMsg('Backup encryption PIN set successfully!');
      setShowSetPinModal(null);
    } catch {
      setPinActionError('Error saving PIN. Please try again.');
    }
    setPinActionLoading(false);
  };

  const handleManualLocalAutoBackup = async () => {
    setLocalBackupLoading(true);
    setLocalBackupMsg('');
    const res = await createLocalAutoBackup(true);
    setLocalBackupLoading(false);
    setLocalBackupMsg(res.message);
    setLocalSnapshotsState(getLocalSnapshots());
  };

  const handleRestoreSnapshot = async (snap: LocalSnapshotMetadata) => {
    const payload = getSnapshotPayload(snap.id);
    if (!payload) {
      setImportStatus('Snapshot data not found in local cache.');
      return;
    }

    if (snap.isEncrypted) {
      setPendingImportContent(payload);
      setShowVerifyPinModal(true);
    } else {
      const ok = await importFullDataBackup(payload);
      if (ok) {
        await reloadAllData();
        setImportStatus(`Restored from snapshot ${snap.filename}!`);
      } else {
        setImportStatus('Failed to restore snapshot data.');
      }
    }
  };

  const handleDeleteSnapshotItem = (snapId: string) => {
    const updated = deleteLocalSnapshot(snapId);
    setLocalSnapshotsState(updated);
    setLocalBackupMsg('Snapshot removed.');
  };

  const handleDisablePin = () => {
    clearExportPin();
    setPinEnabled(false);
    setPinMsg('Backup encryption disabled. Future exports will be plain JSON.');
  };

  const themes: { id: ThemeMode; label: string; bg: string }[] = [
    { id: 'system', label: 'System Default', bg: 'linear-gradient(135deg, #0e0e0c 50%, #fafaf7 50%)' },
    { id: 'dotgui-dark', label: 'Obsidian Dark', bg: '#0e0e0c' },
    { id: 'dotgui-light', label: 'Warm Light', bg: '#fafaf7' },
    { id: 'cyberpunk', label: 'Cyberpunk Neon', bg: '#05050c' },
    { id: 'emerald', label: 'Emerald Mint', bg: '#04140d' },
    { id: 'sunset', label: 'Sunset Copper', bg: '#120b09' },
  ];

  const fonts: { id: FontFamily; label: string; style: React.CSSProperties }[] = [
    { id: 'geist', label: 'Geist Sans (Clean)', style: { fontFamily: 'Geist, sans-serif' } },
    { id: 'inter', label: 'Inter (Modern)', style: { fontFamily: 'Inter, sans-serif' } },
    { id: 'mono', label: 'JetBrains Mono', style: { fontFamily: 'var(--font-mono)' } },
    { id: 'outfit', label: 'Outfit (Geometric)', style: { fontFamily: 'Outfit, sans-serif' } },
    { id: 'space', label: 'Space Grotesk', style: { fontFamily: 'Space Grotesk, sans-serif' } },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto cursor-pointer animate-in fade-in duration-200"
    >
      {/* Fixed FAB Exit Button (Main Page Only) */}
      {activeSubPage === 'main' && (
        <button
          onClick={onClose}
          className="fixed top-12 right-8 z-[60] p-2.5 rounded-full dotgui-glass border border-hairline text-ink hover:border-ink hover:scale-105 transition-all shadow-xl active:scale-95 cursor-pointer bg-surface-card/90"
          title="Close Settings"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      )}

      {/* Modal Container */}
      <div
        onClick={e => e.stopPropagation()}
        className="max-w-2xl w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-3xl shadow-2xl shadow-black/20 relative cursor-default ring-1 ring-white/10 overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            {activeSubPage !== 'main' && (
              <button
                onClick={() => setActiveSubPage('main')}
                className="p-1.5 rounded-lg border border-hairline bg-surface-soft hover:bg-surface-card text-ink transition-all cursor-pointer mr-1 shrink-0"
                title="Back to Settings Menu"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <SettingsIcon className="w-5 h-5 text-brand-blue shrink-0" />
            <h2 className="text-lg sm:text-xl font-display font-bold text-ink truncate">
              {activeSubPage === 'main' && 'Settings'}
              {activeSubPage === 'security' && 'Security & PIN Protection'}
              {activeSubPage === 'csv' && 'Data & CSV Portability'}
              {activeSubPage === 'backup' && 'Backup & Auto-Sync'}
            </h2>
          </div>

          {/* Sub-Pages In-Card Top-Right Close Button */}
          {activeSubPage !== 'main' && (
            <button
              onClick={onClose}
              className="p-2 text-muted-custom hover:text-ink hover:bg-surface-soft border border-hairline rounded-full cursor-pointer transition-all shrink-0"
              title="Close Settings"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ─── MAIN SETTINGS VIEW ───────────────────────────────────────────────── */}
        {activeSubPage === 'main' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            
            {/* SUB-PAGES NAVIGATION MENU ITEMS */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Security */}
                <button
                  type="button"
                  onClick={() => setActiveSubPage('security')}
                  className="bg-surface-soft hover:bg-surface-card border border-hairline p-4 rounded-xl flex items-center justify-between transition-all cursor-pointer group text-left shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-surface-card border border-hairline text-brand-coral">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-mono font-bold text-ink group-hover:text-brand-coral transition-colors">Security</h4>
                      <p className="text-[10px] font-mono text-muted-custom">Password & PIN</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-custom group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* 2. CSV Data Portability */}
                <button
                  type="button"
                  onClick={() => setActiveSubPage('csv')}
                  className="bg-surface-soft hover:bg-surface-card border border-hairline p-4 rounded-xl flex items-center justify-between transition-all cursor-pointer group text-left shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-surface-card border border-hairline text-brand-mint">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-mono font-bold text-ink group-hover:text-brand-mint transition-colors">CSV Data</h4>
                      <p className="text-[10px] font-mono text-muted-custom">Import & Export</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-custom group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* 3. Backup & Auto-Sync */}
                <button
                  type="button"
                  onClick={() => setActiveSubPage('backup')}
                  className="bg-surface-soft hover:bg-surface-card border border-hairline p-4 rounded-xl flex items-center justify-between transition-all cursor-pointer group text-left shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-surface-card border border-hairline text-brand-yellow">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-mono font-bold text-ink group-hover:text-brand-yellow transition-colors">Database Backup</h4>
                      <p className="text-[10px] font-mono text-muted-custom">JSON & Encryption</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-custom group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* CURRENCY CONVERTER (PRIMARY SECTION ON MAIN PAGE) */}
            <div className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3 h-3 text-brand-blue shrink-0" />
                  <span>Currency Converter</span>
                </h3>
                <button
                  onClick={handleSyncRates}
                  disabled={syncing}
                  className="text-[10px] font-mono border border-brand-blue text-brand-blue px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-surface-card transition-all cursor-pointer font-bold"
                >
                  <RefreshCw className={`w-2.5 h-2.5 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
                  <span>Live</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase">Amount</label>
                  <input
                    type="number"
                    value={calcAmount}
                    onChange={e => setCalcAmount(e.target.value)}
                    className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-sm font-mono text-ink"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase">From</label>
                  <CustomSelect
                    options={TOP_CURRENCIES.map(c => ({ value: c.code, label: `${c.flag} ${c.code}` }))}
                    value={calcFrom}
                    onChange={val => setCalcFrom(val as CurrencyCode)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase">To</label>
                  <CustomSelect
                    options={TOP_CURRENCIES.map(c => ({ value: c.code, label: `${c.flag} ${c.code}` }))}
                    value={calcTo}
                    onChange={val => setCalcTo(val as CurrencyCode)}
                  />
                </div>
              </div>

              <div className="text-center pt-2 border-t border-hairline/60">
                <span className="text-xs font-mono text-muted-custom">Converted Value: </span>
                <span className="text-lg font-display font-bold text-brand-mint">
                  {formatCurrency(convertedValue, calcTo)}
                </span>
              </div>

              {syncMsg && <p className="text-[10px] font-mono text-brand-mint text-center font-bold">{syncMsg}</p>}
            </div>

            {/* SWITCH BASE CURRENCY (PRIMARY SECTION ON MAIN PAGE) */}
            <div className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline">
              <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <RefreshCcw className="w-3.5 h-3.5 text-brand-coral" />
                <span>Switch Base App Currency</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase">Select New Base Currency</label>
                  <CustomSelect
                    options={TOP_CURRENCIES.map(c => ({ value: c.code, label: `${c.flag} ${c.code} (${c.symbol})` }))}
                    value={targetCurrency}
                    onChange={val => setTargetCurrency(val as CurrencyCode)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase">Switch Mode</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSwitchMode('convert')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                        switchMode === 'convert'
                          ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                          : 'bg-surface-card text-body-custom border-hairline'
                      }`}
                    >
                      Convert Amounts
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwitchMode('keep')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                        switchMode === 'keep'
                          ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                          : 'bg-surface-card text-body-custom border-hairline'
                      }`}
                    >
                      Keep Numerical
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleExecuteSwitchCurrency}
                disabled={targetCurrency === baseCurrency || switching}
                className="w-full border border-brand-coral text-brand-coral hover:bg-surface-card disabled:opacity-40 font-mono text-xs sm:text-sm py-3 px-4 rounded-xl transition-all font-bold cursor-pointer"
              >
                {switching ? 'Converting...' : `Switch Base Currency to ${targetCurrency}`}
              </button>
            </div>

            {/* THEME & TYPOGRAPHY (PRIMARY SECTION ON MAIN PAGE) */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-brand-purple" />
                <span>Theme & Typography</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {themes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`p-2.5 rounded-xl border text-xs font-mono flex items-center gap-2 transition-all cursor-pointer ${
                      theme === t.id
                        ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                        : 'border-hairline bg-surface-card text-body-custom hover:border-ink'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full border border-hairline" style={{ background: t.bg }} />
                    <span className="truncate">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="border-t border-hairline/60 pt-2" />

              <div className="grid grid-cols-2 gap-2">
                {fonts.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFontFamily(f.id)}
                    style={f.style}
                    className={`px-3 py-2 rounded-xl text-xs border transition-all text-center truncate cursor-pointer ${
                      fontFamily === f.id
                        ? 'border-brand-blue text-brand-blue font-bold shadow-sm bg-surface-soft'
                        : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ─── SUB-PAGE 1: SECURITY & PIN PROTECTION ──────────────────────────── */}
        {activeSubPage === 'security' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            
            {/* Card 1: Startup Password Protection */}
            <div className="space-y-4 bg-surface-soft p-5 rounded-2xl border border-hairline shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brand-coral" />
                    <span>Startup Password Protection</span>
                  </h3>
                  <p className="text-[11px] font-mono text-muted-custom mt-1">
                    {user?.requirePassword === false
                      ? 'Disabled: App opens directly into your vault without password.'
                      : 'Enabled: App prompts for password/PIN on startup.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleRequirePassword(user?.requirePassword === false ? true : false)}
                  className={`px-4 py-2 rounded-full text-xs font-mono font-bold transition-all border shrink-0 cursor-pointer ${
                    user?.requirePassword === false
                      ? 'bg-surface-card text-muted-custom border-hairline hover:border-ink'
                      : 'border-brand-coral text-brand-coral font-bold shadow-sm bg-surface-soft'
                  }`}
                >
                  {user?.requirePassword === false ? 'Disabled (Enable)' : 'Enabled (Disable)'}
                </button>
              </div>

              {/* Change Password Form */}
              <div className="pt-3 border-t border-hairline/60">
                {!isChangingPass ? (
                  <button
                    type="button"
                    onClick={() => setIsChangingPass(true)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-hairline text-ink hover:border-ink transition-all cursor-pointer"
                  >
                    Change Password
                  </button>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-3 bg-surface-card p-3 rounded-xl border border-hairline">
                    <div className="text-xs font-mono font-bold text-ink flex items-center justify-between">
                      <span>Change Password</span>
                      <button type="button" onClick={() => setIsChangingPass(false)} className="text-muted-custom text-xs cursor-pointer">Cancel</button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-muted-custom uppercase">New Password</label>
                        <div className="relative">
                          <input
                            type={showNewPass ? 'text' : 'password'}
                            value={newPass}
                            onChange={e => setNewPass(e.target.value)}
                            placeholder="New Password"
                            required
                            className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-9 py-1.5 text-xs font-mono text-ink"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPass(!showNewPass)}
                            className="absolute right-2.5 top-2 text-muted-custom hover:text-ink cursor-pointer"
                          >
                            {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-muted-custom uppercase">Confirm Password</label>
                        <div className="relative">
                          <input
                            type={showConfirmPass ? 'text' : 'password'}
                            value={confirmPass}
                            onChange={e => setConfirmPass(e.target.value)}
                            placeholder="Confirm Password"
                            required
                            className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-9 py-1.5 text-xs font-mono text-ink"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPass(!showConfirmPass)}
                            className="absolute right-2.5 top-2 text-muted-custom hover:text-ink cursor-pointer"
                          >
                            {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {passError && <p className="text-[10px] font-mono text-brand-coral">{passError}</p>}
                    {passMsg && <p className="text-[10px] font-mono text-brand-mint font-bold">{passMsg}</p>}

                    <button
                      type="submit"
                      className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft text-xs font-mono font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      Update Password
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Card 2: Backup Export Encryption PIN */}
            <div className="space-y-4 bg-surface-soft p-5 rounded-2xl border border-hairline shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-blue" />
                    <span>Backup Export & Snapshot Encryption PIN</span>
                  </h3>
                  <p className="text-[11px] font-mono text-muted-custom mt-1">
                    {pinEnabled
                      ? 'Enabled: Backups and automated local snapshots are AES-256 encrypted with your PIN.'
                      : 'Disabled: Backups export as plain readable JSON.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={pinEnabled ? handleDisablePin : () => setShowSetPinModal('set')}
                  className={`px-4 py-2 rounded-full text-xs font-mono font-bold transition-all border shrink-0 cursor-pointer ${
                    pinEnabled
                      ? 'border-brand-blue text-brand-blue bg-surface-soft shadow-sm'
                      : 'bg-surface-card text-muted-custom border-hairline hover:border-ink'
                  }`}
                >
                  {pinEnabled ? 'Enabled (Disable)' : 'Disabled (Enable)'}
                </button>
              </div>

              {pinEnabled && (
                <button
                  type="button"
                  onClick={() => setShowSetPinModal('change')}
                  className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-hairline text-ink hover:border-ink transition-all cursor-pointer"
                >
                  Change Export PIN
                </button>
              )}
              {pinMsg && <p className="text-[10px] font-mono text-brand-mint font-bold">{pinMsg}</p>}
            </div>

          </div>
        )}

        {/* ─── SUB-PAGE 2: DATA & CSV PORTABILITY ─────────────────────────────── */}
        {activeSubPage === 'csv' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-4 bg-surface-soft p-5 rounded-xl border border-hairline">
              <div className="flex items-center gap-2 border-b border-hairline/60 pb-3">
                <FileSpreadsheet className="w-4 h-4 text-brand-mint shrink-0" />
                <h3 className="text-xs font-mono font-bold text-ink uppercase">CSV Import & Export Engine</h3>
              </div>
              <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                Export your transaction timeline into standard CSV format for Excel/Google Sheets, or import historical bank statements.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {/* CSV Export */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="border border-brand-mint text-brand-mint hover:bg-surface-card font-mono text-xs py-3 px-4 rounded-xl transition-all cursor-pointer font-bold flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>Export to CSV</span>
                </button>

                {/* CSV Import */}
                <button
                  type="button"
                  onClick={() => csvFileInputRef.current?.click()}
                  className="border border-brand-blue text-brand-blue hover:bg-surface-card font-mono text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer font-bold"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span className="truncate">Import Bank Statement CSV</span>
                </button>
                <input
                  type="file"
                  ref={csvFileInputRef}
                  onChange={handleCSVFileUpload}
                  accept=".csv"
                  className="hidden"
                />
              </div>

              {csvStatus && (
                <div className="p-3 rounded-xl bg-surface-card border border-hairline text-center text-xs font-mono font-bold text-ink">
                  {csvStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SUB-PAGE 3: BACKUP & AUTO-SYNC ────────────────────────────────── */}
        {activeSubPage === 'backup' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            
            {/* MANUAL JSON BACKUP */}
            <div className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline">
              <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-brand-yellow shrink-0" />
                  <h3 className="text-xs font-mono font-bold text-ink uppercase">Manual Database Backup (.JSON)</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full border border-hairline bg-surface-card text-[10px] font-mono font-bold text-muted-custom">
                  .JSON
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleExport}
                  className="bg-surface-card hover:border-ink border border-hairline text-ink font-mono text-xs py-2.5 px-3 rounded-xl transition-all cursor-pointer font-bold text-center active:scale-95 shadow-sm"
                >
                  Export Backup
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-brand-blue text-brand-blue hover:bg-surface-card font-mono text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer font-bold active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>Restore Backup</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".json"
                  className="hidden"
                />
              </div>

              {importStatus && <p className="text-[10px] font-mono text-brand-mint text-center font-bold">{importStatus}</p>}
            </div>

            {/* AUTOMATED OFFLINE LOCAL BACKUP */}
            <div className="space-y-4 bg-surface-soft p-4 rounded-xl border border-hairline">
              <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-brand-mint shrink-0" />
                  <h3 className="text-xs font-mono font-bold text-ink uppercase">Automated Offline Local Backup</h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-brand-mint border border-brand-mint/30 px-3 py-0.5 rounded-full">
                  OFFLINE
                </span>
              </div>

              {/* Schedule Select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Auto-Backup Frequency</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'daily', label: 'Daily' },
                    { id: 'weekly', label: 'Weekly' },
                    { id: 'monthly', label: 'Monthly' },
                    { id: 'off', label: 'Off (Manual)' }
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const updated = saveLocalAutoBackupConfig({ schedule: s.id as any, enabled: s.id !== 'off' });
                        setLocalAutoConfig(updated);
                        setLocalBackupMsg(`Schedule updated to ${s.label}.`);
                      }}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                        localAutoConfig.schedule === s.id
                          ? 'border-brand-mint text-brand-mint bg-surface-card shadow-sm'
                          : 'bg-surface-card border-hairline text-muted-custom hover:text-ink'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Repeat Day for Monthly */}
              {localAutoConfig.schedule === 'monthly' && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase font-bold shrink-0">Repeat on Day:</label>
                  <CustomSelect
                    direction="down"
                    options={Array.from({ length: 31 }, (_, i) => ({ value: (i + 1).toString(), label: `Day ${i + 1}` }))}
                    value={localAutoConfig.monthlyDay.toString()}
                    onChange={val => {
                      const updated = saveLocalAutoBackupConfig({ monthlyDay: parseInt(val) });
                      setLocalAutoConfig(updated);
                    }}
                    className="w-28 shrink-0"
                  />
                </div>
              )}

              {/* Compact PIN Encryption Toggle for Backups */}
              <div className="flex items-center justify-between border-t border-hairline/60 pt-3">
                <div>
                  <span className="text-[11px] font-mono font-bold text-ink block">AES-256 Backup PIN Encryption</span>
                  <span className="text-[10px] font-mono text-muted-custom block">Encrypts all database backups & snapshots</span>
                </div>
                <button
                  type="button"
                  onClick={pinEnabled ? handleDisablePin : () => setShowSetPinModal('set')}
                  className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold transition-all border shrink-0 cursor-pointer ${
                    pinEnabled
                      ? 'border-brand-blue text-brand-blue bg-surface-soft shadow-sm'
                      : 'bg-surface-card text-muted-custom border-hairline hover:border-ink'
                  }`}
                >
                  {pinEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {/* Perform Manual Snapshot Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleManualLocalAutoBackup}
                  disabled={localBackupLoading}
                  className="w-full border border-brand-mint text-brand-mint hover:bg-surface-card font-mono text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${localBackupLoading ? 'animate-spin' : ''}`} />
                  <span>{localBackupLoading ? 'Creating Snapshot...' : 'Create Local Snapshot Now'}</span>
                </button>
              </div>

              {localBackupMsg && <p className="text-[10px] font-mono text-brand-mint text-center font-bold">{localBackupMsg}</p>}

              {/* Local Snapshots List */}
              {localSnapshots.length > 0 && (
                <div className="pt-3 border-t border-hairline/60 space-y-2">
                  <span className="text-[10px] font-mono font-bold text-muted-custom uppercase block">
                    Saved Offline Local Snapshots ({localSnapshots.length})
                  </span>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {localSnapshots.map(snap => (
                      <div key={snap.id} className="bg-surface-card p-2.5 rounded-xl border border-hairline flex items-center justify-between text-xs font-mono">
                        <div className="truncate mr-2">
                          <span className="font-bold text-ink block truncate">{snap.filename}</span>
                          <span className="text-[9.5px] text-muted-custom">{snap.timestamp} • {(snap.sizeBytes / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {snap.isEncrypted && (
                            <span className="text-[9px] font-bold text-brand-blue border border-brand-blue/30 px-1.5 py-0.5 rounded">
                              AES-256
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRestoreSnapshot(snap)}
                            className="text-[10px] font-bold text-brand-mint border border-brand-mint/30 px-2 py-1 rounded hover:bg-surface-soft cursor-pointer"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSnapshotItem(snap.id)}
                            className="text-[10px] text-muted-custom hover:text-brand-coral p-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Export Modal overlay for JSON */}
        {exportModalData && (
          <div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
            onClick={() => setExportModalData(null)}
          >
            <div
              className="max-w-md w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-2xl p-6 shadow-2xl shadow-black/20 space-y-4 relative cursor-default ring-1 ring-white/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-brand-yellow" /> Export Backup
                  {pinEnabled && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 border border-brand-blue text-brand-blue rounded-full font-bold">AES-256</span>}
                </span>
                <button type="button" onClick={() => setExportModalData(null)} className="p-1 text-muted-custom hover:text-ink cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                {pinEnabled
                  ? 'Backup encryption is ON. Enter your Export PIN to encrypt the file, then choose a save method.'
                  : 'Export is ready! Choose a destination. On Android, Share is recommended if file downloads are blocked.'}
              </p>
              {pinEnabled ? (
                <ExportWithPinFlow
                  plainData={exportModalData}
                  onEncrypted={async (encryptedStr) => {
                    const filename = `finance-ally-backup-${new Date().toISOString().split('T')[0]}.json`;
                    if (Capacitor.isNativePlatform()) {
                      try {
                        await Filesystem.writeFile({
                          path: `Finance-Ally/Backups/${filename}`,
                          data: encryptedStr,
                          directory: Directory.Documents,
                          encoding: 'utf8' as any,
                          recursive: true
                        });
                        const writeResult = await Filesystem.writeFile({ path: filename, data: encryptedStr, directory: Directory.Cache, encoding: 'utf8' as any });
                        await Share.share({ title: 'Finance-Ally Encrypted Backup', url: writeResult.uri, dialogTitle: 'Save encrypted backup' });
                      } catch { navigator.clipboard.writeText(encryptedStr); }
                    } else {
                      const a = document.createElement('a');
                      a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(encryptedStr);
                      a.download = filename;
                      document.body.appendChild(a); a.click(); a.remove();
                    }
                    setImportStatus('Encrypted backup exported!');
                    setExportModalData(null);
                  }}
                  onCancel={() => setExportModalData(null)}
                />
              ) : (
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const filename = `finance-ally-backup-${new Date().toISOString().split('T')[0]}.json`;
                        if (Capacitor.isNativePlatform()) {
                          const writeResult = await Filesystem.writeFile({ path: filename, data: exportModalData, directory: Directory.Cache, encoding: 'utf8' as any });
                          await Share.share({ title: 'Finance-Ally Backup', url: writeResult.uri, dialogTitle: 'Select destination to save JSON file' });
                          setImportStatus('Backup saved and shared!');
                        } else if (navigator.share) {
                          await navigator.share({ title: 'Finance-Ally Backup', text: exportModalData });
                          setImportStatus('Backup shared!');
                        } else {
                          navigator.clipboard.writeText(exportModalData);
                          setImportStatus('JSON backup copied to clipboard!');
                        }
                        setExportModalData(null);
                      } catch (err: any) { setImportStatus(`Share error: ${err.message || err}`); }
                    }}
                    className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    Share and Choose Destination
                  </button>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(exportModalData); setImportStatus('JSON backup copied to clipboard!'); setExportModalData(null); }}
                    className="w-full bg-surface-soft border border-hairline text-ink hover:border-ink font-mono text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    Copy JSON to Clipboard
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const filename = `finance-ally-backup-${new Date().toISOString().split('T')[0]}.json`;
                        if (Capacitor.isNativePlatform()) {
                          await Filesystem.writeFile({
                            path: `Finance-Ally/Backups/${filename}`,
                            data: exportModalData,
                            directory: Directory.Documents,
                            encoding: 'utf8' as any,
                            recursive: true
                          });
                          setImportStatus(`File saved to Documents: Finance-Ally/Backups/${filename}`);
                        } else {
                          const a = document.createElement('a');
                          a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(exportModalData);
                          a.download = filename;
                          document.body.appendChild(a); a.click(); a.remove();
                          setImportStatus('JSON file download triggered!');
                        }
                        setExportModalData(null);
                      } catch (err: any) { setImportStatus(`Download failed: ${err.message || err}`); }
                    }}
                    className="w-full border border-hairline text-muted-custom hover:text-ink font-mono text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    Save File to Local Storage
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showSetPinModal && (
          <PinModal
            mode={showSetPinModal}
            title={showSetPinModal === 'set' ? 'Set Backup Encryption PIN' : 'Change Export PIN'}
            description="This PIN will AES-256 encrypt your backup exports. You need it to restore from an encrypted backup."
            onConfirm={handleSavePin}
            onCancel={() => { setShowSetPinModal(null); setPinActionError(''); }}
            loading={pinActionLoading}
            error={pinActionError}
          />
        )}

        {showVerifyPinModal && (
          <PinModal
            mode="verify"
            title="Enter Backup Encryption PIN"
            description="This backup is AES-256 encrypted. Enter the correct PIN to decrypt and restore your data."
            onConfirm={handleVerifyPinAndImport}
            onCancel={() => { setShowVerifyPinModal(false); setVerifyPinError(''); setPendingImportContent(null); }}
            loading={verifyPinLoading}
            error={verifyPinError}
          />
        )}

        </div>
      </div>
    </div>
  );
};

const ExportWithPinFlow: React.FC<{
  plainData: string;
  onEncrypted: (encryptedStr: string) => void;
  onCancel: () => void;
}> = ({ plainData, onEncrypted, onCancel }) => {
  const [pin, setPin] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleGo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!pin) { setErr('Enter your export PIN.'); return; }
    setLoading(true);
    try {
      const ok = await verifyExportPin(pin);
      if (!ok) { setErr('Incorrect PIN. Please try again.'); setLoading(false); return; }
      const encrypted = await encryptJSON(plainData, pin);
      setLoading(false);
      onEncrypted(encrypted);
    } catch {
      setLoading(false);
      setErr('Encryption failed. Please try again.');
    }
  };

  return (
    <form onSubmit={handleGo} className="space-y-3 pt-2">
      <div className="space-y-1">
        <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Your Export PIN</label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="enter pin"
            autoFocus
            className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-10 py-2 text-sm font-mono text-ink focus:outline-none focus:border-ink tracking-widest"
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-2 text-muted-custom hover:text-ink cursor-pointer">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {err && <p className="text-[10px] font-mono text-brand-coral font-bold">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-xl border border-hairline text-muted-custom text-xs font-mono font-bold hover:border-ink cursor-pointer">Cancel</button>
        <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl border border-brand-blue text-brand-blue text-xs font-mono font-bold hover:bg-surface-soft cursor-pointer disabled:opacity-50">
          {loading ? 'Encrypting...' : 'Encrypt and Export'}
        </button>
      </div>
      <p className="text-[10px] font-mono text-muted-custom text-center">The encrypted file will be saved after PIN verification.</p>
    </form>
  );
};
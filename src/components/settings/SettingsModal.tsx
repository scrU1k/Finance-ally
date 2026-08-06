import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useTheme, ThemeMode, FontFamily } from '../../context/ThemeContext';
import { TOP_CURRENCIES, convertCurrencyAmount, formatCurrency } from '../../services/currency';
import { exportFullDataBackup, importFullDataBackup } from '../../services/db';
import { CustomSelect } from '../common/CustomSelect';
import { CurrencyCode } from '../../types';
import { X, Settings as SettingsIcon, RefreshCw, Palette, Database, RefreshCcw, ArrowRightLeft, Lock, Eye, EyeOff, Upload } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, toggleRequirePassword, changePassword } = useAuth();
  const { baseCurrency, switchBaseCurrency, syncForexRates, forexRates } = useFinance();
  const { theme, setTheme, minimalSub, setMinimalSub, fontFamily, setFontFamily } = useTheme();

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

  const handleExport = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const backupStr = exportFullDataBackup();
    setExportModalData(backupStr);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = importFullDataBackup(content);
        if (ok) {
          setImportStatus('Backup restored successfully! Reloading...');
          setTimeout(() => window.location.reload(), 1200);
        } else {
          setImportStatus('Error: Invalid JSON backup file.');
        }
      }
    };
    reader.readAsText(file);
  };

  const themes: { id: ThemeMode; label: string; bg: string }[] = [
    { id: 'dotgui-dark', label: 'Obsidian Dark', bg: '#0e0e0c' },
    { id: 'dotgui-light', label: 'Warm Light', bg: '#fafaf7' },
    { id: 'cyberpunk', label: 'Cyberpunk Neon', bg: '#05050c' },
    { id: 'emerald', label: 'Emerald Mint', bg: '#04140d' },
    { id: 'sunset', label: 'Sunset Copper', bg: '#120b09' },
    { id: 'minimal', label: 'Minimal', bg: '#475569' },
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
      className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto cursor-pointer"
    >
      {/* Fixed FAB Exit Cross Button (stuck to screen layer, positioned lower for aesthetic) */}
      <button
        onClick={onClose}
        className="fixed top-12 right-8 z-[60] p-2.5 rounded-full dotgui-glass border border-hairline text-ink hover:border-ink hover:scale-105 transition-all shadow-xl active:scale-95 cursor-pointer bg-surface-card/90"
        title="Close Settings"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      {/* Modal Card Window */}
      <div
        onClick={e => e.stopPropagation()}
        className="max-w-2xl w-full dotgui-glass border border-hairline rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto relative cursor-default"
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4 pr-12">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-brand-blue" />
            <h2 className="text-xl font-display font-bold text-ink">Settings</h2>
          </div>
        </div>

        {/* 1. APP SECURITY & PASSWORD MANAGEMENT */}
        <div className="space-y-4 bg-surface-soft p-4 rounded-xl border border-hairline">
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

          {/* Change Password Form Toggle */}
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
                  {/* New Password Input */}
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

                  {/* Confirm New Password Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-custom uppercase">Confirm New Password</label>
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

        {/* 2. CURRENCY CONVERTER */}
        <div className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1">
              <ArrowRightLeft className="w-2.5 h-2.5 text-brand-blue shrink-0" />
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

          {syncMsg && <p className="text-[10px] font-mono text-brand-mint text-center">{syncMsg}</p>}
        </div>

        {/* 3. SWITCH APP BASE CURRENCY (CONVERT vs KEEP) */}
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

        {/* 4. THEME & FONT CUSTOMIZATION */}
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
                <span className="w-3 h-3 rounded-full border border-hairline" style={{ backgroundColor: t.bg }} />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Secondary Sub-menu for Minimal Theme Selection */}
          {theme === 'minimal' && (
            <div className="bg-surface-soft p-3 rounded-xl border border-hairline/60 space-y-1.5 animate-in fade-in duration-150">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Minimal Mode Options</label>
              <div className="flex gap-1.5">
                {[
                  { id: 'light', label: 'Minimal Light' },
                  { id: 'dark', label: 'Minimal Dark' },
                  { id: 'system', label: 'System Theme' },
                ].map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setMinimalSub(sub.id as any)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] sm:text-xs font-mono border transition-all cursor-pointer ${
                      minimalSub === sub.id
                        ? 'border-ink text-ink font-bold bg-surface-card shadow-sm'
                        : 'bg-surface-soft text-body-custom border-hairline hover:border-ink'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hair-thin Section Divider above Typography */}
          <div className="border-t border-hairline/60 pt-2" />

          {/* 2-Column Typography Grid */}
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

        {/* 5. BACKUP & FILE IMPORT DATA */}
        <div className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-brand-yellow" />
              <span>Offline Backup & Restore</span>
            </h3>
            {/* .JSON static indicator badge */}
            <span className="px-2.5 py-0.5 rounded-full border border-hairline bg-surface-card text-[10px] font-mono font-bold text-muted-custom">
              .JSON
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Export Button */}
            <button
              type="button"
              onClick={handleExport}
              className="bg-surface-card hover:border-ink border border-hairline text-ink font-mono text-xs py-2 rounded-xl transition-all cursor-pointer font-bold text-center active:scale-95 shadow-sm"
            >
              Export
            </button>

            {/* Import Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="border border-brand-blue text-brand-blue hover:bg-surface-card font-mono text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer font-bold active:scale-95"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
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

      {exportModalData && (
        <div
          className="fixed inset-0 z-[70] bg-canvas/65 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExportModalData(null)}
        >
          <div
            className="max-w-md w-full dotgui-glass border border-hairline rounded-2xl p-6 shadow-2xl space-y-4 bg-surface-card/95 backdrop-blur-xl relative cursor-default"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <span className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-brand-yellow" /> Export Backup
              </span>
              <button
                type="button"
                onClick={() => setExportModalData(null)}
                className="p-1 text-muted-custom hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
              Export is ready! Please select a destination / method below. On mobile/Android devices, copying or sharing text is highly recommended if file downloads are blocked.
            </p>

            <div className="space-y-2 pt-2">
              {/* Option 1: Share JSON String */}
              {navigator.share && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.share({
                        title: 'Finance-Ally Backup',
                        text: exportModalData,
                      });
                      setImportStatus('Backup shared successfully!');
                      setExportModalData(null);
                    } catch {
                      // ignore
                    }
                  }}
                  className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  📤 Share Backup String (System Dialog)
                </button>
              )}

              {/* Option 2: Copy to Clipboard */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(exportModalData);
                  setImportStatus('JSON backup copied to clipboard!');
                  setExportModalData(null);
                }}
                className="w-full bg-surface-soft border border-hairline text-ink hover:border-ink font-mono text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                📋 Copy JSON to Clipboard
              </button>

              {/* Option 3: Standard File Download */}
              <button
                type="button"
                onClick={() => {
                  const encodedData = 'data:text/json;charset=utf-8,' + encodeURIComponent(exportModalData);
                  const downloadAnchor = document.createElement('a');
                  downloadAnchor.setAttribute('href', encodedData);
                  downloadAnchor.setAttribute('download', `finance-ally-backup-${new Date().toISOString().split('T')[0]}.json`);
                  document.body.appendChild(downloadAnchor);
                  downloadAnchor.click();
                  downloadAnchor.remove();
                  setImportStatus('JSON file download triggered!');
                  setExportModalData(null);
                }}
                className="w-full border border-hairline text-muted-custom hover:text-ink font-mono text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                💾 Download JSON File
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { useAuth, suppressLockForSystemPicker, resetSystemPickerBypass } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useTheme, ThemeMode, FontFamily } from '../../context/ThemeContext';
import { TOP_CURRENCIES, convertCurrencyAmount, formatCurrency } from '../../services/currency';
import { exportFullDataBackup, importFullDataBackup } from '../../services/db';
import { exportTransactionsToCSV, importTransactionsFromCSV } from '../../services/csvParser';
import { encryptJSON, decryptJSON, decryptJSONWithRecoveryKey, isEncryptedBackup, setupExportPin, changeExportPin, recoverExportPin, resetExportPin, hasExportPin, clearExportPin, verifyExportPin, hasExportPinRecoveryEscrow } from '../../services/cryptoService';
import { verifyUserPassword } from '../../services/auth';
import { RecoveryKeyModal } from '../common/RecoveryKeyModal';
import {
  getLocalAutoBackupConfig,
  saveLocalAutoBackupConfig,
  getLocalSnapshots,
  createLocalAutoBackup,
  getSnapshotPayload,
  deleteLocalSnapshot,
  syncSnapshotsFromFilesystem,
  getRetentionLimit,
  LocalAutoBackupConfig,
  LocalSnapshotMetadata
} from '../../services/localAutoBackupService';
import { PinModal } from '../common/PinModal';
import { CustomSelect } from '../common/CustomSelect';
import { CurrencyCode } from '../../types';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  hasMasterPin,
  setMasterPin,
  changeVaultMasterPin,
  verifyMasterPin,
  isVaultBackup,
  recoverVaultMasterPin,
  hasMasterPinRecoveryEscrow
} from '../../services/passwordVaultService';
import {
  rotateGlobalRecoveryKey,
  hasGlobalRecoveryKey,
  verifyGlobalRecoveryKey
} from '../../services/recoveryService';
import { exportDiagnosticReportToFile } from '../../services/diagnosticLogger';
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
  KeyRound,
  Info,
  ExternalLink,
  Shield,
  User,
  Edit2,
  Check,
  Key,
  AlertTriangle,
  FileText,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsSubPage = 'main' | 'security' | 'csv' | 'backup' | 'privacy';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, toggleRequirePassword, changePassword, updateUsername } = useAuth();
  const {
    baseCurrency,
    switchBaseCurrency,
    syncForexRates,
    forexRates,
    transactions,
    categories,
    addTransaction,
    includeTripExpensesInTimeline,
    setIncludeTripExpensesInTimeline,
  } = useFinance();
  const { theme, appearanceMode, colorPalette, setAppearanceMode, setColorPalette, fontFamily, setFontFamily } = useTheme();

  // Active Sub-Page Navigation State
  const [activeSubPage, setActiveSubPage] = useState<SettingsSubPage>('main');
  const [privacyTab, setPrivacyTab] = useState<'privacy' | 'terms'>('privacy');

  // Username Edit State
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameMsg, setUsernameMsg] = useState('');

  const handleSaveUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    updateUsername(usernameInput.trim());
    setIsEditingUsername(false);
    setUsernameMsg('Username updated successfully!');
    setTimeout(() => setUsernameMsg(''), 3000);
  };

  // Always reset to main settings view whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSubPage('main');
      setPrivacyTab('privacy');
    }
  }, [isOpen]);

  // Handle hardware back button inside Settings subpages
  useEffect(() => {
    if (!isOpen || activeSubPage === 'main' || !Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => void } | null = null;

    CapApp.addListener('backButton', () => {
      setActiveSubPage('main');
    }).then(h => {
      listenerHandle = h;
    }).catch(() => {});

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [isOpen, activeSubPage]);

  // Sync missing snapshots from native filesystem when backup tab opens
  useEffect(() => {
    if (activeSubPage === 'backup') {
      syncSnapshotsFromFilesystem().then(list => setLocalSnapshotsState(list));
    }
  }, [activeSubPage]);

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
  const [currentPass, setCurrentPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');

  // Password Manager Master PIN state
  const [isEditingPwdVaultPin, setIsEditingPwdVaultPin] = useState(false);
  const [pwdVaultOldPin, setPwdVaultOldPin] = useState('');
  const [pwdVaultNewPin, setPwdVaultNewPin] = useState('');
  const [pwdVaultConfirmPin, setPwdVaultConfirmPin] = useState('');
  const [pwdVaultRecoveryKeyInput, setPwdVaultRecoveryKeyInput] = useState('');
  const [pwdVaultPinError, setPwdVaultPinError] = useState('');
  const [pwdVaultPinSuccess, setPwdVaultPinSuccess] = useState('');

  const handleSavePwdVaultPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdVaultPinError('');
    setPwdVaultPinSuccess('');

    const exists = hasMasterPin();
    if (exists) {
      if (!pwdVaultOldPin) {
        setPwdVaultPinError('Current Master PIN is required');
        return;
      }
      const ok = await verifyMasterPin(pwdVaultOldPin);
      if (!ok) {
        setPwdVaultPinError('Current Master PIN is incorrect');
        return;
      }
    }

    if (!pwdVaultNewPin || pwdVaultNewPin.length < 4) {
      setPwdVaultPinError('New PIN must be at least 4 digits');
      return;
    }

    if (pwdVaultNewPin !== pwdVaultConfirmPin) {
      setPwdVaultPinError('New PINs do not match');
      return;
    }

    const hasEscrow = hasMasterPinRecoveryEscrow();
    const hasGlobalKey = hasGlobalRecoveryKey();
    const enteredKey = pwdVaultRecoveryKeyInput.trim();

    // If an escrow currently exists OR user has a Global Recovery Key, require the recovery key
    if (exists && hasEscrow && !enteredKey) {
      setPwdVaultPinError(
        'Your vault has emergency recovery escrow enabled. Please enter your Global Recovery Key to refresh the escrow for your new Master PIN.'
      );
      return;
    }

    if (!exists && hasGlobalKey && !enteredKey) {
      setPwdVaultPinError('Global Recovery Key is required to enable recovery escrow for your Password Vault.');
      return;
    }

    if (enteredKey) {
      const isKeyValid = await verifyGlobalRecoveryKey(enteredKey);
      if (!isKeyValid) {
        setPwdVaultPinError('Invalid Global Recovery Key. Please check and re-enter.');
        return;
      }
    }

    try {
      if (exists) {
        await changeVaultMasterPin(pwdVaultOldPin, pwdVaultNewPin, enteredKey || undefined);
      } else {
        await setMasterPin(pwdVaultNewPin, enteredKey || undefined);
      }
      setPwdVaultPinSuccess(
        exists
          ? (enteredKey ? 'Master PIN and recovery escrow updated successfully!' : 'Master PIN updated successfully!')
          : (enteredKey ? 'Master PIN and recovery escrow created successfully!' : 'Master PIN created successfully!')
      );
      setIsEditingPwdVaultPin(false);
      setPwdVaultOldPin('');
      setPwdVaultNewPin('');
      setPwdVaultConfirmPin('');
      setPwdVaultRecoveryKeyInput('');
    } catch (err: any) {
      setPwdVaultPinError(err?.message || 'Failed to update Master PIN. Operation aborted.');
    }
  };

  // App Password Emergency Recovery State
  const [isRecoveringAppPassword, setIsRecoveringAppPassword] = useState(false);
  const [appPasswordRecoveryKey, setAppPasswordRecoveryKey] = useState('');
  const [appPasswordRecoveryNewPass, setAppPasswordRecoveryNewPass] = useState('');
  const [appPasswordRecoveryConfirmPass, setAppPasswordRecoveryConfirmPass] = useState('');
  const [appPasswordRecoveryError, setAppPasswordRecoveryError] = useState('');
  const [appPasswordRecoverySuccess, setAppPasswordRecoverySuccess] = useState('');

  const handleRecoverAppPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppPasswordRecoveryError('');
    setAppPasswordRecoverySuccess('');

    if (!appPasswordRecoveryKey.trim()) {
      setAppPasswordRecoveryError('Recovery Key is required.');
      return;
    }
    if (!appPasswordRecoveryNewPass || appPasswordRecoveryNewPass.length < 4) {
      setAppPasswordRecoveryError('New password must be at least 4 characters.');
      return;
    }
    if (appPasswordRecoveryNewPass !== appPasswordRecoveryConfirmPass) {
      setAppPasswordRecoveryError('Passwords do not match.');
      return;
    }

    const isKeyValid = await verifyGlobalRecoveryKey(appPasswordRecoveryKey.trim());
    if (!isKeyValid) {
      setAppPasswordRecoveryError('Invalid Recovery Key. Please check and try again.');
      return;
    }

    const ok = await changePassword(appPasswordRecoveryNewPass);
    if (ok) {
      setAppPasswordRecoverySuccess('Password reset successfully!');
      setIsRecoveringAppPassword(false);
      setAppPasswordRecoveryKey('');
      setAppPasswordRecoveryNewPass('');
      setAppPasswordRecoveryConfirmPass('');
    } else {
      setAppPasswordRecoveryError('Failed to update password.');
    }
  };

  // Password Vault Emergency Recovery State
  const [isRecoveringPwdVault, setIsRecoveringPwdVault] = useState(false);
  const [pwdVaultRecoveryKey, setPwdVaultRecoveryKey] = useState('');
  const [pwdVaultRecoveryNewPin, setPwdVaultRecoveryNewPin] = useState('');
  const [pwdVaultRecoveryConfirmPin, setPwdVaultRecoveryConfirmPin] = useState('');
  const [pwdVaultRecoveryError, setPwdVaultRecoveryError] = useState('');
  const [pwdVaultRecoverySuccess, setPwdVaultRecoverySuccess] = useState('');

  const handleRecoverPwdVaultPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdVaultRecoveryError('');
    setPwdVaultRecoverySuccess('');

    if (!pwdVaultRecoveryKey.trim()) {
      setPwdVaultRecoveryError('Recovery Key is required.');
      return;
    }
    if (!pwdVaultRecoveryNewPin || pwdVaultRecoveryNewPin.length < 4) {
      setPwdVaultRecoveryError('New PIN must be at least 4 digits.');
      return;
    }
    if (pwdVaultRecoveryNewPin !== pwdVaultRecoveryConfirmPin) {
      setPwdVaultRecoveryError('PINs do not match.');
      return;
    }

    try {
      const ok = await recoverVaultMasterPin(pwdVaultRecoveryKey.trim(), pwdVaultRecoveryNewPin);
      if (ok) {
        setPwdVaultRecoverySuccess('Master PIN recovered and updated successfully!');
        setIsRecoveringPwdVault(false);
        setPwdVaultRecoveryKey('');
        setPwdVaultRecoveryNewPin('');
        setPwdVaultRecoveryConfirmPin('');
      } else {
        setPwdVaultRecoveryError('Invalid Recovery Key. Please try again.');
      }
    } catch {
      setPwdVaultRecoveryError('Recovery failed. Please check your key.');
    }
  };

  // Rotate Recovery Key State
  const [showRotateWarningModal, setShowRotateWarningModal] = useState(false);
  const [rotateCurrentRecoveryKey, setRotateCurrentRecoveryKey] = useState('');
  const [rotateAuthPassword, setRotateAuthPassword] = useState('');
  const [rotateAuthError, setRotateAuthError] = useState('');
  const [rotateLoading, setRotateLoading] = useState(false);

  // Backup Import Recovery State
  const [isRecoveringBackupImport, setIsRecoveringBackupImport] = useState(false);

  const handleConfirmRotateRecoveryKey = async () => {
    setRotateAuthError('');
    if (!rotateCurrentRecoveryKey.trim()) {
      setRotateAuthError('Please enter your Current Recovery Key to authorize migration.');
      return;
    }
    if (user?.requirePassword) {
      if (!rotateAuthPassword) {
        setRotateAuthError('Please enter your App Password to authorize rotation.');
        return;
      }
      setRotateLoading(true);
      const valid = await verifyUserPassword(rotateAuthPassword);
      if (!valid) {
        setRotateLoading(false);
        setRotateAuthError('Incorrect App Password.');
        return;
      }
    }

    setRotateLoading(true);
    try {
      const username = user?.username || 'USER';
      const newKey = await rotateGlobalRecoveryKey(rotateCurrentRecoveryKey.trim(), username);
      setShowRotateWarningModal(false);
      setRotateAuthPassword('');
      setRotateCurrentRecoveryKey('');
      setRotateAuthError('');
      setGeneratedRecoveryKey(newKey);
    } catch (err: any) {
      setRotateAuthError(err?.message || 'Failed to rotate recovery key.');
    } finally {
      setRotateLoading(false);
    }
  };

  const handleRecoveryImportAndSetPin = async (recoveryKey: string, newPin?: string) => {
    if (!pendingImportContent) return;
    if (!newPin || newPin.length < 4) {
      setVerifyPinError('New Backup PIN must be at least 4 characters.');
      return;
    }
    setVerifyPinLoading(true);
    setVerifyPinError('');
    try {
      const decrypted = await decryptJSONWithRecoveryKey(pendingImportContent, recoveryKey.trim());
      const ok = await importFullDataBackup(decrypted);
      if (!ok) {
        setVerifyPinLoading(false);
        setVerifyPinError('Data decrypted but schema validation failed. File may be corrupted or from an incompatible version.');
        return;
      }
      const username = user?.username || 'USER';
      await setupExportPin(newPin, username, recoveryKey.trim());
      setPinEnabled(true);
      setVerifyPinLoading(false);
      setIsRecoveringBackupImport(false);
      setShowVerifyPinModal(false);
      setPendingImportContent(null);
      setImportStatus('Backup restored and new Backup PIN set! Restarting app...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setVerifyPinLoading(false);
      setVerifyPinError(err?.message || 'Failed to restore backup with Recovery Key.');
    }
  };

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

  // Diagnostic Log Exporter State
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false);
  const [diagnosticExportMessage, setDiagnosticExportMessage] = useState<string | null>(null);

  const handleExportDiagnostics = async () => {
    setIsExportingDiagnostics(true);
    setDiagnosticExportMessage(null);
    try {
      const res = await exportDiagnosticReportToFile();
      if (res.success) {
        setDiagnosticExportMessage(`Saved: ${res.filename} to ${res.destination}`);
      } else {
        setDiagnosticExportMessage(res.error || 'Failed to export diagnostic logs');
      }
    } catch (err: any) {
      setDiagnosticExportMessage(err?.message || 'Failed to export diagnostic logs');
    } finally {
      setIsExportingDiagnostics(false);
    }
  };

  // Export PIN / Encryption state
  const [pinEnabled, setPinEnabled] = useState<boolean>(hasExportPin);
  const [showSetPinModal, setShowSetPinModal] = useState<'set' | 'change' | 'recover' | 'reset' | 'disable' | 'recover-disable' | null>(null);
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string | null>(null);
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

    if (!currentPass) {
      setPassError('Current password is required.');
      return;
    }

    const isCurrentValid = await verifyUserPassword(currentPass);
    if (!isCurrentValid) {
      setPassError('Incorrect Current Password. If forgotten, use "Forgot Password?" below.');
      return;
    }

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
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setIsChangingPass(false);
    } else {
      setPassError('Error updating password.');
    }
  };

  const handleExport = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      setImportStatus('Generating backup...');
      let backupStr = await exportFullDataBackup();
      if (pinEnabled && hasExportPin()) {
        backupStr = await encryptJSON(backupStr, '', !!localAutoConfig.gzipCompression);
      }
      setPendingImportContent(null);
      setExportModalData(backupStr);
      setImportStatus('');
    } catch (err: any) {
      console.error('Export backup failed:', err);
      setImportStatus(`Export failed: ${err?.message || 'Error generating backup.'}`);
    }
  };

  const handleExportCSV = () => {
    suppressLockForSystemPicker();
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
    suppressLockForSystemPicker();
    const file = e.target.files?.[0];
    if (!file) {
      resetSystemPickerBypass();
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) {
        resetSystemPickerBypass();
        return;
      }

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
      resetSystemPickerBypass();
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    suppressLockForSystemPicker();
    const file = e.target.files?.[0];
    if (!file) {
      resetSystemPickerBypass();
      return;
    }

    if (!file.name.endsWith('.json') && !file.name.endsWith('.enc')) {
      setImportStatus('Error: Please select a valid .json or .json.enc backup file.');
      resetSystemPickerBypass();
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) {
        resetSystemPickerBypass();
        return;
      }

      if (isVaultBackup(content)) {
        setImportStatus('Notice: This file is a dedicated Password Vault backup. Please restore it in Password Manager > Backup & Restore.');
        resetSystemPickerBypass();
        return;
      }

      if (isEncryptedBackup(content)) {
        setPendingImportContent(content);
        setShowVerifyPinModal(true);
      } else {
        try {
          const ok = await importFullDataBackup(content);
          if (ok) {
            setImportStatus('Backup restored! Restarting app...');
            setTimeout(() => window.location.reload(), 1200);
          } else {
            setImportStatus('Error: Backup file structure is corrupted or invalid.');
            resetSystemPickerBypass();
          }
        } catch {
          setImportStatus('Security Alert: Backup file is corrupted or has been altered. Restore rejected.');
          resetSystemPickerBypass();
        }
      }
    };
    reader.readAsText(file);
  };

  const handleVerifyPinAndImport = async (pin: string) => {
    setVerifyPinLoading(true);
    setVerifyPinError('');

    if (!pendingImportContent) return;
    try {
      const decrypted = await decryptJSON(pendingImportContent, pin);
      const ok = await importFullDataBackup(decrypted);
      setVerifyPinLoading(false);
      if (ok) {
        setShowVerifyPinModal(false);
        setImportStatus('Encrypted backup decrypted and restored! Restarting app...');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setVerifyPinError('Data decrypted but schema validation failed. File may be corrupted or from an incompatible version.');
      }
    } catch (err: any) {
      setVerifyPinLoading(false);
      const msg = err?.message || '';
      if (msg.includes('tampered') || msg.includes('integrity check failed') || msg.includes('Corrupt')) {
        setVerifyPinError('Security Alert: This backup file is corrupted or has been tampered with. Decryption rejected.');
      } else if (msg.includes('Incorrect PIN')) {
        setVerifyPinError('Incorrect Backup PIN. Please verify and try again.');
      } else {
        setVerifyPinError(msg || 'Incorrect PIN or corrupted file. Please try again.');
      }
    }
  };

  const handleSavePin = async (pin1: string, pin2?: string, recoveryKey?: string) => {
    setPinActionLoading(true);
    setPinActionError('');
    try {
      const hasEscrow = hasExportPinRecoveryEscrow();
      const hasGlobalKey = hasGlobalRecoveryKey();
      const enteredRecKey = recoveryKey?.trim();

      if ((showSetPinModal === 'set' || showSetPinModal === 'reset') && hasGlobalKey && !enteredRecKey) {
        setPinActionLoading(false);
        setPinActionError('Global Recovery Key is required to create recovery escrow for your backup password.');
        return;
      }

      if (showSetPinModal === 'change' && hasEscrow && !enteredRecKey) {
        setPinActionLoading(false);
        setPinActionError('Your backup has recovery escrow enabled. Please enter your Global Recovery Key to refresh recovery escrow.');
        return;
      }

      if (enteredRecKey) {
        const isKeyValid = await verifyGlobalRecoveryKey(enteredRecKey);
        if (!isKeyValid) {
          setPinActionLoading(false);
          setPinActionError('Invalid Global Recovery Key. Please re-check.');
          return;
        }
      }

      if (showSetPinModal === 'set' || showSetPinModal === 'reset') {
        const username = user?.username || 'USER';
        if (showSetPinModal === 'set') {
          await setupExportPin(pin1, username, enteredRecKey || undefined);
        } else {
          await resetExportPin(pin1, username, enteredRecKey || undefined);
        }
        setPinEnabled(true);
        setPinMsg(
          showSetPinModal === 'set'
            ? (enteredRecKey ? 'Backup password & recovery escrow set successfully!' : 'Backup password set successfully!')
            : (enteredRecKey ? 'Backup password & recovery escrow reset successfully.' : 'Backup password reset successfully.')
        );
        setShowSetPinModal(null);
      } else if (showSetPinModal === 'change') {
        const ok = await changeExportPin(pin1, pin2!, enteredRecKey || undefined);
        if (ok) {
          setPinMsg('Backup password changed successfully!');
          setShowSetPinModal(null);
        } else {
          setPinActionError('Incorrect Current Backup Password.');
        }
      } else if (showSetPinModal === 'recover') {
        const ok = await recoverExportPin(pin1, pin2!);
        if (ok) {
          setPinMsg('Backup password recovered and updated!');
          setShowSetPinModal(null);
        } else {
          setPinActionError('Invalid Recovery Key.');
        }
      } else if (showSetPinModal === 'disable') {
        const ok = await verifyExportPin(pin1);
        if (ok) {
          clearExportPin();
          setPinEnabled(false);
          setPinMsg('Backup encryption disabled. Future exports will be plain JSON.');
          setShowSetPinModal(null);
        } else {
          setPinActionError('Incorrect Current Backup PIN.');
        }
      } else if (showSetPinModal === 'recover-disable') {
        const isKeyValid = await verifyGlobalRecoveryKey(pin1.trim());
        if (isKeyValid) {
          clearExportPin();
          setPinEnabled(false);
          setPinMsg('Backup encryption disabled using Recovery Key.');
          setShowSetPinModal(null);
        } else {
          setPinActionError('Invalid Recovery Key.');
        }
      }
    } catch (err: any) {
      setPinActionError(err.message || 'Error processing PIN request. Please try again.');
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
    setImportStatus('Loading snapshot data...');
    const payload = await getSnapshotPayload(snap);
    if (!payload) {
      setImportStatus('Snapshot data not found in local cache.');
      return;
    }

    // Always gate behind PIN if one is set — snapshots are plain JSON but
    // we still verify the user is authorised before overwriting all data.
    if (hasExportPin()) {
      setPendingImportContent(payload);
      setShowVerifyPinModal(true);
      return;
    }

    if (snap.isEncrypted) {
      setPendingImportContent(payload);
      setShowVerifyPinModal(true);
    } else {
      const ok = await importFullDataBackup(payload);
      if (ok) {
        setImportStatus(`Restored from snapshot ${snap.filename}! Restarting app...`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setImportStatus('Failed to restore snapshot data.');
      }
    }
  };

  const handleDeleteSnapshotItem = async (snapId: string) => {
    const updated = await deleteLocalSnapshot(snapId);
    setLocalSnapshotsState(updated);
    setLocalBackupMsg('Snapshot removed.');
  };

  const handleDisablePin = () => {
    setPinActionError('');
    setShowSetPinModal('disable');
  };

  const palettes = [
    {
      id: 'default' as const,
      name: 'Default',
      desc: 'Obsidian & Warm Sand',
      swatch: appearanceMode === 'light' ? '#fafaf7' : appearanceMode === 'dark' ? '#0e0e0c' : 'linear-gradient(135deg, #0e0e0c 50%, #fafaf7 50%)',
      accent: appearanceMode === 'light' ? '#0f766e' : '#2dd4bf',
    },
    {
      id: 'serene' as const,
      name: 'Serene Sage',
      desc: 'Matte Pebble & Soft Slate',
      swatch: appearanceMode === 'light' ? '#f2f0ec' : appearanceMode === 'dark' ? '#1a1918' : 'linear-gradient(135deg, #1a1918 50%, #f2f0ec 50%)',
      accent: appearanceMode === 'light' ? '#6e6659' : '#b5aba0',
    },
    {
      id: 'emerald' as const,
      name: 'Emerald Mint',
      desc: 'Matte Eucalyptus & Deep Pine',
      swatch: appearanceMode === 'light' ? '#f1f5f2' : appearanceMode === 'dark' ? '#131a16' : 'linear-gradient(135deg, #131a16 50%, #f1f5f2 50%)',
      accent: appearanceMode === 'light' ? '#4a9478' : '#8fd5ba',
    },
    {
      id: 'sunset' as const,
      name: 'Sunset Copper',
      desc: 'Matte Terracotta & Warm Bronze',
      swatch: appearanceMode === 'light' ? '#f8f3ef' : appearanceMode === 'dark' ? '#1a1513' : 'linear-gradient(135deg, #1a1513 50%, #f8f3ef 50%)',
      accent: appearanceMode === 'light' ? '#be5a41' : '#e07960',
    },
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
          className="fixed top-8 right-8 z-[60] p-2.5 rounded-full dotgui-glass border border-hairline text-ink hover:border-ink hover:scale-105 transition-all shadow-xl active:scale-95 cursor-pointer bg-surface-card/90"
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
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-display font-bold text-ink truncate flex items-center gap-2">
                <span>
                  {activeSubPage === 'main' && 'Settings'}
                  {activeSubPage === 'security' && 'Security & PIN Protection'}
                  {activeSubPage === 'csv' && 'Data & CSV Portability'}
                  {activeSubPage === 'backup' && 'Backup & Auto-Sync'}
                  {activeSubPage === 'privacy' && 'Privacy Policy & Terms'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-purple/15 text-brand-purple border border-brand-purple/30 font-bold shrink-0">
                  v3.0
                </span>
              </h2>
              {activeSubPage === 'main' && (
                <button
                  onClick={() => setActiveSubPage('privacy')}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-custom hover:text-brand-blue transition-colors cursor-pointer"
                  title="View Privacy Policy & Terms of Service"
                >
                  <Info className="w-3.5 h-3.5 text-brand-blue" />
                  <span>Privacy and Terms</span>
                </button>
              )}
            </div>
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
            
            {/* Account Profile Card */}
            <div className="bg-surface-soft p-4 rounded-2xl border border-hairline shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-blue/15 border border-brand-blue/30 text-brand-blue flex items-center justify-center font-bold font-mono text-xs shrink-0">
                    {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                      <span>Account Profile</span>
                    </h3>
                    <p className="text-[11px] font-mono text-muted-custom">
                      Display Name: <span className="font-semibold text-ink">{user?.username || 'My Account'}</span>
                    </p>
                  </div>
                </div>

                {!isEditingUsername && (
                  <button
                    type="button"
                    onClick={() => {
                      setUsernameInput(user?.username || '');
                      setIsEditingUsername(true);
                      setUsernameMsg('');
                    }}
                    className="px-3 py-1.5 text-xs font-mono font-bold bg-surface-card hover:bg-surface-soft border border-hairline text-ink rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
                  >
                    <Edit2 className="w-3 h-3 text-brand-blue" />
                    <span>Change</span>
                  </button>
                )}
              </div>

              {isEditingUsername && (
                <form onSubmit={handleSaveUsername} className="space-y-3 bg-surface-card p-3.5 rounded-xl border border-hairline animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono text-muted-custom uppercase">Enter New Username</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingUsername(false);
                        setUsernameMsg('');
                      }}
                      className="text-muted-custom hover:text-ink text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      placeholder="Enter new username"
                      maxLength={30}
                      className="flex-1 min-w-0 w-full px-3 py-2 bg-canvas border border-hairline rounded-xl text-xs font-mono text-ink focus:outline-none focus:border-brand-blue"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!usernameInput.trim()}
                      title="Save username"
                      aria-label="Save username"
                      className="w-9 h-9 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-40 text-white rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                  {usernameMsg && (
                    <p className="text-[11px] font-mono text-brand-mint">{usernameMsg}</p>
                  )}
                </form>
              )}
            </div>

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

              {/* Appearance Mode: Adaptive | Light | Dark */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase">Appearance Mode</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-surface-soft border border-hairline rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAppearanceMode('adaptive')}
                    className={`py-2 px-2 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      appearanceMode === 'adaptive'
                        ? 'border border-hairline/80 text-ink font-bold shadow-xs bg-surface-card'
                        : 'text-muted-custom hover:text-ink hover:bg-surface-card/40'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Adaptive</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAppearanceMode('light')}
                    className={`py-2 px-2 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      appearanceMode === 'light'
                        ? 'border border-hairline/80 text-ink font-bold shadow-xs bg-surface-card'
                        : 'text-muted-custom hover:text-ink hover:bg-surface-card/40'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAppearanceMode('dark')}
                    className={`py-2 px-2 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      appearanceMode === 'dark'
                        ? 'border border-hairline/80 text-ink font-bold shadow-xs bg-surface-card'
                        : 'text-muted-custom hover:text-ink hover:bg-surface-card/40'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark</span>
                  </button>
                </div>
              </div>

              {/* Color Scheme: Default | Serene Sage | Emerald Mint | Sunset Copper */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase">Color Palette</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {palettes.map(p => {
                    const isActive = colorPalette === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setColorPalette(p.id)}
                        className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 transition-all cursor-pointer text-left ${
                          isActive
                            ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                            : 'border-hairline bg-surface-card text-body-custom hover:border-ink/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-5 h-5 rounded-full border border-hairline shrink-0 shadow-2xs flex items-center justify-center"
                            style={{ background: p.swatch }}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ background: p.accent }} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{p.name}</div>
                            <div className="text-[10px] text-muted-custom font-normal truncate">{p.desc}</div>
                          </div>
                        </div>

                        {isActive && (
                          <div className="w-4 h-4 rounded-full bg-ink text-surface-card flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
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

            {/* TIMELINE PREFERENCES */}
            <div className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                    <span>Trip Expenses in Timeline</span>
                  </h3>
                  <p className="text-[11px] font-mono text-muted-custom">
                    Include expenses logged under trips in the main dashboard & period totals
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeTripExpensesInTimeline(!includeTripExpensesInTimeline)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    includeTripExpensesInTimeline ? 'bg-brand-mint' : 'bg-surface-card border border-hairline'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      includeTripExpensesInTimeline ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ─── SUB-PAGE 1: SECURITY & PIN PROTECTION ──────────────────────────── */}
        {activeSubPage === 'security' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            
            {/* Card 0: Account Username */}
            <div className="space-y-3 bg-surface-soft p-5 rounded-2xl border border-hairline shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-brand-blue" />
                    <span>Account Username</span>
                  </h3>
                  <p className="text-[11px] font-mono text-muted-custom mt-0.5">
                    The name displayed on the lock screen and in your local vault.
                  </p>
                </div>
              </div>

              {!isEditingUsername ? (
                <div className="flex items-center justify-between bg-surface-card p-3 rounded-xl border border-hairline">
                  <span className="font-mono text-sm font-semibold text-ink">{user?.username || 'My Account'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUsernameInput(user?.username || '');
                      setIsEditingUsername(true);
                      setUsernameMsg('');
                    }}
                    className="px-3 py-1 text-xs font-mono font-bold bg-surface-soft hover:bg-surface-card border border-hairline text-ink rounded-lg transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3 text-brand-blue" />
                    <span>Change</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveUsername} className="space-y-3 bg-surface-card p-3.5 rounded-xl border border-hairline">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono text-muted-custom uppercase">New Username</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingUsername(false);
                        setUsernameMsg('');
                      }}
                      className="text-muted-custom hover:text-ink text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      placeholder="Enter new username"
                      maxLength={30}
                      className="flex-1 min-w-0 w-full px-3 py-2 bg-canvas border border-hairline rounded-xl text-xs font-mono text-ink focus:outline-none focus:border-brand-blue"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!usernameInput.trim()}
                      title="Save username"
                      aria-label="Save username"
                      className="w-9 h-9 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-40 text-white rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                  {usernameMsg && (
                    <p className="text-[11px] font-mono text-brand-mint">{usernameMsg}</p>
                  )}
                </form>
              )}
            </div>

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
                  onClick={() => toggleRequirePassword(user?.requirePassword === false)}
                  className={`px-4 py-2 rounded-full text-xs font-mono font-bold transition-all border shrink-0 cursor-pointer ${
                    user?.requirePassword === false
                      ? 'bg-surface-card text-muted-custom border-hairline hover:border-ink'
                      : 'border-brand-coral text-brand-coral font-bold shadow-sm bg-surface-soft'
                  }`}
                >
                  {user?.requirePassword === false ? 'Disabled (Enable)' : 'Enabled (Disable)'}
                </button>
              </div>

              {/* Change / Recover Password Form */}
              <div className="pt-3 border-t border-hairline/60">
                {!isChangingPass && !isRecoveringAppPassword ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsChangingPass(true)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-hairline text-ink hover:border-ink transition-all cursor-pointer"
                    >
                      Change Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRecoveringAppPassword(true);
                        setAppPasswordRecoveryError('');
                        setAppPasswordRecoverySuccess('');
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-hairline text-brand-blue hover:border-brand-blue transition-all cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                ) : isRecoveringAppPassword ? (
                  <form onSubmit={handleRecoverAppPassword} className="space-y-3 bg-surface-card p-3 rounded-xl border border-hairline">
                    <div className="text-xs font-mono font-bold text-ink flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-brand-yellow">
                        <Key className="w-3.5 h-3.5" />
                        <span>Recover App Password</span>
                      </span>
                      <button type="button" onClick={() => setIsRecoveringAppPassword(false)} className="text-muted-custom text-xs cursor-pointer">Cancel</button>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-muted-custom uppercase block">Global Recovery Key</label>
                      <input
                        type="text"
                        value={appPasswordRecoveryKey}
                        onChange={e => setAppPasswordRecoveryKey(e.target.value)}
                        placeholder="FAK-xxxx-xxxx-xxxx-xxxx"
                        required
                        className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink tracking-wider"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-muted-custom uppercase block">New Password</label>
                        <input
                          type="password"
                          value={appPasswordRecoveryNewPass}
                          onChange={e => setAppPasswordRecoveryNewPass(e.target.value)}
                          placeholder="Min 4 characters"
                          required
                          className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-muted-custom uppercase block">Confirm New Password</label>
                        <input
                          type="password"
                          value={appPasswordRecoveryConfirmPass}
                          onChange={e => setAppPasswordRecoveryConfirmPass(e.target.value)}
                          placeholder="Repeat password"
                          required
                          className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                        />
                      </div>
                    </div>

                    {appPasswordRecoveryError && <p className="text-[10px] font-mono text-brand-coral">{appPasswordRecoveryError}</p>}
                    {appPasswordRecoverySuccess && <p className="text-[10px] font-mono text-brand-mint font-bold">{appPasswordRecoverySuccess}</p>}

                    <button
                      type="submit"
                      className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft text-xs font-mono font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      Reset Password
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-3 bg-surface-card p-3 rounded-xl border border-hairline">
                    <div className="text-xs font-mono font-bold text-ink flex items-center justify-between">
                      <span>Change Password</span>
                      <button type="button" onClick={() => {
                        setIsChangingPass(false);
                        setCurrentPass('');
                        setNewPass('');
                        setConfirmPass('');
                        setPassError('');
                        setPassMsg('');
                      }} className="text-muted-custom text-xs cursor-pointer">Cancel</button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono text-muted-custom uppercase">Current Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsChangingPass(false);
                            setIsRecoveringAppPassword(true);
                          }}
                          className="text-[10px] font-mono text-brand-blue hover:underline cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showCurrentPass ? 'text' : 'password'}
                          value={currentPass}
                          onChange={e => setCurrentPass(e.target.value)}
                          placeholder="Current Password"
                          required
                          className="w-full bg-surface-soft border border-hairline rounded-xl pl-3 pr-9 py-1.5 text-xs font-mono text-ink"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPass(!showCurrentPass)}
                          className="absolute right-2.5 top-2 text-muted-custom hover:text-ink cursor-pointer"
                        >
                          {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
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

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangingPass(false);
                          setIsRecoveringAppPassword(true);
                        }}
                        className="text-[11px] font-mono text-brand-blue hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                      <button
                        type="submit"
                        className="border border-brand-blue text-brand-blue hover:bg-surface-soft text-xs font-mono font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer"
                      >
                        Update Password
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Card 2: Password Manager Master PIN */}
            <div className="space-y-4 bg-surface-soft p-5 rounded-2xl border border-hairline shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-brand-purple" />
                    <span>Master PIN for Passwords</span>
                  </h3>
                  <p className="text-[11px] font-mono text-muted-custom mt-1">
                    {hasMasterPin()
                      ? 'Enforced: Protects & double-encrypts all stored password cards.'
                      : 'Not Set: Create a Master PIN to secure your password cards.'}
                  </p>
                </div>

                <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-brand-purple/15 text-brand-purple border border-brand-purple/30 shrink-0">
                  Always Enforced
                </span>
              </div>

              <div className="pt-3 border-t border-hairline/60">
                {!isEditingPwdVaultPin && !isRecoveringPwdVault ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPwdVaultOldPin('');
                        setPwdVaultNewPin('');
                        setPwdVaultConfirmPin('');
                        setPwdVaultPinError('');
                        setPwdVaultPinSuccess('');
                        setIsEditingPwdVaultPin(true);
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-hairline text-ink hover:border-ink transition-all cursor-pointer"
                    >
                      {hasMasterPin() ? 'Change Master PIN' : 'Create Master PIN'}
                    </button>
                    {hasMasterPin() && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsRecoveringPwdVault(true);
                          setPwdVaultRecoveryError('');
                          setPwdVaultRecoverySuccess('');
                        }}
                        className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-hairline text-brand-purple hover:border-brand-purple transition-all cursor-pointer"
                      >
                        Forgot PIN?
                      </button>
                    )}
                  </div>
                ) : isRecoveringPwdVault ? (
                  <form onSubmit={handleRecoverPwdVaultPin} className="space-y-3 bg-surface-card p-3 rounded-xl border border-hairline">
                    <div className="text-xs font-mono font-bold text-ink flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-brand-purple">
                        <Key className="w-3.5 h-3.5" />
                        <span>Recover Vault Master PIN</span>
                      </span>
                      <button type="button" onClick={() => setIsRecoveringPwdVault(false)} className="text-muted-custom text-xs cursor-pointer">Cancel</button>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-muted-custom uppercase block">Global Recovery Key</label>
                      <input
                        type="text"
                        value={pwdVaultRecoveryKey}
                        onChange={e => setPwdVaultRecoveryKey(e.target.value)}
                        placeholder="FAK-xxxx-xxxx-xxxx-xxxx"
                        required
                        className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink tracking-wider"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-muted-custom uppercase block">New Master PIN</label>
                        <input
                          type="password"
                          value={pwdVaultRecoveryNewPin}
                          onChange={e => setPwdVaultRecoveryNewPin(e.target.value)}
                          placeholder="Min 4 digits"
                          required
                          className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-muted-custom uppercase block">Confirm New Master PIN</label>
                        <input
                          type="password"
                          value={pwdVaultRecoveryConfirmPin}
                          onChange={e => setPwdVaultRecoveryConfirmPin(e.target.value)}
                          placeholder="Repeat PIN"
                          required
                          className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                        />
                      </div>
                    </div>

                    {pwdVaultRecoveryError && <p className="text-[10px] font-mono text-brand-coral">{pwdVaultRecoveryError}</p>}
                    {pwdVaultRecoverySuccess && <p className="text-[10px] font-mono text-brand-mint font-bold">{pwdVaultRecoverySuccess}</p>}

                    <button
                      type="submit"
                      className="w-full border border-brand-purple text-brand-purple hover:bg-surface-soft text-xs font-mono font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      Reset Master PIN
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSavePwdVaultPin} className="space-y-3 bg-surface-card p-3 rounded-xl border border-hairline">
                    <div className="text-xs font-mono font-bold text-ink flex items-center justify-between">
                      <span>{hasMasterPin() ? 'Change Master PIN' : 'Create Master PIN'}</span>
                      <button type="button" onClick={() => setIsEditingPwdVaultPin(false)} className="text-muted-custom text-xs cursor-pointer">Cancel</button>
                    </div>

                    <div className="space-y-2">
                      {hasMasterPin() && (
                        <div>
                          <label className="text-[10px] font-mono text-muted-custom uppercase block">Current Master PIN</label>
                          <input
                            type="password"
                            value={pwdVaultOldPin}
                            onChange={e => setPwdVaultOldPin(e.target.value)}
                            placeholder="Current Master PIN"
                            required
                            className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-mono text-muted-custom uppercase block">New Master PIN</label>
                          <input
                            type="password"
                            value={pwdVaultNewPin}
                            onChange={e => setPwdVaultNewPin(e.target.value)}
                            placeholder="New PIN (min 4 digits)"
                            required
                            className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-mono text-muted-custom uppercase block">Confirm New Master PIN</label>
                          <input
                            type="password"
                            value={pwdVaultConfirmPin}
                            onChange={e => setPwdVaultConfirmPin(e.target.value)}
                            placeholder="Confirm New PIN"
                            required
                            className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-mono text-muted-custom uppercase flex justify-between">
                          <span>
                            Global Recovery Key{' '}
                            {hasMasterPin() && hasMasterPinRecoveryEscrow()
                              ? '(Required to update escrow)'
                              : hasGlobalRecoveryKey()
                              ? '(Required for escrow)'
                              : '(Recommended)'}
                          </span>
                          <span className="text-brand-purple lowercase font-normal">enables reset</span>
                        </label>
                        <input
                          type="text"
                          value={pwdVaultRecoveryKeyInput}
                          onChange={e => setPwdVaultRecoveryKeyInput(e.target.value)}
                          placeholder="FAK-xxxx-xxxx-xxxx-xxxx"
                          required={(hasMasterPin() && hasMasterPinRecoveryEscrow()) || hasGlobalRecoveryKey()}
                          className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink tracking-wider"
                        />
                        <p className="text-[9px] font-mono text-muted-custom mt-0.5">
                          {hasMasterPin() && hasMasterPinRecoveryEscrow()
                            ? 'Required so your emergency recovery escrow is re-encrypted with this new Master PIN.'
                            : 'Required to create emergency recovery escrow so you can recover passwords if you forget this PIN.'}
                        </p>
                      </div>
                    </div>

                    {pwdVaultPinError && <p className="text-[10px] font-mono text-brand-coral">{pwdVaultPinError}</p>}
                    {pwdVaultPinSuccess && <p className="text-[10px] font-mono text-brand-mint font-bold">{pwdVaultPinSuccess}</p>}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      {hasMasterPin() && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingPwdVaultPin(false);
                            setIsRecoveringPwdVault(true);
                          }}
                          className="text-[11px] font-mono text-brand-purple hover:underline cursor-pointer"
                        >
                          Forgot PIN?
                        </button>
                      )}
                      <button
                        type="submit"
                        className="border border-brand-purple text-brand-purple hover:bg-surface-soft text-xs font-mono font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer ml-auto"
                      >
                        {hasMasterPin() ? 'Update Master PIN' : 'Set Master PIN'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Card 3: Backup Export Encryption PIN */}
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSetPinModal('change')}
                    className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-brand-blue text-brand-blue hover:bg-surface-soft transition-all cursor-pointer"
                  >
                    Change Export PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSetPinModal('reset')}
                    className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-brand-coral text-brand-coral hover:bg-brand-coral/10 transition-all cursor-pointer"
                  >
                    Hard Reset PIN
                  </button>
                </div>
              )}
              {pinMsg && <p className="text-[10px] font-mono text-brand-mint font-bold">{pinMsg}</p>}
            </div>

            {/* Card 4: Master Security Recovery Key */}
            <div className="space-y-4 bg-surface-soft p-5 rounded-2xl border border-hairline shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-mono font-bold text-ink uppercase flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-brand-yellow" />
                    <span>Master Security Recovery Key</span>
                  </h3>
                  <p className="text-[11px] font-mono text-muted-custom mt-1">
                    Zero-Knowledge Offline Key: Never saved on this device. Serves as universal emergency fallback for App Lock, Password Vault, and Backup PIN.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30 shrink-0">
                  {hasGlobalRecoveryKey() ? 'Active (Offline)' : 'Uninitialized'}
                </span>
              </div>

              <div className="pt-3 border-t border-hairline/60 flex items-center justify-between gap-3">
                <p className="text-[11px] font-mono text-muted-custom">
                  Keep your 16-character key written down or in a password manager. Need a new one?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowRotateWarningModal(true);
                    setRotateAuthPassword('');
                    setRotateAuthError('');
                  }}
                  className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-surface-card border border-brand-yellow text-brand-yellow hover:bg-brand-yellow/10 transition-all cursor-pointer shrink-0"
                >
                  {hasGlobalRecoveryKey() ? 'Rotate Recovery Key' : 'Generate Recovery Key'}
                </button>
              </div>
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
                  onClick={() => { suppressLockForSystemPicker(); csvFileInputRef.current?.click(); }}
                  className="border border-brand-blue text-brand-blue hover:bg-surface-card font-mono text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer font-bold"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span className="truncate">Import Bank Statement CSV</span>
                </button>
                <input
                  type="file"
                  ref={csvFileInputRef}
                  onChange={handleCSVFileUpload}
                  accept=".csv,text/csv,*/*"
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
                  onClick={() => { suppressLockForSystemPicker(); fileInputRef.current?.click(); }}
                  className="border border-brand-blue text-brand-blue hover:bg-surface-card font-mono text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer font-bold active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>Restore Backup</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="*/*"
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

              {/* Divider above Backup File Limit */}
              <div className="border-t border-hairline my-2.5" />

              {/* Snapshot Retention Limit */}
              <div className="flex items-center justify-between py-1">
                <label className="text-[11px] font-mono text-ink font-bold block">
                  Backup file limit
                </label>
                <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline shrink-0">
                  {[5, 10].map(limit => {
                    const isSelected = (localAutoConfig.retentionLimit || 10) === limit;
                    return (
                      <button
                        key={limit}
                        type="button"
                        onClick={async () => {
                          const updated = saveLocalAutoBackupConfig({ retentionLimit: limit });
                          setLocalAutoConfig(updated);
                          const refreshed = await syncSnapshotsFromFilesystem();
                          setLocalSnapshotsState(refreshed);
                          setLocalBackupMsg(`Backup file limit set to ${limit}. Storage cleaned.`);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-brand-mint/20 border border-brand-mint text-brand-mint shadow-sm'
                            : 'text-muted-custom hover:text-ink border border-transparent'
                        }`}
                      >
                        {limit}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Divider between Backup File Limit and Gzip Lossless Compression */}
              <div className="border-t border-hairline my-2.5" />

              {/* Gzip Lossless Compression Toggle */}
              <div className="flex items-center justify-between py-1">
                <label className="text-[11px] font-mono text-ink font-bold block">
                  Gzip Lossless Compression
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={localAutoConfig.gzipCompression}
                  onClick={() => {
                    const nextVal = !localAutoConfig.gzipCompression;
                    const updated = saveLocalAutoBackupConfig({ gzipCompression: nextVal });
                    setLocalAutoConfig(updated);
                    setLocalBackupMsg(nextVal ? 'Gzip compression enabled for future backups.' : 'Gzip compression disabled.');
                  }}
                  className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    localAutoConfig.gzipCompression ? 'bg-brand-mint' : 'bg-surface-soft border border-hairline'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      localAutoConfig.gzipCompression ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Divider below Gzip Lossless Compression */}
              <div className="border-t border-hairline my-2.5" />

              {/* Compact PIN Encryption Toggle for Backups */}
              <div className="flex items-center justify-between pt-1">
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

              {!pinEnabled && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex gap-2.5 items-start">
                  <Shield className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-mono text-ink leading-relaxed">
                    <strong className="text-amber-500">Unencrypted Notice:</strong> Without a Backup PIN configured, automated local snapshots and exports are stored as plaintext JSON on device. Enable Backup PIN above to encrypt them with AES-256-GCM.
                  </p>
                </div>
              )}

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

              {localBackupMsg && (
                <p className={`text-[10px] font-mono text-center font-bold ${
                  localBackupMsg.toLowerCase().includes('error') || localBackupMsg.toLowerCase().includes('fail')
                    ? 'text-red-400'
                    : 'text-brand-mint'
                }`}>
                  {localBackupMsg}
                </p>
              )}

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
                          {snap.isEncrypted ? (
                            <span className="text-[9px] font-bold text-brand-blue border border-brand-blue/30 px-1.5 py-0.5 rounded">
                              AES-256
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded">
                              PLAINTEXT
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

            {/* LOCALIZED DIAGNOSTIC EXPORTER */}
            <div className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline">
              <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-purple shrink-0" />
                  <h3 className="text-xs font-mono font-bold text-ink uppercase">Diagnostic & Crash Logs</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full border border-hairline bg-surface-card text-[10px] font-mono font-bold text-muted-custom">
                  OFFLINE
                </span>
              </div>

              <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                Export diagnostic metadata and recent error logs directly to your device storage (Documents/Finance-Ally/Logs). No personal financial data, transactions, or passwords are ever included.
              </p>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleExportDiagnostics}
                  disabled={isExportingDiagnostics}
                  className="w-full bg-surface-card hover:border-ink border border-hairline text-ink font-mono text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer font-bold active:scale-95 shadow-sm disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                  <span>{isExportingDiagnostics ? 'Exporting...' : 'Export Diagnostic Logs'}</span>
                </button>
              </div>

              {diagnosticExportMessage && (
                <div className="p-2.5 bg-brand-mint/10 border border-brand-mint/30 rounded-lg text-[11px] font-mono text-brand-mint flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{diagnosticExportMessage}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── 5. PRIVACY POLICY & TERMS SUB-PAGE ────────────────────────────────── */}
        {activeSubPage === 'privacy' && (
          <div className="space-y-5 animate-in fade-in duration-150 max-w-full">
            {/* Top Navigation Segmented Tabs */}
            <div className="flex bg-surface-soft p-1 rounded-xl border border-hairline gap-1">
              <button
                type="button"
                onClick={() => setPrivacyTab('privacy')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  privacyTab === 'privacy'
                    ? 'bg-surface-card text-brand-teal shadow-sm border border-hairline'
                    : 'text-muted-custom hover:text-ink'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Privacy Policy</span>
              </button>
              <button
                type="button"
                onClick={() => setPrivacyTab('terms')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  privacyTab === 'terms'
                    ? 'bg-surface-card text-brand-blue shadow-sm border border-hairline'
                    : 'text-muted-custom hover:text-ink'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Terms of Service</span>
              </button>
            </div>

            {/* TAB 1: PRIVACY POLICY */}
            {privacyTab === 'privacy' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Header / Summary Card */}
                <div className="p-4 rounded-2xl bg-brand-teal/10 border border-brand-teal/30 space-y-2">
                  <div className="flex items-center gap-2 text-brand-teal font-display font-bold text-sm sm:text-base">
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                    <span>Zero-Knowledge & Offline Architecture</span>
                  </div>
                  <p className="text-xs font-mono text-muted-custom leading-relaxed">
                    Finance-Ally is designed so your data never leaves your device. Everything is processed, encrypted, and stored locally.
                  </p>
                </div>

                {/* Quick Policy Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-teal"></span>
                      Zero Data Collection
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      No ownership, operation, or maintenance of remote databases or telemetry servers. No analytics or tracking.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-blue"></span>
                      Argon2id & AES-256 Vault
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      Password vault credentials and backups are encrypted with AES-256-GCM and memory-hard Argon2id key derivation, with zero-knowledge Global Recovery Key protection.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-purple"></span>
                      On-Device Intelligence
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      109 pre-compiled financial rules and on-device vector embeddings run locally in Web Worker threads.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-yellow"></span>
                      Forex & Network Transparency
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      Public currency rates and initial embedding models are the only outbound requests. No personal or financial records are ever transmitted.
                    </p>
                  </div>
                </div>

                {/* Local Storage & Snapshots Card */}
                <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                  <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-mint"></span>
                    Local-Only Storage & Snapshots
                  </div>
                  <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                    Transactions, categories, and budgets reside strictly within local browser/device sandboxes. Automated snapshots are saved locally and are encrypted with AES-256-GCM when a Backup PIN is configured.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: TERMS OF SERVICE */}
            {privacyTab === 'terms' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Header / Summary Card */}
                <div className="p-4 rounded-2xl bg-brand-blue/10 border border-brand-blue/30 space-y-2">
                  <div className="flex items-center gap-2 text-brand-blue font-display font-bold text-sm sm:text-base">
                    <FileText className="w-5 h-5 shrink-0" />
                    <span>Terms of Service & Usage Conditions</span>
                  </div>
                  <p className="text-xs font-mono text-muted-custom leading-relaxed">
                    Please review the terms, limitations, and user responsibilities governing personal use of Finance-Ally.
                  </p>
                </div>

                {/* Terms Highlights */}
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-blue"></span>
                      Personal Budgeting Utility
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      Finance-Ally is provided as a personal expense tracker and encrypted credential vault utility for personal, informational, and organizational purposes.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      No Financial, Investment, or Tax Advice
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      Finance-Ally and its automated analytics do not constitute financial, investment, accounting, or tax advice. The software is not a certified advisor, broker, or financial institution.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-purple"></span>
                      User Responsibility for Backups & Keys
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      Because data is strictly offline, users are solely responsible for creating regular backups and safeguarding master credentials and the 16-character Global Recovery Key. No cloud recovery backdoors exist.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-coral"></span>
                      "AS IS" Disclaimer & Limitation of Liability
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      The software is provided "AS IS" without warranty of any kind. Authors and contributors shall not be liable for any data loss, device issues, or financial decisions resulting from use of the application.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-soft border border-hairline space-y-1.5">
                    <div className="text-xs font-display font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-teal"></span>
                      License: CC BY-NC-SA 4.0
                    </div>
                    <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                      Licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International. Free for personal inspection and non-commercial derivation with attribution.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* External Link Action */}
            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => window.open('./privacy.html', '_blank')}
                className="w-full py-2.5 px-4 bg-surface-soft hover:bg-surface-card border border-hairline hover:border-brand-blue text-ink rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5 text-brand-blue" />
                <span>Open Full Privacy & Terms Document</span>
              </button>
            </div>

            {/* Footer Attribution */}
            <div className="text-center pt-4 pb-1 space-y-1 border-t border-hairline/60">
              <p className="text-[11px] font-mono text-muted-custom font-semibold">
                Finance-Ally • 100% Offline & Sandboxed Personal Finance Vault
              </p>
              <p className="text-[10px] font-mono text-muted-custom/75 tracking-wider font-semibold">
                CC BY-NC-SA 4.0
              </p>
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
                  ? 'Backup is encrypted using Hybrid Cryptography. Choose a destination. On Android, Share is recommended if file downloads are blocked.'
                  : 'Export is ready! Choose a destination. On Android, Share is recommended if file downloads are blocked.'}
              </p>
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const ext = pinEnabled ? 'json.enc' : 'json';
                      const filename = `finance-ally-backup-${new Date().toISOString().split('T')[0]}.${ext}`;
                      if (Capacitor.isNativePlatform()) {
                        try {
                          await Filesystem.writeFile({
                            path: `Finance-Ally/Backups/${filename}`,
                            data: exportModalData,
                            directory: Directory.Documents,
                            encoding: 'utf8' as any,
                            recursive: true
                          });
                        } catch (err) { console.error('Failed to write to Documents', err); }
                        
                        const writeResult = await Filesystem.writeFile({ path: filename, data: exportModalData, directory: Directory.Cache, encoding: 'utf8' as any });
                        await Share.share({ title: `Finance-Ally Backup`, url: writeResult.uri, dialogTitle: 'Select destination to save backup file' });
                        setImportStatus('Backup saved and shared!');
                      } else if (navigator.share) {
                        await navigator.share({ title: 'Finance-Ally Backup', text: exportModalData });
                        setImportStatus('Backup shared!');
                      } else {
                        // Fallback web download
                        const a = document.createElement('a');
                        a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(exportModalData);
                        a.download = filename;
                        document.body.appendChild(a); a.click(); a.remove();
                        setImportStatus('Backup downloaded successfully!');
                      }
                      setExportModalData(null);
                    } catch (err) {
                      console.error('Export share failed', err);
                    }
                  }}
                  className="w-full bg-surface-card hover:bg-surface-soft border border-brand-yellow text-ink py-2.5 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-[0.98]"
                >
                  <Upload className="w-3.5 h-3.5 text-brand-yellow" /> Share Backup File
                </button>
                {!Capacitor.isNativePlatform() && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(exportModalData);
                      setImportStatus('JSON backup copied to clipboard!');
                      setExportModalData(null);
                    }}
                    className="w-full bg-surface-card hover:bg-surface-soft border border-hairline text-ink py-2 rounded-xl font-mono text-[10px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    Copy Raw Content
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showSetPinModal && (
          <PinModal
            mode={showSetPinModal}
            secretType="password"
            title={
              showSetPinModal === 'set' ? 'Set Backup Password' : 
              showSetPinModal === 'change' ? 'Change Backup Password' : 
              showSetPinModal === 'recover' ? 'Recover Backup Password' : 
              showSetPinModal === 'disable' ? 'Disable Backup Encryption' :
              showSetPinModal === 'recover-disable' ? 'Disable Backup Encryption' : 'Reset Backup Password'
            }
            description={
              showSetPinModal === 'set' ? 'This password (processed with Argon2id + AES-256) will encrypt your backup exports. 6+ characters or passphrase recommended.' :
              showSetPinModal === 'change' ? 'Change your backup password. Enter your Global Recovery Key to keep emergency recovery linked.' :
              showSetPinModal === 'recover' ? 'Enter your 16-character Global Recovery Key to set a new Backup Password.' :
              showSetPinModal === 'disable' ? 'Enter your Current Backup Password to authorize disabling backup encryption.' :
              showSetPinModal === 'recover-disable' ? 'Enter your 16-character Global Recovery Key to disable encryption.' : undefined
            }
            onConfirm={handleSavePin}
            onCancel={() => { setShowSetPinModal(null); setPinActionError(''); }}
            onForgotPin={
              showSetPinModal === 'change' ? () => { setShowSetPinModal('recover'); setPinActionError(''); } :
              showSetPinModal === 'disable' ? () => { setShowSetPinModal('recover-disable'); setPinActionError(''); } : undefined
            }
            loading={pinActionLoading}
            error={pinActionError}
          />
        )}

        {showVerifyPinModal && (
          <PinModal
            mode={isRecoveringBackupImport ? 'recover' : 'verify'}
            secretType="password"
            title={isRecoveringBackupImport ? 'Restore with Recovery Key' : 'Enter Backup Password'}
            description={
              isRecoveringBackupImport
                ? 'Enter your Global Recovery Key to decrypt this backup archive and set a new Backup Password for future exports.'
                : 'This backup is encrypted. Enter the correct password to decrypt and restore your data.'
            }
            onConfirm={isRecoveringBackupImport ? handleRecoveryImportAndSetPin : handleVerifyPinAndImport}
            onCancel={() => {
              setShowVerifyPinModal(false);
              setIsRecoveringBackupImport(false);
              setVerifyPinError('');
              setPendingImportContent(null);
            }}
            onForgotPin={!isRecoveringBackupImport ? () => { setIsRecoveringBackupImport(true); setVerifyPinError(''); } : undefined}
            loading={verifyPinLoading}
            error={verifyPinError}
          />
        )}

        {showRotateWarningModal && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-surface-card/95 backdrop-blur-2xl saturate-[180%] border border-brand-coral/40 rounded-2xl p-6 shadow-2xl shadow-black/50 space-y-4 ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 border-b border-hairline pb-3">
                <div className="w-10 h-10 rounded-full bg-brand-coral/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-brand-coral" />
                </div>
                <div>
                  <h2 className="text-base font-display font-bold text-ink">Rotate Recovery Key</h2>
                  <p className="text-[11px] font-mono text-brand-coral font-bold">Re-encrypts Escrows</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-mono text-ink leading-relaxed">
                  Generating a new recovery key will migrate your existing password vault and backup escrows to the new key and invalidate the old one.
                </p>
                <div className="bg-surface-soft border border-hairline rounded-xl p-3">
                  <p className="text-[11px] font-mono text-muted-custom leading-relaxed">
                    💡 <em>Note: Your current transactions, password cards, and backups remain safe. Entering your current key ensures all recovery escrows remain unbroken.</em>
                  </p>
                </div>

                <div className="space-y-1 pt-1">
                  <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block">
                    Current Recovery Key (Required)
                  </label>
                  <input
                    type="text"
                    value={rotateCurrentRecoveryKey}
                    onChange={e => { setRotateCurrentRecoveryKey(e.target.value); setRotateAuthError(''); }}
                    placeholder="FAK-xxxx-xxxx-xxxx-xxxx"
                    autoFocus
                    className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand-coral tracking-wider"
                  />
                </div>

                {user?.requirePassword && (
                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block">
                      Enter App Password to Authorize
                    </label>
                    <input
                      type="password"
                      value={rotateAuthPassword}
                      onChange={e => { setRotateAuthPassword(e.target.value); setRotateAuthError(''); }}
                      placeholder="Your App Password"
                      className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-brand-coral"
                    />
                  </div>
                )}

                {rotateAuthError && (
                  <p className="text-[10px] font-mono text-brand-coral font-bold">{rotateAuthError}</p>
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => {
                    setShowRotateWarningModal(false);
                    setRotateAuthPassword('');
                    setRotateCurrentRecoveryKey('');
                    setRotateAuthError('');
                  }}
                  className="flex-1 py-2 rounded-xl border border-hairline text-muted-custom text-xs font-mono font-bold hover:border-ink hover:text-ink transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rotateLoading}
                  onClick={handleConfirmRotateRecoveryKey}
                  className="flex-1 py-2 rounded-xl border border-brand-coral bg-brand-coral/10 hover:bg-brand-coral text-brand-coral hover:text-white text-xs font-mono font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {rotateLoading ? 'Migrating...' : 'Migrate & Rotate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {generatedRecoveryKey && (
          <RecoveryKeyModal 
            recoveryKey={generatedRecoveryKey}
            onDismiss={() => setGeneratedRecoveryKey(null)}
          />
        )}


        </div>
      </div>
    </div>
  );
};
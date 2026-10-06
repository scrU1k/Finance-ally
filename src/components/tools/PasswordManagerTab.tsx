import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { registerBackHandler } from '../../services/backButtonService';
import {
  KeyRound,
  Plus,
  Search,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Edit2,
  Trash2,
  ShieldCheck,
  RefreshCw,
  X,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Clock,
  Database,
  Download,
  Upload,
  Shield,
  FileText,
  LayoutGrid,
  List,
  Rows3
} from 'lucide-react';
import { PasswordVaultItem, DecryptedPasswordCard } from '../../types';
import {
  getStoredPasswordItems,
  savePasswordItem,
  updatePasswordItem,
  deleteMultiplePasswordItems,
  savePasswordItemsOrder,
  hasMasterPin,
  setMasterPin,
  verifyMasterPin,
  decryptCardPayload,
  verifyVaultIntegrity,
  getLockoutStatus,
  exportVaultBackup,
  importVaultBackup,
  isVaultBackup,
  recoverVaultMasterPin
} from '../../services/passwordVaultService';
import { verifyUserPassword } from '../../services/auth';
import { hasGlobalRecoveryKey, verifyGlobalRecoveryKey } from '../../services/recoveryService';
import { suppressLockForSystemPicker, resetSystemPickerBypass } from '../../context/AuthContext';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

type SortMode = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'custom';

export const PasswordManagerTab: React.FC = () => {
  const [rawItems, setRawItems] = useState<PasswordVaultItem[]>([]);
  const [decryptedCardsMap, setDecryptedCardsMap] = useState<Record<string, DecryptedPasswordCard>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [hasPin, setHasPin] = useState<boolean>(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [vaultMasterPin, setVaultMasterPin] = useState<string>(''); // Session Master PIN when vault is unlocked
  const [isIntegrityOk, setIsIntegrityOk] = useState<boolean>(true);

  // Inactivity Auto-Lock & Background Lock Session Timeout
  const lastActivityTimeRef = useRef<number>(Date.now());
  const autoLockTimerRef = useRef<any>(null);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('fa_vault_autolock_minutes');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if ([1, 2, 3, 5, 10].includes(parsed)) return parsed;
      }
    } catch {}
    return 3;
  });
  const [isAutoLockDropdownOpen, setIsAutoLockDropdownOpen] = useState(false);
  const autoLockDropdownRef = useRef<HTMLDivElement | null>(null);

  // Card View Mode State (Grid, List, Compact)
  const [cardViewMode, setCardViewMode] = useState<'grid' | 'list' | 'compact'>(() => {
    try {
      const saved = localStorage.getItem('fa_vault_view_mode') as 'grid' | 'list' | 'compact';
      if (saved && ['grid', 'list', 'compact'].includes(saved)) return saved;
    } catch {}
    return 'compact';
  });

  const handleSetCardViewMode = (mode: 'grid' | 'list' | 'compact') => {
    setCardViewMode(mode);
    try {
      localStorage.setItem('fa_vault_view_mode', mode);
    } catch {}
  };

  // Sort & Filter State
  const [sortMode, setSortMode] = useState<SortMode>('custom');
  const [expandedSortGroup, setExpandedSortGroup] = useState<'asc' | 'desc' | null>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const toggleFilterDropdown = () => {
    if (!isFilterDropdownOpen) {
      if (sortMode.endsWith('_asc')) setExpandedSortGroup('asc');
      else if (sortMode.endsWith('_desc')) setExpandedSortGroup('desc');
    }
    setIsFilterDropdownOpen(!isFilterDropdownOpen);
  };

  // Card Selection & Re-arrange State (Unlocked Vault condition)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRearrangeModalOpen, setIsRearrangeModalOpen] = useState<boolean>(false);
  const [rearrangeItems, setRearrangeItems] = useState<DecryptedPasswordCard[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Direct Pointer Drag Tracking (Native-feeling 0ms delay vertical dragging)
  const rearrangeListRef = useRef<HTMLDivElement | null>(null);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  // App Style Delete Confirmation Modal State
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState<boolean>(false);

  // Active Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'unlock_vault' | 'unlock_card'>('unlock_card');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Selected Item Details
  const [targetItem, setTargetItem] = useState<PasswordVaultItem | null>(null);
  const [targetDecryptedCard, setTargetDecryptedCard] = useState<DecryptedPasswordCard | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [lockoutCountdown, setLockoutCountdown] = useState<number>(0);
  const [isPassVisible, setIsPassVisible] = useState(false);
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);
  const clipboardWipeTimerRef = useRef<number | null>(null);

  // Add / Edit Form State
  const [editingItem, setEditingItem] = useState<PasswordVaultItem | null>(null);
  const [formService, setFormService] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formMasterPin, setFormMasterPin] = useState('');
  const [formConfirmPin, setFormConfirmPin] = useState('');
  const [formRecoveryKey, setFormRecoveryKey] = useState('');
  const [formError, setFormError] = useState('');

  // Vault Master PIN Emergency Recovery State
  const [isVaultRecovering, setIsVaultRecovering] = useState(false);
  const [vaultRecoveryKey, setVaultRecoveryKey] = useState('');
  const [vaultNewPin, setVaultNewPin] = useState('');
  const [vaultConfirmPin, setVaultConfirmPin] = useState('');
  const [vaultRecoveryError, setVaultRecoveryError] = useState('');
  const [vaultRecoveryLoading, setVaultRecoveryLoading] = useState(false);

  // Vault Backup & Restore State (Double-Layer Encrypted)
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupSubTab, setBackupSubTab] = useState<'export' | 'restore'>('export');
  
  // Export State
  const [exportAppPassword, setExportAppPassword] = useState('');
  const [showExportAppPassword, setShowExportAppPassword] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportedData, setExportedData] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);

  // Restore State
  const [restoreFileContent, setRestoreFileContent] = useState<string | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreAppPassword, setRestoreAppPassword] = useState('');
  const [showRestoreAppPassword, setShowRestoreAppPassword] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

  const resetBackupModalState = () => {
    setIsBackupModalOpen(false);
    setExportedData(null);
    setExportAppPassword('');
    setExportError('');
    setExportCopied(false);
    setRestoreFileContent(null);
    setRestoreFileName('');
    setRestoreAppPassword('');
    setRestoreError('');
    setRestoreSuccess('');
  };

  const handleExportVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setExportError('');
    if (!exportAppPassword) {
      setExportError('Main App Password is required to seal the outer encryption layer.');
      return;
    }
    setExportLoading(true);
    try {
      const isValid = await verifyUserPassword(exportAppPassword);
      if (!isValid) {
        setExportLoading(false);
        setExportError('Incorrect Main App Password. Authentication failed.');
        return;
      }
      const bundle = await exportVaultBackup(exportAppPassword);
      setExportLoading(false);
      setExportedData(bundle);
    } catch (err: any) {
      setExportLoading(false);
      setExportError(err?.message || 'Failed to generate vault backup bundle.');
    }
  };

  const handleDownloadVaultExport = async () => {
    if (!exportedData) return;
    suppressLockForSystemPicker();
    const filename = `FinanceAlly_Vault_Backup_${new Date().toISOString().split('T')[0]}.favault.json`;

    if (Capacitor.isNativePlatform()) {
      try {
        const writeResult = await Filesystem.writeFile({
          path: `Finance-Ally/${filename}`,
          data: exportedData,
          directory: Directory.Documents,
          encoding: 'utf8' as any,
          recursive: true
        });
        await Share.share({
          title: 'Finance-Ally Password Vault Backup',
          url: writeResult.uri,
          dialogTitle: 'Save Password Vault Backup'
        });
      } catch {
        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: exportedData,
          directory: Directory.Cache,
          encoding: 'utf8' as any
        });
        await Share.share({
          title: 'Finance-Ally Password Vault Backup',
          url: writeResult.uri,
          dialogTitle: 'Save Password Vault Backup'
        });
      }
    } else {
      const a = document.createElement('a');
      a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(exportedData);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    resetSystemPickerBypass();
  };

  const handleCopyVaultExport = () => {
    if (!exportedData) return;
    navigator.clipboard.writeText(exportedData);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const handleVaultFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    suppressLockForSystemPicker();
    const file = e.target.files?.[0];
    if (!file) {
      resetSystemPickerBypass();
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      resetSystemPickerBypass();
      if (!content) return;
      if (!isVaultBackup(content)) {
        setRestoreError('Invalid file: this is not a valid Finance-Ally Password Vault backup.');
        return;
      }
      setRestoreFileContent(content);
      setRestoreFileName(file.name);
      setRestoreError('');
      setRestoreSuccess('');
    };
    reader.readAsText(file);
  };

  const handleRestoreVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestoreError('');
    setRestoreSuccess('');

    if (!restoreFileContent) {
      setRestoreError('Please select a vault backup file first.');
      return;
    }
    if (!restoreAppPassword) {
      setRestoreError('Enter your Main App Password to decrypt the outer layer.');
      return;
    }

    setRestoreLoading(true);
    try {
      const isPassValid = await verifyUserPassword(restoreAppPassword);
      if (!isPassValid) {
        setRestoreLoading(false);
        setRestoreError('Incorrect Main App Password. Authentication failed.');
        return;
      }

      const res = await importVaultBackup(restoreFileContent, restoreAppPassword);
      setRestoreLoading(false);

      if (res.result === 'ok') {
        setRestoreSuccess(`Successfully restored ${res.itemCount ?? 0} password card${(res.itemCount ?? 0) !== 1 ? 's' : ''} into your vault!`);
        setRestoreFileContent(null);
        setRestoreFileName('');
        setRestoreAppPassword('');
        lockVault();
        await refreshItems();
      } else if (res.result === 'wrong_password') {
        setRestoreError('Decryption failed. The app password does not match the backup encryption.');
      } else {
        setRestoreError('Corrupted or invalid vault backup file structure.');
      }
    } catch (err: any) {
      setRestoreLoading(false);
      setRestoreError(err?.message || 'Failed to restore vault backup.');
    }
  };

  // Lock Vault Helper - Fully purges decrypted credentials and closes detail modals
  const lockVault = () => {
    setIsVaultUnlocked(false);
    setVaultMasterPin('');
    setDecryptedCardsMap({});
    setSelectedIds([]);
    setIsDetailModalOpen(false);
    setTargetItem(null);
    setTargetDecryptedCard(null);
    setIsAddModalOpen(false);
    setIsPinModalOpen(false);
    setPinInput('');
    setPinError('');
    setEditingItem(null);
    setFormPassword('');
    setIsPassVisible(false);
    setIsBackupModalOpen(false);
    setIsDeleteConfirmModalOpen(false);
    setCopiedField(null);
  };

  // Initial Load & Integrity Check
  useEffect(() => {
    setRawItems(getStoredPasswordItems());
    setHasPin(hasMasterPin());
    verifyVaultIntegrity().then(ok => setIsIntegrityOk(ok));

    return () => {
      if (clipboardWipeTimerRef.current) {
        clearTimeout(clipboardWipeTimerRef.current);
      }
      lockVault();
    };
  }, []);

  // Check Lockout Status on Mount & Interval
  useEffect(() => {
    const checkLockout = () => {
      const status = getLockoutStatus();
      if (status.isLockedOut) {
        setLockoutCountdown(status.remainingSeconds);
      } else {
        setLockoutCountdown(0);
      }
    };
    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-Lock on 5 Minutes Inactivity & App Backgrounding
  useEffect(() => {
    if (!isVaultUnlocked) return;

    const updateActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };

    // Activity event listeners (deliberate user actions, avoiding ambient mousemove jitter)
    window.addEventListener('pointerdown', updateActivity, { passive: true });
    window.addEventListener('keydown', updateActivity, { passive: true });
    window.addEventListener('touchstart', updateActivity, { passive: true });
    window.addEventListener('scroll', updateActivity, { passive: true });
    window.addEventListener('wheel', updateActivity, { passive: true });

    // Auto-lock on app background / tab hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lockVault();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check inactivity every 4 seconds (dynamic minutes threshold)
    const timeoutMs = autoLockMinutes * 60 * 1000;
    autoLockTimerRef.current = setInterval(() => {
      if (Date.now() - lastActivityTimeRef.current >= timeoutMs) {
        lockVault();
      }
    }, 4000);

    return () => {
      window.removeEventListener('pointerdown', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      window.removeEventListener('wheel', updateActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (autoLockTimerRef.current) clearInterval(autoLockTimerRef.current);
    };
  }, [isVaultUnlocked, autoLockMinutes]);

  // Close filter dropdown & autolock dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (autoLockDropdownRef.current && !autoLockDropdownRef.current.contains(e.target as Node)) {
        setIsAutoLockDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen || isAutoLockDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterDropdownOpen, isAutoLockDropdownOpen]);

  // Priority Back Button Handler for Password Vault Modals & Dropdowns
  useEffect(() => {
    return registerBackHandler('password-manager', 40, () => {
      if (isDetailModalOpen) {
        setIsDetailModalOpen(false);
        setTargetItem(null);
        setTargetDecryptedCard(null);
        return true;
      }
      if (isAddModalOpen) {
        setIsAddModalOpen(false);
        setEditingItem(null);
        return true;
      }
      if (isPinModalOpen) {
        setIsPinModalOpen(false);
        return true;
      }
      if (isBackupModalOpen) {
        setIsBackupModalOpen(false);
        return true;
      }
      if (isRearrangeModalOpen) {
        setIsRearrangeModalOpen(false);
        return true;
      }
      if (isDeleteConfirmModalOpen) {
        setIsDeleteConfirmModalOpen(false);
        return true;
      }
      if (isFilterDropdownOpen) {
        setIsFilterDropdownOpen(false);
        return true;
      }
      if (isAutoLockDropdownOpen) {
        setIsAutoLockDropdownOpen(false);
        return true;
      }
      if (selectedIds.length > 0) {
        setSelectedIds([]);
        return true;
      }
      return false;
    });
  }, [
    isDetailModalOpen,
    isAddModalOpen,
    isPinModalOpen,
    isBackupModalOpen,
    isRearrangeModalOpen,
    isDeleteConfirmModalOpen,
    isFilterDropdownOpen,
    isAutoLockDropdownOpen,
    selectedIds
  ]);

  const refreshItems = async () => {
    const list = getStoredPasswordItems();
    setRawItems(list);
    setHasPin(hasMasterPin());
    const ok = await verifyVaultIntegrity();
    setIsIntegrityOk(ok);

    // Re-decrypt cards if vault remains unlocked
    if (isVaultUnlocked && vaultMasterPin) {
      const map: Record<string, DecryptedPasswordCard> = {};
      for (const item of list) {
        try {
          map[item.id] = await decryptCardPayload(item, vaultMasterPin);
        } catch {}
      }
      setDecryptedCardsMap(map);
    }
  };

  // Generate strong random password
  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    let res = '';
    const arr = new Uint8Array(16);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < 16; i++) {
      res += chars[arr[i] % chars.length];
    }
    setFormPassword(res);
  };

  // Unlocked Decrypted Cards List
  const unlockedCardsList: DecryptedPasswordCard[] = rawItems
    .map(item => decryptedCardsMap[item.id])
    .filter(Boolean);

  // Sorted & Filtered Unlocked Cards List
  const sortedCards = [...unlockedCardsList].sort((a, b) => {
    if (sortMode === 'name_asc') {
      return a.serviceName.localeCompare(b.serviceName);
    }
    if (sortMode === 'name_desc') {
      return b.serviceName.localeCompare(a.serviceName);
    }
    if (sortMode === 'date_asc') {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
    if (sortMode === 'date_desc') {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    return 0;
  });

  // Filtered decrypted cards based on search query
  const filteredCards = sortedCards.filter(card => {
    const q = searchQuery.toLowerCase();
    return (
      card.serviceName.toLowerCase().includes(q) ||
      (card.username && card.username.toLowerCase().includes(q))
    );
  });

  // Sorted & Filtered Raw Items (for Locked Vault View)
  const filteredRawItems = [...rawItems]
    .filter(item => {
      const q = searchQuery.toLowerCase();
      return (
        !q ||
        (item.serviceName && item.serviceName.toLowerCase().includes(q)) ||
        item.id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortMode === 'name_asc') {
        return (a.serviceName || '').localeCompare(b.serviceName || '');
      }
      if (sortMode === 'name_desc') {
        return (b.serviceName || '').localeCompare(a.serviceName || '');
      }
      if (sortMode === 'date_asc') {
        const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return timeA - timeB;
      }
      if (sortMode === 'date_desc') {
        const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      }
      return 0;
    });

  // Tap "Unlock Vault" Button in Header
  const handleToggleVaultLock = () => {
    if (isVaultUnlocked) {
      lockVault();
    } else {
      setPinModalMode('unlock_vault');
      setPinInput('');
      setPinError('');
      setIsPinModalOpen(true);
    }
  };

  // Toggle card selection (Only when Vault is Unlocked)
  const handleIconClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!isVaultUnlocked) return;

    setSelectedIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  // Tap Individual Card Body
  const handleCardClick = async (item: PasswordVaultItem) => {
    setTargetItem(item);

    // If vault is already unlocked, display decrypted card
    if (isVaultUnlocked && decryptedCardsMap[item.id]) {
      setTargetDecryptedCard(decryptedCardsMap[item.id]);
      setIsPassVisible(false);
      setIsDetailModalOpen(true);
      return;
    }

    // Challenge PIN for this specific card
    setPinModalMode('unlock_card');
    setPinInput('');
    setPinError('');
    setIsPinModalOpen(true);
  };

  // Confirm Batch Deletion (App Style Modal)
  const confirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    await deleteMultiplePasswordItems(selectedIds);
    setSelectedIds([]);
    setIsDeleteConfirmModalOpen(false);
    await refreshItems();
  };

  // Open Re-arrange Modal (supports selected cards OR all unlocked cards if none/multiple selected)
  const openRearrangeModal = () => {
    let cardsToReorder: DecryptedPasswordCard[] = [];
    if (selectedIds.length > 1) {
      cardsToReorder = unlockedCardsList.filter(card => selectedIds.includes(card.id));
    } else {
      cardsToReorder = [...unlockedCardsList];
    }
    if (cardsToReorder.length <= 1) return;
    setRearrangeItems(cardsToReorder);
    setIsRearrangeModalOpen(true);
  };

  // Move item Up in list
  const moveItemUp = (index: number) => {
    if (index <= 0) return;
    setRearrangeItems(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Move item Down in list
  const moveItemDown = (index: number) => {
    if (index >= rearrangeItems.length - 1) return;
    setRearrangeItems(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // HTML5 Drag & Drop Handlers (smooth, non-laggy reordering)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = parseInt(sourceIndexStr, 10);
    setDraggedIndex(null);
    setDragOverIndex(null);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    setRearrangeItems(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Save New Order for Selected Cards & Auto-Switch to Custom Sort
  const handleSaveOrder = async () => {
    if (!vaultMasterPin) return;

    let newRawItems = [...rawItems];
    if (selectedIds.length > 1) {
      const selectedIndices = rawItems
        .map((item, idx) => (selectedIds.includes(item.id) ? idx : -1))
        .filter(idx => idx !== -1);

      for (let idxInRearrange = 0; idxInRearrange < rearrangeItems.length; idxInRearrange++) {
        const card = rearrangeItems[idxInRearrange];
        const targetItemIdx = selectedIndices[idxInRearrange];
        const itemIndex = rawItems.findIndex(i => i.id === card.id);
        if (itemIndex !== -1 && targetItemIdx !== undefined) {
          newRawItems[targetItemIdx] = rawItems[itemIndex];
        }
      }
    } else {
      // Reordered full list
      const rearrangedIds = new Set(rearrangeItems.map(c => c.id));
      const orderedItems = rearrangeItems
        .map(card => rawItems.find(i => i.id === card.id))
        .filter((item): item is PasswordVaultItem => item !== undefined);
      const remaining = rawItems.filter(i => !rearrangedIds.has(i.id));
      newRawItems = [...orderedItems, ...remaining];
    }

    await savePasswordItemsOrder(newRawItems);
    await refreshItems();
    setSortMode('custom');
    setIsRearrangeModalOpen(false);
    setSelectedIds([]);
  };

  // Close Re-arrange Modal with X
  const handleCloseRearrangeModal = () => {
    setIsRearrangeModalOpen(false);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setSelectedIds([]);
  };

  // Submit Challenge PIN (for Card or Vault Unlock)
  const handleVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutCountdown > 0) return;

    if (!pinInput || pinInput.length < 4) {
      setPinError('PIN must be at least 4 digits');
      return;
    }

    const isValid = await verifyMasterPin(pinInput);
    if (!isValid) {
      const lockout = getLockoutStatus();
      if (lockout.isLockedOut) {
        setLockoutCountdown(lockout.remainingSeconds);
        setPinError(`Too many failed attempts. Locked for ${lockout.remainingSeconds}s.`);
      } else {
        setPinError(`Incorrect Master PIN (${lockout.attemptsCount} failed attempt${lockout.attemptsCount > 1 ? 's' : ''}).`);
      }
      return;
    }

    if (pinModalMode === 'unlock_vault') {
      // Decrypt all card payloads for whole-vault unlocked session
      try {
        const allItems = getStoredPasswordItems();
        const map: Record<string, DecryptedPasswordCard> = {};
        for (const item of allItems) {
          map[item.id] = await decryptCardPayload(item, pinInput);
        }
        setDecryptedCardsMap(map);
        setVaultMasterPin(pinInput);
        setIsVaultUnlocked(true);
        setIsPinModalOpen(false);
      } catch {
        setPinError('Failed to decrypt vault contents.');
      }
    } else {
      // Unlock single card
      if (!targetItem) return;
      try {
        const card = await decryptCardPayload(targetItem, pinInput);
        setTargetDecryptedCard(card);
        setIsPassVisible(false);
        setIsPinModalOpen(false);
        setIsDetailModalOpen(true);
      } catch {
        setPinError('Failed to decrypt card payload.');
      }
    }
  };

  // Submit Emergency Recovery for Vault Master PIN
  const handleVaultRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultRecoveryError('');

    if (!vaultRecoveryKey.trim()) {
      setVaultRecoveryError('Recovery Key is required');
      return;
    }

    if (!vaultNewPin || vaultNewPin.length < 4) {
      setVaultRecoveryError('New PIN must be at least 4 digits');
      return;
    }

    if (vaultNewPin !== vaultConfirmPin) {
      setVaultRecoveryError('New PINs do not match');
      return;
    }

    setVaultRecoveryLoading(true);
    try {
      const ok = await recoverVaultMasterPin(vaultRecoveryKey.trim(), vaultNewPin);
      if (!ok) {
        setVaultRecoveryError('Invalid Recovery Key or recovery failed');
        setVaultRecoveryLoading(false);
        return;
      }

      setHasPin(true);
      setVaultMasterPin(vaultNewPin);

      // Decrypt all card payloads for whole-vault session
      const allItems = getStoredPasswordItems();
      const map: Record<string, DecryptedPasswordCard> = {};
      for (const item of allItems) {
        try {
          map[item.id] = await decryptCardPayload(item, vaultNewPin);
        } catch (err) {
          console.warn('Failed to decrypt card with new PIN:', item.id, err);
        }
      }
      setDecryptedCardsMap(map);
      setIsVaultUnlocked(true);
      setIsPinModalOpen(false);
      setIsVaultRecovering(false);
      setVaultRecoveryKey('');
      setVaultNewPin('');
      setVaultConfirmPin('');
    } catch (err: any) {
      setVaultRecoveryError(err?.message || 'Recovery failed. Please check your key.');
    } finally {
      setVaultRecoveryLoading(false);
    }
  };

  // Save New / Edit Card
  const handleSaveCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formService.trim()) {
      setFormError('Service name is required');
      return;
    }

    if (!editingItem && !formPassword) {
      setFormError('Password is required');
      return;
    }

    // If Master PIN not created yet
    if (!hasPin) {
      if (!formMasterPin || formMasterPin.length < 4) {
        setFormError('Create a Master PIN (at least 4 digits)');
        return;
      }
      if (formMasterPin !== formConfirmPin) {
        setFormError('Master PINs do not match');
        return;
      }
      const trimmedRecKey = formRecoveryKey.trim();
      if (hasGlobalRecoveryKey() && !trimmedRecKey) {
        setFormError('Global Recovery Key is required to create recovery escrow for your vault.');
        return;
      }
      if (trimmedRecKey) {
        const isKeyValid = await verifyGlobalRecoveryKey(trimmedRecKey);
        if (!isKeyValid) {
          setFormError('Invalid Global Recovery Key. Please check and re-enter.');
          return;
        }
      }
      const ok = await setMasterPin(formMasterPin, trimmedRecKey || undefined);
      if (!ok) {
        setFormError('Failed to initialize Master PIN');
        return;
      }
      setHasPin(true);
    }

    const effectivePin = formMasterPin || vaultMasterPin;
    if (!effectivePin) {
      setFormError('Master PIN is required to save');
      return;
    }

    const ok = await verifyMasterPin(effectivePin);
    if (!ok) {
      setFormError('Incorrect Master PIN. Failed to save.');
      return;
    }

    if (editingItem) {
      await updatePasswordItem(
        editingItem.id,
        formService,
        formUsername,
        formPassword || undefined,
        effectivePin
      );
    } else {
      await savePasswordItem(
        formService,
        formUsername,
        formPassword,
        effectivePin
      );
    }

    await refreshItems();
    closeAddModal();
  };

  // Copy helper with automatic 45s clipboard purge for credentials
  const copyToClipboard = (text: string, type: 'username' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopiedField(type);
    setTimeout(() => setCopiedField(null), 2000);

    if (type === 'password') {
      if (clipboardWipeTimerRef.current) {
        clearTimeout(clipboardWipeTimerRef.current);
      }
      clipboardWipeTimerRef.current = window.setTimeout(async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const currentClip = await navigator.clipboard.readText();
            if (currentClip === text) {
              await navigator.clipboard.writeText('');
            }
          }
        } catch {
          // Clipboard read/write permissions may be restricted
        }
      }, 45000);
    }
  };

  // Delete card from detail modal
  const handleDeleteCard = () => {
    if (!targetItem) return;
    setSelectedIds([targetItem.id]);
    setIsDetailModalOpen(false);
    setIsDeleteConfirmModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = () => {
    if (!targetItem || !targetDecryptedCard) return;
    setEditingItem(targetItem);
    setFormService(targetDecryptedCard.serviceName);
    setFormUsername(targetDecryptedCard.username || '');
    setFormPassword('');
    setFormMasterPin(vaultMasterPin);
    setFormError('');
    setIsDetailModalOpen(false);
    setIsAddModalOpen(true);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormService('');
    setFormUsername('');
    setFormPassword('');
    setFormMasterPin(vaultMasterPin);
    setFormConfirmPin('');
    setFormRecoveryKey('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setEditingItem(null);
    setFormRecoveryKey('');
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setTargetItem(null);
    setTargetDecryptedCard(null);
  };

  // Avatar color generator based on service name (Ocean Blue tones)
  const getAvatarBg = (name: string) => {
    const colors = [
      'bg-[#005687]/15 text-[#005687] border-[#005687]/30 dark:text-[#0088cc] dark:border-[#0088cc]/30',
      'bg-[#0f766e]/15 text-[#0f766e] border-[#0f766e]/30 dark:text-[#2dd4bf] dark:border-[#2dd4bf]/30',
      'bg-[#0284c7]/15 text-[#0284c7] border-[#0284c7]/30 dark:text-[#38bdf8] dark:border-[#38bdf8]/30',
      'bg-[#2563eb]/15 text-[#2563eb] border-[#2563eb]/30 dark:text-[#60a5fa] dark:border-[#60a5fa]/30',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className={`space-y-5 animate-in fade-in duration-200 ${selectedIds.length > 0 ? 'pb-44 sm:pb-48' : 'pb-24'}`}>
      
      {/* Integrity Tampering Alert */}
      {!isIntegrityOk && (
        <div className="p-3.5 bg-red-500/15 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-500 font-mono text-xs shadow-sm">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div>
            <strong>Vault Integrity Warning:</strong> Checksum mismatch detected! Storage structure may have been modified externally.
          </div>
        </div>
      )}

      {/* Header Banner - Exclusive #005687 Ocean Blue Theme */}
      <div className="dotgui-card relative z-30 p-4 sm:p-5 bg-surface-card border border-hairline rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Title & Subtext Block */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#005687]/15 border border-[#005687]/30 text-[#005687] dark:text-[#0088cc] flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-mono font-bold text-ink uppercase tracking-wide truncate">Password Manager</h2>
                {isVaultUnlocked && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-brand-mint/15 text-brand-mint border border-brand-mint/30 flex items-center gap-1 shrink-0">
                    <Unlock className="w-3 h-3" /> Unlocked
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-muted-custom flex items-center gap-2 pt-0.5 whitespace-nowrap overflow-x-auto no-scrollbar">
                <span className="shrink-0">{rawItems.length} cards</span>
                <span className="shrink-0">•</span>
                <div className="flex items-center gap-1 relative shrink-0" ref={autoLockDropdownRef}>
                  <span className="shrink-0">Auto-locks in</span>
                  <button
                    type="button"
                    onClick={() => setIsAutoLockDropdownOpen(!isAutoLockDropdownOpen)}
                    className="inline-flex items-center gap-1 font-bold text-ink hover:text-[#005687] border-b border-dotted border-muted-custom/60 hover:border-[#005687] transition-all cursor-pointer shrink-0"
                    title="Change auto-lock timeout"
                  >
                    <span>{autoLockMinutes}min</span>
                    <ChevronDown className="w-3 h-3 text-muted-custom shrink-0" />
                  </button>
                  {isAutoLockDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-24 bg-surface-card/98 backdrop-blur-xl border border-hairline rounded-xl shadow-xl z-50 p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/10">
                      {[1, 2, 3, 5, 10].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            setAutoLockMinutes(mins);
                            try {
                              localStorage.setItem('fa_vault_autolock_minutes', String(mins));
                            } catch {}
                            setIsAutoLockDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded-lg text-xs font-mono flex items-center justify-between cursor-pointer transition-colors ${
                            autoLockMinutes === mins
                              ? 'bg-[#005687] text-white font-bold'
                              : 'text-ink hover:bg-surface-soft'
                          }`}
                        >
                          <span>{mins}min</span>
                          {autoLockMinutes === mins && <Check className="w-3 h-3 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons Row: More Options, Unlock, <+> Icon */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center relative" ref={filterDropdownRef}>
            
            {/* 1. More Options Dropdown Button (SlidersHorizontal) */}
            <button
              type="button"
              onClick={toggleFilterDropdown}
              className={`w-9 h-9 rounded-xl border text-ink transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                sortMode !== 'custom'
                  ? 'bg-[#005687]/15 border-[#005687]/40 text-[#005687] dark:text-[#0088cc]'
                  : 'bg-surface-soft border-hairline hover:border-[#005687] hover:text-[#005687]'
              }`}
              title={`More Options (View: ${cardViewMode.toUpperCase()}, Sort: ${sortMode.toUpperCase()})`}
              aria-label="More Options"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#005687] dark:text-[#0088cc]" />
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-surface-card/98 dark:bg-[#181815]/98 backdrop-blur-2xl border border-hairline/80 rounded-2xl shadow-2xl z-50 p-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/10">
                  
                  {/* View Mode Toggle: Grid, List, Compact */}
                  <div>
                    <span className="text-[10px] font-mono font-bold text-muted-custom uppercase px-2.5 py-0.5 block">
                      Card View Mode
                    </span>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-surface-soft rounded-xl border border-hairline/60">
                      <button
                        type="button"
                        onClick={() => handleSetCardViewMode('grid')}
                        className={`py-1 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          cardViewMode === 'grid'
                            ? 'bg-[#005687] text-white shadow-xs'
                            : 'text-muted-custom hover:text-ink'
                        }`}
                        title="Grid View"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Grid</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetCardViewMode('list')}
                        className={`py-1 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          cardViewMode === 'list'
                            ? 'bg-[#005687] text-white shadow-xs'
                            : 'text-muted-custom hover:text-ink'
                        }`}
                        title="List View"
                      >
                        <List className="w-3.5 h-3.5" />
                        <span className="text-[10px]">List</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetCardViewMode('compact')}
                        className={`py-1 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          cardViewMode === 'compact'
                            ? 'bg-[#005687] text-white shadow-xs'
                            : 'text-muted-custom hover:text-ink'
                        }`}
                        title="Compact View"
                      >
                        <Rows3 className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Compact</span>
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-hairline/80 my-1" />

                  {/* Sort Mode Header */}
                  <span className="text-[10px] font-mono font-bold text-muted-custom uppercase px-2.5 py-0.5 block">
                    Sort Cards
                  </span>

                  {/* Ascending Group */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedSortGroup(prev => (prev === 'asc' ? null : 'asc'))}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                        sortMode.endsWith('_asc') ? 'bg-[#005687]/15 text-[#005687] dark:text-[#0088cc] font-bold' : 'text-ink hover:bg-surface-soft'
                      }`}
                    >
                      <span>Ascending</span>
                      {expandedSortGroup === 'asc' ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#005687] dark:text-[#0088cc]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-custom" />
                      )}
                    </button>

                    {/* Secondary Pop-up Layer Boundary */}
                    {expandedSortGroup === 'asc' && (
                      <div className="mt-1 mb-1 p-1 bg-surface-soft/90 dark:bg-surface-soft/80 border border-hairline/60 rounded-xl space-y-0.5 shadow-inner backdrop-blur-md animate-in slide-in-from-top-1 duration-150">
                        <button
                          type="button"
                          onClick={() => {
                            setSortMode('name_asc');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1 rounded-lg text-xs font-mono flex items-center justify-between transition-colors cursor-pointer ${
                            sortMode === 'name_asc'
                              ? 'bg-[#005687] text-white font-bold'
                              : 'text-ink hover:bg-surface-soft'
                          }`}
                        >
                          <span>Name (A → Z)</span>
                          {sortMode === 'name_asc' && <Check className="w-3 h-3 text-white" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSortMode('date_asc');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1 rounded-lg text-xs font-mono flex items-center justify-between transition-colors cursor-pointer ${
                            sortMode === 'date_asc'
                              ? 'bg-[#005687] text-white font-bold'
                              : 'text-ink hover:bg-surface-soft'
                          }`}
                        >
                          <span>Date (Oldest)</span>
                          {sortMode === 'date_asc' && <Check className="w-3 h-3 text-white" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Descending Group */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedSortGroup(prev => (prev === 'desc' ? null : 'desc'))}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                        sortMode.endsWith('_desc') ? 'bg-[#005687]/15 text-[#005687] dark:text-[#0088cc] font-bold' : 'text-ink hover:bg-surface-soft'
                      }`}
                    >
                      <span>Descending</span>
                      {expandedSortGroup === 'desc' ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#005687] dark:text-[#0088cc]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-custom" />
                      )}
                    </button>

                    {/* Secondary Pop-up Layer Boundary */}
                    {expandedSortGroup === 'desc' && (
                      <div className="mt-1 mb-1 p-1 bg-surface-soft/90 dark:bg-surface-soft/80 border border-hairline/60 rounded-xl space-y-0.5 shadow-inner backdrop-blur-md animate-in slide-in-from-top-1 duration-150">
                        <button
                          type="button"
                          onClick={() => {
                            setSortMode('name_desc');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1 rounded-lg text-xs font-mono flex items-center justify-between transition-colors cursor-pointer ${
                            sortMode === 'name_desc'
                              ? 'bg-[#005687] text-white font-bold'
                              : 'text-ink hover:bg-surface-soft'
                          }`}
                        >
                          <span>Name (Z → A)</span>
                          {sortMode === 'name_desc' && <Check className="w-3 h-3 text-white" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSortMode('date_desc');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1 rounded-lg text-xs font-mono flex items-center justify-between transition-colors cursor-pointer ${
                            sortMode === 'date_desc'
                              ? 'bg-[#005687] text-white font-bold'
                              : 'text-ink hover:bg-surface-soft'
                          }`}
                        >
                          <span>Date (Newest)</span>
                          {sortMode === 'date_desc' && <Check className="w-3 h-3 text-white" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Custom Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setSortMode('custom');
                      setExpandedSortGroup(null);
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                      sortMode === 'custom'
                        ? 'bg-[#005687]/15 text-[#005687] dark:text-[#0088cc] font-bold'
                        : 'text-ink hover:bg-surface-soft'
                    }`}
                  >
                    <span>Custom</span>
                    {sortMode === 'custom' && <Check className="w-3.5 h-3.5 text-[#005687] dark:text-[#0088cc]" />}
                  </button>

                  {/* Re-arrange Cards (Under More Options) */}
                  {isVaultUnlocked && rawItems.length > 1 && (
                    <>
                      <div className="h-px bg-hairline/80 my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setIsFilterDropdownOpen(false);
                          openRearrangeModal();
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-between text-ink hover:bg-surface-soft hover:text-[#005687] transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <ArrowUpDown className="w-3.5 h-3.5 text-[#005687] dark:text-[#0088cc]" />
                          <span>Re-arrange Cards</span>
                        </span>
                      </button>
                    </>
                  )}

                  <div className="h-px bg-hairline/80 my-1" />

                  {/* Vault Backup & Restore Button INSIDE More Options */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsFilterDropdownOpen(false);
                      setIsBackupModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center justify-between text-ink hover:bg-surface-soft hover:text-[#005687] transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-[#005687] dark:text-[#0088cc]" />
                      <span>Vault Backup & Restore</span>
                    </span>
                  </button>
                </div>
              )}

            {/* 2. Unlock / Lock Vault Button */}
            {hasPin && (
              <button
                type="button"
                onClick={handleToggleVaultLock}
                className={`px-3 py-2 text-xs font-mono font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0 ${
                  isVaultUnlocked
                    ? 'bg-brand-mint/15 text-brand-mint border-brand-mint/30 hover:bg-brand-mint/25'
                    : 'bg-surface-soft text-ink border-hairline hover:border-[#005687] hover:text-[#005687]'
                }`}
                title={isVaultUnlocked ? 'Lock Vault' : 'Unlock Vault with Master PIN'}
              >
                {isVaultUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{isVaultUnlocked ? 'Lock' : 'Unlock'}</span>
              </button>
            )}

            {/* 3. Add Card Plus Button (<plus> icon) */}
            <button
              type="button"
              onClick={openAddModal}
              className="w-9 h-9 rounded-xl bg-[#005687] hover:bg-[#004269] text-white transition-all flex items-center justify-center shrink-0 shadow-md shadow-[#005687]/20 cursor-pointer active:scale-95"
              title="Add Card"
              aria-label="Add Card"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>

          </div>

        </div>

        {/* Search Bar */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 text-muted-custom absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isVaultUnlocked ? 'Search service name or username...' : 'Search service name...'}
            className="w-full pl-10 pr-4 py-2 text-xs font-mono bg-surface-soft border border-hairline rounded-xl text-ink placeholder:text-muted-custom focus:outline-none focus:border-[#005687] transition-all"
          />
        </div>
      </div>

      {/* Floating Selection Action Row (Elevated & Perfectly Fitted) */}
      {isVaultUnlocked && selectedIds.length > 0 && (
        <div className="fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] w-auto dotgui-glass bg-surface-card/95 backdrop-blur-2xl border border-[#005687]/40 shadow-2xl rounded-full px-3 py-1.5 flex items-center justify-between gap-2 sm:gap-2.5 animate-in slide-in-from-bottom-5 duration-200 overflow-hidden">
          {/* Count Badge displaying just 'X' */}
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#005687] text-white font-mono text-xs font-bold flex items-center justify-center shrink-0 shadow-sm">
            {selectedIds.length}
          </div>

          <div className="h-4 w-px bg-hairline shrink-0" />

          {/* Re-arrange Button (ONLY IF >1 cards selected!) */}
          {selectedIds.length > 1 && (
            <button
              onClick={openRearrangeModal}
              className="px-3 py-1.5 text-xs font-mono font-bold rounded-full bg-surface-soft border border-hairline text-ink hover:border-[#005687] hover:text-[#005687] transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Re-arrange</span>
            </button>
          )}

          {/* Delete Button */}
          <button
            onClick={() => setIsDeleteConfirmModalOpen(true)}
            className="px-3 py-1.5 text-xs font-mono font-bold rounded-full bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {/* Clear Selection Cross Button */}
          <button
            onClick={() => setSelectedIds([])}
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-surface-soft hover:bg-surface-card border border-hairline text-muted-custom hover:text-ink flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Clear Selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Password Cards Display */}
      {rawItems.length === 0 ? (
        <div className="dotgui-card p-10 text-center text-muted-custom space-y-3">
          <KeyRound className="w-9 h-9 mx-auto text-muted-custom/40" />
          <h3 className="text-sm font-mono font-bold text-ink">No Password Cards Found</h3>
          <p className="text-xs font-mono max-w-sm mx-auto text-muted-custom">
            Click "+ Add Card" above to securely store your passwords with Zero-Knowledge AES-256 encryption.
          </p>
          <button
            onClick={openAddModal}
            className="px-4 py-2 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] transition-all inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" /> Create First Card
          </button>
        </div>
      ) : !isVaultUnlocked ? (
        /* LOCKED VAULT VIEW: Search & Sort Supported */
        <div className={
          cardViewMode === 'grid'
            ? "grid grid-cols-3 gap-2 sm:gap-2.5"
            : cardViewMode === 'list'
            ? "flex flex-col gap-2"
            : "flex flex-col gap-1.5"
        }>
          {filteredRawItems.map((item, index) => {
            if (cardViewMode === 'compact') {
              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  className="dotgui-card py-2 px-3 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group flex items-center justify-between gap-2.5 rounded-xl border border-hairline bg-surface-card font-sans"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 transition-colors ${
                      item.serviceName ? getAvatarBg(item.serviceName) : 'bg-[#005687]/15 border border-[#005687]/30 text-[#005687] dark:text-[#0088cc]'
                    }`}>
                      {item.serviceName ? item.serviceName.charAt(0).toUpperCase() : <Lock className="w-3.5 h-3.5" />}
                    </div>
                    <h3 className="text-xs font-sans font-bold text-ink truncate group-hover:text-[#005687] transition-colors">
                      {item.serviceName || `Card #${index + 1}`}
                    </h3>
                  </div>
                  <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-[#005687]/10 text-[#005687] dark:text-[#0088cc] border border-[#005687]/20 flex items-center gap-1 shrink-0">
                    <Lock className="w-2.5 h-2.5" /> Unlock
                  </span>
                </div>
              );
            }

            if (cardViewMode === 'grid') {
              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  className="dotgui-card p-2 sm:p-2.5 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group flex flex-col items-center justify-between text-center gap-2 rounded-xl border border-hairline bg-surface-card font-sans min-w-0"
                >
                  <div className="flex flex-col items-center gap-1.5 w-full min-w-0">
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 transition-colors ${
                      item.serviceName ? getAvatarBg(item.serviceName) : 'bg-[#005687]/15 border border-[#005687]/30 text-[#005687] dark:text-[#0088cc]'
                    }`}>
                      {item.serviceName ? item.serviceName.charAt(0).toUpperCase() : <Lock className="w-3.5 h-3.5" />}
                    </div>
                    <h3 className="text-xs font-sans font-bold text-ink truncate w-full group-hover:text-[#005687] transition-colors leading-tight px-0.5">
                      {item.serviceName || `Card #${index + 1}`}
                    </h3>
                  </div>
                  <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-[#005687]/10 text-[#005687] dark:text-[#0088cc] border border-[#005687]/20 flex items-center gap-1 shrink-0">
                    <Lock className="w-2.5 h-2.5" /> Unlock
                  </span>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                onClick={() => handleCardClick(item)}
                className="dotgui-card p-3 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-card font-sans"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm shrink-0 transition-colors ${
                    item.serviceName ? getAvatarBg(item.serviceName) : 'bg-[#005687]/15 border border-[#005687]/30 text-[#005687] dark:text-[#0088cc]'
                  }`}>
                    {item.serviceName ? item.serviceName.charAt(0).toUpperCase() : <Lock className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-sans font-bold text-ink truncate group-hover:text-[#005687] transition-colors">
                      {item.serviceName || `Encrypted Card #${index + 1}`}
                    </h3>
                    <p className="text-[10px] font-sans text-muted-custom truncate">
                      Metadata Encrypted
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-sans font-bold px-2 py-1 rounded-full bg-[#005687]/10 text-[#005687] dark:text-[#0088cc] border border-[#005687]/20 flex items-center gap-1 group-hover:bg-[#005687] group-hover:text-white transition-colors shrink-0">
                  <Lock className="w-3 h-3" /> Unlock
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        /* UNLOCKED VAULT VIEW: Decrypted Service Cards */
        <div className={
          cardViewMode === 'grid'
            ? "grid grid-cols-3 gap-2 sm:gap-2.5"
            : cardViewMode === 'list'
            ? "flex flex-col gap-2"
            : "flex flex-col gap-1.5"
        }>
          {filteredCards.map(card => {
            const avatarStyle = getAvatarBg(card.serviceName);
            const firstLetter = card.serviceName.charAt(0).toUpperCase();
            const isSelected = selectedIds.includes(card.id);
            const rawItem = rawItems.find(i => i.id === card.id);

            if (cardViewMode === 'compact') {
              return (
                <div
                  key={card.id}
                  onClick={() => rawItem && handleCardClick(rawItem)}
                  className={`dotgui-card py-2 px-3 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group relative overflow-hidden flex items-center justify-between gap-2.5 rounded-xl font-sans ${
                    isSelected ? 'ring-2 ring-[#005687] border-[#005687] bg-surface-soft' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      onClick={e => handleIconClick(e, card.id)}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center font-mono font-bold text-xs shrink-0 relative transition-all cursor-pointer hover:scale-105 ${avatarStyle}`}
                      title={isSelected ? 'Deselect card' : 'Select card'}
                    >
                      {firstLetter}
                      {isSelected && (
                        <div className="absolute inset-0 rounded-lg bg-[#005687]/80 backdrop-blur-[1px] flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                      <h3 className="text-xs font-sans font-bold text-ink truncate group-hover:text-[#005687] dark:group-hover:text-[#0088cc] transition-colors">
                        {card.serviceName}
                      </h3>
                      {card.username && (
                        <span className="text-[11px] font-mono text-muted-custom truncate hidden xs:inline">
                          • {card.username}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="text-[9px] font-sans font-bold px-1.5 py-0.5 rounded-full bg-brand-mint/15 text-brand-mint border border-brand-mint/30 flex items-center gap-1">
                      <Unlock className="w-2.5 h-2.5 text-brand-mint" />
                    </span>
                  </div>
                </div>
              );
            }

            if (cardViewMode === 'grid') {
              return (
                <div
                  key={card.id}
                  onClick={() => rawItem && handleCardClick(rawItem)}
                  className={`dotgui-card p-2 sm:p-2.5 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group relative overflow-hidden flex flex-col items-center justify-between text-center gap-2 rounded-xl font-sans min-w-0 ${
                    isSelected ? 'ring-2 ring-[#005687] border-[#005687] bg-surface-soft' : ''
                  }`}
                >
                  <div className="flex flex-col items-center gap-1.5 w-full min-w-0">
                    {/* Service Icon Avatar (Clickable to Select) */}
                    <div
                      onClick={e => handleIconClick(e, card.id)}
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center font-mono font-bold text-xs shrink-0 relative transition-all cursor-pointer hover:scale-105 ${avatarStyle}`}
                      title={isSelected ? 'Deselect card' : 'Select card'}
                    >
                      {firstLetter}
                      {isSelected && (
                        <div className="absolute inset-0 rounded-xl bg-[#005687]/80 backdrop-blur-[1px] flex items-center justify-center">
                          <Check className="w-4 h-4 text-white stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="w-full min-w-0 space-y-0.5">
                      <h3 className="text-xs font-sans font-bold text-ink truncate w-full group-hover:text-[#005687] dark:group-hover:text-[#0088cc] transition-colors leading-tight px-0.5">
                        {card.serviceName}
                      </h3>
                      {card.username && (
                        <p className="text-[10px] font-mono text-muted-custom truncate w-full px-0.5">
                          {card.username}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-sans font-bold px-1.5 py-0.5 rounded-full bg-brand-mint/15 text-brand-mint border border-brand-mint/30 flex items-center gap-1 shrink-0">
                    <Unlock className="w-2.5 h-2.5 text-brand-mint" /> Unlocked
                  </span>
                </div>
              );
            }

            return (
              <div
                key={card.id}
                onClick={() => rawItem && handleCardClick(rawItem)}
                className={`dotgui-card p-3 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group relative overflow-hidden flex items-center justify-between gap-3 rounded-xl font-sans ${
                  isSelected ? 'ring-2 ring-[#005687] border-[#005687] bg-surface-soft' : ''
                }`}
              >
                {/* Left: Service Icon Avatar (Clickable to Select) */}
                <div
                  onClick={e => handleIconClick(e, card.id)}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center font-mono font-bold text-sm shrink-0 relative transition-all cursor-pointer hover:scale-105 ${avatarStyle}`}
                  title={isSelected ? 'Deselect card' : 'Select card'}
                >
                  {firstLetter}

                  {/* 70% Alpha Tick Mark Overlay on Selected Icon */}
                  {isSelected && (
                    <div className="absolute inset-0 rounded-xl bg-[#005687]/80 backdrop-blur-[1px] flex items-center justify-center animate-in fade-in duration-100">
                      <Check className="w-5 h-5 text-white stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Middle: Service Name + Username */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <h3 className="text-sm font-sans font-bold text-ink truncate group-hover:text-[#005687] dark:group-hover:text-[#0088cc] transition-colors">
                    {card.serviceName}
                  </h3>
                  <p className="text-xs font-mono text-muted-custom truncate">
                    {card.username || 'No username'}
                  </p>
                </div>

                {/* Right: Unlocked Status */}
                <div className="shrink-0">
                  <span className="text-[10px] font-sans font-bold px-2 py-1 rounded-full bg-brand-mint/15 text-brand-mint border border-brand-mint/30 flex items-center gap-1">
                    <Unlock className="w-3 h-3 text-brand-mint" /> Unlocked
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL 1: App Style-Matching Delete Confirmation Modal ── */}
      {isDeleteConfirmModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="dotgui-card p-6 max-w-sm w-full bg-surface-card border border-hairline rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-hairline pb-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0 font-mono">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-mono font-bold text-ink uppercase">Confirm Deletion</h3>
                <p className="text-[11px] font-mono text-muted-custom">Permanent Action</p>
              </div>
            </div>

            <p className="text-xs font-mono text-ink leading-relaxed">
              Are you sure you want to delete{' '}
              <strong className="text-red-500">
                {selectedIds.length} password card{selectedIds.length !== 1 ? 's' : ''}
              </strong>
              ? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmModalOpen(false)}
                className="px-4 py-2 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBatchDelete}
                className="px-5 py-2 text-xs font-mono font-bold rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-md transition-all cursor-pointer"
              >
                Delete Card{selectedIds.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 2: Re-arrange Overlay Modal (Smooth Scroll & Multi-Mode Reordering) ── */}
      {isRearrangeModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="dotgui-card p-5 sm:p-6 max-w-md w-full bg-surface-card border border-hairline rounded-2xl shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            
            {/* Modal Header with Top-Right Cross X */}
            <div className="flex items-center justify-between border-b border-hairline pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-[#005687] dark:text-[#0088cc]" />
                <h3 className="text-xs font-mono font-bold text-ink uppercase">
                  {selectedIds.length > 1 ? 'Re-arrange Selected Cards' : 'Re-arrange Password Cards'}
                </h3>
              </div>
              <button
                onClick={handleCloseRearrangeModal}
                className="text-muted-custom hover:text-ink p-1 rounded-lg hover:bg-surface-soft transition-colors cursor-pointer"
                title="Exit Re-arrange"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-mono text-muted-custom shrink-0 leading-relaxed">
              Use the <strong className="text-ink">▲ / ▼</strong> arrow buttons or drag cards to reorder. Tap <strong className="text-ink">Save Order</strong> to apply.
            </p>

            {/* List of Services for Reordering (Fully scrollable without touch blocking) */}
            <div
              ref={rearrangeListRef}
              className="overflow-y-auto overscroll-contain touch-pan-y space-y-2 pr-1 flex-1 max-h-[52vh]"
            >
              {rearrangeItems.map((item, idx) => {
                const avatarStyle = getAvatarBg(item.serviceName);
                const firstLetter = item.serviceName.charAt(0).toUpperCase();
                const isDraggingThis = draggedIndex === idx;
                const isDragOver = dragOverIndex === idx;

                return (
                  <div
                    key={item.id}
                    draggable={true}
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={e => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between gap-2.5 p-3 bg-surface-soft border rounded-xl transition-all select-none font-sans ${
                      isDraggingThis
                        ? 'opacity-40 ring-2 ring-[#005687] border-[#005687] bg-surface-card'
                        : isDragOver
                        ? 'border-[#005687] ring-1 ring-[#005687]/50 bg-surface-card'
                        : 'border-hairline hover:border-[#005687]/40'
                    }`}
                  >
                    {/* Left: Drag Grip & Number Badge & Avatar */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-custom hover:text-[#005687] transition-colors shrink-0" title="Drag to reorder">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <span className="text-[10px] font-sans font-bold text-muted-custom bg-surface-card border border-hairline px-1.5 py-0.5 rounded-md shrink-0">
                        #{idx + 1}
                      </span>

                      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center font-mono font-bold text-xs shrink-0 ${avatarStyle}`}>
                        {firstLetter}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-sans font-bold text-ink truncate">{item.serviceName}</h4>
                        {item.username && <p className="text-[10px] font-mono text-muted-custom truncate">{item.username}</p>}
                      </div>
                    </div>

                    {/* Right: Quick Move Up/Down Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveItemUp(idx)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-surface-card hover:bg-surface-soft disabled:opacity-30 disabled:hover:bg-surface-card border border-hairline text-ink transition-all cursor-pointer disabled:cursor-not-allowed"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveItemDown(idx)}
                        disabled={idx === rearrangeItems.length - 1}
                        className="p-1.5 rounded-lg bg-surface-card hover:bg-surface-soft disabled:opacity-30 disabled:hover:bg-surface-card border border-hairline text-ink transition-all cursor-pointer disabled:cursor-not-allowed"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-hairline shrink-0">
              <span className="text-[11px] font-mono text-muted-custom">
                {rearrangeItems.length} card{rearrangeItems.length !== 1 ? 's' : ''} in list
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseRearrangeModal}
                  className="px-3.5 py-1.5 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrder}
                  className="px-4 py-1.5 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] shadow-md transition-all cursor-pointer"
                >
                  Save Order
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 3: PIN Challenge Modal (With Failed Attempt Lockout Countdown) ── */}
      {isPinModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="dotgui-card p-5 max-w-sm w-full bg-surface-card border border-hairline rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#005687] dark:text-[#0088cc]" />
                <h3 className="text-xs font-mono font-bold text-ink uppercase">
                  {pinModalMode === 'unlock_vault' ? 'Unlock Entire Vault' : 'Enter Master PIN'}
                </h3>
              </div>
              <button onClick={() => setIsPinModalOpen(false)} className="text-muted-custom hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            {isVaultRecovering ? (
              <form onSubmit={handleVaultRecoverySubmit} className="space-y-3">
                <div className="text-center space-y-1 pb-1">
                  <p className="text-xs font-mono font-bold text-ink">Emergency Master PIN Recovery</p>
                  <p className="text-[10px] font-mono text-muted-custom">Enter your Global Recovery Key to set a new Master PIN.</p>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block mb-1">
                    Global Recovery Key
                  </label>
                  <input
                    type="text"
                    value={vaultRecoveryKey}
                    onChange={e => { setVaultRecoveryKey(e.target.value); setVaultRecoveryError(''); }}
                    placeholder="FAK-xxxx-xxxx-xxxx-xxxx"
                    autoFocus
                    required
                    className="w-full text-xs font-mono px-3 py-2 bg-surface-soft border border-hairline rounded-xl text-ink tracking-wider focus:outline-none focus:border-[#005687]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block mb-1">
                    New Master PIN (min 4 digits)
                  </label>
                  <input
                    type="password"
                    value={vaultNewPin}
                    onChange={e => { setVaultNewPin(e.target.value); setVaultRecoveryError(''); }}
                    placeholder="••••"
                    required
                    className="w-full text-xs font-mono px-3 py-2 bg-surface-soft border border-hairline rounded-xl text-ink tracking-widest focus:outline-none focus:border-[#005687]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block mb-1">
                    Confirm New Master PIN
                  </label>
                  <input
                    type="password"
                    value={vaultConfirmPin}
                    onChange={e => { setVaultConfirmPin(e.target.value); setVaultRecoveryError(''); }}
                    placeholder="••••"
                    required
                    className="w-full text-xs font-mono px-3 py-2 bg-surface-soft border border-hairline rounded-xl text-ink tracking-widest focus:outline-none focus:border-[#005687]"
                  />
                </div>

                {vaultRecoveryError && (
                  <p className="text-[10px] font-mono text-red-500 font-bold text-center">
                    {vaultRecoveryError}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsVaultRecovering(false); setVaultRecoveryError(''); }}
                    className="px-3 py-2 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer"
                  >
                    Back to PIN
                  </button>
                  <button
                    type="submit"
                    disabled={vaultRecoveryLoading}
                    className="px-4 py-2 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {vaultRecoveryLoading ? 'Recovering...' : 'Reset PIN & Unlock'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-xs font-mono text-muted-custom">
                  {pinModalMode === 'unlock_vault'
                    ? 'Enter Master PIN to reveal and unlock all password cards in session:'
                    : targetItem
                    ? 'Enter Master PIN to decrypt card credentials:'
                    : 'Enter Master PIN:'}
                </p>

                <form onSubmit={handleVerifyPinSubmit} className="space-y-4">
                  <div>
                    <input
                      type="password"
                      value={pinInput}
                      onChange={e => {
                        setPinInput(e.target.value);
                        setPinError('');
                      }}
                      disabled={lockoutCountdown > 0}
                      placeholder={lockoutCountdown > 0 ? `Locked (${lockoutCountdown}s)` : 'Master PIN (min 4 digits)'}
                      autoFocus
                      className="w-full text-center tracking-widest text-lg font-mono px-4 py-2 bg-surface-soft border border-hairline rounded-xl text-ink focus:outline-none focus:border-[#005687] disabled:opacity-50"
                    />

                    {lockoutCountdown > 0 ? (
                      <p className="text-[11px] font-mono text-red-500 mt-1.5 flex items-center justify-center gap-1 font-bold">
                        <Clock className="w-3.5 h-3.5 animate-spin" /> Too many failed attempts. Try again in {lockoutCountdown}s.
                      </p>
                    ) : pinError ? (
                      <p className="text-[11px] font-mono text-red-500 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {pinError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsVaultRecovering(true);
                        setVaultRecoveryError('');
                      }}
                      className="text-[11px] font-mono text-[#005687] dark:text-[#0088cc] hover:underline cursor-pointer"
                    >
                      Forgot Master PIN?
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPinModalOpen(false)}
                        className="px-3 py-2 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={lockoutCountdown > 0}
                        className="px-4 py-2 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {pinModalMode === 'unlock_vault' ? 'Unlock Vault' : 'Unlock Card'}
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 4: Decrypted Card Details Modal ── */}
      {isDetailModalOpen && targetItem && targetDecryptedCard && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="dotgui-card p-5 max-w-sm w-full bg-surface-card border border-hairline rounded-2xl shadow-2xl space-y-4 overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-mono font-bold text-xs shrink-0 ${getAvatarBg(targetDecryptedCard.serviceName)}`}>
                  {targetDecryptedCard.serviceName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-sans font-bold text-ink uppercase truncate">{targetDecryptedCard.serviceName}</h3>
                  <span className="text-[10px] font-sans text-brand-mint flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 shrink-0" /> Decrypted Payload
                  </span>
                </div>
              </div>
              <button onClick={closeDetailModal} className="text-muted-custom hover:text-ink shrink-0 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Credential Fields */}
            <div className="space-y-3">
              
              {/* Username Field */}
              {targetDecryptedCard.username && (
                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-muted-custom uppercase block">Username / Email</label>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-surface-soft border border-hairline rounded-xl overflow-hidden">
                    <span className="text-xs font-mono font-semibold text-ink select-all truncate">{targetDecryptedCard.username}</span>
                    <button
                      onClick={() => copyToClipboard(targetDecryptedCard.username!, 'username')}
                      className="px-2.5 py-1 text-[10px] font-sans font-bold rounded-lg bg-surface-card border border-hairline text-ink hover:border-[#005687] transition-all flex items-center gap-1 shrink-0"
                    >
                      {copiedField === 'username' ? <Check className="w-3 h-3 text-brand-mint" /> : <Copy className="w-3 h-3 text-muted-custom" />}
                      {copiedField === 'username' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Password Field */}
              <div className="space-y-1">
                <label className="text-[10px] font-sans font-bold text-muted-custom uppercase block">Password</label>
                <div className="flex items-center justify-between gap-2 p-2.5 bg-surface-soft border border-hairline rounded-xl overflow-hidden">
                  <span className="text-xs font-mono font-bold tracking-wider text-ink select-all truncate">
                    {isPassVisible ? targetDecryptedCard.password : '••••••••••••'}
                  </span>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setIsPassVisible(!isPassVisible)}
                      className="p-1 rounded-lg text-muted-custom hover:text-ink hover:bg-surface-card transition-colors"
                      title={isPassVisible ? 'Hide Password' : 'Show Password'}
                    >
                      {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => copyToClipboard(targetDecryptedCard.password || '', 'password')}
                      className="px-2.5 py-1 text-[10px] font-sans font-bold rounded-lg bg-[#005687] text-white hover:bg-[#004269] transition-all flex items-center gap-1 shadow-sm shrink-0"
                    >
                      {copiedField === 'password' ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3 text-white" />}
                      {copiedField === 'password' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-hairline flex items-center justify-between gap-2 font-sans">
              <button
                onClick={handleDeleteCard}
                className="px-3 py-1.5 text-xs font-sans text-red-500 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={openEditModal}
                  className="px-3.5 py-1.5 text-xs font-sans font-bold rounded-xl bg-surface-soft border border-hairline text-ink hover:border-[#005687] transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={closeDetailModal}
                  className="px-4 py-1.5 text-xs font-sans font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 5: Add / Edit Card Modal ── */}
      {isAddModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="dotgui-card p-6 max-w-md w-full bg-surface-card border border-hairline rounded-2xl shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#005687] dark:text-[#0088cc]" />
                <h3 className="text-xs font-mono font-bold text-ink uppercase">
                  {editingItem ? 'Edit Password Card' : 'New Password Card'}
                </h3>
              </div>
              <button onClick={closeAddModal} className="text-muted-custom hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCardSubmit} className="space-y-4">
              
              {/* Service Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">Service / App Name *</label>
                <input
                  type="text"
                  value={formService}
                  onChange={e => setFormService(e.target.value)}
                  placeholder="e.g. Netflix, Amazon, Bank Account"
                  required
                  className="w-full px-3.5 py-2 text-xs font-mono bg-surface-soft border border-hairline rounded-xl text-ink focus:outline-none focus:border-[#005687]"
                />
              </div>

              {/* Username */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">Username / Email (Optional)</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={e => setFormUsername(e.target.value)}
                  placeholder="e.g. alex@example.com"
                  className="w-full px-3.5 py-2 text-xs font-mono bg-surface-soft border border-hairline rounded-xl text-ink focus:outline-none focus:border-[#005687]"
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">
                    Password {editingItem ? '(Leave blank to keep unchanged)' : '*'}
                  </label>
                  <button
                    type="button"
                    onClick={generateStrongPassword}
                    className="text-[10px] font-mono font-bold text-[#005687] dark:text-[#0088cc] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Generate Strong
                  </button>
                </div>
                <input
                  type="text"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  placeholder={editingItem ? 'Enter new password to change...' : 'Enter password...'}
                  required={!editingItem}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-surface-soft border border-hairline rounded-xl text-ink focus:outline-none focus:border-[#005687]"
                />
              </div>

              {/* Master PIN Section */}
              {!hasPin ? (
                <div className="p-3 bg-[#005687]/10 border border-[#005687]/30 rounded-xl space-y-2">
                  <span className="text-[11px] font-mono font-bold text-[#005687] dark:text-[#0088cc] block">
                    ⚡ Setup Password Vault Master PIN
                  </span>
                  <p className="text-[10px] font-mono text-muted-custom">
                    This PIN encrypts your password cards. You will need it to view any password.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="password"
                      value={formMasterPin}
                      onChange={e => setFormMasterPin(e.target.value)}
                      placeholder="Create Master PIN"
                      required
                      className="px-3 py-1.5 text-xs font-mono bg-surface-card border border-hairline rounded-lg text-ink"
                    />
                    <input
                      type="password"
                      value={formConfirmPin}
                      onChange={e => setFormConfirmPin(e.target.value)}
                      placeholder="Confirm Master PIN"
                      required
                      className="px-3 py-1.5 text-xs font-mono bg-surface-card border border-hairline rounded-lg text-ink"
                    />
                  </div>
                  <div className="pt-1 space-y-1">
                    <label className="text-[10px] font-mono text-muted-custom flex items-center justify-between">
                      <span>
                        Global Recovery Key {hasGlobalRecoveryKey() ? '(Required for escrow)' : '(Optional)'}
                      </span>
                      <span className="text-[9px] text-[#005687] dark:text-[#0088cc]">Enables PIN recovery</span>
                    </label>
                    <input
                      type="text"
                      value={formRecoveryKey}
                      onChange={e => setFormRecoveryKey(e.target.value)}
                      placeholder={hasGlobalRecoveryKey() ? 'FAK-xxxx-xxxx-xxxx-xxxx' : 'FAK-xxxx-xxxx-xxxx-xxxx (optional)'}
                      required={hasGlobalRecoveryKey()}
                      className="w-full px-3 py-1.5 text-xs font-mono bg-surface-card border border-hairline rounded-lg text-ink"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">Confirm Master PIN *</label>
                  <input
                    type="password"
                    value={formMasterPin}
                    onChange={e => setFormMasterPin(e.target.value)}
                    placeholder="Enter Master PIN to save card"
                    required
                    className="w-full px-3.5 py-2 text-xs font-mono bg-surface-soft border border-hairline rounded-xl text-ink focus:outline-none focus:border-[#005687]"
                  />
                </div>
              )}

              {formError && (
                <p className="text-[11px] font-mono text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] shadow-md cursor-pointer"
                >
                  {editingItem ? 'Update Card' : 'Save Card'}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Vault-Only Backup & Restore Modal (Double-Layer Encrypted) */}
      {isBackupModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface-card border border-hairline rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-hairline flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#005687]/15 border border-[#005687]/30 text-[#005687] dark:text-[#0088cc] flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-mono font-bold text-sm text-ink">Vault Backup & Restore</h3>
                  <p className="text-[10px] font-mono text-muted-custom flex items-center gap-1">
                    <Shield className="w-3 h-3 text-brand-mint inline" /> Double-Layer Encrypted
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetBackupModalState}
                className="w-8 h-8 rounded-xl border border-hairline text-muted-custom hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-tabs: Export vs Restore */}
            <div className="px-4 sm:px-5 pt-3 shrink-0">
              <div className="grid grid-cols-2 p-1 bg-surface-soft rounded-xl border border-hairline text-xs font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setBackupSubTab('export');
                    setExportError('');
                    setRestoreError('');
                  }}
                  className={`py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    backupSubTab === 'export'
                      ? 'bg-[#005687] text-white shadow-sm'
                      : 'text-muted-custom hover:text-ink'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Backup Vault</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBackupSubTab('restore');
                    setExportError('');
                    setRestoreError('');
                  }}
                  className={`py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    backupSubTab === 'restore'
                      ? 'bg-[#005687] text-white shadow-sm'
                      : 'text-muted-custom hover:text-ink'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restore Vault</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {backupSubTab === 'export' ? (
                /* EXPORT FLOW */
                <div className="space-y-4">
                  {!exportedData ? (
                    <form onSubmit={handleExportVault} className="space-y-3">
                      <p className="text-xs font-mono text-muted-custom">
                        Enter your <strong>Main App Password</strong> to authenticate and wrap the encrypted backup file:
                      </p>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">
                          Main App Password *
                        </label>
                        <div className="relative">
                          <input
                            type={showExportAppPassword ? 'text' : 'password'}
                            value={exportAppPassword}
                            onChange={e => setExportAppPassword(e.target.value)}
                            placeholder="Enter your Main App Password..."
                            required
                            className="w-full px-3.5 py-2 pr-10 text-xs font-mono bg-surface-soft border border-hairline rounded-xl text-ink focus:outline-none focus:border-[#005687]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowExportAppPassword(!showExportAppPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-custom hover:text-ink cursor-pointer"
                          >
                            {showExportAppPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {exportError && (
                        <p className="text-[11px] font-mono text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {exportError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={exportLoading}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-mono font-bold bg-[#005687] hover:bg-[#004269] text-white flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        {exportLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Encrypting Vault (200k PBKDF2)...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Generate Encrypted Vault Backup</span>
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    /* EXPORT READY */
                    <div className="space-y-3 animate-in fade-in duration-150">
                      <div className="p-3 bg-brand-mint/15 border border-brand-mint/30 rounded-xl flex items-center gap-2.5 text-xs font-mono text-brand-mint">
                        <Check className="w-4 h-4 shrink-0" />
                        <div>
                          <strong>Vault Backup Ready!</strong><br />
                          {rawItems.length} card{rawItems.length !== 1 ? 's' : ''} sealed with double-layer encryption.
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadVaultExport}
                          className="py-2 px-3 rounded-xl text-xs font-mono font-bold bg-[#005687] hover:bg-[#004269] text-white flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Save / Share File</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyVaultExport}
                          className="py-2 px-3 rounded-xl text-xs font-mono font-bold bg-surface-soft border border-hairline hover:border-[#005687] text-ink flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {exportCopied ? <Check className="w-3.5 h-3.5 text-brand-mint" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{exportCopied ? 'Copied!' : 'Copy Data'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setExportedData(null);
                          setExportAppPassword('');
                        }}
                        className="w-full text-center text-[11px] font-mono text-muted-custom hover:text-ink pt-1 cursor-pointer"
                      >
                        Create another backup
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* RESTORE FLOW */
                <form onSubmit={handleRestoreVault} className="space-y-3">
                  <input
                    type="file"
                    ref={restoreFileInputRef}
                    onChange={handleVaultFileSelect}
                    accept=".json,.favault.json"
                    className="hidden"
                  />

                  {/* File Selector Box */}
                  <div
                    onClick={() => {
                      suppressLockForSystemPicker();
                      restoreFileInputRef.current?.click();
                    }}
                    className="border-2 border-dashed border-hairline hover:border-[#005687] p-4 rounded-xl text-center cursor-pointer transition-colors bg-surface-soft/50 hover:bg-[#005687]/5"
                  >
                    <Upload className="w-6 h-6 text-[#005687] dark:text-[#0088cc] mx-auto mb-1.5" />
                    {restoreFileName ? (
                      <div className="text-xs font-mono font-bold text-ink flex items-center justify-center gap-1.5">
                        <FileText className="w-4 h-4 text-brand-mint" />
                        <span className="truncate max-w-[220px]">{restoreFileName}</span>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-mono font-bold text-ink">Choose Vault Backup File</p>
                        <p className="text-[10px] font-mono text-muted-custom mt-0.5">Select a .favault.json or .json file</p>
                      </>
                    )}
                  </div>

                  {restoreFileContent && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">
                        Main App Password * (to Decrypt Outer Layer)
                      </label>
                      <div className="relative">
                        <input
                          type={showRestoreAppPassword ? 'text' : 'password'}
                          value={restoreAppPassword}
                          onChange={e => setRestoreAppPassword(e.target.value)}
                          placeholder="Enter your Main App Password..."
                          required
                          className="w-full px-3.5 py-2 pr-10 text-xs font-mono bg-surface-soft border border-hairline rounded-xl text-ink focus:outline-none focus:border-[#005687]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRestoreAppPassword(!showRestoreAppPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-custom hover:text-ink cursor-pointer"
                        >
                          {showRestoreAppPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {restoreError && (
                    <p className="text-[11px] font-mono text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {restoreError}
                    </p>
                  )}

                  {restoreSuccess && (
                    <div className="p-3 bg-brand-mint/15 border border-brand-mint/30 rounded-xl flex items-center gap-2 text-xs font-mono text-brand-mint">
                      <Check className="w-4 h-4 shrink-0" />
                      <div>{restoreSuccess}</div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={restoreLoading || !restoreFileContent}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-mono font-bold bg-[#005687] hover:bg-[#004269] text-white flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {restoreLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Decrypting Outer Layer...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Decrypt & Restore Password Vault</span>
                      </>
                    )}
                  </button>
                </form>
              )}

            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
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
  GripVertical,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { PasswordVaultItem, DecryptedPasswordCard } from '../../types';
import {
  getStoredPasswordItems,
  savePasswordItem,
  updatePasswordItem,
  deletePasswordItem,
  deleteMultiplePasswordItems,
  savePasswordItemsOrder,
  hasMasterPin,
  setMasterPin,
  verifyMasterPin,
  decryptCardPayload,
  verifyVaultIntegrity,
  getLockoutStatus
} from '../../services/passwordVaultService';

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
  const isPointerDraggingRef = useRef<boolean>(false);
  const activeDragIndexRef = useRef<number | null>(null);
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

  // Add / Edit Form State
  const [editingItem, setEditingItem] = useState<PasswordVaultItem | null>(null);
  const [formService, setFormService] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formMasterPin, setFormMasterPin] = useState('');
  const [formConfirmPin, setFormConfirmPin] = useState('');
  const [formError, setFormError] = useState('');

  // Lock Vault Helper
  const lockVault = () => {
    setIsVaultUnlocked(false);
    setVaultMasterPin('');
    setDecryptedCardsMap({});
    setSelectedIds([]);
  };

  // Initial Load & Integrity Check
  useEffect(() => {
    setRawItems(getStoredPasswordItems());
    setHasPin(hasMasterPin());
    verifyVaultIntegrity().then(ok => setIsIntegrityOk(ok));

    return () => {
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

    // Activity event listeners
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('touchstart', updateActivity);
    window.addEventListener('pointerdown', updateActivity);

    // Auto-lock on app background / tab hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lockVault();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check inactivity every 5 seconds (3 minutes = 180,000ms threshold)
    autoLockTimerRef.current = setInterval(() => {
      if (Date.now() - lastActivityTimeRef.current > 180000) {
        lockVault();
      }
    }, 5000);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      window.removeEventListener('pointerdown', updateActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (autoLockTimerRef.current) clearInterval(autoLockTimerRef.current);
    };
  }, [isVaultUnlocked]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterDropdownOpen]);

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

  // Open Re-arrange Modal ONLY FOR SELECTED CARDS (>1)
  const openRearrangeModal = () => {
    if (selectedIds.length <= 1) return;
    const selectedCards = unlockedCardsList.filter(card => selectedIds.includes(card.id));
    setRearrangeItems(selectedCards);
    setIsRearrangeModalOpen(true);
  };

  // Seamless Native Vertical Pointer Drag Handlers (0ms latency on Android & Desktop)
  const handlePointerDownRow = (index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    isPointerDraggingRef.current = true;
    activeDragIndexRef.current = index;
    setDraggedIndex(index);
  };

  const handlePointerMoveRow = (e: React.PointerEvent) => {
    if (!isPointerDraggingRef.current || activeDragIndexRef.current === null || !rearrangeListRef.current) return;

    const clientY = e.clientY;
    const children = Array.from(rearrangeListRef.current.children) as HTMLElement[];
    if (children.length === 0) return;

    let targetIndex = activeDragIndexRef.current;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) {
        targetIndex = i;
        break;
      }
      targetIndex = i;
    }

    const currentIndex = activeDragIndexRef.current;
    if (targetIndex !== currentIndex && targetIndex >= 0 && targetIndex < rearrangeItems.length) {
      setRearrangeItems(prev => {
        const updated = [...prev];
        const movedItem = updated[currentIndex];
        updated.splice(currentIndex, 1);
        updated.splice(targetIndex, 0, movedItem);
        return updated;
      });
      activeDragIndexRef.current = targetIndex;
      setDraggedIndex(targetIndex);
    }
  };

  const handlePointerUpRow = (e: React.PointerEvent) => {
    if (isPointerDraggingRef.current) {
      isPointerDraggingRef.current = false;
      activeDragIndexRef.current = null;
      setDraggedIndex(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Save New Order for Selected Cards & Auto-Switch to Custom Sort
  const handleSaveOrder = async () => {
    if (!vaultMasterPin) return;

    const newRawItems = [...rawItems];
    const selectedIndices = rawItems
      .map((item, idx) => (selectedIds.includes(item.id) ? idx : -1))
      .filter(idx => idx !== -1);

    // Re-encrypt updated cards into new positions
    for (let idxInRearrange = 0; idxInRearrange < rearrangeItems.length; idxInRearrange++) {
      const card = rearrangeItems[idxInRearrange];
      const targetItemIdx = selectedIndices[idxInRearrange];
      const itemIndex = rawItems.findIndex(i => i.id === card.id);
      if (itemIndex !== -1) {
        newRawItems[targetItemIdx] = rawItems[itemIndex];
      }
    }

    await savePasswordItemsOrder(newRawItems);
    await refreshItems();
    setSortMode('custom'); // Automatically switch filter to custom on reorder!
    setIsRearrangeModalOpen(false);
    setSelectedIds([]); // Clear selection on exit
  };

  // Close Re-arrange Modal with X
  const handleCloseRearrangeModal = () => {
    setIsRearrangeModalOpen(false);
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
      await setMasterPin(formMasterPin);
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

  // Copy helper
  const copyToClipboard = (text: string, type: 'username' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopiedField(type);
    setTimeout(() => setCopiedField(null), 2000);
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
    setFormError('');
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setEditingItem(null);
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
      <div className="dotgui-card p-4 sm:p-5 bg-surface-card border border-hairline rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#005687]/15 border border-[#005687]/30 text-[#005687] dark:text-[#0088cc] flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-mono font-bold text-ink uppercase tracking-wide">Password Manager</h2>
                {isVaultUnlocked ? (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-brand-mint/15 text-brand-mint border border-brand-mint/30 flex items-center gap-1">
                    <Unlock className="w-3 h-3" /> Vault Unlocked
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#005687]/15 text-[#005687] dark:text-[#0088cc] border border-[#005687]/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> AES-256
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-muted-custom">
                {rawItems.length} card{rawItems.length !== 1 ? 's' : ''} stored • Full Payload Encrypted • Auto-Locks in 3m
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            
            {/* Filter / Sort Button (Icon Only - Positioned EXTREME LEFT in Button Group) */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={toggleFilterDropdown}
                className={`w-8 h-8 rounded-xl border text-ink transition-all flex items-center justify-center cursor-pointer ${
                  sortMode !== 'custom'
                    ? 'bg-[#005687]/15 border-[#005687]/40 text-[#005687] dark:text-[#0088cc]'
                    : 'bg-surface-soft border-hairline hover:border-[#005687] hover:text-[#005687]'
                }`}
                title={`Sort Mode: ${sortMode.toUpperCase()}`}
              >
                <SlidersHorizontal className="w-4 h-4 text-[#005687] dark:text-[#0088cc]" />
              </button>

              {isFilterDropdownOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-52 bg-surface-card/98 dark:bg-[#181815]/98 backdrop-blur-2xl border border-hairline/80 rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                  {/* Ascending Group */}
                  <div>
                    <button
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
                </div>
              )}
            </div>

            {hasPin && (
              <button
                onClick={handleToggleVaultLock}
                className={`px-3 py-1.5 text-[11px] whitespace-nowrap font-mono font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                  isVaultUnlocked
                    ? 'bg-brand-mint/15 text-brand-mint border-brand-mint/30 hover:bg-brand-mint/25'
                    : 'bg-surface-soft text-ink border-hairline hover:border-[#005687] hover:text-[#005687]'
                }`}
                title={isVaultUnlocked ? 'Lock Vault' : 'Unlock Vault with Master PIN'}
              >
                {isVaultUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {isVaultUnlocked ? 'Lock Vault' : 'Unlock Vault'}
              </button>
            )}

            <button
              onClick={openAddModal}
              className="px-3 py-1.5 text-[11px] whitespace-nowrap font-mono font-bold rounded-xl bg-[#005687] hover:bg-[#004269] text-white transition-all flex items-center gap-1.5 shadow-md shadow-[#005687]/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Card
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredRawItems.map((item, index) => (
            <div
              key={item.id}
              onClick={() => handleCardClick(item)}
              className="dotgui-card p-3.5 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-card"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm shrink-0 transition-colors ${
                  item.serviceName ? getAvatarBg(item.serviceName) : 'bg-[#005687]/15 border border-[#005687]/30 text-[#005687] dark:text-[#0088cc]'
                }`}>
                  {item.serviceName ? item.serviceName.charAt(0).toUpperCase() : <Lock className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-mono font-bold text-ink truncate group-hover:text-[#005687] transition-colors">
                    {item.serviceName || `Encrypted Card #${index + 1}`}
                  </h3>
                  <p className="text-[10px] font-mono text-muted-custom truncate">
                    Metadata Encrypted
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-full bg-[#005687]/10 text-[#005687] dark:text-[#0088cc] border border-[#005687]/20 flex items-center gap-1 group-hover:bg-[#005687] group-hover:text-white transition-colors shrink-0">
                <Lock className="w-3 h-3" /> Unlock
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* UNLOCKED VAULT VIEW: Decrypted Service Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredCards.map(card => {
            const avatarStyle = getAvatarBg(card.serviceName);
            const firstLetter = card.serviceName.charAt(0).toUpperCase();
            const isSelected = selectedIds.includes(card.id);
            const rawItem = rawItems.find(i => i.id === card.id);

            return (
              <div
                key={card.id}
                onClick={() => rawItem && handleCardClick(rawItem)}
                className={`dotgui-card p-3 cursor-pointer hover:border-[#005687]/60 hover:shadow-md transition-all group relative overflow-hidden flex items-center justify-between gap-3 rounded-xl ${
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
                  <h3 className="text-sm font-mono font-bold text-ink truncate group-hover:text-[#005687] dark:group-hover:text-[#0088cc] transition-colors">
                    {card.serviceName}
                  </h3>
                  <p className="text-xs font-mono text-muted-custom truncate">
                    {card.username || 'No username'}
                  </p>
                </div>

                {/* Right: Unlocked Status */}
                <div className="shrink-0">
                  <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-full bg-brand-mint/15 text-brand-mint border border-brand-mint/30 flex items-center gap-1">
                    <Unlock className="w-3 h-3 text-brand-mint" /> Unlocked
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL 1: App Style-Matching Delete Confirmation Modal ── */}
      {isDeleteConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
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
        </div>
      )}

      {/* ── MODAL 2: Re-arrange Overlay Modal (Long-Press Pointer Drag FOR SELECTED CARDS ONLY) ── */}
      {isRearrangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="dotgui-card p-6 max-w-md w-full bg-surface-card border border-hairline rounded-2xl shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            
            {/* Modal Header with Top-Right Cross X */}
            <div className="flex items-center justify-between border-b border-hairline pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-[#005687] dark:text-[#0088cc]" />
                <h3 className="text-xs font-mono font-bold text-ink uppercase">Re-arrange Selected Cards</h3>
              </div>
              <button
                onClick={handleCloseRearrangeModal}
                className="text-muted-custom hover:text-ink p-1 rounded-lg hover:bg-surface-soft transition-colors cursor-pointer"
                title="Exit Re-arrange & Clear Selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-mono text-muted-custom shrink-0">
              Press and drag selected cards vertically to reorder. Tap <strong>Save Order</strong> to apply and switch to Custom sort.
            </p>

            {/* List of Selected Services for Reordering */}
            <div
              ref={rearrangeListRef}
              className="overflow-y-auto space-y-2 pr-1 flex-1 max-h-[50vh] touch-none select-none"
            >
              {rearrangeItems.map((item, idx) => {
                const avatarStyle = getAvatarBg(item.serviceName);
                const firstLetter = item.serviceName.charAt(0).toUpperCase();
                const isDraggingThis = draggedIndex === idx;

                return (
                  <div
                    key={item.id}
                    onPointerDown={e => handlePointerDownRow(idx, e)}
                    onPointerMove={handlePointerMoveRow}
                    onPointerUp={handlePointerUpRow}
                    className={`flex items-center justify-between gap-3 p-3 bg-surface-soft border rounded-xl transition-all cursor-grab active:cursor-grabbing touch-none ${
                      isDraggingThis
                        ? 'opacity-70 ring-2 ring-[#005687] border-[#005687] bg-surface-card scale-[1.01] shadow-xl z-10'
                        : 'border-hairline hover:border-[#005687]/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pointer-events-none">
                      <GripVertical className="w-4.5 h-4.5 text-[#005687] dark:text-[#0088cc] shrink-0" />
                      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-mono font-bold text-xs shrink-0 ${avatarStyle}`}>
                        {firstLetter}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-mono font-bold text-ink truncate">{item.serviceName}</h4>
                        {item.username && <p className="text-[10px] font-mono text-muted-custom truncate">{item.username}</p>}
                      </div>
                    </div>

                    <span className="text-[10px] font-mono font-bold text-muted-custom uppercase shrink-0 pointer-events-none">
                      Hold & Move
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline shrink-0">
              <button
                type="button"
                onClick={handleCloseRearrangeModal}
                className="px-4 py-2 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOrder}
                className="px-5 py-2 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] shadow-md cursor-pointer"
              >
                Save Order
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── MODAL 3: PIN Challenge Modal (With Failed Attempt Lockout Countdown) ── */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-4 py-2 text-xs font-mono text-muted-custom hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lockoutCountdown > 0}
                  className="px-5 py-2 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] shadow-md cursor-pointer disabled:opacity-50"
                >
                  {pinModalMode === 'unlock_vault' ? 'Unlock Vault' : 'Unlock Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Decrypted Card Details Modal ── */}
      {isDetailModalOpen && targetItem && targetDecryptedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="dotgui-card p-5 max-w-sm w-full bg-surface-card border border-hairline rounded-2xl shadow-2xl space-y-4 overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-mono font-bold text-xs shrink-0 ${getAvatarBg(targetDecryptedCard.serviceName)}`}>
                  {targetDecryptedCard.serviceName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-mono font-bold text-ink uppercase truncate">{targetDecryptedCard.serviceName}</h3>
                  <span className="text-[10px] font-mono text-brand-mint flex items-center gap-1">
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
                  <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">Username / Email</label>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-surface-soft border border-hairline rounded-xl overflow-hidden">
                    <span className="text-xs font-mono font-semibold text-ink select-all truncate">{targetDecryptedCard.username}</span>
                    <button
                      onClick={() => copyToClipboard(targetDecryptedCard.username!, 'username')}
                      className="px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-surface-card border border-hairline text-ink hover:border-[#005687] transition-all flex items-center gap-1 shrink-0"
                    >
                      {copiedField === 'username' ? <Check className="w-3 h-3 text-brand-mint" /> : <Copy className="w-3 h-3 text-muted-custom" />}
                      {copiedField === 'username' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Password Field */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-muted-custom uppercase block">Password</label>
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
                      className="px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-[#005687] text-white hover:bg-[#004269] transition-all flex items-center gap-1 shadow-sm shrink-0"
                    >
                      {copiedField === 'password' ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3 text-white" />}
                      {copiedField === 'password' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-hairline flex items-center justify-between gap-2">
              <button
                onClick={handleDeleteCard}
                className="px-3 py-1.5 text-xs font-mono text-red-500 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={openEditModal}
                  className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-xl bg-surface-soft border border-hairline text-ink hover:border-[#005687] transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={closeDetailModal}
                  className="px-4 py-1.5 text-xs font-mono font-bold rounded-xl bg-[#005687] text-white hover:bg-[#004269] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── MODAL 5: Add / Edit Card Modal ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
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
        </div>
      )}

    </div>
  );
};

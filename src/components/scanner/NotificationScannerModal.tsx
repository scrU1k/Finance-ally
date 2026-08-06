import React, { useState, useEffect } from 'react';
import { parseNotificationText } from '../../services/notificationParser';
import { ParsedNotification } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../services/currency';
import { Sparkles, Shield, CheckCircle2, Clipboard, Plus, Edit2, Check, Bell, BellOff, MessageSquare } from 'lucide-react';

export const NotificationScannerModal: React.FC = () => {
  const { addTransaction, categories, baseCurrency } = useFinance();
  const [inputText, setInputText] = useState('');
  const [parsed, setParsed] = useState<ParsedNotification>(() =>
    parseNotificationText('', baseCurrency)
  );
  const [logged, setLogged] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Background SMS Listener Simulator State
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [listenerActive, setListenerActive] = useState(false);
  const [simulatedAlert, setSimulatedAlert] = useState<{ title: string; text: string } | null>(null);

  // Editable Form State
  const [editAmount, setEditAmount] = useState<string>('');
  const [editMerchant, setEditMerchant] = useState<string>('');
  const [editCategoryId, setEditCategoryId] = useState<string>('');

  const handleTextChange = (text: string) => {
    setInputText(text);
    setLogged(false);
    setIsEditing(false);
    const result = parseNotificationText(text, baseCurrency);
    setParsed(result);
  };

  const handleStartEditing = () => {
    setEditAmount(parsed.amount ? parsed.amount.toString() : '');
    setEditMerchant(parsed.merchant || '');
    setEditCategoryId(parsed.suggestedCategoryId || categories[0]?.id || '');
    setIsEditing(true);
  };

  const handleSaveEdits = () => {
    const numAmount = parseFloat(editAmount) || parsed.amount;
    const catObj = categories.find(c => c.id === editCategoryId);

    setParsed(prev => ({
      ...prev,
      amount: numAmount,
      merchant: editMerchant || prev.merchant,
      suggestedCategoryId: editCategoryId || prev.suggestedCategoryId,
      suggestedCategoryName: catObj ? catObj.name : prev.suggestedCategoryName,
    }));
    setIsEditing(false);
  };

  const handleLogParsedExpense = async () => {
    if (!parsed.amount || parsed.amount <= 0) return;

    await addTransaction({
      amount: parsed.amount,
      currency: parsed.currency,
      categoryId: parsed.suggestedCategoryId,
      date: parsed.date,
      time: new Date().toTimeString().split(' ')[0].substring(0, 5),
      note: parsed.merchant,
      paymentMethod: 'UPI / SMS Notification',
      isAutoParsed: true,
      confidenceScore: parsed.confidence,
    });

    setLogged(true);
    setSimulatedAlert(null);
  };

  const handleRequestPermission = () => {
    setPermissionGranted(true);
    setListenerActive(true);
  };

  // Simulate an incoming transaction SMS after 3 seconds of turning on the listener
  useEffect(() => {
    if (listenerActive) {
      const timer = setTimeout(() => {
        const mockSms = {
          title: "HDFC Bank Alert",
          text: "Dear Customer, Rs 1200.00 debited from AC XXXXXX on 2026-08-06 to Swiggy. Ref: 204859."
        };
        setSimulatedAlert(mockSms);
        handleTextChange(mockSms.text);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setSimulatedAlert(null);
    }
  }, [listenerActive]);

  return (
    <div className="space-y-6 pb-24 max-w-full overflow-hidden">
      
      {/* Section Header */}
      <div className="border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-yellow" />
          <h2 className="text-xl font-display font-bold text-ink">
            Notification Scanner
          </h2>
        </div>
      </div>

      {/* 1. NATIVE NOTIFICATION / SMS LISTENER PANEL */}
      <div className="dotgui-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {listenerActive ? <Bell className="w-5 h-5 text-brand-mint animate-bounce" /> : <BellOff className="w-5 h-5 text-muted-custom" />}
            <div>
              <h3 className="text-xs font-mono font-bold text-ink uppercase">Automated Background SMS / Notif Reader</h3>
              <p className="text-[10px] font-mono text-muted-custom">
                {listenerActive ? 'Active: Automatically parsing incoming banking & UPI alerts.' : 'Inactive: Tap to request notification access.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleRequestPermission}
            className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all border shrink-0 cursor-pointer ${
              permissionGranted
                ? 'border-brand-mint text-brand-mint bg-surface-soft'
                : 'border-brand-blue text-brand-blue bg-surface-card hover:bg-surface-soft shadow-sm'
            }`}
          >
            {permissionGranted ? 'Access Granted' : 'Grant Permission'}
          </button>
        </div>

        {/* Browser vs Native App Hint */}
        <p className="text-[10px] font-mono text-muted-custom border-t border-hairline pt-2.5">
          ℹ️ <strong>Native OS Integration:</strong> Direct SMS inbox reading is restricted inside browser sandboxes. Once installed as a native Android APK, the background listener intercepts banking alerts automatically, bypassing manual pasting.
        </p>
      </div>

      {/* Simulated Incoming SMS Alert Banner */}
      {simulatedAlert && (
        <div className="border border-brand-blue/30 bg-surface-soft p-4 rounded-xl space-y-2 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 text-ink font-mono text-xs font-bold">
            <MessageSquare className="w-4 h-4 text-brand-blue" />
            <span>Simulated Incoming SMS Received!</span>
          </div>
          <p className="text-xs font-mono text-body-custom italic">
            "{simulatedAlert.text}"
          </p>
        </div>
      )}

      {/* Text Area Input / Paste Dropzone */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono text-muted-custom uppercase">Manual Input / Paste Sandbox</label>
          <button
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text) handleTextChange(text);
              } catch {
                // Clipboard blocked
              }
            }}
            className="text-[11px] font-mono text-brand-blue flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Clipboard className="w-3 h-3" />
            <span>Paste Clipboard</span>
          </button>
        </div>

        <textarea
          rows={4}
          value={inputText}
          onChange={e => handleTextChange(e.target.value)}
          placeholder="Paste bank debit alert, UPI message, or purchase notification text here..."
          className="w-full bg-surface-card border border-hairline rounded-xl p-4 text-xs font-mono text-ink focus:outline-none focus:border-ink font-sans-custom"
        />
      </div>

      {/* Live Parsing Results Preview Card */}
      {inputText.trim() && (
        <div className="dotgui-card p-6 space-y-4 animate-in fade-in duration-150">
          
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-yellow" />
              <h3 className="text-sm font-mono font-semibold text-ink uppercase">Extracted Details</h3>
            </div>
            <span className="text-xs font-mono border border-brand-yellow/30 text-brand-yellow px-2.5 py-0.5 rounded-full font-bold truncate whitespace-nowrap">
              {parsed.confidence}% accuracy
            </span>
          </div>

          {/* Display Mode vs Inline Edit Mode */}
          {!isEditing ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-muted-custom uppercase">Amount</span>
                <div className="text-lg font-display font-bold text-ink">
                  {parsed.amount ? formatCurrency(parsed.amount, parsed.currency) : 'Not Detected'}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono text-muted-custom uppercase">Merchant / Note</span>
                <div className="text-sm font-semibold text-ink truncate">
                  {parsed.merchant}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono text-muted-custom uppercase">Tag</span>
                <div className="text-xs font-mono font-bold text-brand-blue border border-brand-blue/30 px-2 py-1 rounded-md inline-block">
                  {parsed.suggestedCategoryName}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono text-muted-custom uppercase">Ref ID</span>
                <div className="text-xs font-mono text-muted-custom">
                  {parsed.referenceId || 'N/A'}
                </div>
              </div>

            </div>
          ) : (
            /* Inline Edit Form */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface-soft p-4 rounded-xl border border-hairline">
              
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase">Edit Amount</label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  placeholder="Amount"
                  className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase">Edit Merchant / Note</label>
                <input
                  type="text"
                  value={editMerchant}
                  onChange={e => setEditMerchant(e.target.value)}
                  placeholder="Merchant"
                  className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-custom uppercase">Edit Category Tag</label>
                <select
                  value={editCategoryId}
                  onChange={e => setEditCategoryId(e.target.value)}
                  className="w-full bg-surface-card border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink cursor-pointer"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3 text-right pt-2">
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  className="border border-brand-blue text-brand-blue text-xs font-mono px-4 py-1.5 rounded-full font-bold flex items-center gap-1 ml-auto hover:bg-surface-card cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Save Edits
                </button>
              </div>

            </div>
          )}

          {/* Action Buttons: Edit + Add to Expenses */}
          <div className="pt-2 border-t border-hairline flex items-center justify-end gap-2.5">
            {logged ? (
              <div className="flex items-center gap-2 text-brand-mint text-xs font-mono font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Added to Expenses!</span>
              </div>
            ) : (
              <>
                {/* Edit Button directly to the left of Add to Expenses */}
                {!isEditing && (
                  <button
                    type="button"
                    onClick={handleStartEditing}
                    className="flex items-center gap-1.5 bg-surface-soft hover:bg-surface-card border border-hairline text-ink font-mono text-xs px-4 py-2 rounded-full transition-all cursor-pointer"
                    title="Edit parsed details before adding"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}

                {/* Add to Expenses Button */}
                <button
                  onClick={handleLogParsedExpense}
                  disabled={!parsed.amount || parsed.amount <= 0 || isEditing}
                  className="flex items-center gap-2 border border-brand-blue text-brand-blue hover:bg-surface-soft disabled:opacity-50 font-mono text-xs px-5 py-2 rounded-full shadow-sm transition-all font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to Expenses</span>
                </button>
              </>
            )}
          </div>

        </div>
      )}

    </div>
  );
};

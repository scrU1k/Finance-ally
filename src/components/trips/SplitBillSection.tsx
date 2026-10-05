import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, TOP_CURRENCIES } from '../../services/currency';
import { CurrencyCode, SplitMember } from '../../types';
import { CustomSelect, SelectOption } from '../common/CustomSelect';
import { Copy, Plus, Trash2, Check, Calculator, Percent } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getLocalDateString } from '../../utils/dateUtils';

interface SplitBillSectionProps {
  defaultTripId?: string;
}

export const SplitBillSection: React.FC<SplitBillSectionProps> = ({ defaultTripId }) => {
  const { baseCurrency, addTransaction, activeTripVault } = useFinance();

  const [totalAmount, setTotalAmount] = useState('1200');
  const [currency, setCurrency] = useState<CurrencyCode>(activeTripVault?.currency || baseCurrency);
  const [tipPercent, setTipPercent] = useState('10');
  const [isCustomTip, setIsCustomTip] = useState(false);

  const [members, setMembers] = useState<SplitMember[]>([
    { id: '1', name: 'You (Personal)', amount: 300, isPaid: true },
    { id: '2', name: 'Friend 1', amount: 300, isPaid: false },
    { id: '3', name: 'Friend 2', amount: 300, isPaid: false },
  ]);

  const [copied, setCopied] = useState(false);
  const [loggedShare, setLoggedShare] = useState(false);

  const numAmount = parseFloat(totalAmount) || 0;
  const numTip = parseFloat(tipPercent) || 0;
  const totalWithTip = numAmount + (numAmount * numTip) / 100;

  const currencyOptions: SelectOption[] = TOP_CURRENCIES.map(c => ({
    value: c.code,
    label: `${c.flag} ${c.code}`,
  }));

  const perPersonEqual = members.length > 0 ? totalWithTip / members.length : 0;

  const handleAddMember = () => {
    setMembers(prev => [
      ...prev,
      { id: Date.now().toString(), name: `Friend ${prev.length}`, amount: 0, isPaid: false }
    ]);
  };

  const handleRemoveMember = (id: string) => {
    if (members.length <= 1) return;
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const handleTogglePaid = (id: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, isPaid: !m.isPaid } : m));
  };

  const handleNameChange = (id: string, newName: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, name: newName } : m));
  };

  const handleLogMyShare = async () => {
    if (loggedShare) return;
    await addTransaction({
      amount: perPersonEqual,
      currency,
      categoryId: 'cat-others',
      tripId: defaultTripId || activeTripVault?.id,
      date: getLocalDateString(),
      time: new Date().toTimeString().split(' ')[0].substring(0, 5),
      note: `Split bill share for: ${members.map(m => m.name).join(', ')}`,
      paymentMethod: 'UPI',
    });
    setLoggedShare(true);
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 }
    });
  };

  const shareText = `**Split Bill Summary**
Total: ${formatCurrency(totalWithTip, currency)}
Cost: ${formatCurrency(numAmount, currency)} + ${numTip}% Tip/Tax
No. of people: **${members.length}**  Per person: ${formatCurrency(perPersonEqual, currency)}
Members:
${members.map(m => `- ${m.name}: **${formatCurrency(perPersonEqual, currency)}** *(${m.isPaid ? 'Paid' : 'Pending'})*`).join('\n')}`;

  const handleCopyShare = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Bill & Member Controls */}
      <div className="dotgui-card p-4 space-y-3.5 bg-surface-card border border-hairline rounded-2xl shadow-xs">
        {/* Total Bill Input */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono font-bold text-muted-custom uppercase">
            Total Bill Amount
          </label>
          <div className="flex items-center gap-2">
            <CustomSelect
              direction="down"
              options={currencyOptions}
              value={currency}
              onChange={val => setCurrency(val as CurrencyCode)}
              className="w-28 shrink-0"
            />
            <input
              type="number"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              placeholder="1200"
              className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-base font-display font-bold text-ink focus:outline-none focus:border-ink transition-colors"
            />
          </div>
        </div>

        {/* Tip / Tax Selector */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono font-bold text-muted-custom uppercase">
            Tip / Tax Percentage
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['0', '5', '10', '15', '20'].map(pct => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setTipPercent(pct);
                  setIsCustomTip(false);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  !isCustomTip && tipPercent === pct
                    ? 'border border-brand-blue text-brand-blue font-bold shadow-xs bg-surface-soft'
                    : 'bg-surface-soft text-body-custom border border-hairline hover:border-ink'
                }`}
              >
                {pct}%
              </button>
            ))}

            <button
              type="button"
              onClick={() => setIsCustomTip(true)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                isCustomTip
                  ? 'border border-ink text-ink font-bold shadow-xs bg-surface-soft'
                  : 'bg-surface-soft text-body-custom border border-hairline hover:border-ink'
              }`}
              title="Custom Tip Percentage"
            >
              <Percent className="w-3 h-3" />
              <span>Custom</span>
            </button>
          </div>

          {isCustomTip && (
            <div className="pt-1">
              <input
                type="number"
                value={tipPercent}
                onChange={e => setTipPercent(e.target.value)}
                placeholder="Enter custom %"
                autoFocus
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />
            </div>
          )}
        </div>

        {/* Group Members List */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-mono font-bold text-muted-custom uppercase">
              Group Members ({members.length})
            </label>
            <button
              type="button"
              onClick={handleAddMember}
              className="text-xs font-mono text-brand-blue font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Person</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-2 bg-surface-soft px-2.5 py-1.5 rounded-xl border border-hairline">
                <input
                  type="text"
                  value={member.name}
                  onChange={e => handleNameChange(member.id, e.target.value)}
                  className="w-full bg-transparent text-xs font-mono text-ink focus:outline-none"
                />
                {members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                    className="p-1 text-muted-custom hover:text-brand-coral cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calculated Split Breakdown Card */}
      <div className="dotgui-card p-4 space-y-3.5 bg-surface-card border border-hairline rounded-2xl shadow-xs flex flex-col justify-between">
        <div className="space-y-3">
          <div className="border-b border-hairline pb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-brand-mint" />
              <h4 className="text-xs font-mono font-bold text-ink uppercase">Split Breakdown</h4>
            </div>
            <span className="text-[11px] font-mono text-muted-custom">
              Total: {formatCurrency(totalWithTip, currency)}
            </span>
          </div>

          {/* Per-Person Hero Banner */}
          <div className="bg-surface-soft p-3 rounded-xl border border-hairline space-y-2">
            <div className="text-center space-y-0.5">
              <span className="text-[10px] font-mono text-muted-custom uppercase">Each Person Pays</span>
              <div className="text-2xl font-display font-bold text-ink">
                {formatCurrency(perPersonEqual, currency)}
              </div>
            </div>

            {/* Members Status List */}
            <div className="space-y-1.5 pt-2 border-t border-hairline max-h-36 overflow-y-auto pr-0.5">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePaid(m.id)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors shrink-0 cursor-pointer ${
                        m.isPaid 
                          ? 'bg-brand-mint/10 text-brand-mint border-brand-mint/30'
                          : 'bg-brand-coral/10 text-brand-coral border-brand-coral/30'
                      }`}
                    >
                      {m.isPaid ? 'PAID' : 'PENDING'}
                    </button>
                    <span className="text-body-custom truncate">{m.name}</span>
                  </div>
                  <span className="font-bold text-ink shrink-0 ml-2">
                    {formatCurrency(perPersonEqual, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-hairline">
          <button
            type="button"
            onClick={handleCopyShare}
            className="flex items-center justify-center gap-1.5 bg-surface-soft hover:border-ink border border-hairline text-ink font-mono text-xs py-2 px-3 rounded-full transition-all cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
          </button>

          <button
            type="button"
            onClick={handleLogMyShare}
            disabled={loggedShare}
            className="flex items-center justify-center gap-1.5 border border-brand-blue text-brand-blue hover:bg-surface-soft disabled:opacity-50 font-mono text-xs py-2 px-3 rounded-full shadow-xs transition-all font-bold cursor-pointer text-center"
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{loggedShare ? 'Logged!' : `Log My Share`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

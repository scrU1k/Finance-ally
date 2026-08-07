import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../services/currency';
import { TOP_CURRENCIES } from '../../services/currency';
import { CurrencyCode, SplitMember } from '../../types';
import { CustomSelect, SelectOption } from '../common/CustomSelect';
import { Users, Copy, Plus, Trash2, Check, Calculator, Percent } from 'lucide-react';
import confetti from 'canvas-confetti';

export const SplitBillModal: React.FC = () => {
  const { baseCurrency, addTransaction, categories } = useFinance();

  const [totalAmount, setTotalAmount] = useState('1200');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
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

  // Calculate per person share
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
      date: new Date().toISOString().split('T')[0],
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
    <div className="space-y-6 pb-24 max-w-full overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-blue" />
          <h2 className="text-xl font-display font-bold text-ink">Split Bills</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Bill Input Controls */}
        <div className="dotgui-card p-5 space-y-4 bg-surface-card">
          
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-custom uppercase">Total Bill Amount</label>
            <div className="flex items-center gap-2">
              <CustomSelect
                direction="down"
                options={currencyOptions}
                value={currency}
                onChange={val => setCurrency(val as CurrencyCode)}
                className="w-32 shrink-0"
              />

              <input
                type="number"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
                placeholder="1200"
                className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2 text-lg font-display font-bold text-ink focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          {/* Tip / Tax Selector & Custom % Chip */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-custom uppercase">Tip / Tax Percentage</label>
            <div className="flex items-center gap-2 flex-wrap">
              {['0', '5', '10', '15', '20'].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setTipPercent(pct);
                    setIsCustomTip(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                    !isCustomTip && tipPercent === pct
                      ? 'border border-brand-blue text-brand-blue font-bold shadow-sm bg-surface-soft'
                      : 'bg-surface-soft text-body-custom border border-hairline hover:border-ink'
                  }`}
                >
                  {pct}%
                </button>
              ))}

              {/* % Custom Chip */}
              <button
                type="button"
                onClick={() => setIsCustomTip(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  isCustomTip
                    ? 'border border-ink text-ink font-bold shadow-sm bg-surface-soft'
                    : 'bg-surface-soft text-body-custom border border-hairline hover:border-ink'
                }`}
                title="Custom Tip Percentage"
              >
                <Percent className="w-3 h-3" />
                <span>Custom</span>
              </button>
            </div>

            {/* Custom % Input Field */}
            {isCustomTip && (
              <div className="pt-1.5">
                <input
                  type="number"
                  value={tipPercent}
                  onChange={e => setTipPercent(e.target.value)}
                  placeholder="Enter custom %"
                  autoFocus
                  className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink"
                />
              </div>
            )}
          </div>

          {/* People Count & Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-muted-custom uppercase">
                Group Members ({members.length})
              </label>
              <button
                onClick={handleAddMember}
                className="text-xs font-mono text-brand-blue flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Person
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-2 bg-surface-soft p-2 rounded-xl border border-hairline">
                  <input
                    type="text"
                    value={member.name}
                    onChange={e => {
                      const val = e.target.value;
                      setMembers(prev => prev.map(m => (m.id === member.id ? { ...m, name: val } : m)));
                    }}
                    className="w-full bg-transparent text-xs font-mono text-ink focus:outline-none"
                  />

                  {members.length > 1 && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-1 text-muted-custom hover:text-brand-coral cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Calculated Breakdown Display Card */}
        <div className="dotgui-card p-5 space-y-4 bg-surface-card flex flex-col justify-between">
          
          <div className="space-y-4">
            
            <div className="border-b border-hairline pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-brand-mint" />
                <h3 className="text-sm font-mono font-semibold text-ink uppercase">Split Breakdown</h3>
              </div>
              <span className="text-xs font-mono text-muted-custom">
                Grand Total: {formatCurrency(totalWithTip, currency)}
              </span>
            </div>

            {/* Individual Breakdown Card */}
            <div className="bg-surface-soft p-4 rounded-2xl border border-hairline space-y-3">
              <div className="text-center space-y-1">
                <span className="text-[10px] font-mono text-muted-custom uppercase">Each Person Pays</span>
                <div className="text-3xl font-display font-bold text-ink">
                  {formatCurrency(perPersonEqual, currency)}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-hairline">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
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
                    <span className="font-bold text-ink shrink-0">{formatCurrency(perPersonEqual, currency)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-4 border-t border-hairline">
            <button
              onClick={handleCopyShare}
              className="w-full flex items-center justify-center gap-2 bg-surface-soft hover:border-ink border border-hairline text-ink font-mono text-xs py-2.5 rounded-full transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              onClick={handleLogMyShare}
              disabled={loggedShare}
              className="w-full flex items-center justify-center gap-2 border border-brand-blue text-brand-blue hover:bg-surface-soft disabled:opacity-50 font-mono text-xs py-2.5 px-4 rounded-full shadow-sm transition-all font-bold cursor-pointer text-center"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span className="truncate">{loggedShare ? 'Logged to Expenses!' : `Log ${formatCurrency(perPersonEqual, currency)} to Expenses`}</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};

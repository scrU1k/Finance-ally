import React, { useState } from 'react';
import { CurrencyCode } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { TOP_CURRENCIES } from '../../services/currency';
import { X, Check, Plane } from 'lucide-react';

interface TripModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TripModal: React.FC<TripModalProps> = ({ isOpen, onClose }) => {
  const { addTripItem, baseCurrency } = useFinance();

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [tripType, setTripType] = useState<'domestic' | 'foreign'>('domestic');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0]);
  const [budget, setBudget] = useState('15000');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');

  if (!isOpen) return null;

  const activeCurrency = tripType === 'domestic' ? baseCurrency : currency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numBudget = parseFloat(budget) || 0;
    if (!name || numBudget <= 0) return;

    await addTripItem({
      name,
      destination,
      startDate,
      endDate,
      budget: numBudget,
      currency: activeCurrency,
      color: '#2b6be4',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-md w-full dotgui-glass border border-hairline rounded-2xl p-6 shadow-2xl space-y-4">
        
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-brand-coral" />
            <h3 className="text-lg font-display font-bold text-ink">Create Trip Vault</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-custom hover:text-ink cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Trip Type Selector: Domestic vs Foreign */}
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-custom uppercase">Trip Location Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTripType('domestic')}
                className={`flex-1 py-2 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer ${
                  tripType === 'domestic'
                    ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                    : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
                }`}
              >
                Domestic Trip ({baseCurrency})
              </button>
              <button
                type="button"
                onClick={() => setTripType('foreign')}
                className={`flex-1 py-2 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer ${
                  tripType === 'foreign'
                    ? 'border-ink text-ink font-bold shadow-sm bg-surface-soft'
                    : 'bg-surface-card text-body-custom border-hairline hover:border-ink'
                }`}
              >
                Foreign Trip
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-custom uppercase">Trip Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Summer Vacation, Beach Trip"
              required
              autoFocus
              className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2 text-sm text-ink focus:outline-none focus:border-ink font-sans-custom"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-custom uppercase">Destination</label>
            <input
              type="text"
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="e.g. Goa, Paris, Tokyo"
              className="w-full bg-surface-soft border border-hairline rounded-xl px-4 py-2 text-sm text-ink focus:outline-none focus:border-ink"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {tripType === 'foreign' ? (
              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-custom uppercase">Foreign Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as CurrencyCode)}
                  className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink cursor-pointer"
                >
                  {TOP_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-custom uppercase">Currency</label>
                <div className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink">
                  {baseCurrency} (App Default)
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-custom uppercase">Trip Budget</label>
              <input
                type="number"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                placeholder="15000"
                required
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-custom uppercase">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-custom uppercase">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono font-bold text-xs py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Launch Trip Vault</span>
          </button>

        </form>

      </div>
    </div>
  );
};

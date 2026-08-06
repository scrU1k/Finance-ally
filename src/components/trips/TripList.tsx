import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { TripModal } from './TripModal';
import { formatCurrency, convertCurrencyAmount } from '../../services/currency';
import { Plane, Plus, Trash2, Calendar } from 'lucide-react';

export const TripList: React.FC = () => {
  const { trips, transactions, removeTripItem, activeTripVault, setActiveTripVault, forexRates } = useFinance();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-6 pb-24 max-w-full overflow-hidden">
      
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-hairline pb-4">
        <div>
          <h2 className="text-xl font-display font-bold text-ink flex items-center gap-2">
            <Plane className="w-5 h-5 text-brand-coral" />
            <span>Trip Manager & Vaults</span>
          </h2>
          <p className="text-xs font-mono text-muted-custom">
            Organize travel spendings into dedicated trip vaults & track budgets.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono text-xs px-3.5 py-2 rounded-full shadow-sm shrink-0 font-bold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Trip</span>
        </button>
      </div>

      {/* Active Vault Compact Notification Banner */}
      {activeTripVault && (
        <div className="bg-surface-soft border border-brand-coral/40 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-ink">
          <div className="flex items-center gap-2 min-w-0">
            <Plane className="w-4 h-4 text-brand-coral shrink-0" />
            <span className="text-xs font-mono truncate">
              Active Vault: <strong className="text-brand-coral">{activeTripVault.name}</strong> ({activeTripVault.currency})
            </span>
          </div>

          <button
            onClick={() => setActiveTripVault(null)}
            className="p-1 rounded-full text-brand-coral hover:bg-surface-card transition-colors shrink-0 cursor-pointer"
            title="Exit Trip Vault"
          >
            <span className="font-bold text-sm px-1.5">✕</span>
          </button>
        </div>
      )}

      {/* Trip Cards Grid */}
      {trips.length === 0 ? (
        <div className="dotgui-card p-12 text-center space-y-3">
          <Plane className="w-10 h-10 mx-auto text-muted-custom/40" />
          <h3 className="text-base font-display font-semibold text-ink">No Trips Created</h3>
          <p className="text-xs font-mono text-muted-custom max-w-sm mx-auto">
            Create a trip to isolate travel expenses separately from your default app feed.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 border border-brand-blue text-brand-blue font-mono text-xs font-bold px-4 py-2 rounded-full shadow-sm hover:bg-surface-soft cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Trip</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trips.map(trip => {
            const tripTxs = transactions.filter(t => t.tripId === trip.id);
            const totalSpentInTripCurrency = tripTxs.reduce((acc, t) => {
              return acc + convertCurrencyAmount(t.amount, t.currency, trip.currency, forexRates);
            }, 0);

            const pctUsed = Math.min(Math.round((totalSpentInTripCurrency / (trip.budget || 1)) * 100), 100);
            const isActive = activeTripVault?.id === trip.id;

            return (
              <div
                key={trip.id}
                onClick={() => setActiveTripVault(isActive ? null : trip)}
                className={`dotgui-card p-5 space-y-4 relative transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${
                  isActive ? 'border-brand-coral ring-2 ring-brand-coral/40 bg-surface-soft' : ''
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono border border-brand-coral/30 text-brand-coral px-2 py-0.5 rounded-full font-bold uppercase">
                        {trip.currency} Vault
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-mono border border-brand-coral text-brand-coral px-2 py-0.5 rounded-full font-bold uppercase">
                          Active Vault
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-display font-bold text-ink mt-1">
                      {trip.name}
                    </h3>
                    <p className="text-xs font-mono text-muted-custom flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{trip.startDate} to {trip.endDate}</span>
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTripItem(trip.id);
                    }}
                    className="p-1.5 text-muted-custom hover:text-brand-coral rounded-lg transition-colors cursor-pointer"
                    title="Delete Trip"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Spend & Budget Stats */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-custom">Spent / Budget</span>
                    <span className="font-bold text-ink">
                      {formatCurrency(totalSpentInTripCurrency, trip.currency)} / {formatCurrency(trip.budget, trip.currency)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-surface-soft rounded-full overflow-hidden border border-hairline">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pctUsed > 90 ? 'bg-brand-coral' : 'bg-brand-mint'
                      }`}
                      style={{ width: `${pctUsed}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-custom">
                    <span>Tap card to {isActive ? 'exit' : 'open'} vault</span>
                    <span>{pctUsed}% used ({tripTxs.length} items)</span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      <TripModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

    </div>
  );
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Trip } from '../types';
import { loadTrips, saveTrip, deleteTrip } from '../services/db';

export interface TripContextType {
  trips: Trip[];
  activeTripVault: Trip | null;
  includeTripExpensesInTimeline: boolean;
  setIncludeTripExpensesInTimeline: (include: boolean) => void;
  setActiveTripVault: (trip: Trip | null) => void;
  addTripItem: (trip: Omit<Trip, 'id' | 'createdAt'>) => Promise<void>;
  updateTripItem: (trip: Trip) => Promise<void>;
  removeTripItem: (id: string) => Promise<void>;
  reloadTrips: () => Promise<Trip[]>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripVault, setActiveTripVaultState] = useState<Trip | null>(() => {
    try {
      const raw = localStorage.getItem('fa_active_trip_vault');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const setActiveTripVault = (trip: Trip | null) => {
    setActiveTripVaultState(trip);
    try {
      if (trip) {
        localStorage.setItem('fa_active_trip_vault', JSON.stringify(trip));
      } else {
        localStorage.removeItem('fa_active_trip_vault');
      }
    } catch (e) {
      console.warn('Failed to persist active trip vault:', e);
    }
  };

  const [includeTripExpensesInTimeline, setIncludeTripExpensesInTimelineState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('fa_include_trip_expenses');
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  const setIncludeTripExpensesInTimeline = (include: boolean) => {
    setIncludeTripExpensesInTimelineState(include);
    try {
      localStorage.setItem('fa_include_trip_expenses', JSON.stringify(include));
    } catch (e) {
      console.warn('Failed to save fa_include_trip_expenses:', e);
    }
  };

  const reloadTrips = async (): Promise<Trip[]> => {
    try {
      const trps = await loadTrips();
      setTrips(trps);
      return trps;
    } catch (e) {
      console.error('Failed to load trips:', e);
      return [];
    }
  };

  useEffect(() => {
    reloadTrips();
  }, []);

  const addTripItem = async (tripData: Omit<Trip, 'id' | 'createdAt'>) => {
    try {
      const newTrip: Trip = {
        ...tripData,
        id: `trip-${Date.now()}`,
        createdAt: Date.now()
      };
      await saveTrip(newTrip);
      setTrips(prev => [newTrip, ...prev]);
    } catch (e) {
      console.error('Failed to add trip:', e);
      throw e;
    }
  };

  const updateTripItem = async (trip: Trip) => {
    try {
      await saveTrip(trip);
      setTrips(prev => prev.map(t => (t.id === trip.id ? trip : t)));
      if (activeTripVault?.id === trip.id) {
        setActiveTripVault(trip);
      }
    } catch (e) {
      console.error('Failed to update trip:', e);
      throw e;
    }
  };

  const removeTripItem = async (id: string) => {
    try {
      await deleteTrip(id);
      setTrips(prev => prev.filter(t => t.id !== id));
      if (activeTripVault?.id === id) setActiveTripVault(null);
    } catch (e) {
      console.error('Failed to delete trip:', e);
      throw e;
    }
  };

  return (
    <TripContext.Provider
      value={{
        trips,
        activeTripVault,
        includeTripExpensesInTimeline,
        setIncludeTripExpensesInTimeline,
        setActiveTripVault,
        addTripItem,
        updateTripItem,
        removeTripItem,
        reloadTrips,
      }}
    >
      {children}
    </TripContext.Provider>
  );
};

export const useTrips = () => {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrips must be used within TripProvider');
  return ctx;
};

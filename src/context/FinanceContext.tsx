/**
 * Unified Finance Context Facade
 * Composes domain-specific contexts (CategoryContext, TripContext, TransactionContext)
 * to eliminate the God-Context anti-pattern while maintaining 100% backward compatibility.
 */

import React from 'react';
import { CategoryProvider, useCategories, CategoryContextType } from './CategoryContext';
import { TripProvider, useTrips, TripContextType } from './TripContext';
import { TransactionProvider, useTransactions, TransactionContextType } from './TransactionContext';

// Re-export domain hooks for granular component performance
export { useCategories } from './CategoryContext';
export { useTrips } from './TripContext';
export { useTransactions } from './TransactionContext';

export interface FinanceContextType extends CategoryContextType, TripContextType, TransactionContextType {
  reloadAllData: () => Promise<void>;
}

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <CategoryProvider>
      <TripProvider>
        <TransactionProvider>
          {children}
        </TransactionProvider>
      </TripProvider>
    </CategoryProvider>
  );
};

/**
 * Unified facade hook providing full backward compatibility for existing components.
 * For optimal render isolation in new/refactored components, prefer useCategories(),
 * useTrips(), or useTransactions().
 */
export const useFinance = (): FinanceContextType => {
  const categoryContext = useCategories();
  const tripContext = useTrips();
  const transactionContext = useTransactions();

  const deleteCategoryItemWithCascade = async (id: string) => {
    await categoryContext.deleteCategoryItem(id, async (catId, fallbackName) => {
      const affected = transactionContext.transactions.filter(t => t.categoryId === catId);
      for (const t of affected) {
        const remapped = {
          ...t,
          categoryId: 'cat-others',
          customCategoryName: t.customCategoryName || fallbackName || 'Others'
        };
        await transactionContext.editTransaction(remapped);
      }
    });
  };

  const reloadAllData = async (): Promise<void> => {
    await Promise.all([
      categoryContext.reloadCategories(),
      tripContext.reloadTrips(),
      transactionContext.reloadTransactions(),
    ]);
  };

  return {
    ...categoryContext,
    deleteCategoryItem: deleteCategoryItemWithCascade,
    ...tripContext,
    ...transactionContext,
    reloadAllData,
  };
};

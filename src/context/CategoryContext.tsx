import React, { createContext, useContext, useState, useEffect } from 'react';
import { Category } from '../types';
import { loadCategories, saveCategory, deleteCategory } from '../services/db';

export interface CategoryContextType {
  categories: Category[];
  addCategoryItem: (catData: Omit<Category, 'id'>) => Promise<void>;
  updateCategoryItem: (category: Category) => Promise<void>;
  deleteCategoryItem: (id: string, onCascadeDelete?: (catId: string, fallbackName?: string) => Promise<void>) => Promise<void>;
  reloadCategories: () => Promise<Category[]>;
}

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export const CategoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [categories, setCategories] = useState<Category[]>([]);

  const reloadCategories = async (): Promise<Category[]> => {
    try {
      const cats = await loadCategories();
      setCategories(cats);
      return cats;
    } catch (e) {
      console.error('Failed to load categories:', e);
      return [];
    }
  };

  useEffect(() => {
    reloadCategories();
  }, []);

  const addCategoryItem = async (catData: Omit<Category, 'id'>) => {
    try {
      const newCat: Category = {
        ...catData,
        id: `cat-${Date.now()}`
      };
      await saveCategory(newCat);
      setCategories(prev => [...prev, newCat]);
    } catch (e) {
      console.error('Failed to save category:', e);
      throw e;
    }
  };

  const updateCategoryItem = async (category: Category) => {
    try {
      await saveCategory(category);
      setCategories(prev => prev.map(c => (c.id === category.id ? category : c)));
    } catch (e) {
      console.error('Failed to update category:', e);
      throw e;
    }
  };

  const deleteCategoryItem = async (
    id: string,
    onCascadeDelete?: (catId: string, fallbackName?: string) => Promise<void>
  ) => {
    try {
      const deletedCat = categories.find(c => c.id === id);
      await deleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));

      if (onCascadeDelete) {
        await onCascadeDelete(id, deletedCat?.name || 'Others');
      }
    } catch (e) {
      console.error('Failed to delete category:', e);
      throw e;
    }
  };

  return (
    <CategoryContext.Provider
      value={{
        categories,
        addCategoryItem,
        updateCategoryItem,
        deleteCategoryItem,
        reloadCategories,
      }}
    >
      {children}
    </CategoryContext.Provider>
  );
};

export const useCategories = () => {
  const ctx = useContext(CategoryContext);
  if (!ctx) throw new Error('useCategories must be used within CategoryProvider');
  return ctx;
};

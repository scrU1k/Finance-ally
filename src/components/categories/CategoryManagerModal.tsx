import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { Category } from '../../types';
import { formatCurrency } from '../../services/currency';
import { X, Tag, Plus, Edit2, Check } from 'lucide-react';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose }) => {
  const { categories, updateCategoryItem, addCategoryItem, baseCurrency } = useFinance();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('');

  // New Category State
  const [newName, setNewName] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [newColor, setNewColor] = useState('#ec4899');
  const [showAddForm, setShowAddForm] = useState(false);

  const colorPalette = [
    '#ee5f1c', '#f2b300', '#2b6be4', '#002688',
    '#009efd', '#717171', '#ff0073', '#950000',
    '#34d399', '#ec4899', '#8b5cf6', '#14b8a6'
  ];

  if (!isOpen) return null;

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditLimit(cat.budgetLimit ? cat.budgetLimit.toString() : '');
    setEditColor(cat.color);
  };

  const handleSaveEdit = async (cat: Category) => {
    const numLimit = parseFloat(editLimit);
    const updated: Category = {
      ...cat,
      color: editColor || cat.color,
      budgetLimit: !isNaN(numLimit) && numLimit > 0 ? numLimit : undefined
    };
    await updateCategoryItem(updated);
    setEditingId(null);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const numLimit = parseFloat(newLimit);
    await addCategoryItem({
      name: newName.trim(),
      color: newColor,
      icon: 'Tag',
      budgetLimit: !isNaN(numLimit) && numLimit > 0 ? numLimit : undefined
    });
    setNewName('');
    setNewLimit('');
    setShowAddForm(false);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto cursor-pointer animate-in fade-in duration-200"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="max-w-xl w-full bg-surface-card/65 backdrop-blur-2xl saturate-[180%] border border-hairline rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/20 space-y-5 cursor-default relative ring-1 ring-white/10 max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-brand-purple" />
            <h3 className="text-lg font-display font-bold text-ink">
              Category & Budget Cap Manager
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-custom hover:text-ink hover:bg-surface-soft rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add New Category Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-muted-custom uppercase">Manage Category Caps & Palette</span>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs font-mono border border-brand-purple text-brand-purple px-3 py-1 rounded-full font-bold hover:bg-surface-soft cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add Category</span>
          </button>
        </div>

        {/* Add Category Form */}
        {showAddForm && (
          <form onSubmit={handleAddCategory} className="space-y-3 bg-surface-soft p-4 rounded-xl border border-hairline animate-in fade-in duration-150">
            <span className="text-xs font-mono font-bold text-ink block">Create New Custom Category</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Category Name (e.g. Subscriptions)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="bg-surface-card border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink"
                required
              />
              <input
                type="number"
                placeholder="Monthly Budget Cap (Optional)"
                value={newLimit}
                onChange={e => setNewLimit(e.target.value)}
                className="bg-surface-card border border-hairline rounded-xl px-3 py-2 text-xs font-mono text-ink"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block">Accent Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {colorPalette.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${newColor === c ? 'scale-125 border-ink ring-2 ring-white/20' : 'border-hairline'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full border border-brand-purple text-brand-purple hover:bg-surface-card text-xs font-mono font-bold py-2 rounded-xl cursor-pointer shadow-sm"
            >
              Save New Category
            </button>
          </form>
        )}

        {/* Category List with Editable Budget Caps */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {categories.map(cat => {
            const isEditing = editingId === cat.id;

            return (
              <div
                key={cat.id}
                className="bg-surface-soft border border-hairline p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-mono transition-all"
              >
                {!isEditing ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <div>
                        <span className="font-bold text-ink">{cat.name}</span>
                        <div className="text-[10px] text-muted-custom mt-0.5">
                          {cat.budgetLimit ? (
                            <span className="text-brand-mint font-semibold">Cap: {formatCurrency(cat.budgetLimit, baseCurrency)} / month</span>
                          ) : (
                            <span className="italic">No cap set</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(cat)}
                      className="p-1.5 rounded-lg border border-hairline bg-surface-card hover:border-ink text-ink transition-all cursor-pointer flex items-center gap-1 shrink-0 text-[11px]"
                    >
                      <Edit2 className="w-3 h-3 text-brand-blue" />
                      <span>Edit Cap</span>
                    </button>
                  </>
                ) : (
                  /* Inline Edit Form */
                  <div className="w-full space-y-3 bg-surface-card p-3 rounded-xl border border-hairline">
                    <div className="flex items-center justify-between font-bold text-ink">
                      <span>Edit "{cat.name}"</span>
                      <button type="button" onClick={() => setEditingId(null)} className="text-muted-custom text-[11px] cursor-pointer">Cancel</button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-muted-custom uppercase font-bold">Monthly Budget Limit ({baseCurrency})</label>
                      <input
                        type="number"
                        value={editLimit}
                        onChange={e => setEditLimit(e.target.value)}
                        placeholder="Leave blank for no limit"
                        className="w-full bg-surface-soft border border-hairline rounded-xl px-3 py-1.5 text-xs font-mono text-ink"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-muted-custom uppercase font-bold block">Change Color Accent</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {colorPalette.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${editColor === c ? 'scale-125 border-ink ring-2 ring-white/20' : 'border-hairline'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveEdit(cat)}
                      className="w-full border border-brand-blue text-brand-blue hover:bg-surface-soft font-mono text-xs font-bold py-1.5 rounded-xl cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Save Budget Cap
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

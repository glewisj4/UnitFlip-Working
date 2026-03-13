import React, { useState, useEffect } from 'react';
import { CatalogItem, Category, Tier } from '../core/models/types';
import { CatalogService } from '../core/services/CatalogService';
import { CategoryService } from '../core/services/CategoryService';
import { useAppContext } from '../core/hooks/useAppContext';
import { X, Save, Trash2, AlertTriangle, Image as ImageIcon } from 'lucide-react';

interface ProductEditorProps {
  itemId?: string; // If provided, edit mode. If not, create mode.
  onClose: () => void;
  onSave: () => void;
}

export const ProductEditor: React.FC<ProductEditorProps> = ({ itemId, onClose, onSave }) => {
  const { org } = useAppContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<CatalogItem>>({
    title: '',
    description: '',
    defaultPrice: 0,
    defaultQty: 1,
    unit: 'ea',
    isActive: true,
    tags: [],
  });

  useEffect(() => {
    if (org) {
      loadData();
    }
  }, [org, itemId]);

  const loadData = async () => {
    if (!org) return;
    setLoading(true);
    try {
      const cats = await CategoryService.getCategories(org.id);
      setCategories(cats.sort((a, b) => a.sortOrder - b.sortOrder));

      if (itemId) {
        const item = await CatalogService.getItem(org.id, itemId);
        if (item) {
          setFormData(item);
        } else {
          setError('Product not found');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!org) return;
    if (!formData.title?.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const category = categories.find(c => c.id === formData.categoryId);
      const dataToSave = {
        ...formData,
        categoryName: category?.name,
        updatedBy: 'user', // TODO: get actual user
      };

      if (itemId) {
        await CatalogService.updateItem(org.id, itemId, dataToSave);
      } else {
        await CatalogService.addItem(org.id, {
            ...dataToSave,
            createdBy: 'user' // TODO: get actual user
        });
      }
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!org || !itemId) return;
    if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;

    setSaving(true);
    try {
      await CatalogService.deleteItem(org.id, itemId);
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper to flatten categories for select
  const flattenedCategories = React.useMemo(() => {
    const flatten = (cats: Category[], parentId: string | null = null, depth = 0): { id: string, name: string, depth: number }[] => {
      const result: { id: string, name: string, depth: number }[] = [];
      const children = cats
        .filter(c => (c.parentId || null) === (parentId || null))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      
      for (const child of children) {
        result.push({ id: child.id, name: child.name, depth });
        result.push(...flatten(cats, child.id, depth + 1));
      }
      return result;
    };
    return flatten(categories);
  }, [categories]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-xl shadow-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-bold text-slate-900">
            {itemId ? 'Edit Product' : 'New Product'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-start gap-3">
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                  value={formData.title || ''}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Product Title"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                  value={formData.categoryId || ''}
                  onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value || undefined }))}
                >
                  <option value="">Select Category...</option>
                  {flattenedCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {'\u00A0\u00A0'.repeat(cat.depth) + cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Item #</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                    value={formData.itemNumber || ''}
                    onChange={e => setFormData(prev => ({ ...prev, itemNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Model #</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                    value={formData.modelNumber || ''}
                    onChange={e => setFormData(prev => ({ ...prev, modelNumber: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                    value={formData.brand || ''}
                    onChange={e => setFormData(prev => ({ ...prev, brand: e.target.value }))}
                  />
              </div>
            </div>

            {/* Pricing & Media */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Default Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                      value={formData.defaultPrice || 0}
                      onChange={e => setFormData(prev => ({ ...prev, defaultPrice: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                    value={formData.unit || 'ea'}
                    onChange={e => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                  >
                    <option value="ea">Each (ea)</option>
                    <option value="sqft">Sq. Ft.</option>
                    <option value="lnft">Ln. Ft.</option>
                    <option value="box">Box</option>
                    <option value="gal">Gallon</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Image URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                    value={formData.imageUrl || ''}
                    onChange={e => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                {formData.imageUrl && (
                  <div className="mt-2 w-24 h-24 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                    <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue h-24 resize-none"
                  value={formData.description || ''}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  className="rounded border-slate-300 text-lowes-blue focus:ring-lowes-blue"
                  checked={formData.isActive ?? true}
                  onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                />
                <label htmlFor="isActive" className="text-sm font-medium text-slate-700">Active</label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            {itemId && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-red-600 font-bold hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                disabled={saving}
              >
                <Trash2 size={18} /> Delete Product
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-lowes-blue text-white font-bold rounded-lg hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={18} /> {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

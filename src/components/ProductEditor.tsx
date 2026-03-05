import React, { useState, useMemo } from 'react';
import { CatalogItem, Category, Tier } from '../core/models/types';
import { X, Info, Tag } from 'lucide-react';

interface ProductEditorProps {
  item: CatalogItem;
  categories: Category[];
  onSave: (item: CatalogItem) => void;
  onClose: () => void;
}

export const ProductEditor: React.FC<ProductEditorProps> = ({ item: initialItem, categories, onSave, onClose }) => {
  const [item, setItem] = useState<CatalogItem>(initialItem);
  const [newTag, setNewTag] = useState('');

  const suggestions = useMemo(() => {
    // Simple suggestion logic based on keywords
    const keywords = item.name.toLowerCase().split(' ');
    return categories.filter(c => 
      keywords.some(k => c.name.toLowerCase().includes(k))
    ).slice(0, 3);
  }, [item.name, categories]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <header className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900">{item.id ? 'Edit Product' : 'New Product'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Basic Information</label>
              <input 
                type="text" 
                placeholder="Product Name"
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all"
                value={item.name}
                onChange={e => setItem({...item, name: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {categories.map(cat => (
                  <button 
                    key={cat.id}
                    onClick={() => setItem({...item, categoryId: cat.id, categoryName: cat.name})}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      item.categoryId === cat.id 
                        ? 'bg-lowes-blue text-white shadow-md shadow-blue-100' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
              
              {suggestions.length > 0 && !item.categoryId && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Info size={14} />
                  <span>Suggestions:</span>
                  {suggestions.map(s => (
                    <button 
                      key={s.id}
                      onClick={() => setItem({...item, categoryId: s.id, categoryName: s.name})}
                      className="text-lowes-blue hover:underline"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Default Qty</label>
                <input 
                  type="number" 
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all"
                  value={item.defaultQty}
                  onChange={e => setItem({...item, defaultQty: parseInt(e.target.value) || 1})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unit</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all"
                  value={item.unit}
                  onChange={e => setItem({...item, unit: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {item.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-lowes-blue rounded-lg text-xs font-bold">
                    {tag}
                    <button onClick={() => setItem({...item, tags: item.tags.filter(t => t !== tag)})}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Add tag and press Enter"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      setItem({...item, tags: [...new Set([...item.tags, newTag.trim()])]});
                      setNewTag('');
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <footer className="p-6 border-t border-slate-100 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(item)}
            className="flex-1 px-4 py-3 bg-lowes-blue text-white font-bold rounded-xl hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all active:scale-95"
          >
            Save Product
          </button>
        </footer>
      </div>
    </div>
  );
};

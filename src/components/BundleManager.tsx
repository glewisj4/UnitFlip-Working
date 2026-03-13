import React, { useState, useMemo } from 'react';
import { CatalogItem, BundleRule } from '../core/models/types';
import { createId } from '../services/storage';
import { X, Settings, Package, Trash2, Search } from 'lucide-react';

interface BundleManagerProps {
  triggerItem: CatalogItem;
  rule: BundleRule | null;
  catalogItems: CatalogItem[];
  onSave: (rule: BundleRule) => void;
  onClose: () => void;
}

export const BundleManager: React.FC<BundleManagerProps> = ({ triggerItem, rule: initialRule, catalogItems, onSave, onClose }) => {
  const [rule, setRule] = useState<BundleRule>(initialRule || {
    id: createId(),
    orgId: triggerItem.orgId,
    triggerCatalogItemId: triggerItem.id,
    companions: [],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = useMemo(() => {
    return catalogItems.filter(i => 
      i.id !== triggerItem.id && 
      (i.title || i.name || '').toLowerCase().includes(searchTerm.toLowerCase()) &&
      !rule.companions.some(c => c.catalogItemId === i.id)
    ).slice(0, 5);
  }, [catalogItems, searchTerm, rule.companions, triggerItem.id]);

  const addCompanion = (item: CatalogItem) => {
    setRule({
      ...rule,
      companions: [...rule.companions, {
        catalogItemId: item.id,
        defaultQty: item.defaultQty || 1,
        required: false
      }]
    });
    setSearchTerm('');
  };

  const removeCompanion = (id: string) => {
    setRule({
      ...rule,
      companions: rule.companions.filter(c => c.catalogItemId !== id)
    });
  };

  const updateCompanion = (id: string, updates: Partial<any>) => {
    setRule({
      ...rule,
      companions: rule.companions.map(c => c.catalogItemId === id ? {...c, ...updates} : c)
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <header className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Bundle Rules</h2>
            <p className="text-sm text-slate-500">When adding <span className="font-semibold">{triggerItem.title || triggerItem.name}</span>, suggest these items:</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rule.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                <Settings size={20} />
              </div>
              <div>
                <p className="font-bold text-slate-900">Rule Enabled</p>
                <p className="text-xs text-slate-500">Suggestions will appear during product selection</p>
              </div>
            </div>
            <button 
              onClick={() => setRule({...rule, enabled: !rule.enabled})}
              className={`relative w-12 h-6 rounded-full transition-colors ${rule.enabled ? 'bg-lowes-blue' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${rule.enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Companion Products</label>
            
            <div className="space-y-2">
              {rule.companions.map(companion => {
                const item = catalogItems.find(i => i.id === companion.catalogItemId);
                if (!item) return null;
                return (
                  <div key={item.id} className="flex items-center gap-4 p-3 bg-white border border-slate-200 rounded-xl">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package size={20} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{item.title || item.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={companion.required} 
                            onChange={e => updateCompanion(item.id, {required: e.target.checked})}
                            className="rounded border-slate-300 text-lowes-blue focus:ring-lowes-blue"
                          />
                          Pre-checked
                        </label>
                        <div className="flex items-center gap-1 bg-slate-100 rounded px-1.5 py-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Qty</span>
                          <input 
                            type="number" 
                            value={companion.defaultQty} 
                            onChange={e => updateCompanion(item.id, {defaultQty: parseInt(e.target.value) || 1})}
                            className="w-8 bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 p-0"
                          />
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeCompanion(item.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search products to add..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && filteredItems.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden">
                  {filteredItems.map(item => (
                    <button 
                      key={item.id}
                      onClick={() => addCompanion(item)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left transition-colors"
                    >
                      <Package size={16} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">{item.title || item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(rule)}
            className="flex-1 px-4 py-3 bg-lowes-blue text-white font-bold rounded-xl hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all active:scale-95"
          >
            Save Bundle Rule
          </button>
        </footer>
      </div>
    </div>
  );
};

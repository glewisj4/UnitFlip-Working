import React, { useState, useEffect } from 'react';
import { CatalogItem, BundleRule, BundleCompanion, ProductStatus, Tier } from '../core/models/types';
import { X, Check, Plus, Minus, Info, AlertCircle } from 'lucide-react';

interface BundleSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedCompanions: { catalogItemId: string; qty: number }[]) => void;
  triggerItem: CatalogItem;
  rule: BundleRule;
  catalogItems: CatalogItem[];
  mode?: 'default' | 'preview';
}

export const BundleSuggestionsModal: React.FC<BundleSuggestionsModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  triggerItem,
  rule,
  catalogItems,
  mode = 'default'
}) => {
  const [selections, setSelections] = useState<Record<string, { selected: boolean; qty: number }>>({});

  useEffect(() => {
    if (isOpen && rule) {
      const initial: Record<string, { selected: boolean; qty: number }> = {};
      rule.companions.forEach(c => {
        initial[c.catalogItemId] = {
          selected: true, // Pre-check all by default as requested
          qty: c.defaultQty
        };
      });
      setSelections(initial);
    }
  }, [isOpen, rule]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setSelections(prev => {
      const current = prev[id] || { selected: false, qty: 1 };
      return {
        ...prev,
        [id]: { ...current, selected: !current.selected }
      };
    });
  };

  const handleQtyChange = (id: string, delta: number) => {
    setSelections(prev => {
      const current = prev[id] || { selected: false, qty: 1 };
      return {
        ...prev,
        [id]: { ...current, qty: Math.max(1, current.qty + delta) }
      };
    });
  };

  const handleConfirm = () => {
    const selected = (Object.entries(selections) as [string, { selected: boolean; qty: number }][])
      .filter(([_, val]) => val.selected)
      .map(([id, val]) => ({ catalogItemId: id, qty: val.qty }));
    onConfirm(selected);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`p-6 border-b border-slate-100 flex justify-between items-start ${mode === 'preview' ? 'bg-purple-50' : 'bg-slate-50'}`}>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {mode === 'preview' ? 'Bundle Preview' : 'Bundle Suggestions'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'preview' ? 'Testing rules for ' : 'Suggestions for '}
              <span className="font-semibold text-slate-700">{triggerItem.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {mode === 'preview' ? (
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100 text-purple-700 text-sm">
              <Info size={18} />
              <p>This is a preview. No items will be added to any list.</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100 text-blue-700 text-sm">
              <Info size={18} />
              <p>We found companion products often used with this item. Select which ones to add.</p>
            </div>
          )}

          <div className="space-y-3">
            {rule.companions.map(companion => {
              const item = catalogItems.find(i => i.id === companion.catalogItemId);
              if (!item) return null;
              const selection = selections[item.id] || { selected: false, qty: companion.defaultQty };

              return (
                <div 
                  key={item.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    selection.selected 
                      ? 'border-lowes-blue bg-blue-50/30' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <button 
                    onClick={() => handleToggle(item.id)}
                    className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors ${
                      selection.selected 
                        ? 'bg-lowes-blue border-lowes-blue text-white' 
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {selection.selected && <Check size={16} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-900 truncate">{item.name}</h4>
                      {companion.required && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded">Required</span>
                      )}
                    </div>
                    {/* companion.note doesn't exist on BundleCompanion type, removing it */}
                  </div>

                  {selection.selected && (
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
                      <button 
                        onClick={() => handleQtyChange(item.id, -1)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-slate-700">{selection.qty}</span>
                      <button 
                        onClick={() => handleQtyChange(item.id, 1)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            {mode === 'preview' ? 'Close Preview' : 'Just Add Main Item'}
          </button>
          {mode !== 'preview' && (
            <button 
              onClick={handleConfirm}
              className="flex-1 px-4 py-2.5 bg-lowes-blue text-white font-semibold rounded-xl hover:bg-lowes-hover shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            >
              Add Selected
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Room, CatalogItem } from '../core/models/types';
import { ChevronDown, ChevronRight, Printer, Plus, Minus } from 'lucide-react';

interface ChecklistModeProps {
  rooms: Room[];
  products: CatalogItem[];
  onUpdateProduct: (product: CatalogItem) => void;
}

export const ChecklistMode: React.FC<ChecklistModeProps> = ({ rooms, products, onUpdateProduct }) => {
  // Track expanded state for rooms and categories
  // Format: "roomId" or "roomId-category"
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Group products by room -> category
  const groupedData = useMemo(() => {
    const data: Record<string, Record<string, CatalogItem[]>> = {};
    
    rooms.forEach(room => {
      data[room.id] = {};
      const roomProducts = products.filter(p => p.roomId === room.id);
      
      roomProducts.forEach(product => {
        const category = product.category || 'Uncategorized';
        if (!data[room.id][category]) {
          data[room.id][category] = [];
        }
        data[room.id][category].push(product);
      });
    });
    
    return data;
  }, [rooms, products]);

  const handleQuantityChange = (product: CatalogItem, delta: number) => {
    const newQuantity = Math.max(0, (product.quantity || 0) + delta);
    onUpdateProduct({ ...product, quantity: newQuantity });
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-center mb-6 print:hidden">
        <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Inspection Checklist</h2>
            <p className="text-sm text-slate-500">Verify items and update quantities.</p>
        </div>
        <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
        >
            <Printer size={16} /> <span className="hidden sm:inline">Print</span>
        </button>
      </div>

      <div className="space-y-3">
        {rooms.map(room => {
          const categories = groupedData[room.id] || {};
          const categoryKeys = Object.keys(categories).sort();
          const hasItems = categoryKeys.length > 0;
          
          if (!hasItems) return null;

          const isRoomExpanded = expandedItems[room.id];

          return (
            <div key={room.id} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {/* Room Header */}
              <div 
                className="bg-slate-50 p-3 md:p-4 flex items-center justify-between cursor-pointer select-none"
                onClick={() => toggleExpand(room.id)}
              >
                <div className="flex items-center gap-2 md:gap-3">
                    {isRoomExpanded ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
                    <h3 className="font-bold text-slate-800">{room.name}</h3>
                </div>
                <span className="text-xs font-medium bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                  {Object.values(categories).flat().length} items
                </span>
              </div>
              
              {/* Room Content (Categories) */}
              {isRoomExpanded && (
                <div className="border-t border-slate-100">
                  {categoryKeys.map(category => {
                    const categoryId = `${room.id}-${category}`;
                    const isCategoryExpanded = expandedItems[categoryId];
                    const categoryProducts = categories[category];

                    return (
                      <div key={categoryId} className="border-b border-slate-50 last:border-0">
                        {/* Category Header */}
                        <div 
                          className="p-3 pl-8 md:pl-10 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => toggleExpand(categoryId)}
                        >
                          <div className="flex items-center gap-2">
                            {isCategoryExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                            <span className="font-medium text-slate-700 text-sm">{category}</span>
                          </div>
                          <span className="text-xs text-slate-400">{categoryProducts.length}</span>
                        </div>

                        {/* Category Content (Products) */}
                        {isCategoryExpanded && (
                          <div className="bg-slate-50/50 pl-4 md:pl-6 pr-2 py-2">
                            {categoryProducts.map(product => (
                              <div key={product.id} className="flex items-center justify-between p-2 border-b border-slate-100 last:border-0">
                                <div className="flex-1 pr-2">
                                  <div className="text-sm font-medium text-slate-800">{product.name}</div>
                                  <div className="text-xs text-slate-500 truncate max-w-[200px]">{product.description}</div>
                                </div>
                                
                                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                                  <button 
                                    onClick={() => handleQuantityChange(product, -1)}
                                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-600 transition-colors"
                                    disabled={product.quantity <= 0}
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="w-6 text-center text-sm font-semibold">{product.quantity || 0}</span>
                                  <button 
                                    onClick={() => handleQuantityChange(product, 1)}
                                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-600 transition-colors"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
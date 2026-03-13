import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Room, CatalogItem, ProductOption, Tier, ProductStatus, RepairTemplate } from '../core/models/types';
import { normalizeTitle } from '../utils/normalizeTitle';
import { ProductCard } from './ProductCard';
import { createId, REPAIR_TEMPLATES } from '../services/storage';
import { generateRoomProducts } from '../services/gemini';
import { ArrowLeft, Sparkles, Plus, Loader2, Save, DollarSign, Wrench, ChevronDown, Filter, ArrowUpAZ, ArrowDownAZ, Calendar, ListFilter } from 'lucide-react';

interface RoomViewProps {
  room: Room;
  products: CatalogItem[];
  onBack: () => void;
  onAddProduct: (product: CatalogItem) => void;
  onUpdateProduct: (product: CatalogItem) => void;
  onDeleteProduct: (id: string) => void;
  onUpdateRoom?: (room: Room) => void;
  onViewCategory?: (category: string) => void;
}

export const RoomView: React.FC<RoomViewProps> = ({ 
  room, 
  products, 
  onBack, 
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onUpdateRoom,
  onViewCategory
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddingManually, setIsAddingManually] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  
  // Local state for budget editing
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(room.budget?.toString() || '0');

  // Repair Kit Menu State
  const [showRepairMenu, setShowRepairMenu] = useState(false);
  const repairMenuRef = useRef<HTMLDivElement>(null);

  // Filter & Sort State
  const [filterStatus, setFilterStatus] = useState<ProductStatus | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Close repair menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (repairMenuRef.current && !repairMenuRef.current.contains(event.target as Node)) {
        setShowRepairMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    const suggestions = await generateRoomProducts(room.name);
    
    suggestions.forEach(suggestion => {
        const newProd: CatalogItem = {
            id: createId(),
            orgId: 'default-org',
            title: suggestion.name,
            normalizedTitle: normalizeTitle(suggestion.name),
            name: suggestion.name,
            description: suggestion.description,
            tags: [],
            defaultQty: 1,
            unit: 'ea',
            defaultTier: Tier.STANDARD,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            options: suggestion.suggestedOptions.map(opt => ({
                id: createId(),
                name: opt.name,
                price: opt.price,
                sku: opt.sku,
                tier: opt.tier as Tier,
                url: ''
            }))
        };
        onAddProduct(newProd);
    });
    
    setIsGenerating(false);
  };

  const handleApplyTemplate = (template: RepairTemplate) => {
    template.items.forEach(item => {
        const newProd: CatalogItem = {
            id: createId(),
            orgId: 'default-org',
            title: item.name,
            normalizedTitle: normalizeTitle(item.name),
            name: item.name,
            description: item.description,
            tags: ['Repair Kit'],
            defaultQty: 1,
            unit: 'ea',
            defaultTier: item.tier,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            options: [{
                id: createId(),
                name: `Standard ${item.name}`,
                price: item.defaultPrice,
                sku: 'GENERIC',
                tier: item.tier,
                url: ''
            }]
        };
        onAddProduct(newProd);
    });
    setShowRepairMenu(false);
  };

  const handleManualAdd = () => {
    if (!newProductName.trim()) return;
    const newProd: CatalogItem = {
        id: createId(),
        orgId: 'default-org',
        title: newProductName,
        normalizedTitle: normalizeTitle(newProductName),
        name: newProductName,
        description: 'New item',
        tags: [],
        defaultQty: 1,
        unit: 'ea',
        defaultTier: Tier.STANDARD,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        options: []
    };
    onAddProduct(newProd);
    setNewProductName('');
    setIsAddingManually(false);
  };

  const saveBudget = () => {
    if (onUpdateRoom) {
      onUpdateRoom({ ...room, budget: parseFloat(budgetInput) });
    }
    setIsEditingBudget(false);
  };

  const totalActual = products.reduce((sum, p) => sum + ((p.actualCost || 0) * (p.quantity || 1)), 0);
  const variance = (room.budget || 0) - totalActual;

  // Filter and Sort Logic
  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // Filter
    if (filterStatus !== 'ALL') {
      result = result.filter(p => p.status === filterStatus);
    }

    // Sort
    result.sort((a, b) => {
      let valA: any, valB: any;
      
      switch (sortBy) {
        case 'name':
          valA = (a.title || a.name).toLowerCase();
          valB = (b.title || b.name).toLowerCase();
          break;
        case 'price':
          // Prioritize actual cost, fallback to standard option price or 0
          const costA = (a.actualCost || 0) > 0 ? (a.actualCost || 0) : (a.options.find(o => o.tier === Tier.STANDARD)?.price || a.options[0]?.price || 0);
          const costB = (b.actualCost || 0) > 0 ? (b.actualCost || 0) : (b.options.find(o => o.tier === Tier.STANDARD)?.price || b.options[0]?.price || 0);
          valA = costA * (a.quantity || 1);
          valB = costB * (b.quantity || 1);
          break;
        case 'date':
        default:
          valA = a.createdAt || '';
          valB = b.createdAt || '';
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, filterStatus, sortBy, sortOrder]);

  const [availableTemplates, setAvailableTemplates] = useState<RepairTemplate[]>([]);
  
  useEffect(() => {
      const data = localStorage.getItem('unitflip_db_v2');
      if (data) {
          const parsed = JSON.parse(data);
          if (parsed.repairTemplates) {
              setAvailableTemplates(parsed.repairTemplates);
          } else {
              setAvailableTemplates(REPAIR_TEMPLATES || []); // Fallback
          }
      }
  }, [showRepairMenu]); 

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <ArrowLeft size={24} />
            </button>
            <div>
            <h2 className="text-3xl font-bold text-slate-800">{room.name}</h2>
            <p className="text-slate-500">Manage products, options, and replacement status.</p>
            </div>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
            <div className="px-4 border-r border-slate-200">
                <p className="text-xs text-slate-400 uppercase font-semibold">Budget</p>
                {isEditingBudget ? (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">$</span>
                        <input 
                            type="number" 
                            value={budgetInput}
                            onChange={(e) => setBudgetInput(e.target.value)}
                            className="w-24 px-1 py-0.5 border border-slate-300 rounded text-sm font-bold text-slate-900"
                            autoFocus
                            onBlur={saveBudget}
                            onKeyDown={(e) => e.key === 'Enter' && saveBudget()}
                        />
                    </div>
                ) : (
                    <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1 -ml-1 transition-colors"
                        onClick={() => setIsEditingBudget(true)}
                    >
                        <p className="text-lg font-bold text-slate-800">${room.budget?.toLocaleString()}</p>
                    </div>
                )}
            </div>
            <div className="px-4 border-r border-slate-200">
                <p className="text-xs text-slate-400 uppercase font-semibold">Spent</p>
                <p className="text-lg font-bold text-blue-600">${totalActual.toLocaleString()}</p>
            </div>
            <div className="px-4">
                <p className="text-xs text-slate-400 uppercase font-semibold">Remaining</p>
                <p className={`text-lg font-bold ${variance < 0 ? 'text-red-500' : 'text-green-600'}`}>
                    ${variance.toLocaleString()}
                </p>
            </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        {/* Filter and Sort Controls */}
        <div className="flex items-center gap-3 bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto max-w-full">
            <div className="flex items-center gap-2 px-2 border-r border-slate-200">
                <ListFilter size={16} className="text-slate-400" />
                <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as ProductStatus | 'ALL')}
                    className="text-sm border-none focus:ring-0 bg-transparent text-slate-700 font-medium py-1 pr-8 cursor-pointer"
                >
                    <option value="ALL">All Statuses</option>
                    <option value={ProductStatus.PLANNING}>Planning</option>
                    <option value={ProductStatus.ORDERED}>Ordered</option>
                    <option value={ProductStatus.INSTALLED}>Installed</option>
                    <option value={ProductStatus.REPLACED}>Replaced</option>
                    <option value={ProductStatus.REFRESHED}>Refreshed</option>
                    <option value={ProductStatus.REPAIRED}>Repaired</option>
                </select>
            </div>
            
            <div className="flex items-center gap-2 px-2">
               <span className="text-xs text-slate-400 font-medium uppercase mr-1">Sort By:</span>
               <div className="flex gap-1">
                   <button 
                        onClick={() => { setSortBy('name'); setSortOrder(sortBy === 'name' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                        className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${sortBy === 'name' ? 'bg-lowes-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                   >
                       {sortBy === 'name' && (sortOrder === 'asc' ? <ArrowDownAZ size={12} /> : <ArrowUpAZ size={12} />)}
                       Name
                   </button>
                   <button 
                        onClick={() => { setSortBy('price'); setSortOrder(sortBy === 'price' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                        className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${sortBy === 'price' ? 'bg-lowes-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                   >
                       <DollarSign size={12} />
                       Price
                   </button>
                   <button 
                        onClick={() => { setSortBy('date'); setSortOrder(sortBy === 'date' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                        className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${sortBy === 'date' ? 'bg-lowes-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                   >
                       <Calendar size={12} />
                       Date
                   </button>
               </div>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-end gap-3 ml-auto">
                <div className="relative" ref={repairMenuRef}>
                    <button 
                        onClick={() => setShowRepairMenu(!showRepairMenu)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm shadow-sm"
                    >
                        <Wrench size={16} className="text-orange-600" />
                        Add Repair Kit
                        <ChevronDown size={14} className="text-slate-400" />
                    </button>
                    
                    {showRepairMenu && (
                        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <div className="p-3 bg-slate-50 border-b border-slate-200">
                                <h4 className="font-bold text-slate-800 text-sm">Select Project Type</h4>
                                <p className="text-xs text-slate-500">Adds all necessary supplies to list</p>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {availableTemplates.map(template => (
                                    <button
                                        key={template.id}
                                        onClick={() => handleApplyTemplate(template)}
                                        className="w-full text-left p-3 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0 group"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-semibold text-slate-800 text-sm group-hover:text-blue-700">{template.name}</span>
                                            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{template.items.length} items</span>
                                        </div>
                                        <p className="text-xs text-slate-500 line-clamp-1">{template.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-70 font-medium text-sm"
                >
                    {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    {isGenerating ? 'Analyzing...' : 'Auto-Fill with AI'}
                </button>
        </div>
      </div>

      {products.length === 0 && !isGenerating ? (
         <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Sparkles size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No Products Yet</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">Start by adding common items manually, use a Repair Kit, or let our AI suggest a standard list for {room.name}.</p>
            <div className="flex flex-wrap justify-center gap-3">
                <button 
                    onClick={() => setIsAddingManually(true)}
                    className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                    Add Manually
                </button>
                <button 
                    onClick={() => setShowRepairMenu(true)}
                    className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                    <Wrench size={16} /> Use Repair Kit
                </button>
                <button 
                    onClick={handleGenerate}
                    className="px-5 py-2.5 bg-lowes-blue text-white font-medium rounded-lg hover:bg-lowes-hover shadow-md transition-colors"
                >
                    Auto-Populate
                </button>
            </div>
         </div>
      ) : (
          <div className="grid grid-cols-1 gap-6 max-w-4xl mx-auto">
             {/* Manual Add Inline */}
             {isAddingManually ? (
                 <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex gap-3 items-center">
                    <input 
                        autoFocus
                        type="text" 
                        placeholder="Enter item name (e.g. Ceiling Fan)"
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                    />
                    <button 
                        onClick={handleManualAdd}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                    >
                        Save
                    </button>
                    <button 
                        onClick={() => setIsAddingManually(false)}
                        className="p-2 text-slate-400 hover:text-slate-600"
                    >
                        Cancel
                    </button>
                 </div>
             ) : (
                 <button 
                    onClick={() => setIsAddingManually(true)}
                    className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-lowes-blue hover:text-lowes-blue transition-all flex items-center justify-center gap-2 font-medium bg-slate-50/50 hover:bg-white"
                 >
                    <Plus size={20} /> Add New Item
                 </button>
             )}

             {/* Filtered List */}
             {filteredAndSortedProducts.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                   <Filter className="mx-auto text-slate-400 mb-2" size={24} />
                   <p className="text-slate-500 text-sm">No items match your filter.</p>
                   <button onClick={() => setFilterStatus('ALL')} className="text-lowes-blue text-xs font-semibold mt-2 hover:underline">Clear Filters</button>
                </div>
             ) : (
                 filteredAndSortedProducts.map(product => (
                     <ProductCard 
                        key={product.id} 
                        product={product} 
                        onUpdate={onUpdateProduct}
                        onDelete={onDeleteProduct}
                        onViewCategory={onViewCategory}
                     />
                 ))
             )}
          </div>
      )}
    </div>
  );
};
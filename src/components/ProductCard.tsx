import React, { useState } from 'react';
import { CatalogItem, ProductOption, Tier, ProductStatus } from '../core/models/types';
import { Plus, Trash2, ExternalLink, ShoppingCart, Tag, AlertCircle, RefreshCw, CheckCircle2, Clock, Wrench, ListFilter } from 'lucide-react';

interface ProductCardProps {
  product: CatalogItem;
  onUpdate: (updatedProduct: CatalogItem) => void;
  onDelete: (productId: string) => void;
  onViewCategory?: (category: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onUpdate, onDelete, onViewCategory }) => {
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [newOption, setNewOption] = useState<Partial<ProductOption>>({
    tier: Tier.STANDARD,
    price: 0
  });

  const handleAddOption = () => {
    if (!newOption.name || !newOption.price) return;
    
    const option: ProductOption = {
      id: Date.now().toString(),
      name: newOption.name,
      price: Number(newOption.price),
      sku: newOption.sku || 'N/A',
      tier: newOption.tier as Tier,
      url: newOption.url || '',
      description: newOption.description || '',
      brand: newOption.brand || '',
      modelNumber: newOption.modelNumber || '',
      imageUrl: newOption.imageUrl || ''
    };

    const updatedProduct = {
      ...product,
      options: [...product.options, option]
    };
    
    onUpdate(updatedProduct);
    setIsAddingOption(false);
    setNewOption({ tier: Tier.STANDARD, price: 0 });
  };

  const removeOption = (optionId: string) => {
    const updatedProduct = {
      ...product,
      options: product.options.filter(o => o.id !== optionId)
    };
    onUpdate(updatedProduct);
  };

  const updateStatus = (status: ProductStatus) => {
    onUpdate({ ...product, status });
  };

  const updateActualCost = (cost: number) => {
    onUpdate({ ...product, actualCost: cost });
  };

  const updateDetails = (field: keyof CatalogItem, value: any) => {
    onUpdate({ ...product, [field]: value });
  };

  const getTierColor = (tier: Tier) => {
    switch (tier) {
      case Tier.BUDGET: return 'bg-orange-100 text-orange-800 border-orange-200';
      case Tier.STANDARD: return 'bg-blue-100 text-blue-800 border-blue-200';
      case Tier.PREMIUM: return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: ProductStatus) => {
    switch (status) {
        case ProductStatus.INSTALLED: return 'bg-green-100 text-green-700 border-green-200';
        case ProductStatus.ORDERED: return 'bg-blue-100 text-blue-700 border-blue-200';
        case ProductStatus.REPAIRED: return 'bg-purple-100 text-purple-700 border-purple-200';
        case ProductStatus.REPLACED: return 'bg-orange-100 text-orange-700 border-orange-200';
        case ProductStatus.REFRESHED: return 'bg-teal-100 text-teal-700 border-teal-200';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex justify-between items-start mb-4">
            <div className="flex-1 mr-4">
                <input 
                    type="text" 
                    value={product.title || product.name}
                    onChange={(e) => onUpdate({ ...product, title: e.target.value, name: e.target.value })}
                    className="text-lg font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-lowes-blue focus:outline-none w-full mb-1"
                />
                <input 
                    type="text" 
                    value={product.description || ''}
                    onChange={(e) => updateDetails('description', e.target.value)}
                    placeholder="Add description..."
                    className="text-sm text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-lowes-blue focus:outline-none w-full"
                />
            </div>
            <button 
                onClick={() => onDelete(product.id)}
                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                title="Delete Product"
            >
                <Trash2 size={18} />
            </button>
        </div>

        {/* Extended Fields */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white p-2 rounded border border-slate-200 relative group/cat">
                <label className="block text-[10px] uppercase font-bold text-slate-400">Category</label>
                <div className="flex items-center gap-1">
                    <input 
                        type="text" 
                        value={product.category || ''}
                        onChange={(e) => updateDetails('category', e.target.value)}
                        className="w-full text-sm font-medium text-slate-700 focus:outline-none bg-transparent"
                        placeholder="General"
                        list={`cat-list-${product.id}`}
                    />
                    {onViewCategory && product.category && (
                        <button 
                            onClick={() => onViewCategory(product.category!)}
                            className="p-1 text-slate-400 hover:text-lowes-blue hover:bg-blue-50 rounded transition-colors"
                            title={`View all ${product.category}`}
                        >
                            <ListFilter size={14} />
                        </button>
                    )}
                </div>
                <datalist id={`cat-list-${product.id}`}>
                     <option value="General" />
                     <option value="Electrical" />
                     <option value="Plumbing" />
                     <option value="HVAC" />
                     <option value="Flooring" />
                     <option value="Paint" />
                     <option value="Kitchen" />
                     <option value="Bathroom" />
                     <option value="Lighting" />
                </datalist>
            </div>
            <div className="bg-white p-2 rounded border border-slate-200">
                <label className="block text-[10px] uppercase font-bold text-slate-400">Quantity</label>
                <input 
                    type="number" 
                    min="1"
                    value={product.quantity || 1}
                    onChange={(e) => updateDetails('quantity', parseInt(e.target.value) || 1)}
                    className="w-full text-sm font-medium text-slate-700 focus:outline-none"
                />
            </div>
            <div className="bg-white p-2 rounded border border-slate-200">
                <label className="block text-[10px] uppercase font-bold text-slate-400">Unit</label>
                <input 
                    type="text" 
                    value={product.unit || 'ea'}
                    onChange={(e) => updateDetails('unit', e.target.value)}
                    className="w-full text-sm font-medium text-slate-700 focus:outline-none"
                />
            </div>
        </div>

        {/* Workflow / Status Bar */}
        <div className="flex flex-wrap gap-4 items-center">
            <select 
                value={product.status}
                onChange={(e) => updateStatus(e.target.value as ProductStatus)}
                className={`text-xs font-bold uppercase px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-lowes-blue cursor-pointer ${getStatusColor(product.status)}`}
            >
                <option value={ProductStatus.PLANNING}>Planning</option>
                <option value={ProductStatus.ORDERED}>Ordered</option>
                <option value={ProductStatus.INSTALLED}>Installed</option>
                <option value={ProductStatus.REPLACED}>Replaced</option>
                <option value={ProductStatus.REFRESHED}>Refreshed</option>
                <option value={ProductStatus.REPAIRED}>Repaired</option>
            </select>

            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                <span className="text-xs text-slate-400 font-semibold uppercase">Unit Cost:</span>
                <span className="text-slate-400 text-sm">$</span>
                <input 
                    type="number" 
                    value={product.actualCost} 
                    onChange={(e) => updateActualCost(parseFloat(e.target.value) || 0)}
                    className="w-20 text-sm font-bold text-slate-700 focus:outline-none"
                    placeholder="0.00"
                />
            </div>
            
            <div className="ml-auto text-sm font-medium text-slate-500">
                Total: <span className="text-slate-900 font-bold">${((product.actualCost || 0) * (product.quantity || 1)).toFixed(2)}</span>
            </div>
        </div>
      </div>

      <div className="p-5">
        <div className="space-y-3">
          {product.options.length === 0 && (
            <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <AlertCircle className="mx-auto text-slate-400 mb-2" size={24} />
              <p className="text-slate-500 text-sm">No specific product options added yet.</p>
            </div>
          )}

          {product.options.map(option => (
            <div key={option.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-lowes-blue/30 transition-colors bg-white group">
              <div className="flex items-start gap-4">
                 {option.imageUrl && (
                     <div className="w-12 h-12 flex-shrink-0 bg-slate-100 rounded border border-slate-200 overflow-hidden">
                         <img src={option.imageUrl} alt={option.name} className="w-full h-full object-cover" />
                     </div>
                 )}
                {!option.imageUrl && (
                    <div className={`p-2 rounded-md ${option.tier === Tier.BUDGET ? 'bg-orange-50' : 'bg-blue-50'}`}>
                        <Tag size={20} className={option.tier === Tier.BUDGET ? 'text-orange-600' : 'text-lowes-blue'} />
                    </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900 line-clamp-1">{option.name}</span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getTierColor(option.tier)}`}>
                      {option.tier}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                    {option.brand && <span className="font-medium text-slate-700">{option.brand}</span>}
                    {option.modelNumber && <span>Model: {option.modelNumber}</span>}
                    <span className="font-mono bg-slate-100 px-1 rounded">SKU: {option.sku}</span>
                    {option.url && (
                      <a href={option.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-lowes-blue hover:underline">
                        View Item <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between sm:justify-end gap-4 mt-3 sm:mt-0">
                <div className="text-right">
                    <span className="font-bold text-slate-900 text-lg block">
                        ${option.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400">per unit</span>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => {
                            // "Select" this option as the actual cost
                            onUpdate({ ...product, actualCost: option.price, status: ProductStatus.ORDERED });
                        }}
                        className="p-2 text-slate-300 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                        title="Select this option"
                    >
                        <CheckCircle2 size={18} />
                    </button>
                    <button 
                        onClick={() => removeOption(option.id)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Option Form */}
        {isAddingOption ? (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Add Lowes Product Option</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                placeholder="Product Name (e.g., Project Source Faucet)"
                className="col-span-2 px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                value={newOption.name || ''}
                onChange={e => setNewOption({ ...newOption, name: e.target.value })}
              />
              
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 text-sm">$</span>
                <input
                  type="number"
                  placeholder="0.00"
                  className="w-full pl-6 px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                  value={newOption.price || ''}
                  onChange={e => setNewOption({ ...newOption, price: parseFloat(e.target.value) })}
                />
              </div>

              <select
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                value={newOption.tier}
                onChange={e => setNewOption({ ...newOption, tier: e.target.value as Tier })}
              >
                <option value={Tier.BUDGET}>Budget</option>
                <option value={Tier.STANDARD}>Standard</option>
                <option value={Tier.PREMIUM}>Premium</option>
              </select>

              <input
                type="text"
                placeholder="Brand (e.g. Moen)"
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                value={newOption.brand || ''}
                onChange={e => setNewOption({ ...newOption, brand: e.target.value })}
              />
              
              <input
                type="text"
                placeholder="Model #"
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                value={newOption.modelNumber || ''}
                onChange={e => setNewOption({ ...newOption, modelNumber: e.target.value })}
              />

              <input
                type="text"
                placeholder="SKU #"
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                value={newOption.sku || ''}
                onChange={e => setNewOption({ ...newOption, sku: e.target.value })}
              />

              <input
                type="text"
                placeholder="Image URL"
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                value={newOption.imageUrl || ''}
                onChange={e => setNewOption({ ...newOption, imageUrl: e.target.value })}
              />

              <input
                type="text"
                placeholder="Website URL"
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-lowes-blue focus:outline-none"
                value={newOption.url || ''}
                onChange={e => setNewOption({ ...newOption, url: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setIsAddingOption(false)}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddOption}
                className="px-3 py-1.5 text-sm bg-lowes-blue text-white hover:bg-lowes-hover rounded-md shadow-sm"
              >
                Save Option
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsAddingOption(true)}
            className="mt-4 w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-lowes-blue hover:text-lowes-blue transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus size={16} /> Add Product Option
          </button>
        )}
      </div>
    </div>
  );
};
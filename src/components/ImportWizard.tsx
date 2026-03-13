import React, { useState } from 'react';
import { ArrowLeft, Upload, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Room, CatalogItem, ProductStatus, Tier } from '../core/models/types';
import { parseCartText, ParsedCartItem } from '../services/gemini';
import { createId } from '../services/storage';
import { normalizeTitle } from '../utils/normalizeTitle';

interface ImportWizardProps {
  rooms: Room[];
  onAddProduct: (product: CatalogItem) => void;
  onBack: () => void;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ rooms, onAddProduct, onBack }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<(ParsedCartItem & { 
    selectedRoomId: string; 
    selectedCategory: string; // e.g., 'Standard' tier or just category tag? Using category tag for now
    include: boolean;
  })[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!inputText.trim()) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const results = await parseCartText(inputText);
      if (results.length === 0) {
        setError("No products could be identified. Please try pasting different text.");
      } else {
        setParsedItems(results.map(item => ({
          ...item,
          selectedRoomId: rooms[0]?.id || '',
          selectedCategory: item.category || 'General',
          include: true
        })));
        setStep(2);
      }
    } catch (err) {
      setError("Failed to parse text. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    const itemsToSave = parsedItems.filter(item => item.include);
    
    itemsToSave.forEach(item => {
      const newProduct: CatalogItem = {
        id: createId(),
        orgId: 'default-org',
        title: item.name,
        normalizedTitle: normalizeTitle(item.name),
        name: item.name,
        roomId: item.selectedRoomId,
        category: item.selectedCategory,
        description: item.description,
        status: ProductStatus.PLANNING,
        quantity: 1,
        unit: 'each',
        actualCost: item.price,
        tags: [item.selectedCategory],
        defaultQty: 1,
        defaultTier: Tier.STANDARD,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        options: [
          {
            id: createId(),
            name: item.name,
            price: item.price,
            sku: item.sku,
            tier: Tier.STANDARD, // Default to Standard
            description: item.description,
            brand: item.brand,
            modelNumber: item.modelNumber
          }
        ]
      };
      onAddProduct(newProduct);
    });
    
    onBack();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Import from Lowe's</h2>
          <p className="text-slate-500">Paste your cart or list details to automatically add products</p>
        </div>
      </div>

      {step === 1 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Paste Cart Text / HTML
            </label>
            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-4 text-sm">
              <strong>How to use:</strong> Go to your Lowe's Shopping Cart or Project List page. Press 
              <code className="bg-blue-100 px-1 py-0.5 rounded mx-1">Ctrl+A</code> (Select All) then 
              <code className="bg-blue-100 px-1 py-0.5 rounded mx-1">Ctrl+C</code> (Copy). 
              Paste the text below.
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full h-64 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:border-transparent font-mono text-sm"
              placeholder="Paste text here..."
            />
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleParse}
              disabled={isLoading || !inputText.trim()}
              className="bg-lowes-blue text-white px-6 py-3 rounded-lg font-medium hover:bg-lowes-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Upload size={20} />
                  Analyze & Import
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-semibold text-slate-700">Found {parsedItems.length} Products</h3>
              <div className="text-sm text-slate-500">
                Review and categorize items before saving
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                  <tr>
                    <th className="p-4 w-10">
                      <input 
                        type="checkbox" 
                        checked={parsedItems.every(i => i.include)}
                        onChange={(e) => setParsedItems(prev => prev.map(i => ({ ...i, include: e.target.checked })))}
                        className="rounded border-slate-300 text-lowes-blue focus:ring-lowes-blue"
                      />
                    </th>
                    <th className="p-4">Product Details</th>
                    <th className="p-4">Price</th>
                    <th className="p-4">Assign Room</th>
                    <th className="p-4">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedItems.map((item, index) => (
                    <tr key={index} className={!item.include ? 'opacity-50 bg-slate-50' : ''}>
                      <td className="p-4">
                        <input 
                          type="checkbox" 
                          checked={item.include}
                          onChange={(e) => {
                            const newItems = [...parsedItems];
                            newItems[index].include = e.target.checked;
                            setParsedItems(newItems);
                          }}
                          className="rounded border-slate-300 text-lowes-blue focus:ring-lowes-blue"
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          SKU: {item.sku} {item.brand && `• ${item.brand}`}
                        </div>
                      </td>
                      <td className="p-4 font-mono">
                        ${item.price.toFixed(2)}
                      </td>
                      <td className="p-4">
                        <select
                          value={item.selectedRoomId}
                          onChange={(e) => {
                            const newItems = [...parsedItems];
                            newItems[index].selectedRoomId = e.target.value;
                            setParsedItems(newItems);
                          }}
                          className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-lowes-blue"
                          disabled={!item.include}
                        >
                          {rooms.map(room => (
                            <option key={room.id} value={room.id}>{room.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4">
                        <input
                          type="text"
                          value={item.selectedCategory}
                          onChange={(e) => {
                            const newItems = [...parsedItems];
                            newItems[index].selectedCategory = e.target.value;
                            setParsedItems(newItems);
                          }}
                          className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-lowes-blue"
                          disabled={!item.include}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              className="bg-lowes-blue text-white px-6 py-3 rounded-lg font-medium hover:bg-lowes-hover flex items-center gap-2"
            >
              <Check size={20} />
              Import {parsedItems.filter(i => i.include).length} Items
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { X } from 'lucide-react';
import { ProductManager } from './ProductManager';
import { CatalogItem } from '../core/models/types';

interface ProductSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: CatalogItem) => void;
}

export const ProductSelectorModal: React.FC<ProductSelectorModalProps> = ({ isOpen, onClose, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4 md:p-8 animate-in fade-in duration-200">
      <div className="w-full max-w-6xl h-full max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Select Product</h2>
            <p className="text-sm text-slate-500">Choose a product from the catalog to add to this inspection.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <ProductManager 
            selectionMode={true} 
            onSelect={(item) => {
              onSelect(item);
              onClose();
            }} 
          />
        </div>
      </div>
    </div>
  );
};

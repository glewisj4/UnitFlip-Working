import React, { useState, useEffect, useCallback } from 'react';
import { ImportBatch, StagedProduct } from '../../core/models/types';
import { ImportService } from '../../core/services/ImportService';
import { StagingService } from '../../core/services/StagingService';
import { useAppContext } from '../../core/hooks/useAppContext';
import { FileText, CheckCircle, XCircle, AlertTriangle, ChevronRight, Search, Filter, MoreVertical, Edit2, Trash2, Copy } from 'lucide-react';

interface StagingAreaProps {
  onClose: () => void;
}

export const StagingArea: React.FC<StagingAreaProps> = ({ onClose }) => {
  const { org } = useAppContext();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [stagedProducts, setStagedProducts] = useState<StagedProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'STAGED' | 'APPROVED' | 'REJECTED'>('STAGED');
  const [searchTerm, setSearchTerm] = useState('');

  const loadBatches = useCallback(async () => {
    if (!org) return;
    const list = await ImportService.listImportBatches(org.id);
    setBatches(list);
    if (list.length > 0 && !selectedBatchId) {
      setSelectedBatchId(list[0].id);
    }
  }, [org, selectedBatchId]);

  const loadStagedProducts = useCallback(async () => {
    if (!selectedBatchId) return;
    const products = await ImportService.listStagedProducts(selectedBatchId);
    setStagedProducts(products);
    setSelectedProductIds(new Set());
  }, [selectedBatchId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    loadStagedProducts();
  }, [loadStagedProducts]);

  const handleApprove = async (ids: string[]) => {
    if (!selectedBatchId || !org) return;
    setIsProcessing(true);
    try {
      await StagingService.approve(org.id, selectedBatchId, ids);
      await loadStagedProducts();
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (ids: string[]) => {
    if (!selectedBatchId) return;
    setIsProcessing(true);
    try {
      await StagingService.reject(selectedBatchId, ids);
      await loadStagedProducts();
    } catch (err) {
      console.error('Rejection failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<StagedProduct>>({});

  const handleEditStart = (item: StagedProduct) => {
    setEditingId(item.id);
    setEditValues({
      rawTitle: item.rawTitle,
      itemNumber: item.itemNumber,
      modelNumber: item.modelNumber,
      qty: item.qty,
      unitPrice: item.unitPrice
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleEditSave = async () => {
    if (!editingId || !selectedBatchId) return;
    
    // Optimistic update
    setStagedProducts(prev => prev.map(p => {
      if (p.id === editingId) {
        return { ...p, ...editValues, lineTotal: (editValues.qty || 0) * (editValues.unitPrice || 0) };
      }
      return p;
    }));

    // Persist to DB (using ImportService to update the whole list or creating a new update method)
    // For simplicity, we'll just update the local state and re-save the list
    // In a real app, we'd have a specific update endpoint.
    // Let's assume we can just update the list in DB.
    
    const updatedProducts = stagedProducts.map(p => {
      if (p.id === editingId) {
        return { ...p, ...editValues, lineTotal: (editValues.qty || 0) * (editValues.unitPrice || 0) };
      }
      return p;
    });
    
    // We need to access the adapter directly or add an update method to ImportService.
    // Since ImportService isn't exposed for updates, we'll add a method to StagingService or just hack it here?
    // Better to add `updateStagedProduct` to StagingService.
    // But for now, let's just use the optimistic update and assume the user will approve it.
    // Wait, approval reads from DB. So we MUST persist.
    
    try {
        await StagingService.updateProduct(selectedBatchId, editingId, editValues);
    } catch (err) {
        console.error("Failed to save edit", err);
        // Revert?
    }

    setEditingId(null);
    setEditValues({});
  };

  const filteredProducts = stagedProducts.filter((p) => {
    const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
    const matchesSearch =
      !searchTerm ||
      p.rawTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.itemNumber || '').includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  return (
    <div className="fixed inset-0 z-[50] bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <XCircle size={24} className="text-slate-400" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Import Staging Area</h1>
        </div>
        <div className="flex items-center gap-3">
          {selectedProductIds.size > 0 && (
            <>
              <span className="text-sm text-slate-500 font-medium">{selectedProductIds.size} selected</span>
              <button
                onClick={() => handleApprove(Array.from(selectedProductIds))}
                disabled={isProcessing}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                <CheckCircle size={16} /> Approve
              </button>
              <button
                onClick={() => handleReject(Array.from(selectedProductIds))}
                disabled={isProcessing}
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold text-sm hover:bg-red-100 transition-colors flex items-center gap-2"
              >
                <XCircle size={16} /> Reject
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Batches */}
        <aside className="w-80 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Import Batches</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {batches.map((batch) => (
              <button
                key={batch.id}
                onClick={() => setSelectedBatchId(batch.id)}
                className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${
                  selectedBatchId === batch.id ? 'bg-blue-50 border-l-4 border-lowes-blue' : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-900 text-sm">
                    {batch.quoteNumber ? `Quote #${batch.quoteNumber}` : 'Unknown Quote'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <FileText size={12} />
                  <span className="truncate max-w-[180px]">{batch.filename}</span>
                </div>
                {batch.estimatedTotal && (
                  <div className="mt-2 text-xs font-bold text-slate-700">
                    ${batch.estimatedTotal.toFixed(2)}
                  </div>
                )}
              </button>
            ))}
            {batches.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">No imports yet.</div>
            )}
          </div>
        </aside>

        {/* Main Content: Staged Items */}
        <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search items..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-lowes-blue transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                <Filter size={16} className="text-slate-400" />
                <select
                  className="bg-transparent text-sm font-medium text-slate-600 focus:outline-none cursor-pointer"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="STAGED">Staged (Pending)</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-lowes-blue focus:ring-lowes-blue"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
                          } else {
                            setSelectedProductIds(new Set());
                          }
                        }}
                        checked={filteredProducts.length > 0 && selectedProductIds.size === filteredProducts.length}
                      />
                    </th>
                    <th className="px-4 py-3">Item Details</th>
                    <th className="px-4 py-3">Identifiers</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredProducts.map((item) => (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedProductIds.has(item.id) ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-lowes-blue focus:ring-lowes-blue"
                          checked={selectedProductIds.has(item.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedProductIds);
                            if (e.target.checked) newSet.add(item.id);
                            else newSet.delete(item.id);
                            setSelectedProductIds(newSet);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {editingId === item.id ? (
                          <div className="flex items-start gap-3">
                             <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center border border-slate-100 overflow-hidden">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt={item.rawTitle} className="w-full h-full object-cover" />
                                ) : (
                                  <FileText className="text-slate-400" size={16} />
                                )}
                             </div>
                             <div className="flex-1">
                               <input 
                                 type="text" 
                                 className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-lowes-blue mb-1"
                                 value={editValues.rawTitle || ''}
                                 onChange={e => setEditValues(prev => ({ ...prev, rawTitle: e.target.value }))}
                               />
                               <div className="flex gap-2">
                                 <button onClick={handleEditSave} className="text-xs text-emerald-600 font-bold hover:underline">Save</button>
                                 <button onClick={handleEditCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                               </div>
                             </div>
                          </div>
                        ) : (
                        <div className="flex items-center gap-3 group/item">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center border border-slate-100 overflow-hidden">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.rawTitle} className="w-full h-full object-cover" />
                            ) : (
                              <FileText className="text-slate-400" size={16} />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-2">
                               {item.rawTitle}
                               {item.status === 'STAGED' && (
                                 <button onClick={() => handleEditStart(item)} className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-400 hover:text-lowes-blue transition-opacity">
                                   <Edit2 size={12} />
                                 </button>
                               )}
                            </div>
                            {item.duplicateCandidate && (
                              <div className="flex items-center gap-1 text-xs text-amber-600 font-medium mt-0.5">
                                <AlertTriangle size={12} /> Possible Duplicate
                              </div>
                            )}
                            {item.notes && <div className="text-xs text-slate-400 mt-1">{item.notes}</div>}
                          </div>
                        </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {editingId === item.id ? (
                          <div className="space-y-1">
                            <input 
                              type="text" 
                              placeholder="Item #"
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                              value={editValues.itemNumber || ''}
                              onChange={e => setEditValues(prev => ({ ...prev, itemNumber: e.target.value }))}
                            />
                            <input 
                              type="text" 
                              placeholder="Model #"
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                              value={editValues.modelNumber || ''}
                              onChange={e => setEditValues(prev => ({ ...prev, modelNumber: e.target.value }))}
                            />
                          </div>
                        ) : (
                          <>
                            <div>Item #: {item.itemNumber || '-'}</div>
                            <div>Model #: {item.modelNumber || '-'}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {editingId === item.id ? (
                           <input 
                              type="number" 
                              className="w-16 px-2 py-1 text-right text-sm border border-slate-300 rounded"
                              value={editValues.qty || 0}
                              onChange={e => setEditValues(prev => ({ ...prev, qty: parseInt(e.target.value) || 0 }))}
                           />
                        ) : item.qty}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {editingId === item.id ? (
                           <input 
                              type="number" 
                              step="0.01"
                              className="w-20 px-2 py-1 text-right text-sm border border-slate-300 rounded"
                              value={editValues.unitPrice || 0}
                              onChange={e => setEditValues(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                           />
                        ) : `$${item.unitPrice?.toFixed(2) || '0.00'}`}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        ${item.lineTotal?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {item.status === 'STAGED' && (
                            <>
                              <button
                                onClick={() => handleApprove([item.id])}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Approve"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                onClick={() => handleReject([item.id])}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Reject"
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                        No items found matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

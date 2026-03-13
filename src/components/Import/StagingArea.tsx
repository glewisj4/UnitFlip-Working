import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ImportBatch, StagedProduct } from '../../core/models/types';
import { ImportService } from '../../core/services/ImportService';
import { StagingService } from '../../core/services/StagingService';
import { CategoryService } from '../../core/services/CategoryService';
import { useAppContext } from '../../core/hooks/useAppContext';
import { FileText, CheckCircle, XCircle, AlertTriangle, ChevronRight, Search, Filter, MoreVertical, Edit2, Trash2, Copy, Merge, FolderInput, Settings } from 'lucide-react';
import { Category } from '../../core/models/types';
import { CategoryManager } from '../Categories/CategoryManager';

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
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'STAGED' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW'>('STAGED');
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignCategoryModalOpen, setAssignCategoryModalOpen] = useState(false);
  const [selectedCategoryForAssign, setSelectedCategoryForAssign] = useState<string>('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // Helper to flatten categories with depth for dropdown
  const getFlattenedCategories = useCallback((cats: Category[], parentId: string | null = null, depth = 0): { id: string, name: string, depth: number }[] => {
    const result: { id: string, name: string, depth: number }[] = [];
    const children = cats
      .filter(c => (c.parentId || null) === (parentId || null))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    
    for (const child of children) {
      result.push({ id: child.id, name: child.name, depth });
      result.push(...getFlattenedCategories(cats, child.id, depth + 1));
    }
    return result;
  }, []);

  const flattenedCategories = useMemo(() => {
    return getFlattenedCategories(categories);
  }, [categories, getFlattenedCategories]);

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
    console.log("BATCH ID:", selectedBatchId);
    const products = await ImportService.listStagedProducts(selectedBatchId);
    console.log("STAGED ITEMS:", products);
    setStagedProducts(products);
    setSelectedProductIds(new Set());
  }, [selectedBatchId]);

  useEffect(() => {
    loadBatches();
    if (org) {
      CategoryService.getCategories(org.id).then(setCategories);
    }
  }, [loadBatches, org]);

  useEffect(() => {
    loadStagedProducts();
  }, [loadStagedProducts]);

  const [createCategoryModalOpen, setCreateCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleApprove = async (ids: string[]) => {
    if (!selectedBatchId || !org) return;
    setIsProcessing(true);
    try {
      const result = await StagingService.approve(org.id, selectedBatchId, ids);
      
      if (result.failed > 0) {
        alert(`${result.approved} items approved.\n${result.failed} items skipped (missing category).\n\nErrors:\n${result.errors.join('\n')}`);
      }
      
      await loadStagedProducts();
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Approval failed. See console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!org || !newCategoryName.trim()) return;
    setIsProcessing(true);
    try {
      const newCat = await CategoryService.addCategory(org.id, newCategoryName.trim());
      setCategories(prev => [...prev, newCat]);
      setSelectedCategoryForAssign(newCat.id);
      setCreateCategoryModalOpen(false);
      setNewCategoryName('');
      
      // If we were in the middle of assigning, we just selected it.
      // If this was triggered from the dropdown, the user can now click "Assign Category".
    } catch (err) {
      console.error('Failed to create category:', err);
      alert('Failed to create category.');
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

  const handleAssignCategory = async () => {
    if (!selectedBatchId || !selectedCategoryForAssign) return;
    setIsProcessing(true);
    try {
      await StagingService.assignCategory(selectedBatchId, Array.from(selectedProductIds), selectedCategoryForAssign);
      await loadStagedProducts();
      setAssignCategoryModalOpen(false);
      setSelectedCategoryForAssign('');
    } catch (err) {
      console.error('Category assignment failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMerge = async (item: StagedProduct) => {
    if (!selectedBatchId || !item.duplicateTargetId || !org) return;
    setIsProcessing(true);
    try {
      await StagingService.mergeToCatalogWithUpdate(org.id, selectedBatchId, item.id, item.duplicateTargetId);
      await loadStagedProducts();
    } catch (err) {
      console.error('Merge failed:', err);
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
        return { ...p, ...editValues };
      }
      return p;
    }));

    // Persist to DB (using ImportService to update the whole list or creating a new update method)
    // For simplicity, we'll just update the local state and re-save the list
    // In a real app, we'd have a specific update endpoint.
    // Let's assume we can just update the list in DB.
    
    const updatedProducts = stagedProducts.map(p => {
      if (p.id === editingId) {
        return { ...p, ...editValues };
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

  const [pendingDeleteBatchId, setPendingDeleteBatchId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteBatch = (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("DELETE CLICKED", batchId);
    setDeleteError(null);
    setPendingDeleteBatchId(batchId);
  };

  const confirmDelete = async () => {
    if (!org || !pendingDeleteBatchId) return;
    
    console.log("DELETE CONFIRMED", pendingDeleteBatchId);
    setIsProcessing(true);
    setDeleteError(null);
    try {
      await ImportService.deleteImportBatch(org.id, pendingDeleteBatchId);
      console.log("DELETE COMPLETE", pendingDeleteBatchId);
      
      await loadBatches();
      
      // If we deleted the currently selected batch, clear selection
      if (selectedBatchId === pendingDeleteBatchId) {
        setSelectedBatchId(null);
        setStagedProducts([]);
      }
      
      setPendingDeleteBatchId(null);
    } catch (err: any) {
      console.error('Delete failed:', err);
      setDeleteError(err.message || 'Failed to delete batch');
    } finally {
      setIsProcessing(false);
    }
  };

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
          <button
            onClick={() => setShowCategoryManager(true)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Settings size={16} /> Manage Categories
          </button>
          
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
              <button
                onClick={() => setAssignCategoryModalOpen(true)}
                disabled={isProcessing}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <FolderInput size={16} /> Assign Category
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
              <div
                key={batch.id}
                className={`w-full text-left p-4 hover:bg-slate-50 transition-colors group relative ${
                  selectedBatchId === batch.id ? 'bg-blue-50 border-l-4 border-lowes-blue' : 'border-l-4 border-transparent'
                }`}
                onClick={() => setSelectedBatchId(batch.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-900 text-sm">
                    {batch.quoteNumber ? `Quote #${batch.quoteNumber}` : 'Unknown Quote'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        batch.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                        batch.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-500'
                    }`}>
                        {batch.status || 'STAGED'}
                    </span>
                    <button 
                        type="button"
                        onClick={(e) => handleDeleteBatch(batch.id, e)}
                        className="relative z-10 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Batch"
                    >
                        <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <span className="text-[10px]">{new Date(batch.createdAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <FileText size={12} />
                  <span className="truncate max-w-[120px]">{batch.filename}</span>
                </div>
                {batch.estimatedTotal && (
                  <div className="text-xs font-bold text-slate-700">
                    ${batch.estimatedTotal.toFixed(2)}
                  </div>
                )}
              </div>
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
            <div className="flex flex-col gap-2 w-full">
              {/* Debug Panel */}
              <div className="text-xs font-mono bg-slate-100 p-2 rounded border border-slate-200 text-slate-500">
                <div>Batch ID: {selectedBatchId}</div>
                <div>Total Loaded: {stagedProducts.length}</div>
                <div>Filtered Count: {filteredProducts.length}</div>
                <div>Filter Status: {filterStatus}</div>
                <div>Search Term: "{searchTerm}"</div>
              </div>
              
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
                  <option value="NEEDS_REVIEW">Needs Review</option>
                </select>
              </div>
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
                               {item.normalizedTitle || item.rawTitle}
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
                        ${((item.qty || 0) * (item.unitPrice || 0)).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : item.status === 'NEEDS_REVIEW'
                              ? 'bg-orange-100 text-orange-800'
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
                              {item.duplicateCandidate && item.duplicateTargetId && (
                                <button
                                  onClick={() => handleMerge(item)}
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                  title="Merge Duplicate"
                                >
                                  <Merge size={16} />
                                </button>
                              )}
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
      {/* Assign Category Modal */}
      {assignCategoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Assign Category</h2>
            <p className="text-sm text-slate-500 mb-4">
              Select a category to assign to the {selectedProductIds.size} selected items.
            </p>
            
            <select
              className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all mb-6"
              value={selectedCategoryForAssign}
              onChange={(e) => {
                if (e.target.value === 'NEW') {
                  setCreateCategoryModalOpen(true);
                } else if (e.target.value === 'MANAGE') {
                  setAssignCategoryModalOpen(false);
                  setShowCategoryManager(true);
                } else {
                  setSelectedCategoryForAssign(e.target.value);
                }
              }}
            >
              <option value="">Select a category...</option>
              {flattenedCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {'\u00A0\u00A0'.repeat(cat.depth) + cat.name}
                </option>
              ))}
              <option disabled>──────────</option>
              <option value="NEW" className="font-bold text-blue-600">+ Add New Category</option>
              <option value="MANAGE" className="font-bold text-slate-600">Manage Categories...</option>
            </select>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAssignCategoryModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignCategory}
                disabled={!selectedCategoryForAssign || isProcessing}
                className="px-6 py-2 bg-lowes-blue text-white font-bold rounded-lg hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all disabled:opacity-50"
              >
                Assign Category
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Create Category Modal */}
      {createCategoryModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Create New Category</h2>
            
            <input
              type="text"
              placeholder="Category Name"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all mb-6"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              autoFocus
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCreateCategoryModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || isProcessing}
                className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {pendingDeleteBatchId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-bold">Delete Import?</h2>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete this import batch? This will remove all staged items associated with it. This action cannot be undone.
            </p>
            
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                {deleteError}
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingDeleteBatchId(null)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg transition-colors"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isProcessing}
                className="px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg shadow-red-100 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? 'Deleting...' : 'Delete Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Manager */}
      {showCategoryManager && (
        <CategoryManager onClose={() => {
          setShowCategoryManager(false);
          // Refresh categories when closing manager
          if (org) CategoryService.getCategories(org.id).then(setCategories);
        }} />
      )}
    </div>
  );
};

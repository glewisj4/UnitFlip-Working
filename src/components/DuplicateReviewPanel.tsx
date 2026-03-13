import React, { useState, useEffect } from 'react';
import { CatalogItem } from '../core/models/types';
import { CatalogService } from '../core/services/CatalogService';
import { CatalogMergeService, MergePreview } from '../core/services/CatalogMergeService';
import { findDuplicateCandidates, DuplicateResult } from '../services/duplicateDetection';
import { useAppContext } from '../core/hooks/useAppContext';
import { AlertTriangle, Check, X, Merge, ArrowRight, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';

interface DuplicateReviewPanelProps {
  onClose: () => void;
}

interface DuplicatePair {
  source: CatalogItem;
  match: DuplicateResult;
}

export const DuplicateReviewPanel: React.FC<DuplicateReviewPanelProps> = ({ onClose }) => {
  const { org, user } = useAppContext();
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (org) {
      scanCatalog();
    }
  }, [org]);

  const scanCatalog = async () => {
    if (!org) return;
    setLoading(true);
    setDuplicates([]);
    setPreview(null);
    try {
      const items = await CatalogService.getItems(org.id);
      
      const results: DuplicatePair[] = [];
      const processedIds = new Set<string>();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (processedIds.has(item.id)) continue;

        const others = items.slice(i + 1);
        
        const mockStaged: any = {
            ...item,
            rawTitle: item.title || item.name,
            normalizedTitle: item.normalizedTitle || item.title?.toLowerCase() || '',
        };

        const matches = findDuplicateCandidates(mockStaged, others);
        
        if (matches.length > 0) {
            matches.forEach(m => {
                if (!processedIds.has(m.item.id)) {
                    results.push({ source: item, match: m });
                    processedIds.add(item.id);
                    processedIds.add(m.item.id); 
                }
            });
        }
      }
      
      setDuplicates(results);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (sourceId: string, targetId: string) => {
    if (!org) return;
    setProcessing(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const result = await CatalogMergeService.previewMerge(org.id, sourceId, targetId);
      setPreview(result);
    } catch (err: any) {
      console.error(err);
      setPreviewError(err.message || 'Failed to generate preview');
    } finally {
      setProcessing(false);
    }
  };

  const handleExecuteMerge = async () => {
    if (!org || !preview || !user) return;
    setProcessing(true);
    try {
      await CatalogMergeService.executeMerge(org.id, preview.source.id, preview.target.id, user.id);
      
      // Remove from list
      setDuplicates(prev => prev.filter(d => d.source.id !== preview.source.id && d.match.item.id !== preview.source.id));
      setPreview(null);
      setExpandedId(null);
      
    } catch (err: any) {
      console.error(err);
      alert(`Merge failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const swapSourceTarget = () => {
    if (!preview || !org) return;
    // Re-run preview with swapped IDs
    handlePreview(preview.target.id, preview.source.id);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Merge className="text-amber-500" /> Duplicate Review
          </h2>
          <div className="flex items-center gap-2">
            <button 
                onClick={scanCatalog} 
                disabled={loading}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                title="Rescan"
            >
                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {loading ? (
                <div className="text-center py-12 text-slate-500">Scanning catalog...</div>
            ) : duplicates.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                    <Check size={48} className="mx-auto text-emerald-500 mb-4" />
                    <p>No duplicates found in catalog.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {duplicates.map((pair, idx) => {
                        const isExpanded = expandedId === pair.source.id;
                        
                        return (
                        <div key={idx} className={`bg-white border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-blue-300 shadow-md' : 'border-slate-200'}`}>
                            <div 
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                                onClick={() => {
                                    if (isExpanded) {
                                        setExpandedId(null);
                                        setPreview(null);
                                    } else {
                                        setExpandedId(pair.source.id);
                                        handlePreview(pair.source.id, pair.match.item.id);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                        <Merge size={20} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900">{pair.source.title}</div>
                                        <div className="text-xs text-slate-500 flex items-center gap-2">
                                            <span>Potential match: <strong>{pair.match.item.title}</strong></span>
                                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{Math.round(pair.match.score * 100)}% Match</span>
                                            <span className="text-slate-400">({pair.match.reason})</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-slate-100 p-6 bg-slate-50/50">
                                    {processing && !preview ? (
                                        <div className="text-center py-8 text-slate-500">Analyzing merge impact...</div>
                                    ) : previewError ? (
                                        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
                                            {previewError}
                                        </div>
                                    ) : preview ? (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-start">
                                                {/* Source */}
                                                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                                                    <div className="text-xs font-bold text-red-600 uppercase mb-2">Source (Will be Deleted)</div>
                                                    <div className="font-bold text-slate-900 mb-1">{preview.source.title}</div>
                                                    <div className="text-xs text-slate-500 mb-4 font-mono">{preview.source.id}</div>
                                                    
                                                    <div className="space-y-2 text-sm">
                                                        {preview.source.itemNumber && <div>Item #: {preview.source.itemNumber}</div>}
                                                        {preview.source.modelNumber && <div>Model #: {preview.source.modelNumber}</div>}
                                                        {preview.source.brand && <div>Brand: {preview.source.brand}</div>}
                                                        <div className="font-bold mt-2">References to move:</div>
                                                        <ul className="list-disc list-inside text-xs text-slate-600">
                                                            <li>{preview.references.productInstances.length} Product Instances</li>
                                                            <li>{preview.references.bundleTriggers.length} Bundle Triggers</li>
                                                            <li>{preview.references.bundleCompanions.length} Bundle Companions</li>
                                                            <li>{preview.references.stagedProducts.length} Staged Items</li>
                                                        </ul>
                                                    </div>
                                                </div>

                                                {/* Action */}
                                                <div className="flex flex-col items-center justify-center pt-12 gap-2">
                                                    <ArrowRight className="text-slate-300" size={32} />
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); swapSourceTarget(); }}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                                        title="Swap Source/Target"
                                                    >
                                                        <RefreshCw size={16} />
                                                    </button>
                                                </div>

                                                {/* Target */}
                                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                                                    <div className="text-xs font-bold text-emerald-600 uppercase mb-2">Target (Will be Updated)</div>
                                                    <div className="font-bold text-slate-900 mb-1">{preview.target.title}</div>
                                                    <div className="text-xs text-slate-500 mb-4 font-mono">{preview.target.id}</div>
                                                    
                                                    <div className="space-y-2 text-sm">
                                                        {preview.target.itemNumber && <div>Item #: {preview.target.itemNumber}</div>}
                                                        {preview.target.modelNumber && <div>Model #: {preview.target.modelNumber}</div>}
                                                        {preview.target.brand && <div>Brand: {preview.target.brand}</div>}
                                                        <div className="font-bold mt-2 text-emerald-700">Resulting Item:</div>
                                                        <div className="text-xs text-slate-600 bg-white/50 p-2 rounded border border-emerald-100">
                                                            <div>{preview.mergedItem.title}</div>
                                                            <div>{preview.mergedItem.itemNumber || '-'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {preview.blockers.length > 0 && (
                                                <div className="p-4 bg-red-100 text-red-800 rounded-lg text-sm font-bold flex items-center gap-2">
                                                    <AlertTriangle size={16} />
                                                    Merge Blocked: {preview.blockers.join(', ')}
                                                </div>
                                            )}

                                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                                                <button 
                                                    onClick={() => { setExpandedId(null); setPreview(null); }}
                                                    className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={handleExecuteMerge}
                                                    disabled={processing || preview.blockers.length > 0}
                                                    className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {processing ? 'Merging...' : 'Confirm Merge'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

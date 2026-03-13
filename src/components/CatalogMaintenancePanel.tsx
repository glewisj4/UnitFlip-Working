import React, { useState } from 'react';
import { CatalogMaintenanceService, CatalogHealthSummary } from '../core/services/CatalogMaintenanceService';
import { useAppContext } from '../core/hooks/useAppContext';
import { 
  Wrench, 
  RefreshCw, 
  Database, 
  GitMerge, 
  FolderTree, 
  CheckCircle, 
  AlertTriangle,
  Play,
  ShieldCheck
} from 'lucide-react';

interface CatalogMaintenancePanelProps {
  onScanComplete: (summary: CatalogHealthSummary) => void;
}

export const CatalogMaintenancePanel: React.FC<CatalogMaintenancePanelProps> = ({ onScanComplete }) => {
  const { org } = useAppContext();
  const [processing, setProcessing] = useState<string | null>(null);
  const [results, setResults] = useState<string | null>(null);

  const runAction = async (action: string, label: string, fn: () => Promise<any>) => {
    if (!org) return;
    if (!confirm(`Are you sure you want to run: ${label}?`)) return;
    
    setProcessing(action);
    setResults(null);
    try {
      const result = await fn();
      setResults(`${label} completed successfully. Result: ${JSON.stringify(result)}`);
      
      // Always re-scan after maintenance
      const scan = await CatalogMaintenanceService.scanForCatalogIssues(org.id);
      onScanComplete(scan);
      
    } catch (err: any) {
      console.error(err);
      setResults(`Error: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <Wrench size={20} className="text-slate-500" />
          Maintenance Toolbox
        </h3>
      </div>
      
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Category Maintenance */}
        <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                <FolderTree size={14} /> Category Integrity
            </h4>
            <div className="space-y-2">
                <button 
                    disabled={!!processing}
                    onClick={() => runAction('rebuildPaths', 'Rebuild Category Paths', () => CatalogMaintenanceService.rebuildCategoryPaths(org!.id))}
                    className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded hover:border-blue-300 hover:shadow-sm transition-all text-sm flex items-center justify-between group"
                >
                    <span>Rebuild Paths</span>
                    <Play size={14} className="text-slate-300 group-hover:text-blue-500" />
                </button>
                <button 
                    disabled={!!processing}
                    onClick={() => runAction('verifyCats', 'Verify Category Integrity', () => CatalogMaintenanceService.verifyCategoryIntegrity(org!.id))}
                    className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded hover:border-blue-300 hover:shadow-sm transition-all text-sm flex items-center justify-between group"
                >
                    <span>Verify Integrity</span>
                    <ShieldCheck size={14} className="text-slate-300 group-hover:text-blue-500" />
                </button>
            </div>
        </div>

        {/* Data Hygiene */}
        <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                <Database size={14} /> Data Hygiene
            </h4>
            <div className="space-y-2">
                <button 
                    disabled={!!processing}
                    onClick={() => runAction('backfillTitles', 'Backfill Normalized Titles', () => CatalogMaintenanceService.backfillNormalizedTitles(org!.id))}
                    className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded hover:border-blue-300 hover:shadow-sm transition-all text-sm flex items-center justify-between group"
                >
                    <span>Backfill Titles</span>
                    <Play size={14} className="text-slate-300 group-hover:text-blue-500" />
                </button>
                <button 
                    disabled={!!processing}
                    onClick={() => runAction('backfillDefaults', 'Backfill Safe Defaults', () => CatalogMaintenanceService.backfillCatalogDefaults(org!.id))}
                    className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded hover:border-blue-300 hover:shadow-sm transition-all text-sm flex items-center justify-between group"
                >
                    <span>Backfill Defaults</span>
                    <Play size={14} className="text-slate-300 group-hover:text-blue-500" />
                </button>
            </div>
        </div>

        {/* Merge Integrity */}
        <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                <GitMerge size={14} /> Merge Integrity
            </h4>
            <div className="space-y-2">
                <button 
                    disabled={!!processing}
                    onClick={() => runAction('verifyMerge', 'Verify Merge Integrity', () => CatalogMaintenanceService.verifyMergeIntegrity(org!.id))}
                    className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded hover:border-blue-300 hover:shadow-sm transition-all text-sm flex items-center justify-between group"
                >
                    <span>Verify References</span>
                    <ShieldCheck size={14} className="text-slate-300 group-hover:text-blue-500" />
                </button>
            </div>
        </div>

      </div>

      {results && (
        <div className="p-4 bg-slate-100 border-t border-slate-200 text-sm font-mono text-slate-700 break-all">
            {results}
        </div>
      )}
    </div>
  );
};

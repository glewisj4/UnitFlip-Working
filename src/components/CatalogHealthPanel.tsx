import React, { useState, useEffect } from 'react';
import { CatalogMaintenanceService, CatalogHealthSummary, CatalogIssue } from '../core/services/CatalogMaintenanceService';
import { useAppContext } from '../core/hooks/useAppContext';
import { 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  AlertOctagon, 
  ImageOff, 
  Hash, 
  Tag, 
  FolderX, 
  ArrowRight,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface CatalogHealthPanelProps {
  onFilterRequest: (filterType: string) => void;
}

export const CatalogHealthPanel: React.FC<CatalogHealthPanelProps> = ({ onFilterRequest }) => {
  const { org } = useAppContext();
  const [summary, setSummary] = useState<CatalogHealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (org) {
      scan();
    }
  }, [org]);

  const scan = async () => {
    if (!org) return;
    setLoading(true);
    try {
      const result = await CatalogMaintenanceService.scanForCatalogIssues(org.id);
      setSummary(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!summary) return null;

  const totalIssues = summary.issues.length;
  const healthScore = Math.max(0, 100 - (totalIssues * 2)); // Arbitrary score
  
  const getIssueCount = (type: CatalogIssue['type']) => summary.issues.filter(i => i.type === type).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${totalIssues === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
            {totalIssues === 0 ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Catalog Health</h3>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>{summary.totalItems} Items</span>
              <span>•</span>
              <span className={totalIssues > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                {totalIssues === 0 ? 'All Systems Go' : `${totalIssues} Issues Found`}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-400 uppercase">Health Score</div>
                <div className={`text-lg font-bold ${healthScore > 80 ? 'text-emerald-600' : healthScore > 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {healthScore}%
                </div>
            </div>
            {expanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard 
                label="Missing Images" 
                count={summary.missingImage} 
                icon={<ImageOff size={16} />} 
                onClick={() => onFilterRequest('missing_image')}
                color="text-slate-600"
            />
            <MetricCard 
                label="Missing Item #" 
                count={summary.missingItemNumber} 
                icon={<Hash size={16} />} 
                onClick={() => onFilterRequest('missing_item_number')}
                color="text-blue-600"
            />
            <MetricCard 
                label="Uncategorized" 
                count={summary.uncategorizedItems} 
                icon={<FolderX size={16} />} 
                onClick={() => onFilterRequest('uncategorized')}
                color="text-amber-600"
            />
            <MetricCard 
                label="Missing Model #" 
                count={summary.missingModelNumber} 
                icon={<Tag size={16} />} 
                onClick={() => onFilterRequest('missing_model_number')}
                color="text-purple-600"
            />
          </div>

          <div className="flex justify-end gap-2">
             <button 
                onClick={(e) => { e.stopPropagation(); scan(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
             >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Rescan
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, count, icon, onClick, color }: any) => (
  <button 
    onClick={onClick}
    className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left flex items-center justify-between group"
  >
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className={`text-xl font-bold ${count > 0 ? color : 'text-slate-300'}`}>
        {count}
      </div>
    </div>
    {count > 0 && (
        <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
    )}
  </button>
);

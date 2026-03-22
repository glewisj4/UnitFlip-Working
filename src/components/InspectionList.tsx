import React, { useState, useEffect } from 'react';
import { Plus, ClipboardList, ArrowLeft } from 'lucide-react';
import { Inspection } from '../core/models/inspections';
import { InspectionService } from '../core/services/InspectionService';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';
import { NewInspectionModal } from './NewInspectionModal';

interface InspectionListProps {
  unitId: string;
  onSelectInspection: (inspectionId: string) => void;
  onBack: () => void;
}

export const InspectionList: React.FC<InspectionListProps> = ({ unitId, onSelectInspection, onBack }) => {
  const { org, user } = useAppContext();
  const { log } = useAuditLogger();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    if (org) loadInspections();
  }, [org, unitId]);

  const loadInspections = async () => {
    if (!org) return;
    setIsLoading(true);
    const list = await InspectionService.listInspections(org.id, unitId);
    setInspections(list);
    setIsLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'in_progress': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  if (!org) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div>
           <h2 className="text-xl font-bold text-slate-800">Inspection queue</h2>
           <p className="text-sm text-slate-500">Start a new inspection or continue work for this unit.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="ml-auto bg-lowes-blue text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          New Inspection
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-slate-400">Loading inspections...</div>
      ) : inspections.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
          <ClipboardList size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">No inspections found for this unit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inspections.map((inspection) => (
            <div
              key={inspection.id}
              onClick={() => onSelectInspection(inspection.id)}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-lowes-blue transition-all cursor-pointer flex justify-between items-center"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-lg flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{inspection.title}</h3>
                  <p className="text-xs text-slate-400">
                    Created {new Date(inspection.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                 <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(inspection.status)}`}>
                    {inspection.status.replace('_', ' ')}
                 </span>
                 <div className="text-right text-xs text-slate-400">
                    {inspection.photoIds.length} Photos
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewInspectionModal
        isOpen={isCreateModalOpen}
        unitId={unitId}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(inspectionId) => {
          setIsCreateModalOpen(false);
          void loadInspections();
          onSelectInspection(inspectionId);
          log('INSPECTION_CREATION_FLOW_COMPLETED', {
            entityId: inspectionId,
            message: 'Created inspection from the new inspection modal',
          });
        }}
      />
    </div>
  );
};

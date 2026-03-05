import React, { useState, useEffect } from 'react';
import { Plus, Home, Archive } from 'lucide-react';
import { Unit } from '../core/models/inspections';
import { UnitService } from '../core/services/UnitService';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';

interface UnitListProps {
  onSelectUnit: (unitId: string) => void;
}

export const UnitList: React.FC<UnitListProps> = ({ onSelectUnit }) => {
  const { org } = useAppContext();
  const { log } = useAuditLogger();
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (org) loadUnits();
  }, [org]);

  const loadUnits = async () => {
    if (!org) return;
    setIsLoading(true);
    const list = await UnitService.listUnits(org.id);
    setUnits(list.filter(u => u.status !== 'archived'));
    setIsLoading(false);
  };

  const handleCreateUnit = async () => {
    if (!org) return;
    const name = prompt('Enter Unit Name (e.g., 123 Main St #4B):');
    if (!name) return;

    try {
      const newUnit = await UnitService.createUnit(org.id, { name });
      log('UNIT_CREATED', { entityId: newUnit.id, message: `Created unit: ${name}` });
      await loadUnits();
    } catch (e) {
      console.error(e);
      alert('Failed to create unit');
    }
  };

  const handleArchive = async (e: React.MouseEvent, unit: Unit) => {
    e.stopPropagation();
    if (!org || !confirm(`Archive ${unit.name}?`)) return;
    
    try {
      await UnitService.archiveUnit(org.id, unit.id);
      log('UNIT_ARCHIVED', { entityId: unit.id, message: `Archived unit: ${unit.name}` });
      await loadUnits();
    } catch (e) {
      console.error(e);
      alert('Failed to archive unit');
    }
  };

  if (!org) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Units</h2>
        <button
          onClick={handleCreateUnit}
          className="bg-lowes-blue text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          Add Unit
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-slate-400">Loading units...</div>
      ) : units.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
          <Home size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">No units found. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {units.map((unit) => (
            <div
              key={unit.id}
              onClick={() => onSelectUnit(unit.id)}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-lowes-blue transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="w-10 h-10 bg-blue-50 text-lowes-blue rounded-lg flex items-center justify-center">
                  <Home size={20} />
                </div>
                <button
                  onClick={(e) => handleArchive(e, unit)}
                  className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Archive Unit"
                >
                  <Archive size={16} />
                </button>
              </div>
              <h3 className="font-bold text-slate-800 text-lg mb-1">{unit.name}</h3>
              <p className="text-sm text-slate-500">
                {unit.city ? `${unit.city}, ${unit.state}` : 'No address details'}
              </p>
              <div className="mt-4 text-xs text-slate-400">
                Updated {new Date(unit.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, Clock3, Home, PlayCircle, Plus, RefreshCw } from 'lucide-react';
import { Inspection, Unit } from '../core/models/inspections';
import { InspectionService } from '../core/services/InspectionService';
import { UnitService } from '../core/services/UnitService';
import { useAppContext } from '../core/hooks/useAppContext';

interface InspectionHomeProps {
  onSelectUnit: (unitId: string) => void;
  onResumeInspection: (inspectionId: string) => void;
}

const formatInspectionStatus = (status: Inspection['status']) => status.replace(/_/g, ' ');

const getStatusClasses = (status: Inspection['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'in_progress':
      return 'bg-sky-100 text-sky-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

export const InspectionHome: React.FC<InspectionHomeProps> = ({
  onSelectUnit,
  onResumeInspection,
}) => {
  const { org } = useAppContext();
  const [units, setUnits] = useState<Unit[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAllUnits, setShowAllUnits] = useState(false);

  useEffect(() => {
    if (!org) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [loadedUnits, loadedInspections] = await Promise.all([
          UnitService.listUnits(org.id),
          InspectionService.listInspections(org.id),
        ]);
        setUnits(loadedUnits.filter((unit) => unit.status !== 'archived'));
        setInspections(loadedInspections);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [org]);

  const unitsById = useMemo(
    () => Object.fromEntries(units.map((unit) => [unit.id, unit])),
    [units]
  );

  const activeInspections = useMemo(
    () => inspections.filter((inspection) => inspection.status !== 'completed').slice(0, 4),
    [inspections]
  );

  const recentUnits = useMemo(() => units.slice(0, 6), [units]);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lowes-blue">Inspection</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Start or continue inspection work.</h1>
            <p className="mt-3 text-sm text-slate-600">
              This is the operational surface for field work. Start a new inspection from a unit or jump back into one that is already in motion.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => setShowAllUnits(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-lowes-blue px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <PlayCircle size={18} />
              Start Inspection
            </button>
            <button
              onClick={() => setShowAllUnits(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Home size={18} />
              Choose Unit
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{activeInspections.length}</div>
          <p className="mt-2 text-sm text-slate-500">Inspections ready to resume without browsing through records.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Units</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{units.length}</div>
          <p className="mt-2 text-sm text-slate-500">Available units you can launch from right now.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Completed</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {inspections.filter((inspection) => inspection.status === 'completed').length}
          </div>
          <p className="mt-2 text-sm text-slate-500">Finished inspections stay available in Unit Management for review and organization.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Resume active inspections</h2>
            <p className="mt-1 text-sm text-slate-500">Continue inspections that are still draft or in progress.</p>
          </div>
          <button
            onClick={() => setShowAllUnits(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus size={16} />
            Start from unit
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <RefreshCw size={18} className="mr-2 animate-spin" />
            Loading inspection activity...
          </div>
        ) : activeInspections.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <ClipboardList size={42} className="mx-auto text-slate-300" />
            <p className="mt-4 text-sm text-slate-600">No active inspections yet. Start from a unit to create the next inspection record.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {activeInspections.map((inspection) => {
              const unit = unitsById[inspection.unitId];
              return (
                <button
                  key={inspection.id}
                  onClick={() => onResumeInspection(inspection.id)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition-all hover:border-lowes-blue hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{inspection.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{unit?.name || 'Unknown unit'}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusClasses(inspection.status)}`}>
                      {formatInspectionStatus(inspection.status)}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={14} />
                      Updated {new Date(inspection.updatedAt).toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-lowes-blue">
                      Resume
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{showAllUnits ? 'Choose a unit to start' : 'Quick-start units'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {showAllUnits
              ? 'Pick a unit and continue into the existing inspection workflow.'
              : 'Recent units stay one click away, and you can expand to the full unit list when needed.'}
          </p>
        </div>

        {isLoading ? null : recentUnits.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <Home size={42} className="mx-auto text-slate-300" />
            <p className="mt-4 text-sm text-slate-600">No units are available yet. Create units in Unit Management first.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(showAllUnits ? units : recentUnits).map((unit) => (
              <button
                key={unit.id}
                onClick={() => onSelectUnit(unit.id)}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-lowes-blue hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-lowes-blue">
                    <Home size={20} />
                  </div>
                  <span className="text-xs text-slate-400">Updated {new Date(unit.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-4 text-base font-semibold text-slate-900">{unit.name}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {[unit.address1, unit.city, unit.state].filter(Boolean).join(', ') || 'No location details yet'}
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-lowes-blue">
                  Open unit
                  <ArrowRight size={14} />
                </div>
              </button>
            ))}
          </div>
        )}

        {!isLoading && units.length > recentUnits.length ? (
          <div className="mt-5">
            <button
              onClick={() => setShowAllUnits((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              {showAllUnits ? 'Show fewer units' : `Show all ${units.length} units`}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
};

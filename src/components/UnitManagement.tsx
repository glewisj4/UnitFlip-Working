import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building2, ClipboardList, Clock3, FolderCog, Home, Layers3, Plus, Star, Wrench } from 'lucide-react';
import { Inspection, Unit } from '../core/models/inspections';
import { InspectionService } from '../core/services/InspectionService';
import { UnitService } from '../core/services/UnitService';
import { LayoutTemplateService } from '../core/services/LayoutTemplateService';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';

interface UnitManagementProps {
  onOpenInspection: (inspectionId: string) => void;
  onOpenUnitInspections: (unitId: string) => void;
}

type InspectionStatusGroup = Inspection['status'];

const STATUS_ORDER: InspectionStatusGroup[] = ['in_progress', 'draft', 'completed'];

const STATUS_COPY: Record<InspectionStatusGroup, { title: string; description: string; classes: string }> = {
  in_progress: {
    title: 'In progress',
    description: 'Inspections currently being worked.',
    classes: 'bg-sky-100 text-sky-700',
  },
  draft: {
    title: 'Ready',
    description: 'Draft inspections ready to start or review.',
    classes: 'bg-amber-100 text-amber-700',
  },
  completed: {
    title: 'Completed',
    description: 'Finished inspections retained for review.',
    classes: 'bg-emerald-100 text-emerald-700',
  },
};

const getUnitGroupLabel = (unit: Unit) => {
  if (unit.address1?.trim()) {
    return unit.address1.split(',')[0].trim() || 'Independent units';
  }
  if (unit.city || unit.state) {
    return [unit.city, unit.state].filter(Boolean).join(', ');
  }
  return 'Independent units';
};

export const UnitManagement: React.FC<UnitManagementProps> = ({ onOpenInspection, onOpenUnitInspections }) => {
  const { org } = useAppContext();
  const { log } = useAuditLogger();
  const [units, setUnits] = useState<Unit[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [activeTemplateCount, setActiveTemplateCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!org) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [loadedUnits, loadedInspections, layouts] = await Promise.all([
          UnitService.listUnits(org.id),
          InspectionService.listInspections(org.id),
          LayoutTemplateService.listActive(org.id),
        ]);
        setUnits(loadedUnits.filter((unit) => unit.status !== 'archived'));
        setInspections(loadedInspections);
        setActiveTemplateCount(layouts.length);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [org]);

  const unitNameById = useMemo(
    () => Object.fromEntries(units.map((unit) => [unit.id, unit.name])),
    [units]
  );

  const inspectionsByUnitId = useMemo(() => {
    const next: Record<string, Inspection[]> = {};
    inspections.forEach((inspection) => {
      if (!next[inspection.unitId]) {
        next[inspection.unitId] = [];
      }
      next[inspection.unitId].push(inspection);
    });
    Object.values(next).forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [inspections]);

  const statusGroups = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        inspections: inspections.filter((inspection) => inspection.status === status),
      })),
    [inspections]
  );

  const groupedUnits = useMemo(() => {
    const groups = new Map<string, Unit[]>();
    units.forEach((unit) => {
      const label = getUnitGroupLabel(unit);
      const existing = groups.get(label) || [];
      existing.push(unit);
      groups.set(label, existing);
    });

    return Array.from(groups.entries())
      .map(([label, grouped]) => ({
        label,
        units: grouped.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [units]);

  const totalActiveInspections = inspections.filter((inspection) => inspection.status !== 'completed').length;

  const handleCreateUnit = async () => {
    if (!org) return;
    const name = prompt('Enter Unit Name (e.g., 123 Main St #4B):');
    if (!name) return;

    try {
      const unit = await UnitService.createUnit(org.id, { name });
      log('UNIT_CREATED', { entityId: unit.id, message: `Created unit: ${name}` });
      setUnits((current) => [unit, ...current].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (error) {
      console.error(error);
      alert('Failed to create unit.');
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Unit Management</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Manage units, active inspections, and setup.</h1>
            <p className="mt-3 text-sm text-slate-600">
              This is the structural hub for organizing units, reviewing inspection status, and establishing where unit-specific configuration belongs.
            </p>
          </div>
          <button
            onClick={handleCreateUnit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <Plus size={18} />
            Add Unit
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Units</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{units.length}</div>
          <p className="mt-2 text-sm text-slate-500">Active units available for inspections and setup.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active inspections</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{totalActiveInspections}</div>
          <p className="mt-2 text-sm text-slate-500">Draft and in-progress inspections requiring attention.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Completed</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {inspections.filter((inspection) => inspection.status === 'completed').length}
          </div>
          <p className="mt-2 text-sm text-slate-500">Completed records retained for historical review.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active templates</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{activeTemplateCount}</div>
          <p className="mt-2 text-sm text-slate-500">Layouts available to assign as inspection starting points.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Active inspections and statuses</h2>
          <p className="mt-1 text-sm text-slate-500">Review what is in progress, what is ready to work, and what has been completed.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {statusGroups.map(({ status, inspections: grouped }) => (
            <div key={status} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{STATUS_COPY[status].title}</div>
                  <div className="mt-1 text-xs text-slate-500">{STATUS_COPY[status].description}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_COPY[status].classes}`}>
                  {grouped.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {grouped.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    No inspections in this status.
                  </div>
                ) : (
                  grouped.slice(0, 5).map((inspection) => (
                    <button
                      key={inspection.id}
                      onClick={() => onOpenInspection(inspection.id)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-lowes-blue hover:shadow-sm"
                    >
                      <div className="font-medium text-slate-900">{inspection.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{unitNameById[inspection.unitId] || 'Unknown unit'}</div>
                      <div className="mt-3 inline-flex items-center gap-1 text-xs text-lowes-blue">
                        <Clock3 size={13} />
                        Updated {new Date(inspection.updatedAt).toLocaleString()}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Units grouped by facility or building</h2>
          <p className="mt-1 text-sm text-slate-500">
            Grouping uses available address details today and falls back safely when facility metadata has not been modeled yet.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Loading units and inspections...
            </div>
          ) : groupedUnits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <Building2 size={40} className="mx-auto text-slate-300" />
              <p className="mt-4 text-sm text-slate-600">No units have been created yet.</p>
            </div>
          ) : (
            groupedUnits.map((group) => (
              <div key={group.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Building2 size={16} className="text-emerald-700" />
                  {group.label}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {group.units.map((unit) => {
                    const unitInspections = inspectionsByUnitId[unit.id] || [];
                    const latestInspection = unitInspections[0];
                    return (
                      <div key={unit.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-base font-semibold text-slate-900">{unit.name}</div>
                            <div className="mt-1 text-sm text-slate-500">
                              {[unit.address1, unit.city, unit.state, unit.zip].filter(Boolean).join(', ') || 'Address details not set yet'}
                            </div>
                          </div>
                          <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                            <Home size={18} />
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500">Inspections</div>
                            <div className="mt-1 font-semibold text-slate-900">{unitInspections.length}</div>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-3">
                            <div className="text-xs uppercase tracking-wide text-slate-500">Latest status</div>
                            <div className="mt-1 font-semibold text-slate-900">
                              {latestInspection ? latestInspection.status.replace(/_/g, ' ') : 'No inspections'}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">Unit details</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">Assigned templates</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">Product favorites</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">Inspection setup</span>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            onClick={() => onOpenUnitInspections(unit.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                          >
                            <ClipboardList size={16} />
                            View inspections
                          </button>
                          {latestInspection ? (
                            <button
                              onClick={() => onOpenInspection(latestInspection.id)}
                              className="inline-flex items-center gap-2 rounded-lg bg-lowes-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                              Open latest
                              <ArrowRight size={15} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Unit-specific details and configuration</h2>
          <p className="mt-1 text-sm text-slate-500">
            This establishes the management home for setup work without forcing a schema rewrite in this phase.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <FolderCog size={20} className="text-slate-700" />
            <div className="mt-3 font-semibold text-slate-900">Unit details</div>
            <p className="mt-2 text-sm text-slate-500">Address, identity, and facility-building placement belong here.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Layers3 size={20} className="text-slate-700" />
            <div className="mt-3 font-semibold text-slate-900">Assigned templates</div>
            <p className="mt-2 text-sm text-slate-500">Layout and checklist defaults can evolve here in future phases.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Star size={20} className="text-slate-700" />
            <div className="mt-3 font-semibold text-slate-900">Product favorites</div>
            <p className="mt-2 text-sm text-slate-500">Preferred replacement products and standards have a clear home now.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Wrench size={20} className="text-slate-700" />
            <div className="mt-3 font-semibold text-slate-900">Inspection lifecycle</div>
            <p className="mt-2 text-sm text-slate-500">Status review, readiness, and operational handoff stay distinct from live execution.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

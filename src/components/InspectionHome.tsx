import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ClipboardList, Clock3, Home, PlayCircle, Plus, RefreshCw } from 'lucide-react';
import { Inspection, Unit } from '../core/models/inspections';
import { GeneratedInspectionItem, GeneratedInspectionSection } from '../core/models/templates';
import { DevSeedService } from '../core/services/DevSeedService';
import { InspectionService } from '../core/services/InspectionService';
import { UnitService } from '../core/services/UnitService';
import { useAppContext } from '../core/hooks/useAppContext';

interface InspectionHomeProps {
  onSelectUnit: (unitId: string) => void;
  onResumeInspection: (inspectionId: string) => void;
  onOpenPortfolio?: () => void;
}

const getRoomKey = (section: GeneratedInspectionSection) => section.roomLabel || section.title || 'Unit Overview';

const itemNeedsFollowThrough = (item: GeneratedInspectionItem) =>
  item.status === 'in_progress' || item.status === 'not_started' || item.status === 'blocked' || item.status === 'failed';

const getInspectionProgressSummary = (inspection: Inspection) => {
  const sections = inspection.generatedSections || [];
  const items = (inspection.generatedItems || []).length > 0
    ? inspection.generatedItems || []
    : sections.flatMap((section) => section.items || []);
  const totalCount = items.length;
  const completedCount = items.filter((item) => item.status === 'completed' || item.status === 'not_applicable').length;
  const activeCount = items.filter((item) => item.status === 'in_progress').length;
  const blockedCount = items.filter((item) => item.status === 'blocked' || item.status === 'failed').length;

  const prioritizedItem =
    items.find((item) => item.status === 'in_progress') ||
    items.find((item) => item.status === 'blocked' || item.status === 'failed') ||
    items.find((item) => item.status === 'not_started') ||
    null;
  const nextSection = sections.find((section) => (section.items || []).some((item) => itemNeedsFollowThrough(item))) || null;
  const nextRoomLabel =
    prioritizedItem?.roomLabel ||
    nextSection?.roomLabel ||
    nextSection?.title ||
    (sections[0] ? getRoomKey(sections[0]) : 'Unit Overview');

  const nextItemLabel = prioritizedItem?.label || null;
  const hasProgress = totalCount > 0;
  const progressLabel = hasProgress
    ? `${completedCount}/${totalCount} checklist items complete`
    : inspection.status === 'draft'
      ? 'Checklist generated and ready to continue'
      : 'Inspection ready to continue';
  const stateLabel =
    inspection.status === 'in_progress'
      ? activeCount > 0
        ? 'In Progress'
        : completedCount > 0
          ? 'Partially Complete'
          : 'Ready to Continue'
      : completedCount > 0
        ? 'Partially Complete'
        : 'Draft';

  return {
    nextRoomLabel,
    nextItemLabel,
    progressLabel,
    stateLabel,
    blockedCount,
  };
};

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
  onOpenPortfolio,
}) => {
  const { org } = useAppContext();
  const [units, setUnits] = useState<Unit[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAllUnits, setShowAllUnits] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const unitPickerRef = useRef<HTMLElement | null>(null);
  const resumeSectionRef = useRef<HTMLElement | null>(null);
  const firstResumeButtonRef = useRef<HTMLButtonElement | null>(null);

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
  }, [org, refreshNonce]);

  useEffect(() => {
    if (!org) return;

    const handleSeedRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ orgId?: string }>).detail;
      if (detail?.orgId !== org.id) return;
      setRefreshNonce((current) => current + 1);
    };

    window.addEventListener(DevSeedService.REFRESH_EVENT, handleSeedRefresh as EventListener);
    return () => window.removeEventListener(DevSeedService.REFRESH_EVENT, handleSeedRefresh as EventListener);
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
  const searchableUnits = showAllUnits ? units : recentUnits;
  const visibleUnits = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return searchableUnits;
    return searchableUnits.filter((unit) =>
      [
        unit.name,
        unit.address1,
        unit.address2,
        unit.city,
        unit.state,
        unit.zip,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch))
    );
  }, [searchTerm, searchableUnits]);

  const focusUnitPicker = () => {
    setShowAllUnits(true);
    window.requestAnimationFrame(() => {
      unitPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleStartInspection = () => {
    if (activeInspections.length > 0) {
      window.requestAnimationFrame(() => {
        resumeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        firstResumeButtonRef.current?.focus();
      });
      return;
    }

    focusUnitPicker();
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lowes-blue">Inspection</p>
            <h1 className="text-2xl font-bold text-slate-900">Start or continue inspection work.</h1>
            <p className="text-sm text-slate-600">Start Inspection resumes active work first, then falls back to unit selection.</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <button
              onClick={handleStartInspection}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-lowes-blue px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <PlayCircle size={18} />
              Start Inspection
            </button>
            {onOpenPortfolio ? (
              <button
                onClick={onOpenPortfolio}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
              >
                <ArrowRight size={18} />
                Open Portfolio
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{activeInspections.length}</div>
          <p className="mt-1 text-sm text-slate-500">Ready to resume.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Units</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{units.length}</div>
          <p className="mt-1 text-sm text-slate-500">Available to launch.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Completed</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {inspections.filter((inspection) => inspection.status === 'completed').length}
          </div>
          <p className="mt-1 text-sm text-slate-500">Available for review later.</p>
        </div>
      </section>

      <section ref={resumeSectionRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-lowes-blue">Continue Work</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Resume active inspections</h2>
            <p className="mt-1 text-sm text-slate-500">Pick up where you left off. Each inspection continues directly into its current checklist.</p>
          </div>
          <button
            onClick={focusUnitPicker}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus size={16} />
            Choose Different Unit
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <RefreshCw size={18} className="mr-2 animate-spin" />
            Loading inspection activity...
          </div>
        ) : activeInspections.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <ClipboardList size={36} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-600">No active inspections yet.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {activeInspections.map((inspection, index) => {
              const unit = unitsById[inspection.unitId];
              const progress = getInspectionProgressSummary(inspection);
              return (
                <button
                  key={inspection.id}
                  ref={index === 0 ? firstResumeButtonRef : null}
                  onClick={() => onResumeInspection(inspection.id)}
                  className={`rounded-2xl border p-4 text-left transition-all hover:border-lowes-blue hover:bg-white hover:shadow-sm ${
                    index === 0
                      ? 'border-lowes-blue bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lowes-blue">
                        {index === 0 ? 'Continue Next' : 'Active Inspection'}
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">{unit?.name || 'Unknown unit'}</div>
                      <div className="mt-1 text-sm text-slate-500">{inspection.title}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusClasses(inspection.status)}`}>
                      {progress.stateLabel}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <div className="font-medium text-slate-900">
                      Continue in {progress.nextRoomLabel}
                      {progress.nextItemLabel ? ` • ${progress.nextItemLabel}` : ''}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{progress.progressLabel}</span>
                      {progress.blockedCount > 0 ? <span>{progress.blockedCount} item{progress.blockedCount === 1 ? '' : 's'} need attention</span> : null}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Clock3 size={14} />
                      Updated {new Date(inspection.updatedAt).toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-lowes-blue">
                      Resume Inspection
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section ref={unitPickerRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Choose a unit to start</h2>
          <p className="mt-1 text-sm text-slate-500">Recent units first, full list one tap away.</p>
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search units or addresses"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-lowes-blue md:max-w-md"
          />
          {onOpenPortfolio ? (
            <button
              onClick={onOpenPortfolio}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              Use Portfolio for full hierarchy browsing
            </button>
          ) : null}
        </div>

        {isLoading ? null : recentUnits.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <Home size={42} className="mx-auto text-slate-300" />
            <p className="mt-4 text-sm text-slate-600">No units are available yet. Create units in Unit Management first.</p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleUnits.map((unit) => (
              <button
                key={unit.id}
                onClick={() => onSelectUnit(unit.id)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-lowes-blue hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-lowes-blue">
                    <Home size={20} />
                  </div>
                  <span className="text-xs text-slate-400">Updated {new Date(unit.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-3 text-base font-semibold text-slate-900">{unit.name}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {[unit.address1, unit.city, unit.state].filter(Boolean).join(', ') || 'No location details yet'}
                </div>
                {unit.assignedLayoutTemplateId || unit.managementData?.maintenanceCheatSheet?.airFilterSize || unit.managementData?.physicalDetails?.floorPlanNotes ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {unit.assignedLayoutTemplateId ? (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-lowes-blue">
                        Unit template assigned
                      </span>
                    ) : null}
                    {unit.managementData?.maintenanceCheatSheet?.airFilterSize ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Reference data available
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-lowes-blue">
                  Open unit
                  <ArrowRight size={14} />
                </div>
              </button>
            ))}
          </div>
        )}
        {!isLoading && visibleUnits.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
            No units match this search. Try a different unit name or use Portfolio for the full hierarchy view.
          </div>
        ) : null}

        {!isLoading && units.length > recentUnits.length ? (
          <div className="mt-5">
            <button
              onClick={() => setShowAllUnits((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              {showAllUnits ? 'Show recent units' : `Show all ${units.length} units`}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
};

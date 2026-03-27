import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  PackageCheck,
  ShoppingCart,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { Inspection, Unit } from '../core/models/inspections';
import { Finding, MaterialRequirement, RepairTask } from '../core/models/operations';
import { InspectionAttentionService } from '../core/services/InspectionAttentionService';
import { FindingService } from '../core/services/FindingService';
import { InspectionService } from '../core/services/InspectionService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { RepairTaskService } from '../core/services/RepairTaskService';
import { UnitService } from '../core/services/UnitService';
import { UnitLifecycleService } from '../core/services/UnitLifecycleService';

interface DashboardProps {
  recentWork?: Array<{
    id: string;
    surface: 'inspection' | 'unit_workspace' | 'procurement';
    unitId: string;
    label: string;
    detail?: string | null;
  }>;
  onOpenRecentWork?: (id: string) => void;
  onOpenPortfolio: () => void;
  onOpenInspection: (options?: {
    inspectionId?: string | null;
    scopeSection?: 'findings' | 'tasks' | 'materials' | null;
    originContextLabel?: string | null;
    unitId?: string | null;
    scopeTarget?: {
      entityType: 'finding' | 'task' | 'material';
      entityId: string;
      originLabel?: string | null;
    } | null;
  }) => void;
  onOpenProcurement: (options?: {
    unitId?: string | null;
    focus?: 'all' | 'procurement' | 'vendor' | 'receiving' | 'verification';
  }) => void;
  onOpenUnitWorkspace: (
    unitId?: string | null,
    context?: {
      preferredTab?: 'overview' | 'inspection' | 'scope' | 'procurement' | 'vendor' | 'verification' | null;
      inspectionId?: string | null;
      scopeSection?: 'findings' | 'tasks' | 'materials' | null;
      scopeTarget?: {
        entityType: 'finding' | 'task' | 'material';
        entityId: string;
        originLabel?: string | null;
      } | null;
      reasonLabel?: string | null;
      reasonDetail?: string | null;
    }
  ) => void;
}

interface DashboardUnitSignals {
  unit: Unit;
  latestInspection: Inspection | null;
  unresolvedFindingsCount: number;
  activeTasksCount: number;
  pendingMaterialsCount: number;
  procurementReadyCount: number;
  vendorInProgressCount: number;
  pendingReceivingCount: number;
  pendingVerificationCount: number;
  recentlyFulfilledCount: number;
  healthLabel: 'needs_attention' | 'active_work' | 'complete' | 'clear';
  isComplete: boolean;
  lastActivityAt?: number;
  priorityLabel: string;
  priorityDetail: string;
  priorityContext: ReturnType<typeof InspectionAttentionService.derivePriorityContext>;
}

interface ActivityItem {
  key: string;
  type: 'unit' | 'vendor' | 'procurement' | 'verification';
  title: string;
  description: string;
  timestamp: number;
  cta: string;
  action: () => void;
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const formatTimestamp = (timestamp?: number) => (timestamp ? new Date(timestamp).toLocaleString() : 'Not available');

const buildUnitWorkspaceAttentionContext = (signal: DashboardUnitSignals) =>
  signal.priorityContext
    ? {
        preferredTab: signal.priorityContext.unitTab,
        inspectionId: signal.latestInspection?.id || null,
        scopeSection: signal.priorityContext.scopeSection,
        scopeTarget: signal.priorityContext.scopeTarget,
        reasonLabel: signal.priorityContext.reasonLabel,
        reasonDetail: signal.priorityContext.reasonDetail,
      }
    : undefined;

const buildInspectionAttentionContext = (signal: DashboardUnitSignals) =>
  signal.priorityContext && signal.latestInspection
    ? {
        unitId: signal.unit.id,
        inspectionId: signal.latestInspection.id,
        scopeSection: signal.priorityContext.scopeSection,
        originContextLabel: `Opened from Dashboard • ${signal.priorityContext.reasonLabel}`,
        scopeTarget: signal.priorityContext.scopeTarget,
      }
    : undefined;

export const Dashboard: React.FC<DashboardProps> = ({
  recentWork = [],
  onOpenRecentWork,
  onOpenPortfolio,
  onOpenInspection,
  onOpenProcurement,
  onOpenUnitWorkspace,
}) => {
  const { org } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<RepairTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);

  useEffect(() => {
    if (!org) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [loadedUnits, loadedInspections, loadedFindings, loadedTasks, loadedMaterials] = await Promise.all([
          UnitService.listUnits(org.id),
          InspectionService.listInspections(org.id),
          FindingService.listFindings(org.id),
          RepairTaskService.listTasks(org.id),
          MaterialRequirementService.listRequirements(org.id),
        ]);

        setUnits(loadedUnits.filter((unit) => unit.status !== 'archived'));
        setInspections(loadedInspections);
        setFindings(loadedFindings);
        setTasks(loadedTasks);
        setMaterials(loadedMaterials);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [org]);

  const inspectionsByUnitId = useMemo(() => {
    const next = new Map<string, Inspection[]>();
    inspections.forEach((inspection) => {
      const current = next.get(inspection.unitId) || [];
      current.push(inspection);
      next.set(inspection.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [inspections]);

  const inspectionById = useMemo(
    () => new Map(inspections.map((inspection) => [inspection.id, inspection])),
    [inspections]
  );

  const findingsByUnitId = useMemo(() => {
    const next = new Map<string, Finding[]>();
    findings.forEach((finding) => {
      const current = next.get(finding.unitId) || [];
      current.push(finding);
      next.set(finding.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [findings]);

  const tasksByUnitId = useMemo(() => {
    const next = new Map<string, RepairTask[]>();
    tasks.forEach((task) => {
      const current = next.get(task.unitId) || [];
      current.push(task);
      next.set(task.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [tasks]);

  const materialsByUnitId = useMemo(() => {
    const next = new Map<string, MaterialRequirement[]>();
    materials.forEach((requirement) => {
      const inspection = inspectionById.get(requirement.inspectionId);
      if (!inspection) return;
      const current = next.get(inspection.unitId) || [];
      current.push(requirement);
      next.set(inspection.unitId, current);
    });
    next.forEach((group) => group.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }, [inspectionById, materials]);

  const unitSignals = useMemo<DashboardUnitSignals[]>(() => {
    return units.map((unit) => {
      const unitInspections = inspectionsByUnitId.get(unit.id) || [];
      const unitFindings = findingsByUnitId.get(unit.id) || [];
      const unitTasks = tasksByUnitId.get(unit.id) || [];
      const unitMaterials = materialsByUnitId.get(unit.id) || [];
      const lifecycle = UnitLifecycleService.deriveSignals(unit, unitInspections, unitFindings, unitTasks, unitMaterials);
      const attentionProjection = InspectionAttentionService.deriveUnitAttentionProjection(unitFindings, unitTasks, unitMaterials);
      const recentlyFulfilledCount = unitMaterials.filter(
        (material) =>
          material.procurementState === 'fulfilled' &&
          typeof material.verifiedAt === 'number' &&
          material.verifiedAt >= Date.now() - 7 * 24 * 60 * 60 * 1000
      ).length;

      return {
        unit,
        latestInspection: lifecycle.latestInspection,
        unresolvedFindingsCount: lifecycle.unresolvedFindingsCount,
        activeTasksCount: lifecycle.activeTasksCount,
        pendingMaterialsCount: lifecycle.pendingMaterialsCount,
        procurementReadyCount: lifecycle.procurementReadyCount + lifecycle.activatedCount,
        vendorInProgressCount: lifecycle.vendorInProgressCount,
        pendingReceivingCount: lifecycle.pendingReceivingCount,
        pendingVerificationCount: lifecycle.pendingVerificationCount,
        recentlyFulfilledCount,
        healthLabel: lifecycle.healthLabel,
        isComplete: lifecycle.isComplete,
        lastActivityAt: lifecycle.lastActivityAt,
        priorityLabel: attentionProjection.priorityLabel,
        priorityDetail: attentionProjection.priorityDetail,
        priorityContext: attentionProjection.context,
      };
    });
  }, [units, inspectionsByUnitId, findingsByUnitId, tasksByUnitId, materialsByUnitId]);

  const unitsNeedingInspection = useMemo(
    () => unitSignals.filter((signal) => !signal.latestInspection),
    [unitSignals]
  );
  const unitsNeedingAttention = useMemo(
    () => unitSignals.filter((signal) => signal.healthLabel === 'needs_attention'),
    [unitSignals]
  );
  const unitsWithActiveWork = useMemo(
    () => unitSignals.filter((signal) => signal.healthLabel === 'active_work'),
    [unitSignals]
  );
  const completedUnits = useMemo(
    () => unitSignals.filter((signal) => signal.isComplete),
    [unitSignals]
  );
  const procurementReadyCount = useMemo(
    () => unitSignals.reduce((sum, signal) => sum + signal.procurementReadyCount, 0),
    [unitSignals]
  );
  const vendorInProgressCount = useMemo(
    () => unitSignals.reduce((sum, signal) => sum + signal.vendorInProgressCount, 0),
    [unitSignals]
  );
  const pendingReceivingCount = useMemo(
    () => unitSignals.reduce((sum, signal) => sum + signal.pendingReceivingCount, 0),
    [unitSignals]
  );
  const pendingVerificationCount = useMemo(
    () => unitSignals.reduce((sum, signal) => sum + signal.pendingVerificationCount, 0),
    [unitSignals]
  );
  const recentlyFulfilledCount = useMemo(
    () => unitSignals.reduce((sum, signal) => sum + signal.recentlyFulfilledCount, 0),
    [unitSignals]
  );

  const actionCards = useMemo(
    () => [
      {
        title: 'Units needing inspection',
        count: unitsNeedingInspection.length,
        description: 'Units with no inspection history yet.',
        actionLabel: unitsNeedingInspection[0] ? 'Open next unit' : 'Open Portfolio',
        action: () =>
          unitsNeedingInspection[0] ? onOpenUnitWorkspace(unitsNeedingInspection[0].unit.id, buildUnitWorkspaceAttentionContext(unitsNeedingInspection[0])) : onOpenPortfolio(),
        tone: 'border-slate-200 bg-white',
      },
      {
        title: 'Units with active work',
        count: unitsWithActiveWork.length,
        description: 'Inspection or repair execution is already underway.',
        actionLabel: unitsWithActiveWork[0] ? 'Open active unit' : 'Open Inspection',
        action: () =>
          unitsWithActiveWork[0]
            ? onOpenUnitWorkspace(unitsWithActiveWork[0].unit.id, buildUnitWorkspaceAttentionContext(unitsWithActiveWork[0]))
            : onOpenInspection(),
        tone: 'border-sky-200 bg-sky-50',
      },
      {
        title: 'Ready for procurement',
        count: procurementReadyCount,
        description: 'Selected materials can be pushed into procurement work.',
        actionLabel: 'Open Procurement',
        action: () => onOpenProcurement({ focus: 'procurement' }),
        tone: 'border-amber-200 bg-amber-50',
      },
      {
        title: 'Pending vendor completion',
        count: vendorInProgressCount,
        description: 'Assigned vendor work still in flight.',
        actionLabel: 'Review vendor queue',
        action: () => onOpenProcurement({ focus: 'vendor' }),
        tone: 'border-violet-200 bg-violet-50',
      },
      {
        title: 'Pending receiving',
        count: pendingReceivingCount,
        description: 'Vendor completed work waiting on internal receiving.',
        actionLabel: 'Open receiving queue',
        action: () => onOpenProcurement({ focus: 'receiving' }),
        tone: 'border-rose-200 bg-rose-50',
      },
      {
        title: 'Pending verification',
        count: pendingVerificationCount,
        description: 'Received items still need internal verification.',
        actionLabel: 'Open verification queue',
        action: () => onOpenProcurement({ focus: 'verification' }),
        tone: 'border-emerald-200 bg-emerald-50',
      },
    ],
    [
      onOpenInspection,
      onOpenPortfolio,
      onOpenProcurement,
      onOpenUnitWorkspace,
      pendingReceivingCount,
      pendingVerificationCount,
      procurementReadyCount,
      unitsNeedingInspection,
      unitsWithActiveWork,
      vendorInProgressCount,
    ]
  );

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const next: ActivityItem[] = [];

    unitSignals
      .filter((signal) => signal.lastActivityAt)
      .slice()
      .sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))
      .slice(0, 4)
      .forEach((signal) => {
        next.push({
          key: `unit-${signal.unit.id}`,
          type: 'unit',
          title: signal.unit.name,
          description:
            signal.healthLabel === 'needs_attention'
              ? 'Still needs scope review or follow-up.'
              : signal.healthLabel === 'active_work'
                ? 'Has active inspection or task execution.'
                : signal.isComplete
                  ? 'This unit is fully closed and verified.'
                  : 'Recently updated with no active scope.',
          timestamp: signal.lastActivityAt || signal.unit.updatedAt,
          cta: 'Open unit workspace',
          action: () => onOpenUnitWorkspace(signal.unit.id, buildUnitWorkspaceAttentionContext(signal)),
        });
      });

    materials
      .filter((material) => material.procurementActivatedAt)
      .slice()
      .sort((a, b) => (b.procurementActivatedAt || 0) - (a.procurementActivatedAt || 0))
      .slice(0, 2)
      .forEach((material) => {
        next.push({
          key: `activated-${material.id}`,
          type: 'procurement',
          title: material.itemDescription,
          description: 'Recently activated for procurement.',
          timestamp: material.procurementActivatedAt || material.updatedAt,
          cta: 'Open procurement',
          action: onOpenProcurement,
        });
      });

    materials
      .filter((material) => material.vendorCompletedAt)
      .slice()
      .sort((a, b) => (b.vendorCompletedAt || 0) - (a.vendorCompletedAt || 0))
      .slice(0, 2)
      .forEach((material) => {
        next.push({
          key: `vendor-complete-${material.id}`,
          type: 'vendor',
          title: material.itemDescription,
          description: 'Vendor marked this item completed.',
          timestamp: material.vendorCompletedAt || material.updatedAt,
          cta: 'Review completion',
          action: onOpenProcurement,
        });
      });

    materials
      .filter((material) => material.verifiedAt)
      .slice()
      .sort((a, b) => (b.verifiedAt || 0) - (a.verifiedAt || 0))
      .slice(0, 2)
      .forEach((material) => {
        next.push({
          key: `verified-${material.id}`,
          type: 'verification',
          title: material.itemDescription,
          description: 'Recently verified and closed internally.',
          timestamp: material.verifiedAt || material.updatedAt,
          cta: 'Open procurement',
          action: onOpenProcurement,
        });
      });

    return next.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  }, [materials, onOpenProcurement, onOpenUnitWorkspace, unitSignals]);

  const headlineUnit = unitsNeedingAttention[0] || unitsWithActiveWork[0] || unitsNeedingInspection[0] || unitSignals[0] || null;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lowes-blue">Dashboard</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">See what needs attention now and route directly into the work.</h1>
            <p className="mt-3 text-sm text-slate-600">
              Use Dashboard as the command center for portfolio health, procurement pressure, and verification queues.
              Open Portfolio to browse the hierarchy. Open Unit Workspace when you need one unit’s full operational story.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={onOpenPortfolio}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-lowes-blue hover:text-lowes-blue"
            >
              <div className="text-sm font-semibold text-slate-900">Open Portfolio</div>
              <div className="mt-1 text-xs text-slate-500">Browse facilities, buildings, and unit priority signals.</div>
            </button>
            <button
              onClick={() => onOpenUnitWorkspace(headlineUnit?.unit.id || null, headlineUnit ? buildUnitWorkspaceAttentionContext(headlineUnit) : undefined)}
              className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left shadow-sm transition hover:border-lowes-blue"
            >
              <div className="text-sm font-semibold text-slate-900">Open next unit</div>
              <div className="mt-1 text-xs text-slate-500">
                {headlineUnit ? `${headlineUnit.unit.name} is the best next operational stop.` : 'Open the unit workspace.'}
              </div>
            </button>
          </div>
        </div>
        {headlineUnit ? (
          <div
            data-testid="dashboard-priority-summary"
            className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-semibold">
              {unitsNeedingAttention.length} unit{unitsNeedingAttention.length === 1 ? '' : 's'} need attention.
            </span>{' '}
            <span>
              Start with {headlineUnit.unit.name}: {headlineUnit.priorityLabel}
              {headlineUnit.priorityDetail ? ` • ${headlineUnit.priorityDetail}` : ''}.
            </span>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {actionCards.map((card) => (
          <button
            key={card.title}
            onClick={card.action}
            className={`rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.title}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{card.count}</div>
            <p className="mt-2 text-sm text-slate-600">{card.description}</p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-lowes-blue">
              {card.actionLabel}
              <ArrowRight size={14} />
            </div>
          </button>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">At a glance</h2>
                <p className="mt-1 text-sm text-slate-500">High-value counts that help route work without turning Dashboard into a second Portfolio.</p>
              </div>
              <button
                onClick={() => onOpenProcurement({ focus: 'procurement' })}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-lowes-blue hover:text-lowes-blue"
              >
                <ShoppingCart size={16} />
                Open Procurement
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Total units</div>
                <div className="mt-2 text-3xl font-bold text-slate-900">{units.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Units needing attention</div>
                <div className="mt-2 text-3xl font-bold text-amber-700">{unitsNeedingAttention.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Active work</div>
                <div className="mt-2 text-3xl font-bold text-sky-700">{unitsWithActiveWork.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Unit complete</div>
                <div className="mt-2 text-3xl font-bold text-emerald-700">{completedUnits.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Procurement ready</div>
                <div className="mt-2 text-3xl font-bold text-amber-700">{procurementReadyCount}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Vendor in progress</div>
                <div className="mt-2 text-3xl font-bold text-violet-700">{vendorInProgressCount}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Pending verification</div>
                <div className="mt-2 text-3xl font-bold text-emerald-700">{pendingVerificationCount}</div>
                <div className="mt-1 text-xs text-slate-500">{recentlyFulfilledCount} fulfilled in the last 7 days</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Recent work</h2>
                <p className="mt-1 text-sm text-slate-500">Return to the last few meaningful unit, inspection, and procurement contexts without hunting.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3" data-testid="dashboard-recent-work">
              {recentWork.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                  Recent work will appear here after you move into unit, inspection, or procurement contexts.
                </div>
              ) : (
                recentWork.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`dashboard-recent-work-item-${item.surface}`}
                    onClick={() => onOpenRecentWork?.(item.id)}
                    className="flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{item.label}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {item.surface === 'unit_workspace'
                            ? 'Unit Workspace'
                            : item.surface === 'procurement'
                              ? 'Procurement'
                              : 'Inspection'}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{item.detail || 'Return to the same recent work context.'}</div>
                    </div>
                    <div className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-lowes-blue">
                      Return
                      <ArrowRight size={14} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Recent operational feed</h2>
                <p className="mt-1 text-sm text-slate-500">Recently updated units, procurement activations, vendor completions, and verifications.</p>
              </div>
              <button
                onClick={onOpenPortfolio}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-lowes-blue hover:text-lowes-blue"
              >
                <ClipboardList size={16} />
                Open Portfolio
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {recentActivity.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">
                  {isLoading ? 'Loading activity...' : 'No recent operational activity is available yet.'}
                </div>
              ) : (
                recentActivity.map((item) => (
                  <button
                    key={item.key}
                    onClick={item.action}
                    className="flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                      <div className="mt-2 text-xs text-slate-500">{formatTimestamp(item.timestamp)}</div>
                    </div>
                    <div className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-lowes-blue">
                      {item.cta}
                      <ArrowRight size={14} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Units needing attention first</h2>
                <p className="mt-1 text-sm text-slate-500">Short reasons pulled from the same attention model used inside inspection and unit workflow.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {(unitsNeedingAttention.length > 0 ? unitsNeedingAttention : unitSignals.slice(0, 4)).slice(0, 5).map((signal) => (
                <div
                  key={signal.unit.id}
                  data-testid={`dashboard-priority-unit-${signal.unit.id}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-lowes-blue hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-4 text-left">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900">{signal.unit.name}</div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        signal.healthLabel === 'needs_attention'
                          ? 'bg-amber-100 text-amber-800'
                          : signal.healthLabel === 'active_work'
                            ? 'bg-blue-100 text-blue-700'
                            : signal.isComplete
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}>
                        {signal.priorityLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">{signal.priorityDetail}</div>
                  </div>
                  <div className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-lowes-blue">
                    Open unit
                    <ArrowRight size={14} />
                  </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenUnitWorkspace(signal.unit.id, buildUnitWorkspaceAttentionContext(signal))}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-lowes-blue hover:text-lowes-blue"
                    >
                      Open Unit Workspace
                    </button>
                    {signal.latestInspection && signal.priorityContext ? (
                      <button
                        type="button"
                        onClick={() => onOpenInspection(buildInspectionAttentionContext(signal))}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 transition hover:border-emerald-300"
                      >
                        Open Exact Work
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Quick actions</h2>
            <p className="mt-1 text-sm text-slate-500">Use the existing operational surfaces directly. Dashboard only points you to the right place.</p>

            <div className="mt-5 space-y-3">
              <button
                onClick={onOpenInspection}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white p-2 text-lowes-blue shadow-sm">
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Start inspection</div>
                    <div className="text-sm text-slate-500">Go to the live capture and review entry surface.</div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-lowes-blue" />
              </button>

              <button
                onClick={() => onOpenUnitWorkspace(headlineUnit?.unit.id || null, headlineUnit ? buildUnitWorkspaceAttentionContext(headlineUnit) : undefined)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white p-2 text-emerald-700 shadow-sm">
                    <Wrench size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Open unit workspace</div>
                    <div className="text-sm text-slate-500">Review one unit’s inspection, scope, procurement, vendor, and verification story.</div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-lowes-blue" />
              </button>

              <button
                onClick={() => onOpenProcurement({ focus: 'verification' })}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-lowes-blue hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white p-2 text-amber-700 shadow-sm">
                    <PackageCheck size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Open verification queue</div>
                    <div className="text-sm text-slate-500">Move procurement-ready, received, and verified items through closeout.</div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-lowes-blue" />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Current pressure points</h2>
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <TriangleAlert size={18} className="mt-0.5 text-amber-700" />
                <div>
                  <div className="font-semibold text-slate-900">Needs attention</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {unitsNeedingAttention.length} unit{unitsNeedingAttention.length === 1 ? '' : 's'} still have unresolved findings or stalled materials with no active execution.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                <Activity size={18} className="mt-0.5 text-violet-700" />
                <div>
                  <div className="font-semibold text-slate-900">Vendor execution</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {vendorInProgressCount} item{vendorInProgressCount === 1 ? '' : 's'} are actively in vendor hands, and {pendingReceivingCount} are waiting on internal receiving.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <CheckCircle2 size={18} className="mt-0.5 text-emerald-700" />
                <div>
                  <div className="font-semibold text-slate-900">Verification queue</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {pendingVerificationCount} item{pendingVerificationCount === 1 ? '' : 's'} have already been received and should be verified before they are considered fulfilled.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <Clock3 size={18} className="mt-0.5 text-slate-600" />
                <div>
                  <div className="font-semibold text-slate-900">Latest inspection status</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {headlineUnit?.latestInspection
                      ? `${headlineUnit.unit.name} is the current lead unit with ${titleCase(headlineUnit.latestInspection.status)} inspection status.`
                      : 'No inspection history exists yet. Start with Portfolio or Inspection to begin operational work.'}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
};

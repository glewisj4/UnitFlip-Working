import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Hammer,
  Layers3,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Inspection } from '../core/models/inspections';
import { PhotoAsset } from '../core/models/media';
import {
  FINDING_CATEGORIES,
  FINDING_PRIORITIES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  Finding,
  FindingCategory,
  InspectionOperationalSummary,
  MaterialRequirement,
  REPAIR_TASK_STATUSES,
  RepairTask,
  TRADE_OPTIONS,
} from '../core/models/operations';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';
import { FindingService } from '../core/services/FindingService';
import { InspectionIntelligenceService } from '../core/services/InspectionIntelligenceService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { createInspectionOperationalSummary } from '../core/services/InspectionReportSnapshotService';
import { RepairTaskService } from '../core/services/RepairTaskService';

interface InspectionIntelligencePanelProps {
  inspection: Inspection;
  photos: PhotoAsset[];
  previews: Record<string, string>;
}

interface FindingDraft {
  area: string;
  category: FindingCategory;
  severity: Finding['severity'];
  priority: Finding['priority'];
  status: Finding['status'];
  description: string;
  notes: string;
  recommendedTrade: Finding['recommendedTrade'];
  photoIds: string[];
}

const createDefaultDraft = (): FindingDraft => ({
  area: '',
  category: 'general',
  severity: 'moderate',
  priority: 'medium',
  status: 'open',
  description: '',
  notes: '',
  recommendedTrade: 'general',
  photoIds: [],
});

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const readinessStyles: Record<InspectionOperationalSummary['scopeReadiness']['stage'], string> = {
  needs_findings: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_tasks: 'bg-blue-50 text-blue-700 border-blue-200',
  ready_for_materials: 'bg-violet-50 text-violet-700 border-violet-200',
  ready_for_report: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const InspectionIntelligencePanel: React.FC<InspectionIntelligencePanelProps> = ({
  inspection,
  photos,
  previews,
}) => {
  const { org, user } = useAppContext();
  const { log } = useAuditLogger();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tasks, setTasks] = useState<RepairTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [summary, setSummary] = useState<InspectionOperationalSummary>(() =>
    createInspectionOperationalSummary(inspection, [], [], [])
  );
  const [draft, setDraft] = useState<FindingDraft>(createDefaultDraft);
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  const [isSavingFinding, setIsSavingFinding] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [isGeneratingMaterials, setIsGeneratingMaterials] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (org) {
      void loadData();
    }
  }, [org, inspection.id]);

  const loadData = async () => {
    if (!org) return;
    setIsLoading(true);
    try {
      const [loadedFindings, loadedTasks, loadedMaterials] = await Promise.all([
        FindingService.listFindings(org.id, { inspectionId: inspection.id }),
        RepairTaskService.listTasks(org.id, { inspectionId: inspection.id }),
        MaterialRequirementService.listRequirements(org.id, { inspectionId: inspection.id }),
      ]);

      setFindings(loadedFindings);
      setTasks(loadedTasks);
      setMaterials(loadedMaterials);
      setSummary(createInspectionOperationalSummary(inspection, loadedFindings, loadedTasks, loadedMaterials));
    } finally {
      setIsLoading(false);
    }
  };

  const resetDraft = () => {
    setDraft(createDefaultDraft());
    setEditingFindingId(null);
  };

  const handleSaveFinding = async () => {
    if (!org || !user || !draft.area.trim() || !draft.description.trim()) return;
    setIsSavingFinding(true);

    try {
      if (editingFindingId) {
        const existing = findings.find((finding) => finding.id === editingFindingId);
        if (!existing) return;
        await FindingService.updateFinding(
          org.id,
          {
            ...existing,
            area: draft.area.trim(),
            category: draft.category,
            severity: draft.severity,
            priority: draft.priority,
            status: draft.status,
            description: draft.description.trim(),
            notes: draft.notes.trim() || undefined,
            recommendedTrade: draft.recommendedTrade,
            photoIds: draft.photoIds,
          },
          user.id
        );
        log('FINDING_UPDATED', {
          entityType: 'finding',
          entityId: editingFindingId,
          message: `Updated finding in ${draft.area.trim()}`,
        });
      } else {
        const createdFinding = await FindingService.createFinding(
          org.id,
          {
            orgId: org.id,
            inspectionId: inspection.id,
            unitId: inspection.unitId,
            area: draft.area.trim(),
            category: draft.category,
            severity: draft.severity,
            priority: draft.priority,
            status: draft.status,
            description: draft.description.trim(),
            notes: draft.notes.trim() || undefined,
            recommendedTrade: draft.recommendedTrade,
            photoIds: draft.photoIds,
            metadata: { source: 'manual' },
          },
          user.id
        );
        log('FINDING_CREATED', {
          entityType: 'finding',
          entityId: createdFinding.id,
          message: `Created finding in ${draft.area.trim()}`,
        });
      }

      resetDraft();
      await loadData();
    } finally {
      setIsSavingFinding(false);
    }
  };

  const handleEditFinding = (finding: Finding) => {
    setEditingFindingId(finding.id);
    setDraft({
      area: finding.area,
      category: finding.category,
      severity: finding.severity,
      priority: finding.priority,
      status: finding.status,
      description: finding.description,
      notes: finding.notes || '',
      recommendedTrade: finding.recommendedTrade,
      photoIds: finding.photoIds,
    });
  };

  const handleDeleteFinding = async (findingId: string) => {
    if (!org || !user || !confirm('Delete this finding? Linked generated tasks will need to be regenerated.')) return;

    await FindingService.deleteFinding(org.id, findingId, user.id);

    const linkedTasks = tasks.filter((task) => task.findingIds.includes(findingId));
    for (const task of linkedTasks) {
      await RepairTaskService.deleteTask(org.id, task.id, user.id);
    }
    if (linkedTasks.length > 0) {
      await MaterialRequirementService.clearForInspection(org.id, inspection.id, user.id);
    }

    log('FINDING_DELETED', {
      entityType: 'finding',
      entityId: findingId,
      message: 'Deleted finding from inspection scope',
    });
    await loadData();
  };

  const handleGenerateTasks = async () => {
    if (!org || !user) return;
    const actionableFindings = findings.filter((finding) => finding.status !== 'resolved');
    if (actionableFindings.length === 0) return;

    setIsGeneratingTasks(true);
    try {
      const generatedTasks = InspectionIntelligenceService.buildTasksFromFindings(actionableFindings);
      await RepairTaskService.replaceForInspection(org.id, inspection.id, generatedTasks, user.id);
      await MaterialRequirementService.clearForInspection(org.id, inspection.id, user.id);
      log('REPAIR_TASKS_GENERATED', {
        entityType: 'inspection',
        entityId: inspection.id,
        message: `Generated ${generatedTasks.length} repair tasks from findings`,
      });
      await loadData();
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  const handleCreateTaskFromFinding = async (finding: Finding) => {
    if (!org || !user) return;
    if (tasks.some((task) => task.findingIds.includes(finding.id))) {
      alert('A repair task already exists for this finding.');
      return;
    }

    const [generatedTask] = InspectionIntelligenceService.buildTasksFromFindings([finding]);
    const createdTask = await RepairTaskService.createTask(org.id, generatedTask, user.id);
    log('REPAIR_TASK_CREATED', {
      entityType: 'repair_task',
      entityId: createdTask.id,
      message: `Created repair task from finding ${finding.id}`,
    });
    await loadData();
  };

  const handleTaskStatusChange = async (task: RepairTask, status: RepairTask['status']) => {
    if (!org || !user) return;
    await RepairTaskService.updateTask(org.id, { ...task, status }, user.id);
    log('REPAIR_TASK_UPDATED', {
      entityType: 'repair_task',
      entityId: task.id,
      message: `Updated repair task status to ${status}`,
    });
    await loadData();
  };

  const handleGenerateMaterials = async () => {
    if (!org || !user || tasks.length === 0) return;
    setIsGeneratingMaterials(true);
    try {
      const generatedMaterials = InspectionIntelligenceService.buildMaterialRequirementsFromTasks(tasks, findings);
      await MaterialRequirementService.replaceForInspection(org.id, inspection.id, generatedMaterials, user.id);
      log('MATERIAL_REQUIREMENTS_GENERATED', {
        entityType: 'inspection',
        entityId: inspection.id,
        message: `Generated ${generatedMaterials.length} material requirements`,
      });
      await loadData();
    } finally {
      setIsGeneratingMaterials(false);
    }
  };

  const handleCreateMaterialFromTask = async (task: RepairTask) => {
    if (!org || !user) return;
    if (materials.some((material) => material.repairTaskId === task.id)) {
      alert('A material requirement already exists for this task.');
      return;
    }

    const generatedMaterials = InspectionIntelligenceService.buildMaterialRequirementsFromTasks([task], findings);
    const nextMaterial = generatedMaterials[0];
    if (!nextMaterial) {
      alert('No material requirement could be generated for this task.');
      return;
    }

    const createdRequirement = await MaterialRequirementService.createRequirement(org.id, nextMaterial, user.id);
    log('MATERIAL_REQUIREMENT_CREATED', {
      entityType: 'material_requirement',
      entityId: createdRequirement.id,
      message: `Created material requirement from task ${task.id}`,
    });
    await loadData();
  };

  const handleMaterialQuantityChange = async (requirement: MaterialRequirement, quantity: number) => {
    if (!org || !user || !Number.isFinite(quantity) || quantity <= 0) return;
    await MaterialRequirementService.updateRequirement(org.id, { ...requirement, quantity }, user.id);
    log('MATERIAL_REQUIREMENT_UPDATED', {
      entityType: 'material_requirement',
      entityId: requirement.id,
      message: `Updated material quantity for ${requirement.itemDescription}`,
    });
    await loadData();
  };

  const readinessClassName = readinessStyles[summary.scopeReadiness.stage];

  return (
    <div className="border-t border-slate-200 pt-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Hammer size={20} className="text-slate-600" />
            Inspection Intelligence
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Convert inspection observations into findings, repair tasks, and material requirements.
          </p>
        </div>
        <div className={`rounded-xl border px-4 py-3 text-sm max-w-md ${readinessClassName}`}>
          <div className="font-semibold">{summary.scopeReadiness.label}</div>
          <div className="mt-1">{summary.scopeReadiness.details}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Checklist</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.checklist.percentComplete}%</div>
          <div className="text-xs text-slate-500 mt-1">
            {summary.checklist.unresolvedCount} unresolved issue{summary.checklist.unresolvedCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Findings</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.findings.total}</div>
          <div className="text-xs text-slate-500 mt-1">{summary.findings.openCount} open</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Repair Tasks</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.repairTasks.total}</div>
          <div className="text-xs text-slate-500 mt-1">{summary.repairTasks.openCount} active</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Materials</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{summary.materialRequirements.total}</div>
          <div className="text-xs text-slate-500 mt-1">{summary.materialRequirements.totalQuantity} total quantity</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Inspection Status</div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{titleCase(inspection.status)}</div>
          <div className="text-xs text-slate-500 mt-1">Operational scope snapshot</div>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-slate-600" />
          <h4 className="font-semibold text-slate-800">{editingFindingId ? 'Edit Finding' : 'Add Finding'}</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Room / Area</label>
            <input
              value={draft.area}
              onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
              placeholder="Living room, bathroom vanity, exterior stair..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Recommended Trade</label>
            <select
              value={draft.recommendedTrade}
              onChange={(event) =>
                setDraft((current) => ({ ...current, recommendedTrade: event.target.value as Finding['recommendedTrade'] }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {TRADE_OPTIONS.map((trade) => (
                <option key={trade} value={trade}>
                  {titleCase(trade)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as FindingCategory }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {titleCase(category)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Severity</label>
            <select
              value={draft.severity}
              onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value as Finding['severity'] }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {titleCase(severity)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
            <select
              value={draft.priority}
              onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Finding['priority'] }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {titleCase(priority)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Finding['status'] }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
            >
              {FINDING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            rows={3}
            placeholder="Describe the observed issue in clear operational terms."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
          <textarea
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            rows={2}
            placeholder="Optional context, measurements, or contractor notes."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue resize-none"
          />
        </div>

        {photos.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Linked Photos</label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {photos.map((photo, index) => {
                const selected = draft.photoIds.includes(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        photoIds: selected
                          ? current.photoIds.filter((id) => id !== photo.id)
                          : [...current.photoIds, photo.id],
                      }))
                    }
                    className={`rounded-xl overflow-hidden border text-left transition-colors ${
                      selected ? 'border-lowes-blue ring-2 ring-blue-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="aspect-square bg-slate-100">
                      {previews[photo.id] ? (
                        <img src={previews[photo.id]} alt={`Inspection photo ${index + 1}`} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="px-2 py-1 text-[11px] text-slate-500">Photo {index + 1}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleSaveFinding()}
            disabled={isSavingFinding || !draft.area.trim() || !draft.description.trim()}
            className="bg-lowes-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {editingFindingId ? <Save size={16} /> : <Plus size={16} />}
            {editingFindingId ? 'Update Finding' : 'Add Finding'}
          </button>
          {editingFindingId && (
            <button
              onClick={resetDraft}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 hover:bg-white"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-slate-600" />
            Findings ({findings.length})
          </h4>
          <div className="text-xs text-slate-500">{isLoading ? 'Refreshing...' : 'Structured inspection observations'}</div>
        </div>

        {findings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 bg-white">
            No findings yet. Add the first structured finding to start building scope.
          </div>
        ) : (
          <div className="space-y-3">
            {findings.map((finding) => (
              <div key={finding.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-semibold text-slate-800">{finding.area}</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">{titleCase(finding.category)}</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">{titleCase(finding.priority)}</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-sky-100 text-sky-700">{titleCase(finding.status)}</span>
                    </div>
                    <p className="text-sm text-slate-700">{finding.description}</p>
                    {finding.notes ? <p className="text-xs text-slate-500 mt-2">{finding.notes}</p> : null}
                    <div className="text-xs text-slate-400 mt-2">
                      Trade: {titleCase(finding.recommendedTrade)} • Linked photos: {finding.photoIds.length}
                    </div>
                    {finding.metadata?.generatedItemId ? (
                      <div className="text-xs text-blue-600 mt-2">
                        Checklist-linked: {String(finding.metadata.sourceChecklistLabel || finding.metadata.generatedItemId)}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleCreateTaskFromFinding(finding)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      title="Create task"
                    >
                      Create Task
                    </button>
                    <button
                      onClick={() => handleEditFinding(finding)}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                      title="Edit finding"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => void handleDeleteFinding(finding.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                      title="Delete finding"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-col md:flex-row">
          <div>
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Wrench size={18} className="text-slate-600" />
              Repair Tasks ({tasks.length})
            </h4>
            <p className="text-xs text-slate-500 mt-1">Deterministically generated from unresolved findings.</p>
          </div>
          <button
            onClick={() => void handleGenerateTasks()}
            disabled={isGeneratingTasks || findings.filter((finding) => finding.status !== 'resolved').length === 0}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {isGeneratingTasks ? 'Generating...' : tasks.length > 0 ? 'Regenerate Tasks' : 'Generate Tasks'}
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 bg-white">
            No repair tasks generated yet.
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-800">{task.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{task.notes}</div>
                  <div className="text-xs text-slate-400 mt-2">
                    Trade: {titleCase(task.trade)} • Priority: {titleCase(task.priority)} • Effort:{' '}
                    {task.estimatedEffortMinutes || 0} min
                  </div>
                </div>
                <div className="w-44 space-y-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    value={task.status}
                    onChange={(event) => void handleTaskStatusChange(task, event.target.value as RepairTask['status'])}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue bg-white"
                  >
                    {REPAIR_TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {titleCase(status)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void handleCreateMaterialFromTask(task)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Create Material
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-col md:flex-row">
          <div>
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Layers3 size={18} className="text-slate-600" />
              Material Requirements ({materials.length})
            </h4>
            <p className="text-xs text-slate-500 mt-1">Requirement-level scope only. No procurement or vendor logic.</p>
          </div>
          <button
            onClick={() => void handleGenerateMaterials()}
            disabled={isGeneratingMaterials || tasks.length === 0}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {isGeneratingMaterials ? 'Generating...' : materials.length > 0 ? 'Regenerate Materials' : 'Generate Materials'}
          </button>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 bg-white">
            No material requirements generated yet.
          </div>
        ) : (
          <div className="space-y-3">
            {materials.map((requirement) => (
              <div
                key={`${requirement.id}:${requirement.updatedAt}`}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="font-semibold text-slate-800">{requirement.itemDescription}</div>
                  <div className="text-sm text-slate-600 mt-1">
                    {titleCase(requirement.category)} • {titleCase(requirement.source)} generated • Confidence {titleCase(requirement.confidence)}
                  </div>
                  {requirement.notes ? <div className="text-xs text-slate-400 mt-2">{requirement.notes}</div> : null}
                </div>
                <div className="w-32">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      defaultValue={requirement.quantity}
                      onBlur={(event) => void handleMaterialQuantityChange(requirement, Number(event.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-lowes-blue"
                    />
                    <span className="text-xs text-slate-500">{requirement.unit}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import { Finding, MaterialRequirement, RepairTask } from '../models/operations';

export type InspectionAttentionBucketKey = 'attention' | 'background';
export type InspectionScopeSection = 'findings' | 'tasks' | 'materials';
export type InspectionScopeTarget = {
  entityType: 'finding' | 'task' | 'material';
  entityId: string;
  originLabel?: string | null;
};

export interface InspectionAttentionMeta {
  bucket: InspectionAttentionBucketKey;
  score: number;
  recent: boolean;
  badge: string;
  rowToneClass: string;
  badgeClass: string;
}

export interface InspectionPriorityContext {
  unitTab: 'inspection' | 'scope' | 'procurement' | 'verification';
  scopeSection: InspectionScopeSection;
  scopeTarget: InspectionScopeTarget | null;
  reasonLabel: string;
  reasonDetail: string;
}

export interface UnitAttentionProjection {
  priorityLabel: string;
  priorityDetail: string;
  attentionTone: 'needs_attention' | 'active_work' | 'complete' | 'clear';
  context: InspectionPriorityContext | null;
}

const isRecentlyTouched = (createdAt: number, updatedAt: number, windowMs = 30 * 60 * 1000) => {
  const now = Date.now();
  return now - Math.max(createdAt, updatedAt) <= windowMs;
};

const findingPriorityWeight: Record<Finding['priority'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

const findingSeverityWeight: Record<Finding['severity'], number> = {
  minor: 1,
  moderate: 2,
  major: 3,
  critical: 4,
};

const taskStatusWeight: Record<RepairTask['status'], number> = {
  draft: 2,
  ready: 3,
  in_progress: 4,
  blocked: 5,
  done: 0,
};

const procurementStateWeight: Record<NonNullable<MaterialRequirement['procurementState']>, number> = {
  scoped_only: 1,
  ready_for_procurement: 3,
  activated: 2,
  ordered: 2,
  fulfilled: 0,
};

const compareByAttention = <T>(items: T[], getMeta: (item: T) => InspectionAttentionMeta, getTieBreakers: (item: T) => Array<number | string>) =>
  [...items].sort((a, b) => {
    const aMeta = getMeta(a);
    const bMeta = getMeta(b);
    if (bMeta.score !== aMeta.score) return bMeta.score - aMeta.score;

    const aTie = getTieBreakers(a);
    const bTie = getTieBreakers(b);
    for (let index = 0; index < Math.max(aTie.length, bTie.length); index += 1) {
      const aValue = aTie[index];
      const bValue = bTie[index];
      if (typeof aValue === 'number' && typeof bValue === 'number' && bValue !== aValue) {
        return bValue - aValue;
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        if (comparison !== 0) return comparison;
      }
    }
    return 0;
  });

export const InspectionAttentionService = {
  getFindingMeta(finding: Finding): InspectionAttentionMeta {
    const unresolved = finding.status !== 'resolved';
    const recent = isRecentlyTouched(finding.createdAt, finding.updatedAt);
    const score =
      (unresolved ? 100 : 0) +
      (finding.status === 'open' ? 35 : finding.status === 'reviewed' ? 20 : 0) +
      findingPriorityWeight[finding.priority] * 8 +
      findingSeverityWeight[finding.severity] * 6 +
      (recent ? 5 : 0);

    return {
      bucket: unresolved ? 'attention' : 'background',
      score,
      recent,
      badge:
        finding.status === 'open'
          ? 'Open issue'
          : finding.status === 'reviewed'
            ? 'Ready for task review'
            : 'Resolved',
      rowToneClass: unresolved ? 'border-amber-200 bg-amber-50/55' : 'border-slate-200 bg-slate-50/80',
      badgeClass: unresolved ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700',
    };
  },

  getTaskMeta(task: RepairTask): InspectionAttentionMeta {
    const active = task.status !== 'done';
    const recent = isRecentlyTouched(task.createdAt, task.updatedAt);
    const score = (active ? 100 : 0) + taskStatusWeight[task.status] * 14 + findingPriorityWeight[task.priority] * 8 + (recent ? 5 : 0);

    const badge =
      task.status === 'blocked'
        ? 'Blocked'
        : task.status === 'in_progress'
          ? 'In progress'
          : task.status === 'ready'
            ? 'Ready to execute'
            : task.status === 'draft'
              ? 'Needs review'
              : 'Done';

    return {
      bucket: active ? 'attention' : 'background',
      score,
      recent,
      badge,
      rowToneClass:
        task.status === 'blocked'
          ? 'border-rose-200 bg-rose-50/55'
          : active
            ? 'border-amber-200 bg-amber-50/45'
            : 'border-slate-200 bg-slate-50/80',
      badgeClass:
        task.status === 'blocked'
          ? 'bg-rose-100 text-rose-700'
          : active
            ? 'bg-amber-100 text-amber-800'
            : 'bg-emerald-100 text-emerald-700',
    };
  },

  getMaterialMeta(requirement: MaterialRequirement): InspectionAttentionMeta {
    const issueState = requirement.closeoutIssueState || 'none';
    const reopened = typeof requirement.reopenedAt === 'number';
    const procurementState = requirement.procurementState || 'scoped_only';
    const verificationStatus = requirement.verificationStatus || 'pending';
    const hasIssue = issueState !== 'none' || reopened;
    const needsVerification = verificationStatus !== 'verified' && procurementState === 'fulfilled';
    const active = hasIssue || procurementState !== 'fulfilled';
    const recent = isRecentlyTouched(requirement.createdAt, requirement.updatedAt);

    const score =
      (active ? 100 : 0) +
      (hasIssue ? 60 : 0) +
      (needsVerification ? 35 : 0) +
      procurementStateWeight[procurementState] * 10 +
      (!requirement.selectedMatch && procurementState !== 'fulfilled' ? 5 : 0) +
      (recent ? 5 : 0);

    const badge = hasIssue
      ? issueState === 'verification_failed'
        ? 'Verification failed'
        : issueState === 'partial_receipt'
          ? 'Partial receipt'
          : 'Rework required'
      : needsVerification
        ? verificationStatus === 'received'
          ? 'Pending verification'
          : 'Pending closeout'
        : procurementState === 'ready_for_procurement'
          ? 'Ready for procurement'
          : procurementState === 'activated'
            ? 'Procurement active'
            : procurementState === 'ordered'
              ? 'Waiting on vendor'
              : procurementState === 'fulfilled'
                ? 'Fulfilled'
                : 'Scoped only';

    return {
      bucket: active ? 'attention' : 'background',
      score,
      recent,
      badge,
      rowToneClass: hasIssue
        ? 'border-rose-200 bg-rose-50/55'
        : needsVerification
          ? 'border-violet-200 bg-violet-50/55'
          : active
            ? 'border-blue-200 bg-blue-50/45'
            : 'border-slate-200 bg-slate-50/80',
      badgeClass: hasIssue
        ? 'bg-rose-100 text-rose-700'
        : needsVerification
          ? 'bg-violet-100 text-violet-700'
          : active
            ? 'bg-blue-100 text-blue-700'
            : 'bg-emerald-100 text-emerald-700',
    };
  },

  sortFindings(findings: Finding[]) {
    return compareByAttention(findings, this.getFindingMeta, (finding) => [finding.updatedAt, finding.area, finding.description]);
  },

  sortTasks(tasks: RepairTask[]) {
    return compareByAttention(tasks, this.getTaskMeta, (task) => [task.updatedAt, task.trade, task.title]);
  },

  sortMaterials(materials: MaterialRequirement[]) {
    return compareByAttention(materials, this.getMaterialMeta, (material) => [material.updatedAt, material.itemDescription]);
  },

  derivePriorityContext(findings: Finding[], tasks: RepairTask[], materials: MaterialRequirement[]): InspectionPriorityContext | null {
    const sortedMaterials = this.sortMaterials(materials);
    const sortedTasks = this.sortTasks(tasks);
    const sortedFindings = this.sortFindings(findings);

    const materialAttention = sortedMaterials.find((requirement) => this.getMaterialMeta(requirement).bucket === 'attention');
    if (materialAttention) {
      const materialMeta = this.getMaterialMeta(materialAttention);
      const hasCloseoutIssue = (materialAttention.closeoutIssueState || 'none') !== 'none' || typeof materialAttention.reopenedAt === 'number';
      const needsVerification =
        (materialAttention.verificationStatus || 'pending') !== 'verified' &&
        (materialAttention.procurementState || 'scoped_only') === 'fulfilled';

      return {
        unitTab: hasCloseoutIssue || needsVerification ? 'verification' : 'procurement',
        scopeSection: 'materials',
        scopeTarget: {
          entityType: 'material',
          entityId: materialAttention.id,
          originLabel: `Opened from Unit Workspace • ${materialMeta.badge}`,
        },
        reasonLabel: materialMeta.badge,
        reasonDetail: materialAttention.itemDescription,
      };
    }

    const taskAttention = sortedTasks.find((task) => this.getTaskMeta(task).bucket === 'attention');
    if (taskAttention) {
      const taskMeta = this.getTaskMeta(taskAttention);
      return {
        unitTab: 'scope',
        scopeSection: 'tasks',
        scopeTarget: {
          entityType: 'task',
          entityId: taskAttention.id,
          originLabel: `Opened from Unit Workspace • ${taskMeta.badge}`,
        },
        reasonLabel: taskMeta.badge,
        reasonDetail: taskAttention.title,
      };
    }

    const findingAttention = sortedFindings.find((finding) => this.getFindingMeta(finding).bucket === 'attention');
    if (findingAttention) {
      const findingMeta = this.getFindingMeta(findingAttention);
      return {
        unitTab: 'scope',
        scopeSection: 'findings',
        scopeTarget: {
          entityType: 'finding',
          entityId: findingAttention.id,
          originLabel: `Opened from Unit Workspace • ${findingMeta.badge}`,
        },
        reasonLabel: findingMeta.badge,
        reasonDetail: findingAttention.description,
      };
    }

    return null;
  },

  deriveUnitAttentionProjection(findings: Finding[], tasks: RepairTask[], materials: MaterialRequirement[]): UnitAttentionProjection {
    const context = this.derivePriorityContext(findings, tasks, materials);
    if (context) {
      const tone = context.unitTab === 'verification' || context.unitTab === 'procurement' ? 'needs_attention' : 'active_work';
      return {
        priorityLabel: context.reasonLabel,
        priorityDetail: context.reasonDetail,
        attentionTone: tone,
        context,
      };
    }

    if (materials.some((material) => material.procurementState === 'fulfilled' && (material.verificationStatus || 'pending') === 'verified')) {
      return {
        priorityLabel: 'Complete',
        priorityDetail: 'Inspection, scope, procurement, and closeout are fully resolved for this unit.',
        attentionTone: 'complete',
        context: null,
      };
    }

    return {
      priorityLabel: 'Clear for next step',
      priorityDetail: 'No urgent inspection attention signal is active right now.',
      attentionTone: 'clear',
      context: null,
    };
  },
};

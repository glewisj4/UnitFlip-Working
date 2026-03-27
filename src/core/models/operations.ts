import {
  ProcurementOptimizationSignal,
  ProcurementOfferFreshnessLabel,
  ProcurementReviewGuidanceCode,
  ProcurementVendorRiskSignal,
  SelectedProcurementOption,
} from './procurement';

export const FINDING_CATEGORIES = [
  'paint',
  'drywall',
  'flooring',
  'appliance',
  'plumbing',
  'electrical',
  'fixture',
  'trim',
  'cleaning',
  'exterior',
  'safety',
  'general',
] as const;

export const FINDING_SEVERITIES = ['minor', 'moderate', 'major', 'critical'] as const;
export const FINDING_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const FINDING_STATUSES = ['open', 'reviewed', 'resolved'] as const;

export const TRADE_OPTIONS = [
  'general',
  'paint',
  'drywall',
  'flooring',
  'appliance',
  'plumbing',
  'electrical',
  'fixture',
  'finish',
  'cleaning',
  'exterior',
  'safety',
] as const;

export const REPAIR_TASK_STATUSES = ['draft', 'ready', 'in_progress', 'blocked', 'done'] as const;
export const MATERIAL_REQUIREMENT_CONFIDENCE = ['low', 'medium', 'high'] as const;
export const MATERIAL_REQUIREMENT_SOURCES = ['rule', 'manual'] as const;
export const MATERIAL_REQUIREMENT_STATUSES = [
  'draft',
  'reviewed',
  'planned',
  'quoted',
  'ordered',
  'fulfilled',
  'canceled',
] as const;
export const MATERIAL_PROCUREMENT_STATES = [
  'scoped_only',
  'ready_for_procurement',
  'activated',
  'ordered',
  'fulfilled',
] as const;
export const MATERIAL_VENDOR_ACTION_STATES = [
  'unassigned',
  'assigned',
  'acknowledged',
  'in_progress',
  'completed',
] as const;
export const MATERIAL_VERIFICATION_STATUSES = ['pending', 'received', 'verified'] as const;
export const MATERIAL_CLOSEOUT_ISSUE_STATES = [
  'none',
  'verification_failed',
  'partial_receipt',
  'rework_required',
] as const;
export const MATERIAL_CORRECTION_ROUTES = ['vendor', 'procurement', 'scope'] as const;
export const SCOPE_READINESS_STAGES = [
  'needs_findings',
  'ready_for_tasks',
  'ready_for_materials',
  'ready_for_report',
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export type FindingPriority = (typeof FINDING_PRIORITIES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export type TradeOption = (typeof TRADE_OPTIONS)[number];
export type RepairTaskStatus = (typeof REPAIR_TASK_STATUSES)[number];
export type MaterialRequirementConfidence = (typeof MATERIAL_REQUIREMENT_CONFIDENCE)[number];
export type MaterialRequirementSource = (typeof MATERIAL_REQUIREMENT_SOURCES)[number];
export type MaterialRequirementStatus = (typeof MATERIAL_REQUIREMENT_STATUSES)[number];
export type MaterialProcurementState = (typeof MATERIAL_PROCUREMENT_STATES)[number];
export type MaterialVendorActionState = (typeof MATERIAL_VENDOR_ACTION_STATES)[number];
export type MaterialVerificationStatus = (typeof MATERIAL_VERIFICATION_STATUSES)[number];
export type MaterialCloseoutIssueState = (typeof MATERIAL_CLOSEOUT_ISSUE_STATES)[number];
export type MaterialCorrectionRoute = (typeof MATERIAL_CORRECTION_ROUTES)[number];
export type ScopeReadinessStage = (typeof SCOPE_READINESS_STAGES)[number];

export interface Finding {
  id: string;
  orgId: string;
  inspectionId: string;
  unitId: string;
  area: string;
  category: FindingCategory;
  severity: FindingSeverity;
  priority: FindingPriority;
  status: FindingStatus;
  description: string;
  notes?: string;
  recommendedTrade: TradeOption;
  photoIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface RepairTask {
  id: string;
  orgId: string;
  inspectionId: string;
  unitId: string;
  findingIds: string[];
  title: string;
  trade: TradeOption;
  priority: FindingPriority;
  status: RepairTaskStatus;
  estimatedEffortMinutes?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface MaterialRequirement {
  id: string;
  orgId: string;
  inspectionId: string;
  repairTaskId: string;
  category: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  confidence: MaterialRequirementConfidence;
  source: MaterialRequirementSource;
  status: MaterialRequirementStatus;
  procurementState?: MaterialProcurementState;
  notes?: string;
  roomLabel?: string;
  sourceFindingId?: string;
  sourceGeneratedSectionId?: string;
  sourceGeneratedItemId?: string;
  selectedMatch?: SelectedProcurementOption;
  procurementReadyAt?: number;
  procurementActivatedAt?: number;
  procurementActivatedByUserId?: string;
  assignedVendorUserId?: string;
  assignedVendorDisplayName?: string;
  procurementAssignedAt?: number;
  procurementAssignedByUserId?: string;
  vendorActionState?: MaterialVendorActionState;
  vendorActionUpdatedAt?: number;
  vendorActionUpdatedByUserId?: string;
  vendorCompletedAt?: number;
  vendorCompletedByUserId?: string;
  vendorCompletionNote?: string;
  vendorCompletionDetails?: string;
  receivedAt?: number;
  receivedByUserId?: string;
  verifiedAt?: number;
  verifiedByUserId?: string;
  verificationStatus?: MaterialVerificationStatus;
  closeoutIssueState?: MaterialCloseoutIssueState;
  closeoutIssueNotes?: string;
  closeoutIssueAt?: number;
  closeoutIssueByUserId?: string;
  correctionRoute?: MaterialCorrectionRoute;
  reopenedAt?: number;
  reopenedByUserId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface FindingsSummary {
  total: number;
  openCount: number;
  byCategory: Partial<Record<FindingCategory, number>>;
  bySeverity: Partial<Record<FindingSeverity, number>>;
}

export interface RepairTaskSummary {
  total: number;
  openCount: number;
  byTrade: Partial<Record<TradeOption, number>>;
  byStatus: Partial<Record<RepairTaskStatus, number>>;
}

export interface MaterialRequirementSummary {
  total: number;
  byCategory: Record<string, number>;
  totalQuantity: number;
  openCount: number;
  procurementReadyCount: number;
}

export interface ChecklistExecutionSummary {
  total: number;
  completedCount: number;
  failedCount: number;
  blockedCount: number;
  notApplicableCount: number;
  inProgressCount: number;
  unresolvedCount: number;
  percentComplete: number;
  readyForScope: boolean;
}

export interface ScopeReadinessSummary {
  stage: ScopeReadinessStage;
  label: string;
  details: string;
  findingsReady: boolean;
  tasksReady: boolean;
  materialsReady: boolean;
}

export interface InspectionOperationalSummary {
  inspectionId: string;
  unitId: string;
  checklist: ChecklistExecutionSummary;
  findings: FindingsSummary;
  repairTasks: RepairTaskSummary;
  materialRequirements: MaterialRequirementSummary;
  scopeReadiness: ScopeReadinessSummary;
}

export interface InspectionProcurementOptimizationSummary {
  draftCount: number;
  optimizedItemCount: number;
  estimatedOptimizedCost: number;
  estimatedWasteQuantity: number;
  riskSignals: ProcurementOptimizationSignal[];
  packStrategySummaries: string[];
}

export interface InspectionProcurementVendorIntelligenceSummary {
  draftCount: number;
  intelligentItemCount: number;
  selectedOfferCount: number;
  staleOfferCount: number;
  riskSignals: ProcurementVendorRiskSignal[];
  selectedOfferFreshness: ProcurementOfferFreshnessLabel[];
  offerSummaries: string[];
  cheaperAlternativeSummaries: string[];
  bundleOpportunitySummaries: string[];
}

export interface InspectionProcurementReviewGuidanceSummary {
  draftCount: number;
  reviewItemCount: number;
  guidanceCount: number;
  codes: ProcurementReviewGuidanceCode[];
  summaries: string[];
}

export interface InspectionReportSnapshot {
  inspectionId: string;
  unitId: string;
  generatedAt: number;
  findings: Finding[];
  repairTasks: RepairTask[];
  materialRequirements: MaterialRequirement[];
  summary: InspectionOperationalSummary;
  procurementOptimization?: InspectionProcurementOptimizationSummary;
  procurementVendorIntelligence?: InspectionProcurementVendorIntelligenceSummary;
  procurementReviewGuidance?: InspectionProcurementReviewGuidanceSummary;
}

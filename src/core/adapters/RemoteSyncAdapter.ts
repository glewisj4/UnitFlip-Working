export interface RemoteSyncAdapter {
  upsertUnit(orgId: string, unitPayload: Record<string, unknown>): Promise<void>;
  upsertInspection(orgId: string, inspectionPayload: Record<string, unknown>): Promise<void>;
  upsertFinding(orgId: string, findingPayload: Record<string, unknown>): Promise<void>;
  deleteFinding(orgId: string, findingId: string): Promise<void>;
  upsertRepairTask(orgId: string, taskPayload: Record<string, unknown>): Promise<void>;
  deleteRepairTask(orgId: string, repairTaskId: string): Promise<void>;
  upsertMaterialRequirement(orgId: string, requirementPayload: Record<string, unknown>): Promise<void>;
  deleteMaterialRequirement(orgId: string, materialRequirementId: string): Promise<void>;
  attachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void>;
  detachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void>;
}

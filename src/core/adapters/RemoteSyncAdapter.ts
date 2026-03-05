export interface RemoteSyncAdapter {
  upsertUnit(orgId: string, unitPayload: Record<string, unknown>): Promise<void>;
  upsertInspection(orgId: string, inspectionPayload: Record<string, unknown>): Promise<void>;
  attachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void>;
  detachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void>;
}

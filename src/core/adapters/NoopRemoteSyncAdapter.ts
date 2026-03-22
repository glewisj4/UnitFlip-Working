import { RemoteSyncAdapter } from './RemoteSyncAdapter';

export class NoopRemoteSyncAdapter implements RemoteSyncAdapter {
  private shouldFailRandomly: boolean;

  constructor(shouldFailRandomly = false) {
    this.shouldFailRandomly = shouldFailRandomly;
  }

  private async simulateNetworkCall() {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (this.shouldFailRandomly && Math.random() < 0.1) {
      throw new Error('Simulated network failure');
    }
  }

  async upsertUnit(orgId: string, unitPayload: Record<string, unknown>): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Upsert Unit for org ${orgId}`, unitPayload);
  }

  async upsertInspection(orgId: string, inspectionPayload: Record<string, unknown>): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Upsert Inspection for org ${orgId}`, inspectionPayload);
  }

  async upsertFinding(orgId: string, findingPayload: Record<string, unknown>): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Upsert Finding for org ${orgId}`, findingPayload);
  }

  async deleteFinding(orgId: string, findingId: string): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Delete Finding ${findingId} for org ${orgId}`);
  }

  async upsertRepairTask(orgId: string, taskPayload: Record<string, unknown>): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Upsert Repair Task for org ${orgId}`, taskPayload);
  }

  async deleteRepairTask(orgId: string, repairTaskId: string): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Delete Repair Task ${repairTaskId} for org ${orgId}`);
  }

  async upsertMaterialRequirement(orgId: string, requirementPayload: Record<string, unknown>): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Upsert Material Requirement for org ${orgId}`, requirementPayload);
  }

  async deleteMaterialRequirement(orgId: string, materialRequirementId: string): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Delete Material Requirement ${materialRequirementId} for org ${orgId}`);
  }

  async attachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Attach Photo ${photoId} to Inspection ${inspectionId}`);
  }

  async detachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Detach Photo ${photoId} from Inspection ${inspectionId}`);
  }
}

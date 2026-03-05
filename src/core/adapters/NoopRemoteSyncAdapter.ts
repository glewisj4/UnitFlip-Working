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

  async attachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Attach Photo ${photoId} to Inspection ${inspectionId}`);
  }

  async detachPhoto(orgId: string, inspectionId: string, photoId: string): Promise<void> {
    await this.simulateNetworkCall();
    console.log(`[RemoteSync] Detach Photo ${photoId} from Inspection ${inspectionId}`);
  }
}

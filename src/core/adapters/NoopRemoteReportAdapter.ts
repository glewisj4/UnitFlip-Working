import { RemoteReportAdapter } from './RemoteReportAdapter';

export class NoopRemoteReportAdapter implements RemoteReportAdapter {
  private shouldFailRandomly: boolean;

  constructor(shouldFailRandomly = false) {
    this.shouldFailRandomly = shouldFailRandomly;
  }

  async requestReportGeneration(params: { 
    orgId: string; 
    reportId: string; 
    inspectionId: string; 
    options?: any;
    snapshot?: unknown;
    inspection?: {
      id: string;
      title: string;
      status: string;
      notes?: string;
      createdAt: number;
      updatedAt: number;
      photoCount: number;
    };
    unit?: {
      id: string;
      name: string;
      unitCode?: string;
      facilityName?: string;
      buildingName?: string;
      address1?: string;
      address2?: string;
      city?: string;
      state?: string;
      zip?: string;
      notes?: string;
    };
  }): Promise<{ 
    bucket: string; 
    path: string; 
  }> {
    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (this.shouldFailRandomly && Math.random() < 0.1) {
      throw new Error('Simulated report generation failure');
    }

    console.log(`[RemoteReport] Requested report generation ${params.reportId} for inspection ${params.inspectionId}`);

    return {
      bucket: 'reports',
      path: `${params.orgId}/${params.reportId}/report.html`,
    };
  }

  async getSignedDownloadUrl(params: { 
    bucket: string; 
    path: string; 
    expiresInSeconds: number 
  }): Promise<{ 
    url: string; 
    expiresAt: number; 
  }> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    return {
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', // Placeholder PDF
      expiresAt: Date.now() + params.expiresInSeconds * 1000,
    };
  }
}

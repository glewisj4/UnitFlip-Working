export interface RemoteReportAdapter {
  requestReportGeneration(params: { 
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
  }>;

  getSignedDownloadUrl(params: { 
    bucket: string; 
    path: string; 
    expiresInSeconds: number 
  }): Promise<{ 
    url: string; 
    expiresAt: number; 
  }>;
}

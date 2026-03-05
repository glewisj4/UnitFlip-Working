export interface RemoteReportAdapter {
  requestReportGeneration(params: { 
    orgId: string; 
    reportId: string; 
    inspectionId: string; 
    options?: any 
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

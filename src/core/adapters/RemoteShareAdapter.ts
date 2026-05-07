export interface RemoteShareAdapter {
  registerShareLink(params: {
    link: {
      id: string;
      orgId: string;
      token: string;
      resourceId: string;
      inspectionId?: string;
      expiresAt: number;
      createdAt: number;
      createdByUserId: string;
      createdByRole: string;
      resourceBucket?: string;
      resourcePath?: string;
      resourceContentType?: string;
      resourceLabel?: string;
    };
  }): Promise<void>;

  revokeShareLink(params: {
    orgId: string;
    token: string;
    revokedAt: number;
    revokedByUserId?: string;
  }): Promise<void>;

  resolveShareToken(params: { 
    token: string 
  }): Promise<{ 
    status: 'ok' | 'expired' | 'revoked' | 'not_found'; 
    bucket?: string; 
    path?: string; 
    url?: string; 
    expiresAt?: number; 
    contentType?: string;
    title?: string;
  }>;

  logShareAccess(params: { 
    token: string; 
    action: 'VIEW' | 'DOWNLOAD' 
  }): Promise<void>;
}

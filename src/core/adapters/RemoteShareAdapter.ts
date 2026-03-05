export interface RemoteShareAdapter {
  resolveShareToken(params: { 
    token: string 
  }): Promise<{ 
    status: 'ok' | 'expired' | 'revoked' | 'not_found'; 
    bucket?: string; 
    path?: string; 
    url?: string; 
    expiresAt?: number; 
  }>;

  logShareAccess(params: { 
    token: string; 
    action: 'VIEW' | 'DOWNLOAD' 
  }): Promise<void>;
}

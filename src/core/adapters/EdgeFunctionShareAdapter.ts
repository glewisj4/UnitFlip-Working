import { RemoteShareAdapter } from './RemoteShareAdapter';
import { getSupabaseClient } from '../services/supabaseClient';

export class EdgeFunctionShareAdapter implements RemoteShareAdapter {
  async registerShareLink(params: {
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
  }): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.functions.invoke('share-access', {
      body: {
        action: 'REGISTER_LINK',
        link: params.link,
      },
    });

    if (error) {
      throw new Error(`Failed to register share link: ${error.message}`);
    }
  }

  async revokeShareLink(params: {
    orgId: string;
    token: string;
    revokedAt: number;
    revokedByUserId?: string;
  }): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.functions.invoke('share-access', {
      body: {
        action: 'REVOKE_LINK',
        orgId: params.orgId,
        token: params.token,
        revokedAt: params.revokedAt,
        revokedByUserId: params.revokedByUserId,
      },
    });

    if (error) {
      throw new Error(`Failed to revoke share link: ${error.message}`);
    }
  }

  async resolveShareToken(params: { 
    token: string 
  }): Promise<{ 
    status: 'ok' | 'expired' | 'revoked' | 'not_found'; 
    bucket?: string; 
    path?: string; 
    url?: string; 
    expiresAt?: number; 
    contentType?: string;
    title?: string;
  }> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('share-resolve', {
      body: params
    });

    if (error) {
      console.error('Failed to resolve share token', error);
      return { status: 'not_found' };
    }

    return data;
  }

  async logShareAccess(params: { 
    token: string; 
    action: 'VIEW' | 'DOWNLOAD' 
  }): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.functions.invoke('share-access', {
      body: params
    });

    if (error) {
      console.warn('Failed to log share access', error);
    }
  }
}

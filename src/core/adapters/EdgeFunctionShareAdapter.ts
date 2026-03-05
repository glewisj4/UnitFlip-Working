import { RemoteShareAdapter } from './RemoteShareAdapter';
import { getSupabaseClient } from '../services/supabaseClient';

export class EdgeFunctionShareAdapter implements RemoteShareAdapter {
  async resolveShareToken(params: { 
    token: string 
  }): Promise<{ 
    status: 'ok' | 'expired' | 'revoked' | 'not_found'; 
    bucket?: string; 
    path?: string; 
    url?: string; 
    expiresAt?: number; 
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

import { RemoteReportAdapter } from './RemoteReportAdapter';
import { getSupabaseClient } from '../services/supabaseClient';

export class EdgeFunctionReportAdapter implements RemoteReportAdapter {
  async requestReportGeneration(params: { 
    orgId: string; 
    reportId: string; 
    inspectionId: string; 
    options?: any 
  }): Promise<{ 
    bucket: string; 
    path: string; 
  }> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('generate-report', {
      body: params
    });

    if (error) {
      throw new Error(`Failed to request report generation: ${error.message}`);
    }

    return {
      bucket: data.bucket,
      path: data.path
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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('signed-url', {
      body: params
    });

    if (error) {
      throw new Error(`Failed to get signed download URL: ${error.message}`);
    }

    return {
      url: data.url,
      expiresAt: data.expiresAt
    };
  }
}

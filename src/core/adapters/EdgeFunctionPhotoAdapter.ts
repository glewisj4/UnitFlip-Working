import { RemotePhotoAdapter } from './RemotePhotoAdapter';
import { getSupabaseClient } from '../services/supabaseClient';
import { PhotoUploadVariant } from '../models/media';

export class EdgeFunctionPhotoAdapter implements RemotePhotoAdapter {
  async getSignedUploadUrl(params: {
    orgId: string;
    photoId: string;
    variant: PhotoUploadVariant;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ bucket: string; path: string; uploadUrl: string }> {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase.functions.invoke('photo-upload-url', {
      body: params
    });

    if (error) {
      throw new Error(`Failed to get signed upload URL: ${error.message}`);
    }

    return data as { bucket: string; path: string; uploadUrl: string };
  }

  async confirmUpload(params: { bucket: string; path: string }): Promise<{ bucket: string; path: string }> {
    // Noop confirm for now as requested
    return params;
  }
}

import { PhotoUploadVariant } from '../models/media';

export interface RemotePhotoAdapter {
  getSignedUploadUrl(params: {
    orgId: string;
    photoId: string;
    variant: PhotoUploadVariant;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ bucket: string; path: string; uploadUrl: string }>;

  confirmUpload(params: {
    bucket: string;
    path: string;
  }): Promise<{ bucket: string; path: string }>;
}

export interface RemotePhotoAdapter {
  getSignedUploadUrl(params: {
    orgId: string;
    photoId: string;
    variant: 'full' | 'thumb';
    contentType: string;
    sizeBytes: number;
  }): Promise<{ bucket: string; path: string; uploadUrl: string }>;

  confirmUpload(params: {
    bucket: string;
    path: string;
  }): Promise<{ bucket: string; path: string }>;
}

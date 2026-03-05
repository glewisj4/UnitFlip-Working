export type ReportStatus = 'queued' | 'generating' | 'ready' | 'failed';

export interface ReportJob {
  id: string;
  orgId: string;
  inspectionId: string;
  requestedByUserId: string;
  createdAt: number;
  updatedAt: number;
  status: ReportStatus;
  errorMessage?: string;

  // Output (future Supabase Storage)
  pdf?: {
    bucket: string;
    path: string;
    url?: string;           // signed URL or public URL, generated server-side
    expiresAt?: number;     // signed URL expiration
    sizeBytes?: number;
  };

  // Optional rendering options
  options?: {
    includePhotos?: boolean;        // default true
    photoLayout?: 'grid' | 'full';  // default grid
    includeCosts?: boolean;         // default true
  };
}

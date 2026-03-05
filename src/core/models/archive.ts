export type ArchiveStatus = 'queued' | 'generating' | 'ready' | 'failed';

export interface ArchiveJob {
  id: string;
  orgId: string;
  createdAt: number;
  updatedAt: number;
  requestedByUserId: string;

  pendingPurgeId: string;
  photoId: string;

  variant: 'full' | 'thumb';
  status: ArchiveStatus;
  errorMessage?: string;

  output?: {
    blobKey: string;         // key in blob store: "archive:{archiveId}"
    filename: string;        // e.g., "unitflip-archive-{photoId}.zip"
    sizeBytes?: number;
  };
}

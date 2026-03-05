export type CaptureSource = 'camera' | 'gallery' | 'file';

export interface CompressionOptions {
  maxBytes: number;
  minQuality: number;
  maxDimension?: number;
}

export interface PhotoDerivative {
  key: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
}

export interface PhotoAsset {
  id: string;
  orgId: string;
  createdAt: number;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  
  source: CaptureSource;
  maxBytesTarget: number;
  thumbMaxBytesTarget: number;

  derivatives: {
    full: PhotoDerivative;
    thumb: PhotoDerivative;
  };

  localRef?: { kind: 'indexeddb'; key: string } | { kind: 'filesystem'; path: string };
  remote?: {
    full?: { bucket: string; path: string };
    thumb?: { bucket: string; path: string };
  };
  tags?: string[];
  note?: string;
}

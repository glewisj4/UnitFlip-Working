import { CompressionOptions } from '../models/media';
import { getExifOrientation } from './exifOrientation';

interface CompressionResult {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  mimeType: string;
}

export const compressImage = async (
  file: File | Blob,
  options: CompressionOptions = { maxBytes: 500_000, minQuality: 0.5, maxDimension: 2000 }
): Promise<CompressionResult> => {
  const orientation = await getExifOrientation(file);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const { maxDimension, maxBytes, minQuality } = options;
      
      let quality = 0.85;
      let scale = 1.0;
      
      // Initial scale to maxDimension
      if (maxDimension && (img.width > maxDimension || img.height > maxDimension)) {
        scale = Math.min(maxDimension / img.width, maxDimension / img.height);
      }

      const attemptCompression = () => {
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context'));

        // Handle Orientation
        if (orientation && orientation > 1) {
          if (orientation >= 5 && orientation <= 8) {
            canvas.width = height;
            canvas.height = width;
          } else {
            canvas.width = width;
            canvas.height = height;
          }
          
          switch (orientation) {
            case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
            case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
            case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
            case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
            case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
            case 7: ctx.transform(0, -1, -1, 0, height, width); break;
            case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
          }
        } else {
          canvas.width = width;
          canvas.height = height;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas to Blob failed'));

          // If under target, or we've hit bottom of quality AND scale
          if (blob.size <= maxBytes || (quality <= minQuality && scale <= 0.3)) {
            resolve({
              blob,
              width: canvas.width,
              height: canvas.height,
              originalBytes: file.size,
              compressedBytes: blob.size,
              mimeType: blob.type
            });
          } else if (quality > minQuality) {
            quality -= 0.05;
            attemptCompression();
          } else {
            // Quality reached min, start reducing dimensions
            scale *= 0.85;
            attemptCompression();
          }
        }, 'image/jpeg', quality);
      };

      attemptCompression();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
};

export const createThumbnail = async (
  file: File | Blob,
  settings: { thumbMaxBytes: number; thumbMaxDimension: number; minQuality: number }
): Promise<CompressionResult> => {
  return compressImage(file, {
    maxBytes: settings.thumbMaxBytes,
    maxDimension: settings.thumbMaxDimension,
    minQuality: settings.minQuality
  });
};

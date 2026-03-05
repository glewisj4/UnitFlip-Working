import * as fflate from 'fflate';

/**
 * Creates a ZIP archive containing a manifest.json and a photo file.
 */
export async function createPhotoArchiveZip(params: {
  filenameBase: string;
  photoFileName: string;          // e.g., "{photoId}.jpg"
  photoBlob: Blob;
  manifest: Record<string, unknown>;
}): Promise<{ zipBlob: Blob; fileCount: number; sizeBytes: number }> {
  const manifestContent = JSON.stringify(params.manifest, null, 2);
  const manifestData = new TextEncoder().encode(manifestContent);
  
  const photoData = new Uint8Array(await params.photoBlob.arrayBuffer());

  const zipData: fflate.Zippable = {
    'manifest.json': manifestData,
    [params.photoFileName]: photoData
  };

  return new Promise((resolve, reject) => {
    fflate.zip(zipData, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const zipBlob = new Blob([data], { type: 'application/zip' });
      resolve({
        zipBlob,
        fileCount: 2,
        sizeBytes: zipBlob.size
      });
    });
  });
}

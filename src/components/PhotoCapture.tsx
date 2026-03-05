import React, { useState, useEffect } from 'react';
import { Camera, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { MediaService } from '../core/services/MediaService';
import { PhotoAsset } from '../core/models/media';
import { useAuditLogger } from '../core/hooks/useAuditLogger';

export const PhotoCapture: React.FC = () => {
  const { org } = useAppContext();
  const { log } = useAuditLogger();
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    if (org) {
      loadPhotos();
    }
    return () => {
      // Cleanup object URLs
      Object.values(previews).forEach(url => URL.revokeObjectURL(url as string));
    };
  }, [org]);

  const loadPhotos = async () => {
    if (!org) return;
    const list = await MediaService.listPhotos({ orgId: org.id });
    setPhotos(list);
    
    // Generate previews
    const newPreviews: Record<string, string> = {};
    for (const photo of list) {
        if (!previews[photo.id]) {
            const blob = await MediaService.getPhotoBlob(photo.id, 'thumb');
            if (blob) {
                newPreviews[photo.id] = URL.createObjectURL(blob);
            }
        }
    }
    setPreviews(prev => ({ ...prev, ...newPreviews }));
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !org) return;
    
    setIsUploading(true);
    try {
      const file = e.target.files[0];
      const asset = await MediaService.savePhotoFromFile({
        orgId: org.id,
        file,
        source: 'camera', // simplified for MVP
      });
      
      log('PHOTO_CAPTURED', { 
          entityId: asset.id, 
          metadata: { 
              originalBytes: asset.originalBytes, 
              compressedBytes: asset.compressedBytes 
          } 
      });

      await loadPhotos();
    } catch (error) {
      console.error('Failed to save photo', error);
      alert('Failed to save photo');
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!org || !confirm('Delete this photo?')) return;
    
    try {
      await MediaService.deletePhoto({ orgId: org.id, photoId });
      log('PHOTO_DELETED', { entityId: photoId });
      
      // Cleanup preview
      if (previews[photoId]) {
          URL.revokeObjectURL(previews[photoId]);
          setPreviews(prev => {
              const next = { ...prev };
              delete next[photoId];
              return next;
          });
      }
      
      await loadPhotos();
    } catch (error) {
      console.error('Failed to delete photo', error);
    }
  };

  if (!org) return null;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Camera size={20} />
          Photos (MVP Test)
        </h3>
        <label className={`cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
          <span className="text-sm font-medium">Add Photo</span>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            className="hidden" 
            onChange={handleCapture}
            disabled={isUploading}
          />
        </label>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <ImageIcon size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 text-sm">No photos captured yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map(photo => (
            <div key={photo.id} className="relative group aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
              {previews[photo.id] ? (
                <img 
                  src={previews[photo.id]} 
                  alt="Capture" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              )}
              
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                 <div className="text-white text-[10px] font-mono mb-1">
                    {(photo.compressedBytes / 1024).toFixed(0)}KB
                    <span className="opacity-60"> (was {(photo.originalBytes / 1024).toFixed(0)}KB)</span>
                 </div>
                 <button 
                    onClick={() => handleDelete(photo.id)}
                    className="bg-red-500 text-white p-1.5 rounded-md self-end hover:bg-red-600 transition-colors"
                 >
                    <Trash2 size={14} />
                 </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

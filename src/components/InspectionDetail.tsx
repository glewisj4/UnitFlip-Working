import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Camera, Trash2, Loader2, FileText, Download, AlertCircle, Share2, Copy, XCircle, Clock } from 'lucide-react';
import { Inspection, InspectionStatus } from '../core/models/inspections';
import { InspectionService } from '../core/services/InspectionService';
import { MediaService } from '../core/services/MediaService';
import { ReportService } from '../core/services/ReportService';
import { ShareLinkService } from '../core/services/ShareLinkService';
import { ReportJob } from '../core/models/reports';
import { ShareLink } from '../core/models/share';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';
import { useSyncEngine } from '../core/hooks/useSyncEngine';
import { PhotoAsset } from '../core/models/media';
import { useCatalog } from '../core/hooks/useCatalog';
import { ProductInstanceService } from '../core/services/ProductInstanceService';
import { CatalogService } from '../core/services/CatalogService';
import { ProductInstance, CatalogItem } from '../core/models/types';
import { ProductSelectorModal } from './ProductSelectorModal';
import { Package, PlusCircle, MinusCircle } from 'lucide-react';

interface InspectionDetailProps {
  inspectionId: string;
  onBack: () => void;
}

export const InspectionDetail: React.FC<InspectionDetailProps> = ({ inspectionId, onBack }) => {
  const { org, user, flags } = useAppContext();
  const { log } = useAuditLogger();
  const { triggerSyncNow } = useSyncEngine();
  const { addCatalogItemToList } = useCatalog();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [productInstances, setProductInstances] = useState<ProductInstance[]>([]);
  const [catalogItems, setCatalogItems] = useState<Record<string, CatalogItem>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [latestReport, setLatestReport] = useState<ReportJob | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // Share state
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);

  // Product selection state
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<InspectionStatus>('draft');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (org && inspectionId) {
      loadInspection();
      loadLatestReport();
      loadProductInstances();
      if (flags.public_share_links) {
        loadShareLinks();
      }
    }
    return () => {
      // Cleanup object URLs
      Object.values(previews).forEach(url => URL.revokeObjectURL(url as string));
    };
  }, [org, inspectionId, flags.public_share_links]);

  // Listen for product instance additions (from useCatalog hook)
  useEffect(() => {
    const handleInstanceAdded = (e: any) => {
      const instance = e.detail as ProductInstance;
      if (instance.listRef.kind === 'inspection' && instance.listRef.id === inspectionId) {
        setProductInstances(prev => [...prev, instance]);
        loadCatalogItemsForInstances([...productInstances, instance]);
      }
    };
    window.addEventListener('product-instance-added', handleInstanceAdded);
    return () => window.removeEventListener('product-instance-added', handleInstanceAdded);
  }, [inspectionId, productInstances]);

  // Poll for report status updates if generating
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (latestReport && (latestReport.status === 'queued' || latestReport.status === 'generating')) {
      interval = setInterval(loadLatestReport, 2000);
    }
    return () => clearInterval(interval);
  }, [latestReport]);

  const loadInspection = async () => {
    if (!org) return;
    const list = await InspectionService.listInspections(org.id);
    const found = list.find(i => i.id === inspectionId);
    if (found) {
      setInspection(found);
      setTitle(found.title);
      setStatus(found.status);
      setNotes(found.notes || '');
      loadPhotos(found.photoIds);
    }
  };

  const loadLatestReport = async () => {
      if (!org) return;
      const report = await ReportService.getLatestReport(org.id, inspectionId);
      setLatestReport(report);
  };

  const loadShareLinks = async () => {
      if (!org) return;
      const links = await ShareLinkService.listLinks(org.id, { inspectionId });
      setShareLinks(links);
  };

  const loadProductInstances = async () => {
    if (!org) return;
    const instances = await ProductInstanceService.listInstances(org.id, { kind: 'inspection', id: inspectionId });
    setProductInstances(instances);
    await loadCatalogItemsForInstances(instances);
  };

  const loadCatalogItemsForInstances = async (instances: ProductInstance[]) => {
    if (!org) return;
    const itemIds = Array.from(new Set(instances.map(i => i.catalogItemId)));
    const items = await Promise.all(itemIds.map(id => CatalogService.getItem(org.id, id)));
    const itemMap: Record<string, CatalogItem> = {};
    items.forEach(item => {
      if (item) itemMap[item.id] = item;
    });
    setCatalogItems(prev => ({ ...prev, ...itemMap }));
  };

  const loadPhotos = async (photoIds: string[]) => {
    if (!org) return;
    const allPhotos = await MediaService.listPhotos({ orgId: org.id, limit: 1000 }); // Inefficient but simple for MVP
    const attached = allPhotos.filter(p => photoIds.includes(p.id));
    setPhotos(attached);

    // Generate previews
    const newPreviews: Record<string, string> = {};
    for (const photo of attached) {
        if (!previews[photo.id]) {
            // Use thumbnail for preview
            const blob = await MediaService.getPhotoBlob(photo.id, 'thumb');
            if (blob) {
                newPreviews[photo.id] = URL.createObjectURL(blob);
            }
        }
    }
    setPreviews(prev => ({ ...prev, ...newPreviews }));
  };

  const handleSave = async () => {
    if (!org || !user || !inspection) return;
    setIsSaving(true);
    try {
      const updated = {
        ...inspection,
        title,
        status,
        notes,
      };
      await InspectionService.updateInspection(org.id, updated, user.id);
      log('INSPECTION_UPDATED', { entityId: inspection.id, message: `Updated inspection: ${title}` });
      setInspection(updated);
    } catch (e) {
      console.error(e);
      alert('Failed to save inspection');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !org || !user || !inspection) return;
    
    setIsUploading(true);
    try {
      const file = e.target.files[0];
      const asset = await MediaService.savePhotoFromFile({
        orgId: org.id,
        file,
        source: 'camera',
      });
      
      await InspectionService.addPhoto(org.id, inspection.id, asset.id, user.id);
      
      log('PHOTO_CAPTURED', { 
        entityId: inspection.id, 
        metadata: { 
            photoId: asset.id,
            originalBytes: asset.originalBytes,
            compressedBytes: asset.compressedBytes,
            targetBytes: asset.maxBytesTarget
        } 
      });
      
      // Refresh photos
      const updatedList = await InspectionService.listInspections(org.id);
      const updated = updatedList.find(i => i.id === inspectionId);
      if (updated) {
          setInspection(updated);
          loadPhotos(updated.photoIds);
      }
    } catch (error) {
      console.error('Failed to add photo', error);
      alert('Failed to add photo');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    if (!org || !user || !inspection || !confirm('Remove this photo from inspection?')) return;
    
    try {
        await InspectionService.removePhoto(org.id, inspection.id, photoId, user.id);
        await MediaService.deletePhoto({ orgId: org.id, photoId });
        
        log('PHOTO_DELETED', { entityId: inspection.id, metadata: { photoId } });
        
        // Refresh
        const updatedList = await InspectionService.listInspections(org.id);
        const updated = updatedList.find(i => i.id === inspectionId);
        if (updated) {
            setInspection(updated);
            loadPhotos(updated.photoIds);
        }
    } catch (e) {
        console.error(e);
    }
  };

  const handleAddProduct = async (item: CatalogItem) => {
    if (!org) return;
    await addCatalogItemToList({ kind: 'inspection', id: inspectionId }, item.id, org.id);
  };

  const handleRemoveProductInstance = async (instanceId: string) => {
    if (!org || !confirm('Remove this product from inspection?')) return;
    try {
      await ProductInstanceService.deleteInstance(org.id, instanceId);
      setProductInstances(prev => prev.filter(i => i.id !== instanceId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateProductQty = async (instanceId: string, qty: number) => {
    if (!org) return;
    try {
      await ProductInstanceService.updateInstance(org.id, instanceId, { qty });
      setProductInstances(prev => prev.map(i => i.id === instanceId ? { ...i, qty } : i));
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateReport = async () => {
      if (!org || !user) return;
      setIsGeneratingReport(true);
      try {
          const report = await ReportService.createReportRequest({
              orgId: org.id,
              inspectionId,
              userId: user.id,
              options: { includePhotos: true }
          });
          setLatestReport(report);
          log('PDF_REPORT_REQUESTED', { entityId: inspectionId, metadata: { reportId: report.id } });
          
          // Trigger sync immediately to start processing
          triggerSyncNow();
      } catch (e) {
          console.error(e);
          alert('Failed to request report generation');
      } finally {
          setIsGeneratingReport(false);
      }
  };

  const handleCreateShareLink = async () => {
    if (!org || !user || !latestReport) return;
    setIsCreatingLink(true);
    try {
        const link = await ShareLinkService.createLink({
            orgId: org.id,
            userId: user.id,
            role: 'manager', // Hardcoded for MVP as we don't have full role context in AppContext yet, but service checks it. Assuming 'manager' for now or we need to pass actual role.
            reportId: latestReport.id,
            inspectionId,
            expiresAt: Date.now() + expiryDays * 24 * 60 * 60 * 1000
        });
        setShareLinks(prev => [link, ...prev]);
        log('SHARE_LINK_CREATED', { entityId: inspectionId, metadata: { token: link.token } });
    } catch (e) {
        console.error(e);
        alert('Failed to create share link. Ensure you have permission.');
    } finally {
        setIsCreatingLink(false);
    }
  };

  const handleRevokeLink = async (token: string) => {
      if (!org || !user || !confirm('Revoke this share link? It will no longer be accessible.')) return;
      try {
          await ShareLinkService.revokeLink({
              orgId: org.id,
              userId: user.id,
              role: 'manager', // Assuming manager
              token
          });
          setShareLinks(prev => prev.map(l => l.token === token ? { ...l, revokedAt: Date.now() } : l));
          log('SHARE_LINK_REVOKED', { entityId: inspectionId, metadata: { token } });
      } catch (e) {
          console.error(e);
          alert('Failed to revoke link');
      }
  };

  const copyToClipboard = (token: string) => {
      const url = `${window.location.origin}/share/${token}`;
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
  };

  if (!inspection) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-slate-50 py-4 z-10">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <h2 className="text-xl font-bold text-slate-800">Edit Inspection</h2>
        </div>
        <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-lowes-blue text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save Changes
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:border-transparent outline-none"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as InspectionStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:border-transparent outline-none bg-white"
                >
                    <option value="draft">Draft</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
        </div>

        {/* Notes */}
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:border-transparent outline-none resize-none"
                placeholder="General inspection notes..."
            />
        </div>

        {/* Photos Section */}
        <div>
            <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-slate-700">Photos ({photos.length})</label>
                <label className={`cursor-pointer text-lowes-blue text-sm font-medium flex items-center gap-2 hover:underline ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    Add Photo
                    <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        className="hidden" 
                        onChange={handlePhotoCapture}
                        disabled={isUploading}
                    />
                </label>
            </div>
            
            {photos.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
                    No photos attached. Click "Add Photo" to capture.
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {photos.map(photo => (
                        <div key={photo.id} className="relative group aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                             {previews[photo.id] ? (
                                <div className="w-full h-full relative">
                                    <img 
                                        src={previews[photo.id]} 
                                        alt="Inspection" 
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white p-1 flex justify-between">
                                        <span>{(photo.originalBytes / 1024).toFixed(0)}KB → {(photo.compressedBytes / 1024).toFixed(0)}KB</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Loader2 size={20} className="animate-spin text-slate-400" />
                                </div>
                            )}
                            <button 
                                onClick={() => handleRemovePhoto(photo.id)}
                                className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Products Section */}
        <div className="border-t border-slate-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Package size={20} className="text-slate-600" />
              Products ({productInstances.length})
            </h3>
            <button
              onClick={() => setIsProductSelectorOpen(true)}
              className="text-sm bg-lowes-blue text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <PlusCircle size={16} />
              Add Product
            </button>
          </div>

          {productInstances.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
              No products added yet. Click "Add Product" to select from catalog.
            </div>
          ) : (
            <div className="space-y-3">
              {productInstances.map((instance) => {
                const item = catalogItems[instance.catalogItemId];
                return (
                  <div key={instance.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-800">{item?.name || 'Loading...'}</h4>
                      <p className="text-xs text-slate-500">
                        {item?.options[0]?.sku && `SKU: ${item.options[0].sku}`}
                        {item?.options[0]?.price && ` • $${item.options[0].price.toFixed(2)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateProductQty(instance.id, Math.max(1, instance.qty - 1))}
                          className="p-1 hover:bg-slate-200 rounded-lg text-slate-500"
                        >
                          <MinusCircle size={18} />
                        </button>
                        <span className="w-8 text-center font-bold text-slate-700">{instance.qty}</span>
                        <button
                          onClick={() => handleUpdateProductQty(instance.id, instance.qty + 1)}
                          className="p-1 hover:bg-slate-200 rounded-lg text-slate-500"
                        >
                          <PlusCircle size={18} />
                        </button>
                      </div>
                      <button
                        onClick={() => handleRemoveProductInstance(instance.id)}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reports Section (Feature Flagged) */}
        {flags.pdf_reports && (
            <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-slate-600" />
                        <h3 className="text-lg font-semibold text-slate-800">PDF Reports</h3>
                    </div>
                    {(!latestReport || latestReport.status === 'ready' || latestReport.status === 'failed') && (
                        <button
                            onClick={handleGenerateReport}
                            disabled={isGeneratingReport}
                            className="text-sm bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {isGeneratingReport ? <Loader2 size={14} className="animate-spin" /> : null}
                            Generate New Report
                        </button>
                    )}
                </div>

                {!latestReport ? (
                    <div className="text-sm text-slate-500 italic">No reports generated yet.</div>
                ) : (
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-700">Latest Report</span>
                                <span className="text-xs text-slate-400">
                                    {new Date(latestReport.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {latestReport.status === 'queued' && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Loader2 size={10} className="animate-spin" /> Queued
                                    </span>
                                )}
                                {latestReport.status === 'generating' && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Loader2 size={10} className="animate-spin" /> Generating...
                                    </span>
                                )}
                                {latestReport.status === 'ready' && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                        Ready
                                    </span>
                                )}
                                {latestReport.status === 'failed' && (
                                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <AlertCircle size={10} /> Failed
                                    </span>
                                )}
                            </div>
                            {latestReport.errorMessage && (
                                <p className="text-xs text-red-500 mt-1">{latestReport.errorMessage}</p>
                            )}
                        </div>

                        {latestReport.status === 'ready' && latestReport.pdf?.url && (
                            <a 
                                href={latestReport.pdf.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                            >
                                <Download size={16} />
                                Download PDF
                            </a>
                        )}
                         {latestReport.status === 'failed' && (
                            <button 
                                onClick={handleGenerateReport}
                                className="flex items-center gap-2 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* Share Section (Feature Flagged) */}
        {flags.public_share_links && (
            <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                    <Share2 size={20} className="text-slate-600" />
                    <h3 className="text-lg font-semibold text-slate-800">Share Report</h3>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
                    {/* Create Link Form */}
                    <div className="flex items-end gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Expiration</label>
                            <select 
                                value={expiryDays}
                                onChange={(e) => setExpiryDays(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                                <option value={1}>1 Day</option>
                                <option value={3}>3 Days</option>
                                <option value={7}>7 Days (Default)</option>
                                <option value={14}>14 Days</option>
                                <option value={30}>30 Days</option>
                            </select>
                        </div>
                        <button
                            onClick={handleCreateShareLink}
                            disabled={isCreatingLink || !latestReport || latestReport.status !== 'ready'}
                            className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors disabled:opacity-50 flex items-center gap-2 h-[38px]"
                        >
                            {isCreatingLink ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                            Create Public Link
                        </button>
                    </div>
                    
                    {!latestReport || latestReport.status !== 'ready' ? (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Generate a PDF report first to create a share link.
                        </p>
                    ) : null}

                    {/* Links List */}
                    {shareLinks.length > 0 && (
                        <div className="space-y-2 mt-4">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Links</h4>
                            {shareLinks.map(link => (
                                <div key={link.id} className={`bg-white p-3 rounded-lg border ${link.revokedAt ? 'border-red-100 bg-red-50' : 'border-slate-200'} flex items-center justify-between`}>
                                    <div className="flex-1 min-w-0 mr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 truncate max-w-[200px]">
                                                .../share/{link.token.substring(0, 8)}...
                                            </span>
                                            {link.revokedAt ? (
                                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">REVOKED</span>
                                            ) : (
                                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    <Clock size={10} />
                                                    Expires {new Date(link.expiresAt).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!link.revokedAt && (
                                            <>
                                                <button 
                                                    onClick={() => copyToClipboard(link.token)}
                                                    className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700"
                                                    title="Copy Link"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleRevokeLink(link.token)}
                                                    className="p-1.5 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                                                    title="Revoke Link"
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>

      <ProductSelectorModal
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleAddProduct}
      />
    </div>
  );
};

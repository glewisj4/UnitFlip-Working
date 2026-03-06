import React, { useState, useEffect } from 'react';
import { Shield, Trash2, Download, CheckCircle, AlertTriangle, RefreshCw, Loader2, Clock, FileArchive } from 'lucide-react';
import { RetentionService } from '../core/services/RetentionService';
import { MediaService } from '../core/services/MediaService';
import { ArchiveService } from '../core/services/ArchiveService';
import { AuditLogService } from '../core/services/AuditLogService';
import { RetentionPolicy, PendingPurgeItem } from '../core/models/retention';
import { ArchiveJob } from '../core/models/archive';
import { AuditEvent } from '../core/models/audit';
import { useAppContext } from '../core/hooks/useAppContext';

export const AdminRetentionPanel: React.FC = () => {
  const { org, user, role } = useAppContext();
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [pending, setPending] = useState<PendingPurgeItem[]>([]);
  const [archives, setArchives] = useState<Record<string, ArchiveJob[]>>({});
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [exportingIds, setExportingIds] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Record<string, 'full' | 'thumb'>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    if (org) {
      loadData();
    }
    return () => {
      Object.values(previews).forEach(url => URL.revokeObjectURL(url as string));
    };
  }, [org]);

  const loadData = async () => {
    if (!org) return;
    setIsLoading(true);
    try {
      const [p, items, allArchives, logs] = await Promise.all([
        RetentionService.getPolicy(org.id),
        RetentionService.listPending(org.id),
        ArchiveService.listArchives(org.id),
        AuditLogService.listEvents({ orgId: org.id, limit: 20 })
      ]);
      setPolicy(p);
      setPending(items);
      setAuditLogs(logs);
      
      // Group archives by pendingPurgeId
      const archiveMap: Record<string, ArchiveJob[]> = {};
      allArchives.forEach(a => {
        if (!archiveMap[a.pendingPurgeId]) archiveMap[a.pendingPurgeId] = [];
        archiveMap[a.pendingPurgeId].push(a);
      });
      setArchives(archiveMap);
      
      // Load thumbnails for pending items
      const newPreviews: Record<string, string> = {};
      for (const item of items) {
        if (!previews[item.photoId]) {
          const blob = await MediaService.getPhotoBlob(item.photoId, 'thumb');
          if (blob) {
            newPreviews[item.photoId] = URL.createObjectURL(blob);
          }
        }
      }
      setPreviews(prev => ({ ...prev, ...newPreviews }));
    } catch (error) {
      console.error('Failed to load retention data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePolicy = async (patch: Partial<RetentionPolicy>) => {
    if (!org || !user || !role) return;
    try {
      await RetentionService.updatePolicy({
        orgId: org.id,
        userId: user.id,
        role,
        patch
      });
      await loadData();
    } catch (error) {
      alert('Failed to update policy');
    }
  };

  const handleScan = async () => {
    if (!org) return;
    setIsScanning(true);
    try {
      const result = await RetentionService.scanForEligiblePhotos(org.id);
      alert(`Scan complete. Found ${result.totalEligible} eligible photos, created ${result.created} new pending items.`);
      await loadData();
    } catch (error) {
      alert('Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const handleApprove = async (pendingId: string) => {
    if (!org || !user || !role) return;
    try {
      await RetentionService.approvePurge({ orgId: org.id, userId: user.id, role, pendingId });
      await loadData();
    } catch (error) {
      alert('Approval failed');
    }
  };

  const handleExport = async (pendingId: string) => {
    if (!org || !user || !role) return;
    const variant = selectedVariants[pendingId] || 'full';
    
    setExportingIds(prev => new Set(prev).add(pendingId));
    try {
      await RetentionService.exportArchive({ 
        orgId: org.id, 
        userId: user.id, 
        role, 
        pendingId,
        variant
      });
      await loadData();
    } catch (error) {
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setExportingIds(prev => {
        const next = new Set(prev);
        next.delete(pendingId);
        return next;
      });
    }
  };

  const handleDownload = async (archive: ArchiveJob) => {
    if (!org || !archive.output) return;
    try {
      const blob = await ArchiveService.getArchiveBlob(org.id, archive.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = archive.output.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('Archive file not found in local storage.');
      }
    } catch (error) {
      alert('Download failed');
    }
  };

  const handlePurge = async (pendingId: string, force = false) => {
    if (!org || !user || !role) return;
    if (!force && !confirm('Purge this photo permanently?')) return;
    try {
      await RetentionService.executePurge({ orgId: org.id, userId: user.id, role, pendingId, force });
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Purge failed');
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield size={48} className="mx-auto text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Admin Access Required</h2>
        <p className="text-slate-500">You do not have permission to view this panel.</p>
      </div>
    );
  }

  if (isLoading || !policy) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Retention</h1>
          <p className="text-slate-500">Manage photo lifecycle and purge policies</p>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isScanning ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          Scan for Eligible Photos
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Retention Period</h3>
          <div className="flex items-end gap-2">
            <input
              type="number"
              value={policy.retentionDays}
              onChange={(e) => handleUpdatePolicy({ retentionDays: parseInt(e.target.value) || 0 })}
              className="text-3xl font-bold text-slate-900 w-24 border-b-2 border-slate-200 focus:border-blue-500 outline-none"
            />
            <span className="text-slate-500 mb-1">days</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Photos older than this will be flagged for purge.</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Auto-Purge</h3>
          <div className="flex items-center justify-between">
            <span className="text-slate-700 font-medium">{policy.autoPurgeEnabled ? 'Enabled' : 'Disabled'}</span>
            <button
              onClick={() => handleUpdatePolicy({ autoPurgeEnabled: !policy.autoPurgeEnabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${policy.autoPurgeEnabled ? 'bg-green-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${policy.autoPurgeEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Automatically delete approved or aged items.</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Approval Window</h3>
          <div className="flex items-end gap-2">
            <input
              type="number"
              value={policy.approvalWindowDays}
              onChange={(e) => handleUpdatePolicy({ approvalWindowDays: parseInt(e.target.value) || 0 })}
              className="text-3xl font-bold text-slate-900 w-24 border-b-2 border-slate-200 focus:border-blue-500 outline-none"
            />
            <span className="text-slate-500 mb-1">days</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">Days pending before auto-purge (if enabled).</p>
        </div>
      </div>

      {/* Audit Log Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-slate-600" />
            <h3 className="font-bold text-slate-800">Recent Audit History</h3>
          </div>
          <button 
            onClick={loadData}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs font-semibold text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3">Event</th>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Details</th>
                <th className="px-6 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No audit events found.
                  </td>
                </tr>
              ) : (
                auditLogs.map(event => (
                  <tr key={event.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">
                        {event.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{event.userId}</span>
                        <span className="text-[10px] text-slate-400 uppercase">{event.userRole}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600 max-w-xs truncate">
                        {event.message || (event.metadata && JSON.stringify(event.metadata)) || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-slate-400">
                      {new Date(event.ts).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Pending Purge Queue ({pending.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs font-semibold text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3">Photo</th>
                <th className="px-6 py-3">Eligible Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No items pending purge.
                  </td>
                </tr>
              ) : (
                pending.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="w-12 h-12 rounded bg-slate-100 overflow-hidden border border-slate-200">
                        {previews[item.photoId] ? (
                          <img src={previews[item.photoId]} alt="Thumbnail" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Clock size={16} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(item.eligibleAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        item.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                        item.status === 'archived' ? 'bg-indigo-100 text-indigo-700' :
                        item.status === 'purged' ? 'bg-slate-100 text-slate-500' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {item.status === 'pending' && <Clock size={10} />}
                        {item.status === 'approved' && <CheckCircle size={10} />}
                        {item.status === 'purged' && <Trash2 size={10} />}
                        {item.status === 'skipped' && <AlertTriangle size={10} />}
                        {item.status}
                      </span>
                      {item.reason && <p className="text-[10px] text-red-500 mt-1">{item.reason}</p>}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {item.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={selectedVariants[item.id] || 'full'}
                            onChange={(e) => setSelectedVariants(prev => ({ ...prev, [item.id]: e.target.value as 'full' | 'thumb' }))}
                            className="text-xs border border-slate-200 rounded px-1 py-1 outline-none focus:border-blue-500"
                          >
                            <option value="full">Full</option>
                            <option value="thumb">Thumb</option>
                          </select>
                          <button
                            onClick={() => handleExport(item.id)}
                            disabled={exportingIds.has(item.id)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Export Archive"
                          >
                            {exportingIds.has(item.id) ? <Loader2 size={18} className="animate-spin" /> : <FileArchive size={18} />}
                          </button>
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Approve Purge"
                          >
                            <CheckCircle size={18} />
                          </button>
                        </div>
                      )}
                      {item.status === 'archived' && archives[item.id] && (
                        <div className="flex items-center justify-end gap-2">
                          {archives[item.id].map(archive => (
                            <div key={archive.id} className="flex flex-col items-end">
                              <button
                                onClick={() => handleDownload(archive)}
                                className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs hover:bg-indigo-100 transition-colors"
                                title={`Download ${archive.variant} archive`}
                              >
                                <Download size={14} />
                                {archive.variant}
                              </button>
                              <span className="text-[10px] text-slate-400">{formatSize(archive.output?.sizeBytes)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(item.status === 'approved' || item.status === 'archived' || policy.autoPurgeEnabled) && item.status !== 'purged' && item.status !== 'skipped' && (
                        <button
                          onClick={() => handlePurge(item.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Purge Now"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

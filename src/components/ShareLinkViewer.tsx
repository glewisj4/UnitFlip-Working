import React, { useEffect, useState, useMemo } from 'react';
import { ShareLinkService } from '../core/services/ShareLinkService';
import { ReportService } from '../core/services/ReportService';
import { ShareLink } from '../core/models/share';
import { ReportJob } from '../core/models/reports';
import { Loader2, AlertTriangle, Download, FileText, Ban, Clock } from 'lucide-react';
import { EdgeFunctionShareAdapter } from '../core/adapters/EdgeFunctionShareAdapter';
import { RemoteShareAdapter } from '../core/adapters/RemoteShareAdapter';

interface ShareLinkViewerProps {
  token: string;
}

export const ShareLinkViewer: React.FC<ShareLinkViewerProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'expired' | 'revoked' | null>(null);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [report, setReport] = useState<ReportJob | null>(null);
  const [remotePdfUrl, setRemotePdfUrl] = useState<string | null>(null);

  const shareAdapter = useMemo<RemoteShareAdapter | null>(() => {
    if (import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true') {
      return new EdgeFunctionShareAdapter();
    }
    return null;
  }, []);

  useEffect(() => {
    loadLink();
  }, [token]);

  const loadLink = async () => {
    setLoading(true);
    try {
      if (shareAdapter) {
        // Remote resolution
        const result = await shareAdapter.resolveShareToken({ token });
        
        if (result.status !== 'ok') {
          setError(result.status);
          setLoading(false);
          return;
        }

        // For remote, we might not have the full 'link' object locally
        // but we need some basic info for the UI
        setLink({
          token,
          expiresAt: result.expiresAt || 0,
          orgId: 'remote', // Placeholder
          resourceId: 'remote',
        } as any);

        setRemotePdfUrl(result.url || null);
        
        // Log remote access
        await shareAdapter.logShareAccess({ token, action: 'VIEW' });
        
        setLoading(false);
        return;
      }

      // Local Fallback
      const { link, status } = await ShareLinkService.resolveLink(token);
      
      if (status !== 'ok' || !link) {
        setError(status as any);
        // Log failed access
        if (link) {
             await ShareLinkService.logAccess({
                orgId: link.orgId,
                token,
                action: 'VIEW',
                resourceType: 'report_pdf',
                resourceId: link.resourceId,
                success: false,
                failureReason: status === 'ok' ? undefined : status.toUpperCase() as any,
                userAgent: navigator.userAgent
            });
        }
        setLoading(false);
        return;
      }

      setLink(link);

      // Load Report
      const reports = await ReportService.listReports(link.orgId);
      const foundReport = reports.find(r => r.id === link.resourceId);
      
      if (!foundReport) {
        setError('not_found');
      } else {
        setReport(foundReport);
        // Log success access
        await ShareLinkService.logAccess({
            orgId: link.orgId,
            token,
            action: 'VIEW',
            resourceType: 'report_pdf',
            resourceId: link.resourceId,
            success: true,
            userAgent: navigator.userAgent
        });
      }
    } catch (e) {
      console.error(e);
      setError('not_found');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (shareAdapter) {
      await shareAdapter.logShareAccess({ token, action: 'DOWNLOAD' });
      if (remotePdfUrl) {
        window.open(remotePdfUrl, '_blank');
      }
      return;
    }

    if (!link || !report?.pdf?.url) return;
    
    await ShareLinkService.logAccess({
        orgId: link.orgId,
        token,
        action: 'DOWNLOAD',
        resourceType: 'report_pdf',
        resourceId: link.resourceId,
        success: true,
        userAgent: navigator.userAgent
    });

    window.open(report.pdf.url, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-lowes-blue mx-auto mb-4" />
          <p className="text-slate-600">Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {error === 'expired' ? <Clock size={32} className="text-red-600" /> : 
             error === 'revoked' ? <Ban size={32} className="text-red-600" /> :
             <AlertTriangle size={32} className="text-red-600" />}
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">
            {error === 'expired' ? 'Link Expired' : 
             error === 'revoked' ? 'Link Revoked' : 
             'Link Not Found'}
          </h1>
          <p className="text-slate-600">
            {error === 'expired' ? 'This share link has expired and is no longer accessible.' :
             error === 'revoked' ? 'This share link has been revoked by the owner.' :
             'The link you are trying to access does not exist or is invalid.'}
          </p>
        </div>
      </div>
    );
  }

  if (!link || (!report && !remotePdfUrl)) return null;

  const pdfUrl = remotePdfUrl || report?.pdf?.url;
  const createdAt = report ? new Date(report.createdAt).toLocaleDateString() : 'Unknown';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                    <FileText size={24} className="text-lowes-blue" />
                </div>
                <div>
                    <h1 className="font-bold text-slate-800">Inspection Report</h1>
                    <p className="text-xs text-slate-500">Shared via UnitFlip</p>
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-8 text-center border-b border-slate-100">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">PDF Report Ready</h2>
                <p className="text-slate-600 mb-6">
                    Generated on {createdAt}
                </p>
                
                {pdfUrl ? (
                    <button 
                        onClick={handleDownload}
                        className="bg-lowes-blue text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                    >
                        <Download size={20} />
                        Download PDF Report
                    </button>
                ) : (
                    <div className="text-amber-600 bg-amber-50 p-4 rounded-lg inline-block">
                        PDF file is not available.
                    </div>
                )}
            </div>
            
            <div className="bg-slate-50 p-4 text-center">
                <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                    <AlertTriangle size={12} />
                    This report link is public. Anyone with the link can access it until it expires on {new Date(link.expiresAt).toLocaleDateString()}.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

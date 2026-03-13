import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, FileText, Upload, CheckCircle, AlertTriangle, Bug, ChevronDown, ChevronRight } from 'lucide-react';
import { ImportService } from '../../core/services/ImportService';
import { useAppContext } from '../../core/hooks/useAppContext';
import { parseLowesQuote } from '../../services/lowesQuoteParser';
import { extractPdfTextItems } from '../../services/pdfParser';

interface ImportWizardProps {
  onClose: () => void;
  onImportComplete: (batchId: string) => void;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ onClose, onImportComplete }) => {
  const { org } = useAppContext();
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<{
    rowCount: number;
    rows: any[];
    anchors: any[];
    json: any;
    warnings: string[];
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
      setDebugData(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  } as any);

  const handleImport = async () => {
    if (!file || !org) return;

    setIsProcessing(true);
    setError(null);

    try {
      // For debug purposes, we parse here first to show debug info if needed
      // In production flow, ImportService does this again, which is fine for now
      const pdfItems = await extractPdfTextItems(file);
      const { batch, items, warnings, debug } = parseLowesQuote(pdfItems);
      
      setDebugData({
        rowCount: debug.rowCount,
        rows: debug.rows,
        anchors: debug.anchors,
        json: { batch, items },
        warnings
      });

      const { importBatchId } = await ImportService.createImportFromPdf(file, org.id);
      onImportComplete(importBatchId);
    } catch (err: any) {
      console.error('Import failed:', err);
      setError(String(err.message || 'Failed to process PDF. Please try again.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200 my-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Import Lowe's Quote</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragActive ? 'border-lowes-blue bg-blue-50' : 'border-slate-200 hover:border-lowes-blue hover:bg-slate-50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <Upload size={24} />
                </div>
                <div>
                  <p className="font-semibold text-slate-700">
                    {file ? file.name : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">PDF files only (max 10MB)</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            {debugData && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button 
                  onClick={() => setShowDebug(!showDebug)}
                  className="w-full px-4 py-2 bg-slate-50 flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider hover:bg-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <Bug size={14} /> Debug Info
                    {debugData.warnings.length > 0 && (
                      <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px]">
                        {debugData.warnings.length} Warnings
                      </span>
                    )}
                  </div>
                  {showDebug ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                {showDebug && (
                  <div className="p-4 bg-slate-900 text-slate-300 font-mono text-xs overflow-x-auto max-h-96 space-y-4">
                    {debugData.warnings.length > 0 && (
                      <div>
                        <h4 className="text-amber-400 font-bold mb-1">Warnings</h4>
                        <ul className="list-disc pl-4 text-amber-200/80">
                          {debugData.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-blue-400 font-bold mb-1">Reconstructed Rows ({debugData.rowCount})</h4>
                        <pre className="bg-black/30 p-2 rounded whitespace-pre-wrap h-40 overflow-y-auto text-[10px]">
                          {debugData.rows.map((r, i) => `[P${r.page} Y${Math.round(r.y)}] ${r.text}`).join('\n')}
                        </pre>
                      </div>
                      <div>
                        <h4 className="text-emerald-400 font-bold mb-1">Parsed JSON</h4>
                        <pre className="bg-black/30 p-2 rounded h-40 overflow-y-auto">
                          {JSON.stringify(debugData.json, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-purple-400 font-bold mb-1">Anchors Found ({debugData.anchors.length})</h4>
                      <div className="space-y-2">
                        {debugData.anchors.map((anchor, i) => (
                          <div key={i} className="bg-black/30 p-2 rounded border-l-2 border-purple-500/50">
                            <div className="font-bold text-purple-300">Item #{anchor.itemNumber}</div>
                            <div className="text-slate-400">Anchor: {anchor.rowText}</div>
                            <div className="text-blue-300">Title Rows: {JSON.stringify(anchor.titleRows)}</div>
                            <div className="text-emerald-300">Pricing Row: {anchor.pricingRow || 'NONE'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file || isProcessing}
                className="px-6 py-2 bg-lowes-blue text-white font-bold rounded-lg hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText size={16} /> Import Quote
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

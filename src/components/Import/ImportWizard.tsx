import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, FileText, Upload, CheckCircle, AlertTriangle } from 'lucide-react';
import { ImportService } from '../../core/services/ImportService';
import { useAppContext } from '../../core/hooks/useAppContext';

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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
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
      const { importBatchId } = await ImportService.createImportFromPdf(file, org.id);
      onImportComplete(importBatchId);
    } catch (err: any) {
      console.error('Import failed:', err);
      setError(err.message || 'Failed to process PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
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

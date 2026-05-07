import React, { useMemo, useState } from 'react';
import { Download, FileText, Plus, Upload, X } from 'lucide-react';
import { Category } from '../core/models/types';
import { CatalogImportFailure, CatalogImportResult, CatalogImportService } from '../core/services/CatalogImportService';

interface CatalogImportModalProps {
  orgId: string;
  categories: Category[];
  onClose: () => void;
  onImportComplete: () => void;
}

type ImportMode = 'csv' | 'paste' | 'quick_add';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-lowes-blue';

export const CatalogImportModal: React.FC<CatalogImportModalProps> = ({
  orgId,
  categories,
  onClose,
  onImportComplete,
}) => {
  const [mode, setMode] = useState<ImportMode>('csv');
  const [csvText, setCsvText] = useState(CatalogImportService.getCsvTemplate());
  const [pasteText, setPasteText] = useState('');
  const [quickAddValue, setQuickAddValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'success' | 'failed'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState<CatalogImportFailure[]>([]);

  const templateText = useMemo(() => CatalogImportService.getCsvTemplate(), []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
  };

  const completeImport = (result: CatalogImportResult) => {
    setStatus(result.failedRows.length > 0 ? 'failed' : 'success');
    setFailures(result.failedRows);
    setMessage(
      result.failedRows.length > 0
        ? `Imported ${result.importedCount} products. Preserved ${result.preservedProvidedCategoryCount} explicit categories, auto-assigned ${result.autoAssignedCount}, and flagged ${result.needsReviewCount} for review with ${result.failedRows.length} validation issue(s).`
        : `Imported ${result.importedCount} products. Preserved ${result.preservedProvidedCategoryCount} explicit categories, auto-assigned ${result.autoAssignedCount}, and flagged ${result.needsReviewCount} for review.`,
    );
    onImportComplete();
  };

  const handleImport = async () => {
    setStatus('working');
    setFailures([]);
    setMessage('Importing catalog records...');

    try {
      if (mode === 'csv') {
        completeImport(await CatalogImportService.importCsv(orgId, csvText, categories));
        return;
      }

      if (mode === 'paste') {
        completeImport(await CatalogImportService.importPastedText(orgId, pasteText, categories));
        return;
      }

      await CatalogImportService.quickAddPlaceholder(orgId, quickAddValue, categories);
      setStatus('success');
      setMessage('Quick-add placeholder saved to the catalog.');
      onImportComplete();
    } catch (error) {
      setStatus('failed');
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Catalog Import</h2>
            <p className="text-sm text-slate-500">
              Use the Lowe&apos;s archetype CSV, pasted quote-friendly text, or a quick placeholder without creating a second catalog path.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="flex flex-wrap gap-2">
            {[
              ['csv', 'CSV import'],
              ['paste', 'Paste text'],
              ['quick_add', 'Quick add'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setMode(value as ImportMode)}
                data-testid={`catalog-import-mode-${value}`}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  mode === value ? 'bg-lowes-blue text-white' : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'csv' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                The downloadable CSV is set up for manual Lowe&apos;s sourcing: pick one product per tier, keep the
                archetype id stable, and leave category blank when you want auto-category assignment plus review flags
                to do the first pass.
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([templateText], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = 'unitflip-manual-lowes-template.csv';
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                >
                  <Download size={15} />
                  Download CSV template
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                  <Upload size={15} />
                  Upload CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              <textarea
                data-testid="catalog-import-csv-input"
                rows={12}
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                className={`${inputClass} resize-none font-mono text-xs`}
                placeholder="Paste CSV rows here"
              />
              <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="font-semibold text-slate-700">Archetype bridge</div>
                  <div className="mt-1">Use `archetype_id` to map imported products back to inspection needs.</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="font-semibold text-slate-700">Assignment hints</div>
                  <div className="mt-1">`category_hint`, `keyword_hints`, and `lowes_category_hint` feed the existing review pipeline.</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="font-semibold text-slate-700">Tier sanity</div>
                  <div className="mt-1">Keep budget, standard, and premium rows distinct with rising price and no duplicate product picks.</div>
                </div>
              </div>
            </div>
          ) : null}

          {mode === 'paste' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Use one product per line in this format:
                <div className="mt-2 font-mono text-xs text-slate-700">
                  name | vendor | sku | Top-level &gt; Subcategory | equivalentGroup | tag1;tag2 | price
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Missing or weak categories are auto-assigned deterministically. Low-confidence matches are imported into a reviewable category instead of being silently guessed.
                </div>
              </div>
              <textarea
                data-testid="catalog-import-paste-input"
                rows={12}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                className={`${inputClass} resize-none`}
                placeholder="Basic bathroom faucet | Turn Supply Co. | FAUCET-001 | Plumbing > Faucets & Fixtures | bathroom_sink_faucet_standard | task:replace_faucet;room:bathroom;grade:standard | 89.99"
              />
            </div>
          ) : null}

          {mode === 'quick_add' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Quick add is for rough placeholders that you normalize later. If category hints are weak, the product is still imported with a review flag instead of being left unusable.
              </div>
              <input
                data-testid="catalog-import-quick-add-input"
                value={quickAddValue}
                onChange={(event) => setQuickAddValue(event.target.value)}
                className={inputClass}
                placeholder="Standard white blind 35x64 | Turn Supply Co. | BLIND-3564-WHT | Windows & Coverings > Blinds & Shades | blind_white_35x64_standard | task:install_blinds;room:bedroom | 24.99"
              />
            </div>
          ) : null}

          {message ? (
            <div
              data-testid="catalog-import-status"
              className={`rounded-2xl border px-4 py-3 text-sm ${
                status === 'failed'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : status === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700'
              }`}
            >
              {message}
              {failures.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs">
                  {failures.map((failure) => (
                    <div key={`${failure.row}-${failure.reason}`}>
                      Row {failure.row}: {failure.reason}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs text-slate-500">
            Existing import path preserved: PDF quote import still uses the staging workflow.
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
              Close
            </button>
            <button
              onClick={() => void handleImport()}
              data-testid="catalog-import-submit"
              disabled={
                status === 'working' ||
                (mode === 'csv' ? !csvText.trim() : mode === 'paste' ? !pasteText.trim() : !quickAddValue.trim())
              }
              className="inline-flex items-center gap-2 rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {mode === 'quick_add' ? <Plus size={15} /> : <FileText size={15} />}
              {status === 'working' ? 'Importing...' : mode === 'quick_add' ? 'Save Placeholder' : 'Import Catalog'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

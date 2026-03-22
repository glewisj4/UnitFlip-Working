import React from 'react';
import { AlertCircle, Download, Loader2, MessageSquareWarning, X } from 'lucide-react';
import { FeedbackCategory } from '../core/services/FeedbackService';

interface FeedbackPanelProps {
  isOpen: boolean;
  category: FeedbackCategory;
  message: string;
  includeDiagnostics: boolean;
  includeContext: boolean;
  savedCount: number;
  submitState: 'idle' | 'saving' | 'saved' | 'failed';
  submitMessage?: string;
  onClose: () => void;
  onCategoryChange: (category: FeedbackCategory) => void;
  onMessageChange: (message: string) => void;
  onIncludeDiagnosticsChange: (value: boolean) => void;
  onIncludeContextChange: (value: boolean) => void;
  onSubmit: () => void;
  onExport: () => void;
}

const CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'ux_issue', label: 'UX issue' },
  { value: 'confusing_behavior', label: 'Confusing behavior' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  isOpen,
  category,
  message,
  includeDiagnostics,
  includeContext,
  savedCount,
  submitState,
  submitMessage,
  onClose,
  onCategoryChange,
  onMessageChange,
  onIncludeDiagnosticsChange,
  onIncludeContextChange,
  onSubmit,
  onExport,
}) => {
  if (!isOpen) return null;

  const isBusy = submitState === 'saving';

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 bg-slate-950/35" onClick={isBusy ? undefined : onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Send Feedback</h3>
            <p className="text-sm text-slate-500">Saved locally for review/export. Nothing is sent to a server in this phase.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Category</span>
            <select
              value={category}
              disabled={isBusy}
              onChange={(event) => onCategoryChange(event.target.value as FeedbackCategory)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">What happened?</span>
            <textarea
              rows={6}
              value={message}
              disabled={isBusy}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Describe the bug, suggestion, confusion, or workflow issue."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <MessageSquareWarning size={16} className="mt-0.5 text-slate-500" />
              <div className="space-y-3 text-sm text-slate-700">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    disabled={isBusy}
                    onChange={(event) => onIncludeContextChange(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Include current route and screen context
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeDiagnostics}
                    disabled={isBusy}
                    onChange={(event) => onIncludeDiagnosticsChange(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Include recent diagnostic logs
                  </span>
                </label>
                <p className="text-xs text-slate-500">
                  Diagnostics are bounded and sanitized. Raw media and large blobs are not attached.
                </p>
              </div>
            </div>
          </div>

          {submitState === 'saving' && submitMessage ? (
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <Loader2 size={14} className="animate-spin" />
              <span>{submitMessage}</span>
            </div>
          ) : null}

          {submitState === 'saved' && submitMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {submitMessage}
            </div>
          ) : null}

          {submitState === 'failed' && submitMessage ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{submitMessage}</span>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
            Saved feedback reports: {savedCount}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={isBusy || !message.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? 'Saving...' : 'Save Feedback'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={isBusy || savedCount === 0}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={14} />
              Export Saved
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

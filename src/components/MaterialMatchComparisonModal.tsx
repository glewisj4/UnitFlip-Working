import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { MaterialRequirement } from '../core/models/operations';
import { MaterialRequirementMatchCandidate, SelectedProcurementOption } from '../core/models/procurement';

interface MaterialMatchComparisonModalProps {
  isOpen: boolean;
  requirement: MaterialRequirement | null;
  candidates: MaterialRequirementMatchCandidate[];
  onClose: () => void;
  onSelect: (candidate: MaterialRequirementMatchCandidate) => void;
  onClear: () => void;
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const MaterialMatchComparisonModal: React.FC<MaterialMatchComparisonModalProps> = ({
  isOpen,
  requirement,
  candidates,
  onClose,
  onSelect,
  onClear,
}) => {
  if (!isOpen || !requirement) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Compare Match Candidates</h2>
            <p className="text-sm text-slate-500">{requirement.itemDescription}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6">
          {candidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              No strong local catalog matches were found. You can keep this requirement unmatched and still continue to procurement.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs font-semibold text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3">Option</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Rationale</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((candidate) => {
                    const isSelected =
                      requirement.selectedMatch?.catalogItemId === candidate.catalogItemId &&
                      requirement.selectedMatch?.optionId === candidate.optionId;
                    return (
                      <tr key={`${candidate.catalogItemId}:${candidate.optionId || 'default'}`} className="align-top">
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-800">{candidate.optionName}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {candidate.catalogItemName}
                            {candidate.sku ? ` • SKU ${candidate.sku}` : ''}
                            {candidate.modelNumber ? ` • Model ${candidate.modelNumber}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">{candidate.vendor || 'Unknown'}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{candidate.category || 'Uncategorized'}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">{candidate.unit}</td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {typeof candidate.price === 'number' ? `$${candidate.price.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-800">{candidate.confidenceScore}</div>
                          <div className="text-xs text-slate-500">{titleCase(candidate.confidenceBand)}</div>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">
                          {candidate.rationale.join(', ') || 'Manual fallback'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => onSelect(candidate)}
                            className={`rounded-lg px-3 py-2 text-xs font-medium border ${
                              isSelected
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 size={14} />
                                Selected
                              </span>
                            ) : (
                              'Select'
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Clear Selection
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

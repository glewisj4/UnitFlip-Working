import React, { useState } from 'react';
import { CatalogItem } from '../core/models/types';
import { ProductRecommendationResult } from '../core/services/ProductRecommendationService';

interface ProductRecommendationPanelProps {
  result: ProductRecommendationResult;
  existingCatalogItemIds?: string[];
  disabled?: boolean;
  onAddProduct: (item: CatalogItem, source: 'suggested' | 'alternate') => Promise<void> | void;
  onAlternatesOpened?: (equivalentGroup: string) => void;
}

export const ProductRecommendationPanel: React.FC<ProductRecommendationPanelProps> = ({
  result,
  existingCatalogItemIds = [],
  disabled = false,
  onAddProduct,
  onAlternatesOpened,
}) => {
  const [showAlternates, setShowAlternates] = useState(false);
  const existingIds = new Set(existingCatalogItemIds);
  const inferenceChips = [
    result.inferredTopLevelCategory,
    result.inferredSubcategory,
    ...result.inferredFunctionalTags,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Suggested products</div>
          <p className="mt-1 text-xs text-emerald-900/80">
            Deterministic matches based on task wording, category, tags, room context, and favorite products.
          </p>
        </div>
        {result.inferredEquivalentGroup ? (
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-emerald-800">
            Alt {result.inferredEquivalentGroup}
          </span>
        ) : null}
      </div>

      {inferenceChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {inferenceChips.map((chip) => (
            <span key={chip} className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      {result.suggestedProducts.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-white px-3 py-3 text-xs text-slate-600">
          {result.noMatchReason}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {result.suggestedProducts.map((recommendation) => {
            const alreadyAdded = existingIds.has(recommendation.item.id);
            return (
              <div key={recommendation.item.id} className="rounded-xl border border-emerald-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold text-slate-900">{recommendation.item.name}</div>
                      {recommendation.isFavorite ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          Favorite
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[recommendation.item.vendor, recommendation.item.subcategory || recommendation.item.topLevelCategory]
                        .filter(Boolean)
                        .join(' • ')}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {recommendation.reasons.map((reason) => (
                        <span key={reason} className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-900">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={disabled || alreadyAdded}
                    onClick={() => void onAddProduct(recommendation.item, 'suggested')}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {alreadyAdded ? 'Added' : 'Add Product'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result.alternateProducts.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              const next = !showAlternates;
              setShowAlternates(next);
              if (next && result.inferredEquivalentGroup) {
                onAlternatesOpened?.(result.inferredEquivalentGroup);
              }
            }}
            className="text-xs font-semibold text-emerald-900 underline-offset-2 hover:underline"
          >
            {showAlternates ? 'Hide alternates' : `Show alternates (${result.alternateProducts.length})`}
          </button>

          {showAlternates ? (
            <div className="mt-2 space-y-2">
              {result.alternateProducts.map((recommendation) => {
                const alreadyAdded = existingIds.has(recommendation.item.id);
                return (
                  <div key={recommendation.item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">{recommendation.item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[recommendation.item.vendor, 'Alternate option'].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={disabled || alreadyAdded}
                        onClick={() => void onAddProduct(recommendation.item, 'alternate')}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {alreadyAdded ? 'Added' : 'Add Alternate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

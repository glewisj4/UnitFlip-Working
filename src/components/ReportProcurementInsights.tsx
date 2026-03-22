import React from 'react';
import { AlertTriangle, Layers3, PackageSearch, ShieldAlert } from 'lucide-react';
import {
  InspectionProcurementOptimizationSummary,
  InspectionProcurementReviewGuidanceSummary,
  InspectionProcurementVendorIntelligenceSummary,
} from '../core/models/operations';

interface ReportProcurementInsightsProps {
  optimization?: InspectionProcurementOptimizationSummary;
  vendorIntelligence?: InspectionProcurementVendorIntelligenceSummary;
  reviewGuidance?: InspectionProcurementReviewGuidanceSummary;
  compact?: boolean;
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const ReportProcurementInsights: React.FC<ReportProcurementInsightsProps> = ({
  optimization,
  vendorIntelligence,
  reviewGuidance,
  compact = false,
}) => {
  if (!optimization && !vendorIntelligence && !reviewGuidance) {
    return null;
  }

  const wrapperClass = compact
    ? 'mx-auto mb-6 max-w-2xl rounded-xl border border-slate-200 bg-slate-50 p-4 text-left print:mb-4 print:max-w-none print:rounded-none print:border-slate-300 print:bg-white print:p-0'
    : 'mt-3 rounded-lg border border-slate-200 bg-white p-4 max-w-2xl print:mt-4 print:max-w-none print:rounded-none print:border-slate-300 print:bg-white';

  const statCardClass =
    'rounded-lg bg-slate-50 px-3 py-2 print:rounded-none print:border print:border-slate-300 print:bg-white';
  const noteCardClass =
    'rounded-lg px-3 py-2 text-sm print:rounded-none print:border print:border-slate-300 print:bg-white print:text-slate-800';
  const printBadgeClass =
    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium print:rounded-none print:border print:border-slate-400 print:bg-white print:text-slate-800';

  return (
    <div
      className={wrapperClass}
      style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 print:items-start print:pb-2">
        <PackageSearch size={16} className="text-lowes-blue print:hidden" />
        <div>
          <div className="text-sm font-semibold text-slate-800 print:text-base print:text-black">Procurement Intelligence</div>
          <div className="text-xs text-slate-500 print:text-slate-600">
            Operational summary for optimization and vendor guidance captured in this report snapshot.
          </div>
        </div>
      </div>

      {optimization ? (
        <section className="mt-4 print:mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 print:text-[11px] print:text-black">
            Optimization
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Optimized Items</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">{optimization.optimizedItemCount}</div>
            </div>
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Estimated Cost</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">${optimization.estimatedOptimizedCost.toFixed(2)}</div>
            </div>
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Projected Waste</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">{optimization.estimatedWasteQuantity.toFixed(1)}</div>
            </div>
          </div>
          {optimization.packStrategySummaries.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Pack Strategy Notes
              </div>
              <div className="mt-2 space-y-2">
                {optimization.packStrategySummaries.slice(0, 4).map((summary, index) => (
                  <div key={summary} className={`${noteCardClass} bg-blue-50 text-slate-700`}>
                    <span className="font-medium text-slate-500 print:text-slate-700">Strategy {index + 1}:</span>{' '}
                    {summary}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {optimization.riskSignals.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Optimization Risk Signals
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
              {optimization.riskSignals.map((signal) => (
                <span key={signal} className={`${printBadgeClass} bg-amber-100 text-amber-700`}>
                  <AlertTriangle size={12} className="print:hidden" />
                  {titleCase(signal)}
                </span>
              ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {vendorIntelligence ? (
        <section className="mt-4 print:mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 print:text-[11px] print:text-black">
            Vendor Intelligence
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Selected Offers</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">{vendorIntelligence.selectedOfferCount}</div>
            </div>
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Stale Offers</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">{vendorIntelligence.staleOfferCount}</div>
            </div>
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Freshness Seen</div>
              <div className="text-sm font-semibold text-slate-800 print:text-black">
                {vendorIntelligence.selectedOfferFreshness.join(', ') || 'N/A'}
              </div>
            </div>
          </div>
          {vendorIntelligence.offerSummaries.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Offer Notes
              </div>
              <div className="mt-2 space-y-2">
                {vendorIntelligence.offerSummaries.slice(0, 4).map((summary, index) => (
                  <div key={summary} className={`${noteCardClass} bg-slate-50 text-slate-700`}>
                    <span className="font-medium text-slate-500 print:text-slate-700">Offer {index + 1}:</span>{' '}
                    {summary}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {vendorIntelligence.cheaperAlternativeSummaries.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Cheaper Alternative Notes
              </div>
              <div className="mt-2 space-y-2">
                {vendorIntelligence.cheaperAlternativeSummaries.slice(0, 3).map((summary) => (
                  <div key={summary} className={`${noteCardClass} bg-amber-50 text-amber-800`}>
                    <span className="inline-flex items-center gap-1 font-medium">
                    <ShieldAlert size={14} className="print:hidden" />
                    {summary}
                  </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {vendorIntelligence.bundleOpportunitySummaries.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Bundle Opportunity Notes
              </div>
              <div className="mt-2 space-y-2">
                {vendorIntelligence.bundleOpportunitySummaries.slice(0, 3).map((summary) => (
                  <div key={summary} className={`${noteCardClass} bg-emerald-50 text-emerald-800`}>
                    <span className="inline-flex items-center gap-1 font-medium">
                    <Layers3 size={14} className="print:hidden" />
                    {summary}
                  </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {vendorIntelligence.riskSignals.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Vendor Risk Signals
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
              {vendorIntelligence.riskSignals.map((signal) => (
                <span key={signal} className={`${printBadgeClass} bg-slate-100 text-slate-700`}>
                  <AlertTriangle size={12} className="print:hidden" />
                  {titleCase(signal)}
                </span>
              ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {reviewGuidance ? (
        <section className="mt-4 print:mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 print:text-[11px] print:text-black">
            Review Guidance
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Items Needing Review</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">{reviewGuidance.reviewItemCount}</div>
            </div>
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Guidance Notes</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">{reviewGuidance.guidanceCount}</div>
            </div>
            <div className={statCardClass}>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Drafts Impacted</div>
              <div className="text-lg font-semibold text-slate-800 print:text-base print:text-black">{reviewGuidance.draftCount}</div>
            </div>
          </div>
          {reviewGuidance.codes.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Review Signals
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {reviewGuidance.codes.map((code) => (
                  <span key={code} className={`${printBadgeClass} bg-rose-100 text-rose-700`}>
                    <AlertTriangle size={12} className="print:hidden" />
                    {titleCase(code)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {reviewGuidance.summaries.length > 0 ? (
            <div className="mt-3" style={{ breakInside: 'avoid-page', pageBreakInside: 'avoid' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 print:text-black">
                Review Notes
              </div>
              <div className="mt-2 space-y-2">
                {reviewGuidance.summaries.map((summary) => (
                  <div key={summary} className={`${noteCardClass} bg-rose-50 text-rose-800`}>
                    <span className="inline-flex items-center gap-1 font-medium">
                      <AlertTriangle size={14} className="print:hidden" />
                      {summary}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

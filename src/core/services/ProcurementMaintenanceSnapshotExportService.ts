import {
  ProcurementDraft,
  ProcurementMaintenanceDigest,
  ProcurementPortfolioSummary,
  ProcurementRefreshLedgerEntry,
} from '../models/procurement';

interface ProcurementMaintenanceSnapshotExportInput {
  exportedAt: number;
  drafts: ProcurementDraft[];
  portfolioSummary?: ProcurementPortfolioSummary;
  refreshHealthSummary: {
    neverRefreshedCount: number;
    staleRefreshCount: number;
    needsReviewCount: number;
    noOfferCount: number;
    vendorIssuesCount: number;
    staleAndNeedsReviewCount: number;
  };
  maintenanceDigest?: ProcurementMaintenanceDigest;
  recentLedgerEntries: ProcurementRefreshLedgerEntry[];
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const downloadText = (filename: string, contents: string): void => {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const ProcurementMaintenanceSnapshotExportService = {
  buildSnapshotText(input: ProcurementMaintenanceSnapshotExportInput): string {
    const lines: string[] = [];

    lines.push('UnitFlip Procurement Maintenance Snapshot');
    lines.push(`Exported At: ${new Date(input.exportedAt).toISOString()}`);
    lines.push('');

    if (input.portfolioSummary) {
      lines.push('Portfolio Summary');
      lines.push(`- Total drafts: ${input.portfolioSummary.draftCount}`);
      lines.push(`- Drafts needing review: ${input.portfolioSummary.draftCountWithReviewNeeded}`);
      lines.push(`- Optimized items: ${input.portfolioSummary.optimizedItemCount}`);
      lines.push(`- Estimated optimized cost: $${input.portfolioSummary.estimatedOptimizedCost.toFixed(2)}`);
      lines.push(`- Projected waste: ${input.portfolioSummary.projectedWasteQuantity.toFixed(1)} units`);
      lines.push(`- No-offer items: ${input.portfolioSummary.unmatchedOrNoOfferCount}`);
      lines.push(`- Drafts with stale vendor data: ${input.portfolioSummary.draftCountWithStaleVendorData}`);
      lines.push(`- Drafts with bundle opportunities: ${input.portfolioSummary.draftCountWithBundleOpportunities}`);
      lines.push(`- Drafts with cheaper alternatives: ${input.portfolioSummary.draftCountWithCheaperAlternatives}`);
      lines.push('');
    }

    lines.push('Refresh Health');
    lines.push(`- Never refreshed: ${input.refreshHealthSummary.neverRefreshedCount}`);
    lines.push(`- Stale refresh: ${input.refreshHealthSummary.staleRefreshCount}`);
    lines.push(`- Needs review: ${input.refreshHealthSummary.needsReviewCount}`);
    lines.push(`- No offer: ${input.refreshHealthSummary.noOfferCount}`);
    lines.push(`- Vendor issues: ${input.refreshHealthSummary.vendorIssuesCount}`);
    lines.push(`- Stale + needs review: ${input.refreshHealthSummary.staleAndNeedsReviewCount}`);
    lines.push('');

    if (input.maintenanceDigest) {
      lines.push('Weekly Maintenance Digest');
      lines.push(`- Digest label: ${input.maintenanceDigest.label}`);
      lines.push(`- Window size: ${input.maintenanceDigest.windowSize} snapshots`);
      for (const metric of input.maintenanceDigest.metrics) {
        lines.push(`- ${metric.label}: ${metric.summary}`);
      }
      if (input.maintenanceDigest.oldestStaleAgeSummary) {
        lines.push(`- ${input.maintenanceDigest.oldestStaleAgeSummary}`);
      }
      lines.push('');
    }

    if (input.recentLedgerEntries.length > 0) {
      lines.push('Recent Ledger Entries');
      input.recentLedgerEntries.forEach((entry, index) => {
        lines.push(
          `${index + 1}. ${new Date(entry.capturedAt).toISOString()} | stale=${entry.staleRefreshCount} | never_refreshed=${entry.neverRefreshedCount} | needs_review=${entry.needsReviewCount} | no_offer=${entry.noOfferCount} | vendor_issues=${entry.vendorIssuesCount}${
            typeof entry.oldestStaleAgeDays === 'number' ? ` | oldest_stale_days=${entry.oldestStaleAgeDays}` : ''
          }`
        );
      });
      lines.push('');
    }

    const annotatedDrafts = input.drafts.filter((draft) => draft.manualAnnotation?.note);
    if (annotatedDrafts.length > 0) {
      lines.push('Manual Notes');
      annotatedDrafts.forEach((draft, index) => {
        lines.push(
          `${index + 1}. ${draft.name} (${new Date(draft.manualAnnotation?.updatedAt || input.exportedAt).toISOString()})`
        );
        lines.push(`   ${draft.manualAnnotation?.note || ''}`);
      });
    }

    return lines.join('\n');
  },

  downloadSnapshot(input: ProcurementMaintenanceSnapshotExportInput): void {
    const contents = this.buildSnapshotText(input);
    const filename = `${slugify('procurement-maintenance-snapshot') || 'maintenance-snapshot'}-${new Date(
      input.exportedAt
    )
      .toISOString()
      .slice(0, 10)}.txt`;
    downloadText(filename, contents);
  },
};

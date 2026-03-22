import { ProcurementMaintenanceDigest, ProcurementRefreshLedgerEntry } from '../models/procurement';

const summarizeDelta = (delta: number): string => {
  if (delta < 0) return `down by ${Math.abs(delta)}`;
  if (delta > 0) return `up by ${delta}`;
  return 'unchanged';
};

export const ProcurementMaintenanceDigestService = {
  buildFromLedger(ledger: ProcurementRefreshLedgerEntry[]): ProcurementMaintenanceDigest | undefined {
    if (ledger.length < 2) {
      return undefined;
    }

    const windowEntries = ledger.slice(0, Math.min(7, ledger.length));
    const latest = windowEntries[0];
    const baseline = windowEntries[windowEntries.length - 1];

    const metrics = [
      {
        label: 'Stale refresh',
        delta: latest.staleRefreshCount - baseline.staleRefreshCount,
      },
      {
        label: 'Never refreshed',
        delta: latest.neverRefreshedCount - baseline.neverRefreshedCount,
      },
      {
        label: 'Needs review',
        delta: latest.needsReviewCount - baseline.needsReviewCount,
      },
      {
        label: 'No offer',
        delta: latest.noOfferCount - baseline.noOfferCount,
      },
      {
        label: 'Vendor issues',
        delta: latest.vendorIssuesCount - baseline.vendorIssuesCount,
      },
    ].map((metric) => ({
      ...metric,
      summary: summarizeDelta(metric.delta),
    }));

    const worseningCount = metrics.filter((metric) => metric.delta > 0).length;
    const improvingCount = metrics.filter((metric) => metric.delta < 0).length;

    const label: ProcurementMaintenanceDigest['label'] =
      worseningCount > 0 && improvingCount === 0
        ? 'worsening'
        : improvingCount > 0 && worseningCount === 0
          ? 'improving'
          : worseningCount === 0 && improvingCount === 0
            ? 'stable'
            : 'mixed';

    const latestOldest = latest.oldestStaleAgeDays;
    const baselineOldest = baseline.oldestStaleAgeDays;

    return {
      label,
      windowSize: windowEntries.length,
      metrics,
      oldestStaleAgeSummary:
        typeof latestOldest === 'number' && typeof baselineOldest === 'number'
          ? `Oldest stale age ${summarizeDelta(latestOldest - baselineOldest)}`
          : typeof latestOldest === 'number'
            ? `Oldest stale age now ${latestOldest} day${latestOldest === 1 ? '' : 's'}`
            : undefined,
    };
  },
};

import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import {
  ProcurementDraft,
  ProcurementRefreshAnalyticsSnapshot,
  ProcurementRefreshLedgerEntry,
} from '../models/procurement';

const STORAGE_KEY_PREFIX = 'unitflip_procurement_refresh_analytics_v1:';
const LEDGER_KEY_PREFIX = 'unitflip_procurement_refresh_analytics_ledger_v1:';
const MAX_LEDGER_ENTRIES = 12;
const adapter = createLocalDbAdapter();

const getStoreKey = (orgId: string) => `${STORAGE_KEY_PREFIX}${orgId}`;
const getLedgerKey = (orgId: string) => `${LEDGER_KEY_PREFIX}${orgId}`;

const isStaleRefresh = (draft: ProcurementDraft): boolean => {
  if (!draft.intelligenceRefreshedAt) return false;
  const ageDays = Math.floor((Date.now() - draft.intelligenceRefreshedAt) / (1000 * 60 * 60 * 24));
  return ageDays >= 7;
};

const buildSnapshot = (drafts: ProcurementDraft[]): ProcurementRefreshAnalyticsSnapshot => ({
  capturedAt: Date.now(),
  neverRefreshedCount: drafts.filter((draft) => !draft.intelligenceRefreshedAt).length,
  staleRefreshCount: drafts.filter(isStaleRefresh).length,
  needsReviewCount: drafts.filter((draft) => draft.items.some((item) => (item.reviewGuidance?.length || 0) > 0)).length,
});

const buildLedgerEntry = (drafts: ProcurementDraft[]): ProcurementRefreshLedgerEntry => {
  const refreshedDrafts = drafts
    .map((draft) => ({
      ageDays: draft.intelligenceRefreshedAt
        ? Math.floor((Date.now() - draft.intelligenceRefreshedAt) / (1000 * 60 * 60 * 24))
        : undefined,
    }))
    .filter((entry): entry is { ageDays: number } => typeof entry.ageDays === 'number');

  const oldestStaleAgeDays = refreshedDrafts
    .filter((entry) => entry.ageDays >= 7)
    .sort((a, b) => b.ageDays - a.ageDays)[0]?.ageDays;

  return {
    ...buildSnapshot(drafts),
    noOfferCount: drafts.filter((draft) =>
      draft.items.some(
        (item) =>
          item.vendorIntelligence?.riskSignals.includes('no_offer') ||
          item.vendorIntelligence?.riskSignals.includes('unmatched_requirement')
      )
    ).length,
    vendorIssuesCount: drafts.filter((draft) =>
      draft.items.some(
        (item) =>
          item.vendorIntelligence?.riskSignals.includes('stale_price') ||
          item.vendorIntelligence?.riskSignals.includes('cheaper_alternative') ||
          item.vendorIntelligence?.riskSignals.includes('bundle_opportunity')
      )
    ).length,
    oldestStaleAgeDays,
  };
};

export const ProcurementRefreshAnalyticsService = {
  async captureSnapshot(
    orgId: string,
    drafts: ProcurementDraft[]
  ): Promise<{
    previous?: ProcurementRefreshAnalyticsSnapshot;
    current: ProcurementRefreshAnalyticsSnapshot;
    ledger: ProcurementRefreshLedgerEntry[];
  }> {
    const previous = await adapter.getItem<ProcurementRefreshAnalyticsSnapshot>(getStoreKey(orgId));
    const current = buildSnapshot(drafts);
    const nextLedgerEntry = buildLedgerEntry(drafts);
    const existingLedger = (await adapter.getItem<ProcurementRefreshLedgerEntry[]>(getLedgerKey(orgId))) || [];
    const latest = existingLedger[0];
    const nextLedger =
      latest &&
      latest.neverRefreshedCount === nextLedgerEntry.neverRefreshedCount &&
      latest.staleRefreshCount === nextLedgerEntry.staleRefreshCount &&
      latest.needsReviewCount === nextLedgerEntry.needsReviewCount &&
      latest.noOfferCount === nextLedgerEntry.noOfferCount &&
      latest.vendorIssuesCount === nextLedgerEntry.vendorIssuesCount &&
      latest.oldestStaleAgeDays === nextLedgerEntry.oldestStaleAgeDays
        ? existingLedger
        : [nextLedgerEntry, ...existingLedger].slice(0, MAX_LEDGER_ENTRIES);

    await adapter.setItem(getStoreKey(orgId), current);
    await adapter.setItem(getLedgerKey(orgId), nextLedger);
    return { previous: previous || undefined, current, ledger: nextLedger };
  },
};

import { ProcurementDraft, ProcurementDraftItem } from '../models/procurement';

const escapeCsv = (value: string | number | boolean | null | undefined): string => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const summarizePackStrategy = (item: ProcurementDraftItem): string =>
  item.optimization?.recommendedPacks
    .map((selection) => `${selection.packCount} x ${selection.optionName}`)
    .join(' + ') || '';

const summarizeOptimizationSignals = (item: ProcurementDraftItem): string =>
  (item.optimization?.signals || []).join('; ');

const summarizeVendorSignals = (item: ProcurementDraftItem): string =>
  (item.vendorIntelligence?.riskSignals || []).join('; ');

const summarizeBundleOpportunity = (item: ProcurementDraftItem): string =>
  item.vendorIntelligence?.bundleSuggestion
    ? `${item.vendorIntelligence.bundleSuggestion.triggerName} (${item.vendorIntelligence.bundleSuggestion.companionCount} companions)`
    : '';

const summarizeDraftBundles = (draft: ProcurementDraft): string =>
  (draft.bundleSuggestions || []).map((bundle) => bundle.label).join('; ');

const summarizeItemBundles = (item: ProcurementDraftItem): string =>
  (item.bundleIds || []).join('; ');

const summarizeDraftBundleProductRecommendations = (draft: ProcurementDraft): string =>
  (draft.bundleProductRecommendations || [])
    .map((recommendation) =>
      recommendation.status === 'resolved'
        ? `${recommendation.bundleLabel}: ${recommendation.recommendedProductLabel}`
        : `${recommendation.bundleLabel}: manual review`
    )
    .join('; ');

const summarizeDraftRecommendationAttachments = (draft: ProcurementDraft): string =>
  (draft.recommendationAttachments || [])
    .map((attachment) => `${attachment.bundleId}:${attachment.attachmentState}`)
    .join('; ');

const summarizeDraftPromotedLines = (draft: ProcurementDraft): string =>
  (draft.promotedLines || [])
    .map((line) => `${line.label}:${line.optionId || 'default'}:${line.quantity ?? 'manual'}`)
    .join('; ');

const getItemBundleProductRecommendations = (draft: ProcurementDraft, item: ProcurementDraftItem) =>
  (draft.bundleProductRecommendations || []).filter((recommendation) =>
    (item.bundleIds || []).includes(recommendation.bundleId)
  );

const getItemRecommendationAttachments = (draft: ProcurementDraft, item: ProcurementDraftItem) =>
  (draft.recommendationAttachments || []).filter((attachment) =>
    (item.bundleIds || []).includes(attachment.bundleId)
  );

const summarizeItemBundleProductIds = (draft: ProcurementDraft, item: ProcurementDraftItem): string =>
  getItemBundleProductRecommendations(draft, item)
    .map((recommendation) => recommendation.recommendedProductId || '')
    .filter(Boolean)
    .join('; ');

const summarizeItemBundleProductLabels = (draft: ProcurementDraft, item: ProcurementDraftItem): string =>
  getItemBundleProductRecommendations(draft, item)
    .map((recommendation) =>
      recommendation.status === 'resolved'
        ? `${recommendation.recommendedProductLabel} x ${recommendation.quantity ?? 'manual'}`
        : `${recommendation.bundleLineLabel} (manual)`
    )
    .join('; ');

const summarizeItemAttachmentStates = (draft: ProcurementDraft, item: ProcurementDraftItem): string =>
  getItemRecommendationAttachments(draft, item)
    .map((attachment) => `${attachment.productLabel || attachment.bundleLineId}:${attachment.attachmentState}`)
    .join('; ');

const summarizeItemPromotedLines = (draft: ProcurementDraft, item: ProcurementDraftItem): string =>
  (draft.promotedLines || [])
    .filter((line) => (item.bundleIds || []).includes(line.bundleId))
    .map((line) => `${line.label} • ${line.skuCode || line.optionId || 'default'}`)
    .join('; ');

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const ProcurementExportService = {
  buildDraftCsv(draft: ProcurementDraft): string {
    const headers = [
      'Draft ID',
      'Draft Name',
      'Draft Status',
      'Draft Updated At',
      'Draft Bundle Suggestions',
      'Draft Product Recommendations',
      'Draft Recommendation Attachments',
      'Draft Promoted Lines',
      'Item ID',
      'Material Requirement ID',
      'Inspection ID',
      'Repair Task ID',
      'Finding ID',
      'Generated Section ID',
      'Generated Item ID',
      'Room Label',
      'Category',
      'Item Description',
      'Requested Quantity',
      'Requested Unit',
      'Notes',
      'Selected Catalog Item ID',
      'Selected Catalog Item Name',
      'Selected Option ID',
      'Selected Option Name',
      'Selected Vendor',
      'Selected SKU',
      'Selected Model Number',
      'Selected Price',
      'Selected Confidence Score',
      'Selected Confidence Band',
      'Estimated Optimized Cost',
      'Projected Waste Quantity',
      'Optimization Coverage Quantity',
      'Pack Strategy Summary',
      'Optimization Signals',
      'Vendor Freshness Label',
      'Cheaper Alternative Option',
      'Cheaper Alternative Price',
      'Bundle Opportunity',
      'Item Bundle IDs',
      'Item Bundle Product IDs',
      'Item Bundle Product Labels',
      'Item Attachment States',
      'Item Promoted Lines',
      'Vendor Risk Flags',
      'Vendor Review Needed',
    ];

    const rows = draft.items.map((item) => [
      draft.id,
      draft.name,
      draft.status,
      new Date(draft.updatedAt).toISOString(),
      summarizeDraftBundles(draft),
      summarizeDraftBundleProductRecommendations(draft),
      summarizeDraftRecommendationAttachments(draft),
      summarizeDraftPromotedLines(draft),
      item.id,
      item.materialRequirementId,
      item.inspectionId,
      item.repairTaskId || '',
      item.findingId || '',
      item.generatedSectionId || '',
      item.generatedItemId || '',
      item.roomLabel || '',
      item.category,
      item.itemDescription,
      item.quantity,
      item.unit,
      item.notes || '',
      item.selectedMatch?.catalogItemId || '',
      item.selectedMatch?.catalogItemName || '',
      item.selectedMatch?.optionId || '',
      item.selectedMatch?.optionName || '',
      item.selectedMatch?.vendor || '',
      item.selectedMatch?.sku || '',
      item.selectedMatch?.modelNumber || '',
      item.selectedMatch?.price ?? '',
      item.selectedMatch?.confidenceScore ?? '',
      item.selectedMatch?.confidenceBand || '',
      item.optimization?.estimatedTotalCost ?? '',
      item.optimization?.estimatedWasteQuantity ?? '',
      item.optimization?.estimatedCoverageQuantity ?? '',
      summarizePackStrategy(item),
      summarizeOptimizationSignals(item),
      item.vendorIntelligence?.selectedOffer?.freshnessLabel || '',
      item.vendorIntelligence?.cheapestAlternative?.optionName || '',
      item.vendorIntelligence?.cheapestAlternative?.price ?? '',
      summarizeBundleOpportunity(item),
      summarizeItemBundles(item),
      summarizeItemBundleProductIds(draft, item),
      summarizeItemBundleProductLabels(draft, item),
      summarizeItemAttachmentStates(draft, item),
      summarizeItemPromotedLines(draft, item),
      summarizeVendorSignals(item),
      item.vendorIntelligence?.reviewNeeded ?? '',
    ]);

    return [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
      .join('\n');
  },

  downloadDraftCsv(draft: ProcurementDraft): void {
    const csv = this.buildDraftCsv(draft);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(draft.name) || 'procurement-draft'}-${draft.id}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};

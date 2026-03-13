import { StagedProduct, CatalogItem } from '../core/models/types';

export interface DuplicateResult {
  item: CatalogItem;
  score: number;
  reason: string;
}

function calculateMatchScore(source: { itemNumber?: string | null, modelNumber?: string | null, normalizedTitle?: string, title?: string, name?: string }, candidate: CatalogItem): { score: number, reason: string } {
    const sourceItemNo = source.itemNumber;
    const sourceModelNo = source.modelNumber;
    const sourceTitle = source.normalizedTitle || source.title?.toLowerCase() || source.name?.toLowerCase() || '';

    // Exact Item Number Match
    if (sourceItemNo && (candidate.itemNumber === sourceItemNo || candidate.options?.some(o => o.sku === sourceItemNo))) {
        return { score: 1.0, reason: 'Exact Item Number Match' };
    }
    // Exact Model Number Match
    if (sourceModelNo && (candidate.modelNumber === sourceModelNo || candidate.options?.some(o => o.modelNumber === sourceModelNo))) {
        return { score: 0.95, reason: 'Exact Model Number Match' };
    }
    
    // Title Match
    const candTitle = candidate.normalizedTitle || candidate.title?.toLowerCase() || candidate.name?.toLowerCase() || '';
    if (sourceTitle && candTitle === sourceTitle) {
        return { score: 0.9, reason: 'Exact Title Match' };
    } 
    
    if (sourceTitle && candTitle && (sourceTitle.includes(candTitle) || candTitle.includes(sourceTitle))) {
         if (Math.abs(sourceTitle.length - candTitle.length) < 5) {
            return { score: 0.7, reason: 'Partial Title Match' };
         }
    }
    
    return { score: 0, reason: '' };
}

export function findDuplicateCandidates(
  source: StagedProduct | CatalogItem | any, 
  candidates: CatalogItem[]
): DuplicateResult[] {
  const results: DuplicateResult[] = [];
  
  for (const candidate of candidates) {
    // Avoid self-match if IDs are present
    if (source.id && candidate.id && source.id === candidate.id) continue;

    const { score, reason } = calculateMatchScore(source, candidate);
    if (score > 0.6) {
        results.push({ item: candidate, score, reason });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function detectDuplicates(stagedProducts: StagedProduct[], existingCatalog: CatalogItem[]): StagedProduct[] {
  return stagedProducts.map(staged => {
    const matches = findDuplicateCandidates(staged, existingCatalog);
    if (matches.length > 0) {
        const best = matches[0];
        return {
            ...staged,
            duplicateCandidate: true,
            duplicateTargetId: best.item.id
        };
    }
    return staged;
  });
}

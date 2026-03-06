import { StagedProduct, CatalogItem } from '../core/models/types';

export function detectDuplicates(stagedProducts: StagedProduct[], existingCatalog: CatalogItem[]): StagedProduct[] {
  return stagedProducts.map(staged => {
    let match: CatalogItem | undefined;

    // 1. Match by Item Number
    if (staged.itemNumber) {
      match = existingCatalog.find(c => 
        c.options.some(o => o.sku === staged.itemNumber)
      );
    }

    // 2. Match by Model Number
    if (!match && staged.modelNumber) {
      match = existingCatalog.find(c => 
        c.options.some(o => o.modelNumber === staged.modelNumber)
      );
    }

    // 3. Match by Normalized Title (Exact match)
    if (!match && staged.normalizedTitle) {
      match = existingCatalog.find(c => 
        c.name.toLowerCase() === staged.normalizedTitle.toLowerCase()
      );
    }

    if (match) {
      return {
        ...staged,
        duplicateCandidate: true,
        duplicateTargetId: match.id
      };
    }

    return staged;
  });
}

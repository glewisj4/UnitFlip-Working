import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ImportBatch, StagedProduct } from '../models/types';
import { createId } from '../../services/storage';
import { extractPdfText } from '../../services/pdfParser';
import { parseLowesQuote } from '../../services/lowesQuoteParser';
import { detectDuplicates } from '../../services/duplicateDetection';
import { CatalogService } from './CatalogService';
import { fetchLowesProductImage } from '../../services/productImageService';

const adapter = createLocalDbAdapter();

export class ImportService {
  private static getBatchKey(orgId: string) {
    return `unitflip_import_batches_v1:${orgId}`;
  }

  private static getStagedKey(importBatchId: string) {
    return `unitflip_staged_products_v1:${importBatchId}`;
  }

  static async createImportFromPdf(
    file: File,
    orgId: string,
    createdBy?: string
  ): Promise<{ importBatchId: string }> {
    // 1. Validate File
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('Only PDF files are supported');
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
      throw new Error('File size exceeds 10MB limit');
    }

    // 2. Store File Blob
    const fileRef = createId();
    await adapter.setItem(`file:${fileRef}`, file);

    // 3. Extract Text & Parse
    const text = await extractPdfText(file);
    const { batch: parsedBatch, items } = parseLowesQuote(text);

    // 4. Create ImportBatch
    const batchId = createId();
    const newBatch: ImportBatch = {
      id: batchId,
      orgId,
      source: 'LOWES_QUOTE_PDF',
      quoteNumber: parsedBatch.quoteNumber || null,
      storeNumber: parsedBatch.storeNumber || null,
      createdDate: parsedBatch.createdDate || null,
      validUntil: parsedBatch.validUntil || null,
      subtotal: parsedBatch.subtotal || null,
      estimatedTotal: parsedBatch.estimatedTotal || null,
      filename: file.name,
      fileRef,
      createdAt: new Date().toISOString(),
      createdBy: createdBy || null,
    };

    // 5. Create StagedProducts
    let stagedProducts: StagedProduct[] = items.map((item, index) => ({
      id: createId(),
      orgId,
      importBatchId: batchId,
      lineNumber: index + 1,
      rawTitle: item.rawTitle,
      normalizedTitle: item.rawTitle,
      itemNumber: item.itemNumber,
      modelNumber: item.modelNumber,
      fulfillment: item.fulfillmentType,
      type: null,
      unitPrice: item.unitPrice,
      qty: item.qty,
      lineTotal: item.lineTotal,
      status: 'STAGED',
      suggestedCategoryId: null,
      approvedCatalogItemId: null,
      duplicateOfStagedProductId: null,
      notes: null,
      createdAt: new Date().toISOString(),
      imageUrl: null,
      duplicateCandidate: false,
      duplicateTargetId: null
    }));

    // 6. Duplicate Detection
    const existingCatalog = await CatalogService.getItems(orgId);
    stagedProducts = detectDuplicates(stagedProducts, existingCatalog);

    // 7. Persist Batch
    const batches = (await adapter.getItem<ImportBatch[]>(this.getBatchKey(orgId))) || [];
    batches.unshift(newBatch);
    await adapter.setItem(this.getBatchKey(orgId), batches);

    // 8. Persist Staged Products
    await adapter.setItem(this.getStagedKey(batchId), stagedProducts);

    // 9. Trigger Image Fetching (Async)
    this.fetchImagesForBatch(batchId, stagedProducts);

    return { importBatchId: batchId };
  }

  private static async fetchImagesForBatch(batchId: string, products: StagedProduct[]) {
    const updates: StagedProduct[] = [...products];
    let hasUpdates = false;

    for (let i = 0; i < updates.length; i++) {
      const p = updates[i];
      if (p.itemNumber && !p.imageUrl) {
        const url = await fetchLowesProductImage(p.itemNumber);
        if (url) {
          updates[i] = { ...p, imageUrl: url };
          hasUpdates = true;
        }
      }
    }

    if (hasUpdates) {
      await adapter.setItem(this.getStagedKey(batchId), updates);
    }
  }

  static async listImportBatches(orgId: string): Promise<ImportBatch[]> {
    const batches = await adapter.getItem<ImportBatch[]>(this.getBatchKey(orgId));
    return batches || [];
  }

  static async getImportBatch(orgId: string, importBatchId: string): Promise<ImportBatch | null> {
    const batches = await this.listImportBatches(orgId);
    return batches.find((b) => b.id === importBatchId) || null;
  }

  static async listStagedProducts(importBatchId: string): Promise<StagedProduct[]> {
    const products = await adapter.getItem<StagedProduct[]>(this.getStagedKey(importBatchId));
    return products || [];
  }
  
  static async getFile(fileRef: string): Promise<Blob | null> {
    return adapter.getItem<Blob>(`file:${fileRef}`);
  }
}

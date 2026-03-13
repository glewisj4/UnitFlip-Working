import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ImportBatch, StagedProduct } from '../models/types';
import { createId } from '../../services/storage';
import { extractPdfTextItems } from '../../services/pdfParser';
import { parseLowesQuote } from '../../services/lowesQuoteParser';
import { detectDuplicates } from '../../services/duplicateDetection';
import { CatalogService } from './CatalogService';
import { fetchLowesProductImage } from '../../services/productImageService';
import { normalizeTitle } from '../../utils/normalizeTitle';

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
    const pdfItems = await extractPdfTextItems(file);
    const { batch: parsedBatch, items, warnings, debug } = parseLowesQuote(pdfItems);
    
    console.log("LOWES PARSER RESULT:", { batch: parsedBatch, items, warnings });
    console.log("PARSED ITEM COUNT:", items.length);

    if (!items || items.length === 0) {
      throw new Error("No quote items could be parsed from this PDF.");
    }

    // 4. Check for Duplicate Quote
    if (parsedBatch.quoteNumber) {
        const existingBatches = await this.listImportBatches(orgId);
        const duplicate = existingBatches.find(b => 
          b.quoteNumber === parsedBatch.quoteNumber && 
          b.status !== 'FAILED' && 
          b.status !== 'DELETED'
        );
        if (duplicate) {
            throw new Error(`This Lowe's quote (${parsedBatch.quoteNumber}) has already been imported.`);
        }
    }

    // 5. Create ImportBatch
    const batchId = createId();
    const newBatch: ImportBatch = {
      id: batchId,
      orgId,
      source: 'LOWES_QUOTE_PDF',
      status: 'STAGED',
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

    // 6. Create StagedProducts
    let stagedProducts: StagedProduct[] = items.map((item, index) => {
      // Ensure we use the cleaned title as normalizedTitle
      const normalized = normalizeTitle(item.rawTitle); 
      
      console.log(`ITEM ${index + 1}:`);
      console.log(`  RAW: ${item.rawTitle}`);
      console.log(`  NORM: ${normalized}`);

      return {
        id: createId(),
        orgId,
        importBatchId: batchId,
        lineNumber: index + 1,
        rawTitle: item.rawTitle,
        normalizedTitle: normalized,
        itemNumber: item.itemNumber,
        modelNumber: item.modelNumber,
        type: null,
        unitPrice: item.unitPrice,
        qty: item.qty,
        status: 'STAGED',
        suggestedCategoryId: null,
        approvedCatalogItemId: null,
        duplicateOfStagedProductId: null,
        notes: null,
        createdAt: new Date().toISOString(),
        imageUrl: null,
        duplicateCandidate: false,
        duplicateTargetId: null
      };
    });

    // 7. Duplicate Detection
    const existingCatalog = await CatalogService.getItems(orgId);
    stagedProducts = detectDuplicates(stagedProducts, existingCatalog);

    // 8. Persist Batch
    const batches = (await adapter.getItem<ImportBatch[]>(this.getBatchKey(orgId))) || [];
    batches.unshift(newBatch);
    await adapter.setItem(this.getBatchKey(orgId), batches);

    // 9. Persist Staged Products
    await adapter.setItem(this.getStagedKey(batchId), stagedProducts);

    // 10. Trigger Image Fetching (Async)
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
  
  static async deleteImportBatch(orgId: string, importBatchId: string): Promise<void> {
    console.log("ImportService.deleteImportBatch", importBatchId);
    // 1. Get the batch to find fileRef
    const batches = await this.listImportBatches(orgId);
    const batchIndex = batches.findIndex(b => b.id === importBatchId);
    
    if (batchIndex === -1) {
        console.warn("Batch not found for deletion:", importBatchId);
        return;
    }
    
    console.log(`Found batch at index ${batchIndex}, deleting...`);
    const batch = batches[batchIndex];

    // 2. Delete Staged Products
    try {
        await adapter.removeItem(this.getStagedKey(importBatchId));
        console.log("Deleted staged products");
    } catch (e) {
        console.warn("Failed to delete staged products", e);
    }

    // 3. Delete File Blob
    if (batch.fileRef) {
        try {
            await adapter.removeItem(`file:${batch.fileRef}`);
            console.log("Deleted file blob");
        } catch (e) {
            console.warn("Failed to delete file blob", e);
        }
    }

    // 4. Remove Batch Record
    batches.splice(batchIndex, 1);
    await adapter.setItem(this.getBatchKey(orgId), batches);
    console.log("Batch deleted successfully, remaining count:", batches.length);
  }
}

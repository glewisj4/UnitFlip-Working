import { createId } from '../../services/storage';
import { CatalogItem, Category, Tier } from '../models/types';
import { CatalogService } from './CatalogService';
import { ClientLoggerService } from './ClientLoggerService';
import { ProductCatalogFoundationService } from './ProductCatalogFoundationService';

export interface CatalogImportFailure {
  row: number;
  reason: string;
}

export interface CatalogImportResult {
  importedCount: number;
  failedRows: CatalogImportFailure[];
}

interface ParsedImportRow {
  name: string;
  vendor?: string;
  sku?: string;
  topLevelCategory?: string;
  subcategory?: string;
  equivalentGroup?: string;
  functionalTags: string[];
  price?: number;
  unit?: string;
  defaultQty?: number;
  defaultTier?: Tier;
  description?: string;
  importSource: CatalogItem['importSource'];
}

const CSV_HEADERS = [
  'name',
  'vendor',
  'sku',
  'topLevelCategory',
  'subcategory',
  'equivalentGroup',
  'functionalTags',
  'price',
  'unit',
  'defaultQty',
  'defaultTier',
  'description',
];

export class CatalogImportService {
  static getCsvTemplate() {
    return [
      CSV_HEADERS.join(','),
      [
        'Standard white blind 35x64',
        'Turn Supply Co.',
        'BLIND-3564-WHT',
        'Windows & Coverings',
        'Blinds & Shades',
        'blind_white_35x64_standard',
        'task:install_blinds;room:bedroom;grade:standard;turn:quick_turn',
        '24.99',
        'ea',
        '1',
        Tier.STANDARD,
        'Standard turn blind for common bedroom window size',
      ].join(','),
    ].join('\n');
  }

  static async exportCatalogCsv(orgId: string): Promise<string> {
    const items = await CatalogService.getItems(orgId);
    const rows = items.map((item) =>
      [
        item.name,
        item.vendor || '',
        item.options?.[0]?.sku || '',
        item.topLevelCategory || '',
        item.subcategory || '',
        item.equivalentGroup || '',
        (item.functionalTags || []).join(';'),
        item.options?.[0]?.price ?? '',
        item.unit,
        item.defaultQty,
        item.defaultTier,
        item.description || '',
      ].map((value) => this.escapeCsvValue(value)).join(','),
    );

    return [CSV_HEADERS.join(','), ...rows].join('\n');
  }

  static async importCsv(orgId: string, csvText: string, categories: Category[]): Promise<CatalogImportResult> {
    ClientLoggerService.info('Catalog CSV import started.', {
      category: 'catalog',
      eventType: 'product_import.started',
      screen: 'ProductManager',
      contextIds: { orgId },
      metadata: { source: 'csv' },
    });

    try {
      const rows = this.parseCsv(csvText);
      const parsedRows = rows.slice(1).map((row, index) => this.mapCsvRow(row, index + 2));
      const result = await this.persistRows(orgId, parsedRows, categories);

      ClientLoggerService.info('Catalog CSV import completed.', {
        category: 'catalog',
        eventType: 'product_import.completed',
        screen: 'ProductManager',
        contextIds: { orgId },
        metadata: { source: 'csv', importedCount: result.importedCount, failedCount: result.failedRows.length },
      });

      return result;
    } catch (error) {
      ClientLoggerService.error('Catalog CSV import failed.', {
        category: 'catalog',
        eventType: 'product_import.failed',
        screen: 'ProductManager',
        contextIds: { orgId },
        metadata: { source: 'csv', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  static async importPastedText(orgId: string, pastedText: string, categories: Category[]): Promise<CatalogImportResult> {
    ClientLoggerService.info('Catalog pasted text import started.', {
      category: 'catalog',
      eventType: 'product_import.started',
      screen: 'ProductManager',
      contextIds: { orgId },
      metadata: { source: 'text_paste' },
    });

    try {
      const parsedRows = pastedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => this.parsePipeRow(line, index + 1));

      const result = await this.persistRows(orgId, parsedRows, categories);

      ClientLoggerService.info('Catalog pasted text import completed.', {
        category: 'catalog',
        eventType: 'product_import.completed',
        screen: 'ProductManager',
        contextIds: { orgId },
        metadata: { source: 'text_paste', importedCount: result.importedCount, failedCount: result.failedRows.length },
      });

      return result;
    } catch (error) {
      ClientLoggerService.error('Catalog pasted text import failed.', {
        category: 'catalog',
        eventType: 'product_import.failed',
        screen: 'ProductManager',
        contextIds: { orgId },
        metadata: { source: 'text_paste', error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  static async quickAddPlaceholder(
    orgId: string,
    value: string,
    categories: Category[],
  ): Promise<CatalogItem> {
    const parts = value.split('|').map((part) => part.trim());
    const row = this.parsePipeRow(parts.join('|'), 1);
    const categoryId = ProductCatalogFoundationService.findCategoryIdByPath(
      categories,
      row.topLevelCategory,
      row.subcategory,
    );

    return CatalogService.addItem(orgId, this.buildCatalogItem(row, categoryId));
  }

  private static async persistRows(
    orgId: string,
    rows: Array<ParsedImportRow & { rowNumber: number }>,
    categories: Category[],
  ): Promise<CatalogImportResult> {
    const failedRows: CatalogImportFailure[] = [];
    let importedCount = 0;

    for (const row of rows) {
      if (!row.name.trim()) {
        failedRows.push({ row: row.rowNumber, reason: 'Name is required.' });
        continue;
      }

      const categoryId = ProductCatalogFoundationService.findCategoryIdByPath(
        categories,
        row.topLevelCategory,
        row.subcategory,
      );

      try {
        await CatalogService.addItem(orgId, this.buildCatalogItem(row, categoryId));
        importedCount += 1;
      } catch (error) {
        failedRows.push({
          row: row.rowNumber,
          reason: error instanceof Error ? error.message : 'Unknown import error.',
        });
      }
    }

    return { importedCount, failedRows };
  }

  private static buildCatalogItem(row: ParsedImportRow, categoryId?: string): Omit<CatalogItem, 'id' | 'orgId' | 'createdAt' | 'updatedAt'> {
    return {
      name: row.name,
      categoryId,
      categoryName: row.subcategory || row.topLevelCategory,
      topLevelCategory: row.topLevelCategory,
      subcategory: row.subcategory,
      equivalentGroup: row.equivalentGroup,
      functionalTags: row.functionalTags,
      vendor: row.vendor,
      importSource: row.importSource,
      description: row.description || '',
      tags: Array.from(new Set([...(row.functionalTags || []), row.vendor ? `vendor:${row.vendor.toLowerCase().replace(/\s+/g, '_')}` : ''].filter(Boolean))),
      defaultQty: row.defaultQty || 1,
      unit: row.unit || 'ea',
      defaultTier: row.defaultTier || Tier.STANDARD,
      options: [
        {
          id: createId(),
          name: row.name,
          price: row.price || 0,
          sku: row.sku || '',
          tier: row.defaultTier || Tier.STANDARD,
          brand: row.vendor,
        },
      ],
    };
  }

  private static mapCsvRow(row: string[], rowNumber: number) {
    const record = Object.fromEntries(CSV_HEADERS.map((header, index) => [header, row[index] || '']));
    return {
      rowNumber,
      name: record.name.trim(),
      vendor: record.vendor.trim() || undefined,
      sku: record.sku.trim() || undefined,
      topLevelCategory: record.topLevelCategory.trim() || undefined,
      subcategory: record.subcategory.trim() || undefined,
      equivalentGroup: record.equivalentGroup.trim() || undefined,
      functionalTags: this.parseTags(record.functionalTags),
      price: record.price ? Number(record.price) : undefined,
      unit: record.unit.trim() || undefined,
      defaultQty: record.defaultQty ? Number(record.defaultQty) : undefined,
      defaultTier: this.parseTier(record.defaultTier),
      description: record.description.trim() || undefined,
      importSource: 'csv' as const,
    };
  }

  private static parsePipeRow(line: string, rowNumber: number) {
    const [name, vendor, sku, categoryPath, equivalentGroup, functionalTags, price] = line.split('|').map((part) => part.trim());
    const [topLevelCategory, subcategory] = (categoryPath || '').split('>').map((part) => part.trim());

    return {
      rowNumber,
      name: name || '',
      vendor: vendor || undefined,
      sku: sku || undefined,
      topLevelCategory: topLevelCategory || undefined,
      subcategory: subcategory || undefined,
      equivalentGroup: equivalentGroup || undefined,
      functionalTags: this.parseTags(functionalTags),
      price: price ? Number(price) : undefined,
      defaultTier: Tier.STANDARD,
      unit: 'ea',
      defaultQty: 1,
      description: undefined,
      importSource: 'text_paste' as const,
    };
  }

  private static parseTier(value?: string): Tier | undefined {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'budget') return Tier.BUDGET;
    if (normalized === 'premium') return Tier.PREMIUM;
    return Tier.STANDARD;
  }

  private static parseTags(value?: string) {
    return (value || '')
      .split(/[;,]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private static parseCsv(csvText: string) {
    const rows: string[][] = [];
    let current = '';
    let row: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
      const char = csvText[index];
      const nextChar = csvText[index + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          index += 1;
        }
        row.push(current);
        current = '';
        if (row.some((value) => value.length > 0)) {
          rows.push(row);
        }
        row = [];
      } else {
        current += char;
      }
    }

    if (current.length > 0 || row.length > 0) {
      row.push(current);
      rows.push(row);
    }

    if (rows.length === 0) {
      throw new Error('No CSV rows were found.');
    }

    return rows;
  }

  private static escapeCsvValue(value: string | number) {
    const stringValue = String(value ?? '');
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }
}

import { createId } from '../../services/storage';
import { CatalogItem, Category, Tier } from '../models/types';
import { CatalogService } from './CatalogService';
import { CatalogCategoryAssignmentService } from './CatalogCategoryAssignmentService';
import { ClientLoggerService } from './ClientLoggerService';
import { ProductCatalogFoundationService } from './ProductCatalogFoundationService';
import { ManualLowesCatalogPipelineService } from './ManualLowesCatalogPipelineService';

export interface CatalogImportFailure {
  row: number;
  reason: string;
}

export interface CatalogImportResult {
  importedCount: number;
  failedRows: CatalogImportFailure[];
  autoAssignedCount: number;
  needsReviewCount: number;
  preservedProvidedCategoryCount: number;
}

interface ParsedImportRow {
  name: string;
  vendor?: string;
  sku?: string;
  topLevelCategory?: string;
  subcategory?: string;
  equivalentGroup?: string;
  archetypeId?: string;
  tags: string[];
  functionalTags: string[];
  keywordHints: string[];
  price?: number;
  unit?: string;
  defaultQty?: number;
  defaultTier?: Tier;
  description?: string;
  notes?: string;
  imageUrl?: string;
  sourceRef?: string;
  lowesCategoryHint?: string;
  sourceConfidence?: CatalogItem['sourceConfidence'];
  lastReviewedAt?: string;
  packSize?: number;
  coverage?: string;
  importSource: CatalogItem['importSource'];
}

const LEGACY_CSV_HEADERS = [
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

const IMPORT_HEADER_ALIASES = {
  title: ['title', 'name'],
  vendor: ['vendor', 'brand'],
  sku: ['sku'],
  category: ['category'],
  topLevelCategory: ['topLevelCategory', 'top_level_category', 'topLevel'],
  subcategory: ['subcategory', 'sub_category', 'subCategory'],
  equivalentGroup: ['equivalentGroup', 'equivalent_group'],
  archetypeId: ['archetype_id', 'archetypeId'],
  functionalTags: ['functionalTags', 'functional_tags'],
  tags: ['tags'],
  price: ['price', 'estimated_unit_cost', 'estimatedUnitCost'],
  unit: ['unit', 'unit_type', 'unitType'],
  defaultQty: ['defaultQty', 'default_qty'],
  defaultTier: ['defaultTier', 'default_tier', 'tier'],
  description: ['description'],
  notes: ['notes'],
  categoryHint: ['category_hint', 'categoryHint'],
  keywordHints: ['keyword_hints', 'keywordHints'],
  lowesCategoryHint: ['lowes_category_hint', 'lowesCategoryHint'],
  lowesUrl: ['lowes_url', 'lowesUrl', 'sourceRef'],
  imageUrl: ['image_url', 'imageUrl'],
  confidence: ['confidence', 'source_confidence'],
  source: ['source', 'importSource'],
  lastReviewedAt: ['last_reviewed_at', 'lastReviewedAt'],
  packSize: ['pack_size', 'packSize'],
  coverage: ['coverage'],
} as const;

type CsvAliasKey = keyof typeof IMPORT_HEADER_ALIASES;
type NormalizedCsvRecord = Record<string, string>;

export class CatalogImportService {
  static getCsvTemplate() {
    return ManualLowesCatalogPipelineService.getCsvTemplate();
  }

  static getLegacyCsvTemplate() {
    return [
      LEGACY_CSV_HEADERS.join(','),
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
    const headers = ManualLowesCatalogPipelineService.getCsvHeaders();
    const rows = items.map((item) =>
      [
        item.title,
        item.categoryName || [item.topLevelCategory, item.subcategory].filter(Boolean).join(' > '),
        (item.tags || []).join(','),
        item.notes || item.description || '',
        item.archetypeId || item.equivalentGroup || '',
        this.tierToImportValue(item.defaultTier),
        item.sourceRef || item.options?.[0]?.url || '',
        item.imageUrl || item.options?.[0]?.imageUrl || '',
        item.unit || '',
        item.packSize ?? item.options?.[0]?.packSize ?? '',
        item.coverage || item.options?.[0]?.coverage || '',
        item.options?.[0]?.price ?? item.defaultPrice ?? '',
        [item.topLevelCategory, item.subcategory].filter(Boolean).join(' > '),
        (item.keywordHints || []).join(','),
        item.lowesCategoryHint || '',
        item.sourceConfidence || 'medium',
        item.importSource || 'manual',
        item.lastReviewedAt || '',
      ]
        .map((value) => this.escapeCsvValue(value))
        .join(','),
    );

    return [headers.join(','), ...rows].join('\n');
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
      const parsedRows = rows.slice(1).map((row, index) => this.mapCsvRow(rows[0], row, index + 2));
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
    const ensuredCategories = await ProductCatalogFoundationService.ensureDefaultCategories(orgId);
    const resolution = await CatalogCategoryAssignmentService.resolveAssignment(
      {
        orgId,
        title: row.name,
        description: row.description,
        vendor: row.vendor,
        tags: [...row.tags, ...row.keywordHints, ...(row.lowesCategoryHint ? [row.lowesCategoryHint] : [])],
        functionalTags: row.functionalTags,
        topLevelCategory: row.topLevelCategory,
        subcategory: row.subcategory,
      },
      ensuredCategories.length > 0 ? ensuredCategories : categories
    );

    return CatalogService.addItem(
      orgId,
      this.buildCatalogItem(row, resolution.categoryId, resolution.categoryName, resolution.assignment)
    );
  }

  private static async persistRows(
    orgId: string,
    rows: Array<ParsedImportRow & { rowNumber: number }>,
    categories: Category[],
  ): Promise<CatalogImportResult> {
    const ensuredCategories = await ProductCatalogFoundationService.ensureDefaultCategories(orgId);
    const failedRows: CatalogImportFailure[] = [];
    let importedCount = 0;
    let autoAssignedCount = 0;
    let needsReviewCount = 0;
    let preservedProvidedCategoryCount = 0;

    for (const row of rows) {
      if (!row.name.trim()) {
        failedRows.push({ row: row.rowNumber, reason: 'Name is required.' });
        continue;
      }

      try {
        const resolution = await CatalogCategoryAssignmentService.resolveAssignment(
          {
            orgId,
            title: row.name,
            description: row.description,
            vendor: row.vendor,
            tags: [...row.tags, ...row.keywordHints, ...(row.lowesCategoryHint ? [row.lowesCategoryHint] : [])],
            functionalTags: row.functionalTags,
            topLevelCategory: row.topLevelCategory,
            subcategory: row.subcategory,
          },
          ensuredCategories.length > 0 ? ensuredCategories : categories
        );

        await CatalogService.addItem(
          orgId,
          this.buildCatalogItem(row, resolution.categoryId, resolution.categoryName, resolution.assignment)
        );
        importedCount += 1;
        if (
          resolution.assignment.assignmentMethod === 'provided_exact' ||
          resolution.assignment.assignmentMethod === 'provided_alias'
        ) {
          preservedProvidedCategoryCount += 1;
        } else {
          autoAssignedCount += 1;
        }
        if (resolution.assignment.needsReview) {
          needsReviewCount += 1;
        }
      } catch (error) {
        failedRows.push({
          row: row.rowNumber,
          reason: error instanceof Error ? error.message : 'Unknown import error.',
        });
      }
    }

    return { importedCount, failedRows, autoAssignedCount, needsReviewCount, preservedProvidedCategoryCount };
  }

  private static buildCatalogItem(
    row: ParsedImportRow,
    categoryId?: string,
    resolvedCategoryName?: string,
    categoryAssignment?: CatalogItem['categoryAssignment']
  ): Omit<CatalogItem, 'id' | 'orgId' | 'createdAt' | 'updatedAt'> {
    return {
      title: row.name,
      normalizedTitle: row.name.trim().toLowerCase(),
      name: row.name,
      categoryId,
      categoryName: resolvedCategoryName || row.subcategory || row.topLevelCategory,
      topLevelCategory: row.topLevelCategory,
      subcategory: row.subcategory,
      equivalentGroup: row.equivalentGroup || row.archetypeId,
      archetypeId: row.archetypeId || row.equivalentGroup,
      functionalTags: row.functionalTags,
      vendor: row.vendor,
      importSource: row.importSource,
      sourceRef: row.sourceRef,
      imageUrl: row.imageUrl,
      categoryAssignment,
      description: row.description || '',
      notes: row.notes,
      keywordHints: row.keywordHints,
      lowesCategoryHint: row.lowesCategoryHint,
      sourceConfidence: row.sourceConfidence,
      lastReviewedAt: row.lastReviewedAt,
      packSize: row.packSize,
      coverage: row.coverage,
      defaultPrice: row.price,
      tags: Array.from(
        new Set(
          [
            ...(row.tags || []),
            ...(row.keywordHints || []),
            ...(row.functionalTags || []),
            row.lowesCategoryHint || '',
            row.archetypeId ? `archetype:${row.archetypeId}` : '',
            row.defaultTier ? `tier:${this.tierToImportValue(row.defaultTier)}` : '',
            row.vendor ? `vendor:${row.vendor.toLowerCase().replace(/\s+/g, '_')}` : '',
          ].filter(Boolean)
        )
      ),
      defaultQty: row.defaultQty || 1,
      unit: row.unit || 'ea',
      defaultTier: row.defaultTier || Tier.STANDARD,
      isActive: true,
      options: [
        {
          id: createId(),
          name: row.name,
          price: row.price || 0,
          sku: row.sku || '',
          tier: row.defaultTier || Tier.STANDARD,
          brand: row.vendor,
          url: row.sourceRef,
          imageUrl: row.imageUrl,
          packSize: row.packSize,
          coverage: row.coverage,
        },
      ],
    };
  }

  private static mapCsvRow(headerRow: string[], row: string[], rowNumber: number) {
    const record = this.normalizeCsvRecord(headerRow, row);
    const categoryPath = this.resolveCategoryPath(record);
    const [topLevelCategory, subcategory] = this.parseCategoryPath(categoryPath);
    const unit = this.getRecordValue(record, 'unit').trim() || undefined;
    const packSize = this.parseNumber(this.getRecordValue(record, 'packSize'));
    const defaultQty = this.parseNumber(this.getRecordValue(record, 'defaultQty'));

    return {
      rowNumber,
      name: this.getRecordValue(record, 'title').trim(),
      vendor: this.getRecordValue(record, 'vendor').trim() || undefined,
      sku: this.getRecordValue(record, 'sku').trim() || undefined,
      topLevelCategory,
      subcategory,
      equivalentGroup: this.getRecordValue(record, 'equivalentGroup').trim() || this.getRecordValue(record, 'archetypeId').trim() || undefined,
      archetypeId: this.getRecordValue(record, 'archetypeId').trim() || this.getRecordValue(record, 'equivalentGroup').trim() || undefined,
      tags: this.parseTags(this.getRecordValue(record, 'tags')),
      functionalTags: this.parseTags(this.getRecordValue(record, 'functionalTags')),
      keywordHints: this.parseTags(this.getRecordValue(record, 'keywordHints')),
      price: this.parseNumber(this.getRecordValue(record, 'price')),
      unit,
      defaultQty:
        defaultQty ??
        (packSize && unit && ['pack', 'case', 'box'].includes(unit.toLowerCase()) ? packSize : undefined),
      defaultTier: this.parseTier(this.getRecordValue(record, 'defaultTier')),
      description: this.getRecordValue(record, 'description').trim() || undefined,
      notes: this.getRecordValue(record, 'notes').trim() || undefined,
      imageUrl: this.getRecordValue(record, 'imageUrl').trim() || undefined,
      sourceRef: this.getRecordValue(record, 'lowesUrl').trim() || undefined,
      lowesCategoryHint: this.getRecordValue(record, 'lowesCategoryHint').trim() || undefined,
      sourceConfidence: this.parseConfidence(this.getRecordValue(record, 'confidence')),
      lastReviewedAt: this.getRecordValue(record, 'lastReviewedAt').trim() || undefined,
      packSize,
      coverage: this.getRecordValue(record, 'coverage').trim() || undefined,
      importSource: this.parseImportSource(this.getRecordValue(record, 'source')),
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
      archetypeId: equivalentGroup || undefined,
      tags: this.parseTags(functionalTags),
      functionalTags: this.parseTags(functionalTags),
      keywordHints: [],
      price: price ? Number(price) : undefined,
      defaultTier: Tier.STANDARD,
      unit: 'ea',
      defaultQty: 1,
      description: undefined,
      notes: undefined,
      imageUrl: undefined,
      sourceRef: undefined,
      lowesCategoryHint: undefined,
      sourceConfidence: undefined,
      lastReviewedAt: undefined,
      packSize: undefined,
      coverage: undefined,
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

  private static parseNumber(value?: string) {
    const normalized = (value || '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private static parseConfidence(value?: string): CatalogItem['sourceConfidence'] | undefined {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }
    return undefined;
  }

  private static parseImportSource(value?: string): CatalogItem['importSource'] {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === 'manual_lowes') return 'manual_lowes';
    if (normalized === 'text_paste') return 'text_paste';
    if (normalized === 'quick_add') return 'quick_add';
    if (normalized === 'quote_pdf') return 'quote_pdf';
    return 'csv';
  }

  private static normalizeHeader(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private static normalizeCsvRecord(headerRow: string[], row: string[]): NormalizedCsvRecord {
    const record: NormalizedCsvRecord = {};
    headerRow.forEach((header, index) => {
      record[this.normalizeHeader(header)] = row[index] || '';
    });
    return record;
  }

  private static getRecordValue(record: NormalizedCsvRecord, key: CsvAliasKey) {
    const aliases = IMPORT_HEADER_ALIASES[key] || [];
    for (const alias of aliases) {
      const normalizedAlias = this.normalizeHeader(alias);
      if (normalizedAlias in record) {
        return record[normalizedAlias] || '';
      }
    }
    return '';
  }

  private static resolveCategoryPath(record: NormalizedCsvRecord) {
    const category = this.getRecordValue(record, 'category').trim();
    const topLevelCategory = this.getRecordValue(record, 'topLevelCategory').trim();
    const subcategory = this.getRecordValue(record, 'subcategory').trim();
    const categoryHint = this.getRecordValue(record, 'categoryHint').trim();

    if (category) return category;
    if (topLevelCategory || subcategory) {
      return [topLevelCategory, subcategory].filter(Boolean).join(' > ');
    }
    return categoryHint;
  }

  private static parseCategoryPath(path?: string): [string | undefined, string | undefined] {
    const normalized = (path || '').trim();
    if (!normalized) return [undefined, undefined];

    const parts = normalized
      .split('>')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      return [parts[0], parts.slice(1).join(' > ')];
    }

    return [parts[0], undefined];
  }

  private static tierToImportValue(value?: Tier) {
    if (value === Tier.BUDGET) return 'budget';
    if (value === Tier.PREMIUM) return 'premium';
    return 'standard';
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

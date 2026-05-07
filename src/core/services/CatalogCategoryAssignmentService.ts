import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import {
  CatalogCategoryAssignment,
  CatalogCategoryCorrectionMemory,
  CatalogCategoryAssignmentMethod,
  Category,
} from '../models/types';
import { createId } from '../../services/storage';

const adapter = createLocalDbAdapter();

export interface CatalogCategoryResolutionInput {
  orgId: string;
  title: string;
  description?: string;
  vendor?: string;
  tags?: string[];
  functionalTags?: string[];
  topLevelCategory?: string;
  subcategory?: string;
}

export interface CatalogCategoryResolutionResult {
  categoryId?: string;
  categoryName?: string;
  assignment: CatalogCategoryAssignment;
}

type ScoredCategoryMatch = {
  category: Category;
  score: number;
  matchedSignals: string[];
  method: CatalogCategoryAssignmentMethod;
};

const UNCATEGORIZED_CATEGORY_NAME = 'Uncategorized / Needs Review';

const normalize = (value?: string | null) =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value?: string | null) =>
  normalize(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

const createPathVariants = (topLevelCategory?: string, subcategory?: string) => {
  const variants = new Set<string>();
  const parent = normalize(topLevelCategory);
  const child = normalize(subcategory);
  if (parent && child) {
    variants.add(`${parent} > ${child}`);
    variants.add(`${parent}/${child}`);
    variants.add(`${parent} ${child}`);
  }
  if (parent) variants.add(parent);
  if (child) variants.add(child);
  return Array.from(variants).filter(Boolean);
};

const createTitleFingerprint = (title: string) => {
  const tokens = tokenize(title).filter(
    (token) => !/^\d+$/.test(token) && token.length > 2
  );
  return tokens.slice(0, 5).join(' ');
};

const getCategorySignals = (category: Category, categories: Category[]) => {
  const parent =
    category.parentId != null
      ? categories.find((entry) => entry.id === category.parentId)
      : undefined;
  const pathSignals = [
    category.name,
    category.path,
    parent ? `${parent.name} > ${category.name}` : undefined,
  ]
    .map((entry) => normalize(entry))
    .filter(Boolean);

  const directSignals = [
    ...(category.aliases || []),
    ...(category.keywordHints || []),
    ...(category.lowesCategoryHints || []),
  ]
    .map((entry) => normalize(entry))
    .filter(Boolean);

  return Array.from(new Set([...pathSignals, ...directSignals]));
};

const getExactCategorySignals = (category: Category, categories: Category[]) => {
  const parent =
    category.parentId != null
      ? categories.find((entry) => entry.id === category.parentId)
      : undefined;
  return [
    normalize(category.name),
    normalize(category.path),
    parent ? normalize(`${parent.name} > ${category.name}`) : undefined,
  ].filter(Boolean) as string[];
};

export class CatalogCategoryAssignmentService {
  private static getMemoryKey(orgId: string) {
    return `unitflip_catalog_category_memory_v1:${orgId}`;
  }

  static async getCorrectionMemory(orgId: string): Promise<CatalogCategoryCorrectionMemory[]> {
    const stored = await adapter.getItem<CatalogCategoryCorrectionMemory[]>(this.getMemoryKey(orgId));
    return (stored || []).map((entry) => ({
      ...entry,
      createdAt:
        typeof entry.createdAt === 'number' ? new Date(entry.createdAt).toISOString() : entry.createdAt,
      updatedAt:
        typeof entry.updatedAt === 'number' ? new Date(entry.updatedAt).toISOString() : entry.updatedAt,
    }));
  }

  static async rememberCorrection(
    orgId: string,
    params: {
      categoryId: string;
      categoryName?: string;
      sourceCategoryPath?: string;
      sourceTitleFingerprint?: string;
      createdBy?: string;
      notes?: string;
    }
  ): Promise<CatalogCategoryCorrectionMemory[]> {
    const existing = await this.getCorrectionMemory(orgId);
    const now = new Date().toISOString();
    const updates: CatalogCategoryCorrectionMemory[] = [...existing];

    ([
      params.sourceCategoryPath
        ? { matchType: 'category_path' as const, matchValue: normalize(params.sourceCategoryPath) }
        : null,
      params.sourceTitleFingerprint
        ? { matchType: 'title_fingerprint' as const, matchValue: normalize(params.sourceTitleFingerprint) }
        : null,
    ].filter(Boolean) as Array<{ matchType: 'category_path' | 'title_fingerprint'; matchValue: string }>).forEach(
      (candidate) => {
        if (!candidate.matchValue) return;
        const existingIndex = updates.findIndex(
          (entry) => entry.matchType === candidate.matchType && entry.matchValue === candidate.matchValue
        );

        const payload: CatalogCategoryCorrectionMemory = {
          id: existingIndex >= 0 ? updates[existingIndex].id : createId(),
          orgId,
          matchType: candidate.matchType,
          matchValue: candidate.matchValue,
          categoryId: params.categoryId,
          categoryName: params.categoryName,
          createdAt: existingIndex >= 0 ? updates[existingIndex].createdAt : now,
          updatedAt: now,
          createdBy: params.createdBy,
          notes: params.notes,
        };

        if (existingIndex >= 0) {
          updates[existingIndex] = payload;
        } else {
          updates.unshift(payload);
        }
      }
    );

    await adapter.setItem(this.getMemoryKey(orgId), updates);
    return updates;
  }

  static async clearCorrectionMemory(
    orgId: string,
    options: { noteIncludes?: string } = {}
  ): Promise<void> {
    if (!options.noteIncludes) {
      await adapter.setItem(this.getMemoryKey(orgId), []);
      return;
    }

    const existing = await this.getCorrectionMemory(orgId);
    const filtered = existing.filter(
      (entry) => !(entry.notes || '').includes(options.noteIncludes || '')
    );
    await adapter.setItem(this.getMemoryKey(orgId), filtered);
  }

  static async resolveAssignment(
    input: CatalogCategoryResolutionInput,
    categories: Category[]
  ): Promise<CatalogCategoryResolutionResult> {
    const activeCategories = categories.filter((entry) => entry.isActive !== false);
    const uncategorizedCategory =
      activeCategories.find((entry) => normalize(entry.name) === normalize(UNCATEGORIZED_CATEGORY_NAME)) ||
      activeCategories.find((entry) => !entry.parentId && normalize(entry.name).includes('uncategorized'));

    const providedPathVariants = createPathVariants(input.topLevelCategory, input.subcategory);
    const titleFingerprint = createTitleFingerprint(input.title);

    const exactMatch = this.findExactCategoryMatch(activeCategories, categories, providedPathVariants);
    if (exactMatch) {
      return {
        categoryId: exactMatch.category.id,
        categoryName: exactMatch.category.name,
        assignment: this.buildAssignment(exactMatch, false, providedPathVariants[0], titleFingerprint),
      };
    }

    const aliasMatch = this.findAliasCategoryMatch(activeCategories, categories, providedPathVariants);
    if (aliasMatch) {
      return {
        categoryId: aliasMatch.category.id,
        categoryName: aliasMatch.category.name,
        assignment: this.buildAssignment(aliasMatch, false, providedPathVariants[0], titleFingerprint),
      };
    }

    const memoryMatch = await this.findOrgMemoryMatch(input.orgId, activeCategories, providedPathVariants, titleFingerprint);
    if (memoryMatch) {
      return {
        categoryId: memoryMatch.category.id,
        categoryName: memoryMatch.category.name,
        assignment: this.buildAssignment(memoryMatch, false, providedPathVariants[0], titleFingerprint),
      };
    }

    const heuristicMatch = this.findHeuristicCategoryMatch(input, activeCategories, categories);
    if (heuristicMatch) {
      const needsReview = heuristicMatch.score < 78;
      return {
        categoryId: heuristicMatch.category.id,
        categoryName: heuristicMatch.category.name,
        assignment: this.buildAssignment(heuristicMatch, needsReview, providedPathVariants[0], titleFingerprint),
      };
    }

    return {
      categoryId: uncategorizedCategory?.id,
      categoryName: uncategorizedCategory?.name,
      assignment: {
        assignedCategoryId: uncategorizedCategory?.id,
        assignmentMethod: 'fallback_uncategorized',
        confidence: 0.24,
        matchedSignals: ['No exact category, alias, org memory, or keyword heuristic matched safely.'],
        needsReview: true,
        sourceCategoryPath: providedPathVariants[0],
        sourceTitleFingerprint: titleFingerprint || undefined,
        sourceHintLabel: input.topLevelCategory || input.subcategory || input.title,
      },
    };
  }

  private static findExactCategoryMatch(
    categories: Category[],
    allCategories: Category[],
    providedPathVariants: string[]
  ): ScoredCategoryMatch | null {
    for (const provided of providedPathVariants) {
      const exact = categories.find((category) =>
        getExactCategorySignals(category, allCategories).some((signal) => signal === provided)
      );
      if (exact) {
        return {
          category: exact,
          score: 100,
          matchedSignals: [`Exact category match: ${provided}`],
          method: 'provided_exact',
        };
      }
    }
    return null;
  }

  private static findAliasCategoryMatch(
    categories: Category[],
    allCategories: Category[],
    providedPathVariants: string[]
  ): ScoredCategoryMatch | null {
    for (const provided of providedPathVariants) {
      const alias = categories.find((category) =>
        getCategorySignals(category, allCategories).some((signal) => signal === provided)
      );
      if (alias) {
        return {
          category: alias,
          score: 90,
          matchedSignals: [`Alias category match: ${provided}`],
          method: 'provided_alias',
        };
      }
    }
    return null;
  }

  private static async findOrgMemoryMatch(
    orgId: string,
    categories: Category[],
    providedPathVariants: string[],
    titleFingerprint: string
  ): Promise<ScoredCategoryMatch | null> {
    const memory = await this.getCorrectionMemory(orgId);
    const candidates = [
      ...providedPathVariants.map((value) => ({ matchType: 'category_path' as const, value: normalize(value) })),
      titleFingerprint ? { matchType: 'title_fingerprint' as const, value: normalize(titleFingerprint) } : null,
    ].filter(Boolean) as Array<{ matchType: 'category_path' | 'title_fingerprint'; value: string }>;

    for (const candidate of candidates) {
      const matchedMemory = memory.find(
        (entry) => entry.matchType === candidate.matchType && entry.matchValue === candidate.value
      );
      if (!matchedMemory) continue;
      const category = categories.find((entry) => entry.id === matchedMemory.categoryId);
      if (!category) continue;
      return {
        category,
        score: 94,
        matchedSignals: [
          candidate.matchType === 'category_path'
            ? `Org memory matched prior category path correction: ${candidate.value}`
            : `Org memory matched prior title correction: ${candidate.value}`,
        ],
        method: 'org_memory',
      };
    }

    return null;
  }

  private static findHeuristicCategoryMatch(
    input: CatalogCategoryResolutionInput,
    categories: Category[],
    allCategories: Category[]
  ): ScoredCategoryMatch | null {
    const haystack = normalize(
      [
        input.title,
        input.description,
        input.vendor,
        ...(input.tags || []),
        ...(input.functionalTags || []),
      ]
        .filter(Boolean)
        .join(' ')
    );

    if (!haystack) return null;

    const scored = categories
      .map((category) => {
        const signals = getCategorySignals(category, allCategories);
        const matchedSignals = signals.filter((signal) => haystack.includes(signal) && signal.length > 2);
        const score = matchedSignals.reduce((total, signal) => total + Math.min(signal.length * 3, 24), 0);
        return {
          category,
          score,
          matchedSignals,
          method: 'keyword_heuristic' as const,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);

    if (scored.length === 0) return null;
    const best = scored[0];
    const runnerUp = scored[1];
    if (best.score < 18) return null;
    if (runnerUp && best.score - runnerUp.score < 6) {
      return {
        ...best,
        score: 68,
        matchedSignals: [
          ...best.matchedSignals.slice(0, 3).map((signal) => `Heuristic keyword: ${signal}`),
          `Close alternate also matched ${runnerUp.category.name}; review recommended.`,
        ],
      };
    }
    return {
      ...best,
      score: Math.min(88, 60 + best.matchedSignals.length * 8),
      matchedSignals: best.matchedSignals.slice(0, 4).map((signal) => `Heuristic keyword: ${signal}`),
    };
  }

  private static buildAssignment(
    match: ScoredCategoryMatch,
    needsReview: boolean,
    sourceCategoryPath?: string,
    titleFingerprint?: string
  ): CatalogCategoryAssignment {
    return {
      assignedCategoryId: match.category.id,
      assignmentMethod: match.method,
      confidence: Number((match.score / 100).toFixed(2)),
      matchedSignals: match.matchedSignals,
      needsReview,
      sourceCategoryPath,
      sourceTitleFingerprint: titleFingerprint || undefined,
      sourceHintLabel: match.category.name,
    };
  }
}

export { UNCATEGORIZED_CATEGORY_NAME, createTitleFingerprint };

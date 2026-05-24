import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  CatalogItem,
  Category,
  Tier,
  BundleRule,
  ProductOption,
} from "../core/models/types";
import {
  Search,
  Plus,
  ChevronDown,
  X,
  Package,
  Layers,
  FolderPlus,
  Settings,
  Play,
  Copy,
  Trash2,
  MoreVertical,
  ArrowUpDown,
  Filter,
  ExternalLink,
  Image as ImageIcon,
  PlusCircle,
  MinusCircle,
  ChevronLeft,
  Edit2,
  Download,
  CheckSquare,
  Square,
  Archive,
  Tag,
  FolderInput,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// If your project uses framer-motion instead, swap this import accordingly.
// import { motion, AnimatePresence } from 'framer-motion';
import { motion, AnimatePresence } from "motion/react";

import { createId } from "../services/storage";
import { CatalogService } from "../core/services/CatalogService";
import { CategoryService } from "../core/services/CategoryService";
import { BundleRuleService } from "../core/services/BundleRuleService";
import { CatalogExportService } from "../core/services/CatalogExportService";
import {
  CatalogCategoryAssignmentService,
  createTitleFingerprint,
} from "../core/services/CatalogCategoryAssignmentService";
import { useAppContext } from "../core/hooks/useAppContext";
import { ProductEditor } from "./ProductEditor";
import { BundleManager } from "./BundleManager";
import { BundleSuggestionsModal } from "./BundleSuggestionsModal";
import { useDebouncedCallback } from "../core/hooks/useDebouncedCallback";
import { CategoryManager } from "./Categories/CategoryManager";
import { CatalogHealthPanel } from "./CatalogHealthPanel";
import { CatalogMaintenancePanel } from "./CatalogMaintenancePanel";
import { CatalogImportModal } from "./CatalogImportModal";
import { AuthPolicyService } from "../core/services/AuthPolicyService";
import {
  CatalogReviewIntelligenceService,
  CatalogReviewItemInsight,
  CatalogReviewGroupInsight,
  CatalogReviewSignalCode,
} from "../core/services/CatalogReviewIntelligenceService";

import { ImportWizard } from "./Import/ImportWizard";
import { StagingArea } from "./Import/StagingArea";
import { DuplicateReviewPanel } from "./DuplicateReviewPanel";

interface ProductManagerProps {
  selectionMode?: boolean;
  onSelect?: (item: CatalogItem) => void;
  initialCategory?: string;
}

interface CleanupScopeRow {
  id: string;
  title: string;
  tierLabel: string;
  currentCategoryLabel: string;
  proposedCategoryLabel: string;
  currentHintsLabel: string;
  proposedHintsLabel: string;
  willChangeCategory: boolean;
  willChangeHints: boolean;
}

interface CleanupScopeSummary {
  groupKey: string;
  groupLabel: string;
  siblingRows: CleanupScopeRow[];
  categoryEligibleCount: number;
  hintsEligibleCount: number;
}

interface CleanupFeedbackState {
  action: "category" | "hints";
  tone: "success" | "neutral";
  message: string;
  updatedCount: number;
  groupKey?: string;
}

type SortKey = "name" | "category" | "updatedAt";
type SortOrder = "asc" | "desc";
type QualityFilter =
  | "all"
  | "uncategorized"
  | "needs_category_review"
  | "flagged_imports"
  | "low_confidence_imports"
  | "missing_tier_groups"
  | "price_inversion_groups"
  | "duplicate_like_rows"
  | "missing_lowes_fields"
  | "missing_image"
  | "missing_item_number"
  | "missing_model_number"
  | "inactive";

const SIGNAL_META: Record<
  CatalogReviewSignalCode,
  { chipClass: string; label: string }
> = {
  low_confidence_import: {
    chipClass: "bg-amber-100 text-amber-800",
    label: "Low confidence",
  },
  weak_category_assignment: {
    chipClass: "bg-orange-100 text-orange-800",
    label: "Category review",
  },
  missing_tier_coverage: {
    chipClass: "bg-blue-100 text-blue-800",
    label: "Missing tiers",
  },
  price_inversion: {
    chipClass: "bg-rose-100 text-rose-800",
    label: "Price inversion",
  },
  duplicate_like_row: {
    chipClass: "bg-fuchsia-100 text-fuchsia-800",
    label: "Duplicate-like",
  },
  missing_lowes_source_fields: {
    chipClass: "bg-yellow-100 text-yellow-800",
    label: "Missing Lowe's fields",
  },
  mixed_group_confidence: {
    chipClass: "bg-slate-200 text-slate-700",
    label: "Mixed confidence",
  },
};

const GROUP_COMPLETION_META: Record<
  CatalogReviewGroupInsight["completionState"],
  { chipClass: string; label: string }
> = {
  clean: {
    chipClass: "bg-emerald-100 text-emerald-800",
    label: "Clean",
  },
  partially_resolved: {
    chipClass: "bg-blue-100 text-blue-800",
    label: "Almost done",
  },
  needs_review: {
    chipClass: "bg-amber-100 text-amber-800",
    label: "Needs review",
  },
  blocked: {
    chipClass: "bg-rose-100 text-rose-800",
    label: "Blocked",
  },
};

const tierRank = (tier?: Tier) => {
  if (tier === Tier.BUDGET) return 0;
  if (tier === Tier.STANDARD) return 1;
  if (tier === Tier.PREMIUM) return 2;
  return 3;
};

const formatCleanupCategoryLabel = (
  product: CatalogItem,
  categories: Category[],
  overrideCategoryId?: string,
  overrideCategoryName?: string,
) => {
  const categoryId = overrideCategoryId ?? product.categoryId;
  if (categoryId) {
    const matchedCategory = categories.find((entry) => entry.id === categoryId);
    if (matchedCategory?.path) return matchedCategory.path;
    if (matchedCategory?.name) return matchedCategory.name;
  }

  return overrideCategoryName ?? product.categoryName ?? "Uncategorized";
};

const formatCleanupHintsLabel = (keywordHints: string[], lowesCategoryHint?: string) => {
  const parts: string[] = [];
  if (keywordHints.length > 0) {
    parts.push(keywordHints.slice(0, 3).join(", "));
    if (keywordHints.length > 3) {
      parts[parts.length - 1] = `${parts[parts.length - 1]} +${keywordHints.length - 3} more`;
    }
  }
  if (lowesCategoryHint) {
    parts.push(lowesCategoryHint);
  }
  return parts.length > 0 ? parts.join(" • ") : "No review hints";
};

export const ProductManager: React.FC<ProductManagerProps> = ({
  initialCategory,
  onSelect,
  selectionMode = false,
}) => {
  const { org, role, user, permissions } = useAppContext();
  const orgId = org?.id;
  const canManageCatalog = AuthPolicyService.canManageCatalog(role, permissions);

  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bundleRules, setBundleRules] = useState<BundleRule[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | "all">(
    "all",
  );
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [selectedReviewGroup, setSelectedReviewGroup] = useState<string>("all");
  const [cleanupFeedback, setCleanupFeedback] =
    useState<CleanupFeedbackState | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );

  // Bulk Selection State
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBulkCategorizeOpen, setIsBulkCategorizeOpen] = useState(false);

  // Product Editor State
  const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);
  const [productEditorItemId, setProductEditorItemId] = useState<
    string | undefined
  >(undefined);

  // Category Manager State
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isDuplicateReviewOpen, setIsDuplicateReviewOpen] = useState(false);

  // Bundle Management State
  const [managingBundleForItem, setManagingBundleForItem] =
    useState<CatalogItem | null>(null);
  const [currentBundle, setCurrentBundle] = useState<BundleRule | null>(null);

  // Test Bundle State
  const [testBundleItem, setTestBundleItem] = useState<CatalogItem | null>(
    null,
  );
  const [testBundleRule, setTestBundleRule] = useState<BundleRule | null>(null);

  // Kebab menu state (so it actually works)
  const [openMenuForId, setOpenMenuForId] = useState<string | null>(null);

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Import State
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [isStagingAreaOpen, setIsStagingAreaOpen] = useState(false);
  const [isCatalogImportOpen, setIsCatalogImportOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [cats, items, rules] = await Promise.all([
        CategoryService.getCategories(orgId),
        CatalogService.getItems(orgId),
        BundleRuleService.getRules(orgId),
      ]);
      setCategories(cats || []);
      setProducts(items || []);
      setBundleRules(rules || []);
    } catch (error) {
      console.error("Failed to load catalog data:", error);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (initialCategory) setSelectedCategoryId(initialCategory);
  }, [initialCategory]);

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setOpenMenuForId(null);
        if (isBulkMode) setIsBulkMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBulkMode]);

  // Close kebab menu when clicking outside
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!openMenuForId) return;
      const target = e.target as Node;
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(target)
      ) {
        setOpenMenuForId(null);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [openMenuForId]);

  const reviewIntelligence = useMemo(
    () => CatalogReviewIntelligenceService.analyze(products),
    [products],
  );

  const sortedAndFilteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    let result = products.filter((p) => {
      const matchesSearch =
        !q ||
        (p.title || p.name || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q));

      let matchesCategory = true;
      if (selectedCategoryId === "all") matchesCategory = true;
      else {
        if (selectedCategoryId === "uncategorized") {
          matchesCategory =
            !p.categoryId ||
            Boolean(p.categoryAssignment?.needsReview) ||
            (p.categoryName || "").toLowerCase().includes("uncategorized");
        } else {
          // Match selected category OR any of its subcategories
          const subCategoryIds = categories
            .filter((c) => c.parentId === selectedCategoryId)
            .map((c) => c.id);
          matchesCategory =
            p.categoryId === selectedCategoryId ||
            (p.categoryId ? subCategoryIds.includes(p.categoryId) : false);
        }
      }

      let matchesQuality = true;
      if (qualityFilter === "uncategorized") matchesQuality = !p.categoryId;
      else if (qualityFilter === "needs_category_review")
        matchesQuality = Boolean(p.categoryAssignment?.needsReview);
      else if (qualityFilter === "flagged_imports")
        matchesQuality = Boolean(
          reviewIntelligence.itemInsights.get(p.id)?.isFlagged,
        );
      else if (qualityFilter === "low_confidence_imports")
        matchesQuality = Boolean(
          reviewIntelligence
            .itemInsights.get(p.id)
            ?.signals.some((signal) => signal.code === "low_confidence_import"),
        );
      else if (qualityFilter === "missing_tier_groups")
        matchesQuality = Boolean(
          reviewIntelligence
            .itemInsights.get(p.id)
            ?.signals.some((signal) => signal.code === "missing_tier_coverage"),
        );
      else if (qualityFilter === "price_inversion_groups")
        matchesQuality = Boolean(
          reviewIntelligence
            .itemInsights.get(p.id)
            ?.signals.some((signal) => signal.code === "price_inversion"),
        );
      else if (qualityFilter === "duplicate_like_rows")
        matchesQuality = Boolean(
          reviewIntelligence
            .itemInsights.get(p.id)
            ?.signals.some((signal) => signal.code === "duplicate_like_row"),
        );
      else if (qualityFilter === "missing_lowes_fields")
        matchesQuality = Boolean(
          reviewIntelligence
            .itemInsights.get(p.id)
            ?.signals.some(
              (signal) => signal.code === "missing_lowes_source_fields",
            ),
        );
      else if (qualityFilter === "missing_image")
        matchesQuality =
          !p.imageUrl && (!p.options || !p.options.some((o) => o.imageUrl));
      else if (qualityFilter === "missing_item_number")
        matchesQuality = !p.itemNumber;
      else if (qualityFilter === "missing_model_number")
        matchesQuality = !p.modelNumber;
      else if (qualityFilter === "inactive") matchesQuality = !p.isActive;

      const matchesReviewGroup =
        selectedReviewGroup === "all" ||
        reviewIntelligence.itemInsights.get(p.id)?.groupKey ===
          selectedReviewGroup;

      return matchesSearch && matchesCategory && matchesQuality && matchesReviewGroup;
    });

    const useReviewQueueOrdering =
      qualityFilter === "flagged_imports" ||
      qualityFilter === "low_confidence_imports" ||
      qualityFilter === "missing_tier_groups" ||
      qualityFilter === "price_inversion_groups" ||
      qualityFilter === "duplicate_like_rows" ||
      qualityFilter === "missing_lowes_fields" ||
      selectedReviewGroup !== "all";

    result.sort((a, b) => {
      if (useReviewQueueOrdering) {
        const aInsight = reviewIntelligence.itemInsights.get(a.id);
        const bInsight = reviewIntelligence.itemInsights.get(b.id);
        const aGroup =
          aInsight?.groupKey
            ? reviewIntelligence.groupInsights.get(aInsight.groupKey)
            : undefined;
        const bGroup =
          bInsight?.groupKey
            ? reviewIntelligence.groupInsights.get(bInsight.groupKey)
            : undefined;

        const severityDelta =
          (bInsight?.severityScore || 0) - (aInsight?.severityScore || 0);
        if (severityDelta !== 0) return severityDelta;

        const groupSeverityDelta =
          (bGroup?.severityScore || 0) - (aGroup?.severityScore || 0);
        if (groupSeverityDelta !== 0) return groupSeverityDelta;

        if (selectedReviewGroup !== "all") {
          const tierDelta = tierRank(a.defaultTier) - tierRank(b.defaultTier);
          if (tierDelta !== 0) return tierDelta;
        }
      }

      let comparison = 0;

      if (sortKey === "name") {
        comparison = (a.title || a.name || "").localeCompare(
          b.title || b.name || "",
        );
      } else if (sortKey === "category") {
        comparison = (a.categoryName || "").localeCompare(b.categoryName || "");
      } else if (sortKey === "updatedAt") {
        const aU =
          typeof a.updatedAt === "string"
            ? new Date(a.updatedAt).getTime()
            : a.updatedAt || 0;
        const bU =
          typeof b.updatedAt === "string"
            ? new Date(b.updatedAt).getTime()
            : b.updatedAt || 0;
        comparison = aU - bU;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [
    products,
    searchTerm,
    selectedCategoryId,
    categories,
    sortKey,
    sortOrder,
    qualityFilter,
    selectedReviewGroup,
    reviewIntelligence,
  ]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const flaggedImportGroups = useMemo(
    () =>
      Array.from(
        reviewIntelligence.groupInsights.values() as Iterable<CatalogReviewGroupInsight>,
      ).filter(
        (group) => group.isFlagged,
      ),
    [reviewIntelligence],
  );

  const allImportGroups = useMemo(
    () =>
      Array.from(
        reviewIntelligence.groupInsights.values() as Iterable<CatalogReviewGroupInsight>,
      ).sort((left, right) => {
        if (left.completionState !== right.completionState) {
          const rank = {
            blocked: 0,
            needs_review: 1,
            partially_resolved: 2,
            clean: 3,
          } as const;
          return rank[left.completionState] - rank[right.completionState];
        }
        return right.severityScore - left.severityScore;
      }),
    [reviewIntelligence],
  );

  const selectedProductReviewInsight = useMemo<CatalogReviewItemInsight | undefined>(
    () =>
      selectedProduct
        ? reviewIntelligence.itemInsights.get(selectedProduct.id)
        : undefined,
    [reviewIntelligence, selectedProduct],
  );

  const selectedReviewGroupInsight = useMemo(() => {
    if (selectedReviewGroup !== "all") {
      return reviewIntelligence.groupInsights.get(selectedReviewGroup);
    }
    if (selectedProductReviewInsight?.groupKey) {
      return reviewIntelligence.groupInsights.get(selectedProductReviewInsight.groupKey);
    }
    return undefined;
  }, [reviewIntelligence, selectedProductReviewInsight, selectedReviewGroup]);

  const selectedProductCleanupScope = useMemo<CleanupScopeSummary | null>(() => {
    if (!selectedProduct) return null;
    const groupKey =
      selectedProduct.archetypeId || selectedProduct.equivalentGroup;
    if (!groupKey) return null;

    const groupLabel =
      selectedProductReviewInsight?.groupLabel ||
      selectedProduct.archetypeId ||
      selectedProduct.equivalentGroup ||
      selectedProduct.title ||
      selectedProduct.name ||
      groupKey;

    const sourceKeywordHints = selectedProduct.keywordHints || [];
    const sourceLowesHint = selectedProduct.lowesCategoryHint || "";
    const sourceHintTags = Array.from(
      new Set([...(selectedProduct.tags || []), ...sourceKeywordHints]),
    );

    const siblingRows = products
      .filter(
        (product) =>
          product.id !== selectedProduct.id &&
          (product.archetypeId || product.equivalentGroup) === groupKey,
      )
      .sort((left, right) => tierRank(left.defaultTier) - tierRank(right.defaultTier))
      .map((product) => {
        const currentKeywordHints = product.keywordHints || [];
        const nextHintTags = Array.from(
          new Set([...(product.tags || []), ...sourceKeywordHints]),
        );
        const categoryChanged =
          Boolean(selectedProduct.categoryId) &&
          (product.categoryId !== selectedProduct.categoryId ||
            product.categoryName !== selectedProduct.categoryName);
        const hintsChanged =
          (sourceKeywordHints.length > 0 &&
            JSON.stringify(currentKeywordHints) !==
              JSON.stringify(sourceKeywordHints)) ||
          (!!sourceLowesHint && product.lowesCategoryHint !== sourceLowesHint) ||
          JSON.stringify(product.tags || []) !== JSON.stringify(nextHintTags);

        return {
          id: product.id,
          title: product.title || product.name || "Untitled product",
          tierLabel: product.defaultTier || Tier.STANDARD,
          currentCategoryLabel: formatCleanupCategoryLabel(product, categories),
          proposedCategoryLabel: formatCleanupCategoryLabel(
            product,
            categories,
            selectedProduct.categoryId,
            selectedProduct.categoryName,
          ),
          currentHintsLabel: formatCleanupHintsLabel(
            currentKeywordHints,
            product.lowesCategoryHint,
          ),
          proposedHintsLabel: formatCleanupHintsLabel(
            sourceKeywordHints.length > 0 ? sourceKeywordHints : currentKeywordHints,
            sourceLowesHint || product.lowesCategoryHint,
          ),
          willChangeCategory: categoryChanged,
          willChangeHints: hintsChanged,
        };
      });

    return {
      groupKey,
      groupLabel,
      siblingRows,
      categoryEligibleCount: siblingRows.filter((row) => row.willChangeCategory)
        .length,
      hintsEligibleCount: siblingRows.filter((row) => row.willChangeHints).length,
    };
  }, [categories, products, selectedProduct, selectedProductReviewInsight]);

  useEffect(() => {
    if (!cleanupFeedback) return;
    if (!selectedProductCleanupScope) return;
    if (cleanupFeedback.groupKey === selectedProductCleanupScope.groupKey) return;
    setCleanupFeedback(null);
  }, [cleanupFeedback, selectedProductCleanupScope]);

  const categoryReviewCount = useMemo(
    () => products.filter((product) => product.categoryAssignment?.needsReview).length,
    [products]
  );

  const autoCategorizedCount = useMemo(
    () =>
      products.filter(
        (product) =>
          product.importSource &&
          product.importSource !== "manual" &&
          product.categoryAssignment &&
          product.categoryAssignment.assignmentMethod !== "manual_review"
      ).length,
    [products]
  );

  const reviewQueueProducts = useMemo(
    () =>
      sortedAndFilteredProducts.filter(
        (product) => reviewIntelligence.itemInsights.get(product.id)?.isFlagged,
      ),
    [reviewIntelligence, sortedAndFilteredProducts],
  );

  const selectedReviewQueueIndex = useMemo(
    () =>
      selectedProductId
        ? reviewQueueProducts.findIndex((product) => product.id === selectedProductId)
        : -1,
    [reviewQueueProducts, selectedProductId],
  );

  const nextFlaggedProduct = useMemo(
    () =>
      selectedReviewQueueIndex >= 0
        ? reviewQueueProducts[selectedReviewQueueIndex + 1] || null
        : reviewQueueProducts[0] || null,
    [reviewQueueProducts, selectedReviewQueueIndex],
  );

  useEffect(() => {
    if (sortedAndFilteredProducts.length === 0) return;
    if (
      selectedProductId &&
      sortedAndFilteredProducts.some((product) => product.id === selectedProductId)
    ) {
      return;
    }

    const shouldAutoFocusQueue =
      qualityFilter === "flagged_imports" ||
      qualityFilter === "low_confidence_imports" ||
      qualityFilter === "missing_tier_groups" ||
      qualityFilter === "price_inversion_groups" ||
      qualityFilter === "duplicate_like_rows" ||
      qualityFilter === "missing_lowes_fields" ||
      selectedReviewGroup !== "all";

    if (shouldAutoFocusQueue) {
      setSelectedProductId(sortedAndFilteredProducts[0].id);
    }
  }, [qualityFilter, selectedProductId, selectedReviewGroup, sortedAndFilteredProducts]);

  const previousFlaggedProduct = useMemo(
    () =>
      selectedReviewQueueIndex > 0
        ? reviewQueueProducts[selectedReviewQueueIndex - 1]
        : null,
    [reviewQueueProducts, selectedReviewQueueIndex],
  );

  const debouncedUpdate = useDebouncedCallback(async (item: CatalogItem) => {
    if (!orgId) return;
    try {
      const updated = await CatalogService.updateItem(orgId, item.id, item);
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
    } catch (error) {
      console.error("Failed to autosave item:", error);
    }
  }, 400);

  const handleInspectorChange = (updates: Partial<CatalogItem>) => {
    if (!canManageCatalog) return;
    if (!selectedProduct) return;
    const updatedItem: CatalogItem = {
      ...selectedProduct,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedItem.id ? updatedItem : p)),
    );

    // Debounced persistence
    debouncedUpdate(updatedItem);
  };

  const handleAddCategory = () => {
    if (!canManageCatalog) return;
    setIsCategoryManagerOpen(true);
  };

  const handleCreateProduct = () => {
    if (!canManageCatalog) return;
    setProductEditorItemId(undefined);
    setIsProductEditorOpen(true);
  };

  const handleEditProductFull = (id: string) => {
    if (!canManageCatalog) return;
    setProductEditorItemId(id);
    setIsProductEditorOpen(true);
  };

  const handleImportClick = () => {
    if (!canManageCatalog) return;
    setIsImportWizardOpen(true);
  };

  const canRememberCategoryCorrections = canManageCatalog;

  const handleImportComplete = (batchId: string) => {
    setIsImportWizardOpen(false);
    setIsStagingAreaOpen(true);
  };

  const handleDuplicate = async (itemId: string) => {
    if (!canManageCatalog) return;
    if (!orgId) return;
    try {
      const duplicated = await CatalogService.duplicateItem(orgId, itemId);
      setProducts((prev) => [...prev, duplicated]);
      setSelectedProductId(duplicated.id);
      setOpenMenuForId(null);
    } catch (error) {
      console.error("Failed to duplicate item:", error);
      alert("Failed to duplicate item");
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!canManageCatalog) return;
    if (!orgId) return;

    setConfirmDialog({
      isOpen: true,
      title: "Delete Product",
      message:
        "Are you sure you want to delete this catalog item? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await CatalogService.deleteItem(orgId, itemId);
          setProducts((prev) => prev.filter((p) => p.id !== itemId));
          if (selectedProductId === itemId) setSelectedProductId(null);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          setOpenMenuForId(null);
        } catch (error) {
          console.error("Failed to delete item:", error);
          alert("Failed to delete item");
        }
      },
    });
  };

  const handleManageBundle = async (item: CatalogItem) => {
    if (!canManageCatalog) return;
    if (!orgId) return;
    try {
      const rule = await BundleRuleService.getRuleByTrigger(orgId, item.id);
      setCurrentBundle(rule);
      setManagingBundleForItem(item);
      setOpenMenuForId(null);
    } catch (error) {
      console.error("Failed to load bundle rule:", error);
    }
  };

  const handleTestBundle = async (item: CatalogItem) => {
    if (!canManageCatalog) return;
    if (!orgId) return;
    try {
      const rule = await BundleRuleService.getRuleByTrigger(orgId, item.id);
      if (rule && rule.enabled) {
        setTestBundleItem(item);
        setTestBundleRule(rule);
        setOpenMenuForId(null);
      } else {
        alert("No active bundle rule found for this item.");
      }
    } catch (error) {
      console.error("Failed to load bundle rule for test:", error);
    }
  };

  const handleExport = async () => {
    if (!orgId) return;
    try {
      await CatalogExportService.exportCatalogToCsv(orgId);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. See console for details.");
    }
  };

  const handleRememberCategoryCorrection = async (item: CatalogItem) => {
    if (!canManageCatalog) return;
    if (!orgId || !item.categoryId || !canRememberCategoryCorrections) return;
    const category = categories.find((entry) => entry.id === item.categoryId);
    try {
      await CatalogCategoryAssignmentService.rememberCorrection(orgId, {
        categoryId: item.categoryId,
        categoryName: category?.name || item.categoryName,
        sourceCategoryPath: item.categoryAssignment?.sourceCategoryPath,
        sourceTitleFingerprint:
          item.categoryAssignment?.sourceTitleFingerprint ||
          createTitleFingerprint(item.title || item.name || ""),
        createdBy: user?.id,
        notes: "Remembered from Product Manager category review.",
      });

      const updated = await CatalogService.updateItem(orgId, item.id, {
        categoryAssignment: {
          ...(item.categoryAssignment || {
            assignmentMethod: "manual_review",
            confidence: 1,
            matchedSignals: [],
            needsReview: false,
          }),
          assignedCategoryId: item.categoryId,
          assignmentMethod: "manual_review",
          confidence: 1,
          matchedSignals: [
            "Category confirmed manually and saved as org-specific correction memory.",
          ],
          needsReview: false,
          reviewedAt: new Date().toISOString(),
          reviewedBy: user?.id || "system",
        },
        updatedBy: user?.id || "system",
      });

      setProducts((prev) =>
        prev.map((product) => (product.id === updated.id ? updated : product))
      );
    } catch (error) {
      console.error("Failed to remember category correction:", error);
      alert("Failed to save category correction memory.");
    }
  };

  const handleApplyCategoryToSiblingTiers = async (item: CatalogItem) => {
    if (!canManageCatalog) return;
    if (!orgId || !item.categoryId) return;
    const groupKey = item.archetypeId || item.equivalentGroup;
    if (!groupKey) return;

    const siblings = products.filter(
      (product) =>
        product.id !== item.id &&
        (product.archetypeId || product.equivalentGroup) === groupKey,
    );
    const eligibleSiblings = siblings.filter(
      (sibling) =>
        sibling.categoryId !== item.categoryId ||
        sibling.categoryName !== item.categoryName,
    );

    if (eligibleSiblings.length === 0) {
      setCleanupFeedback({
        action: "category",
        tone: "neutral",
        message: "Sibling tiers already share this reviewed category.",
        updatedCount: 0,
        groupKey,
      });
      return;
    }

    try {
      const category = categories.find((entry) => entry.id === item.categoryId);
      const updates = await Promise.all(
        eligibleSiblings.map((sibling) =>
          CatalogService.updateItem(orgId, sibling.id, {
            categoryId: item.categoryId,
            categoryName: category?.name || item.categoryName,
            updatedBy: user?.id || "system",
          }),
        ),
      );
      setProducts((prev) =>
        prev.map((product) =>
          updates.find((update) => update.id === product.id) || product,
        ),
      );
      setCleanupFeedback({
        action: "category",
        tone: "success",
        message: `Applied category changes to ${updates.length} sibling ${updates.length === 1 ? "tier" : "tiers"} in the current archetype group.`,
        updatedCount: updates.length,
        groupKey,
      });
    } catch (error) {
      console.error("Failed to apply category to sibling tiers:", error);
      alert("Failed to copy category to sibling tiers.");
    }
  };

  const handleReviewQueueNavigation = useCallback(
    (direction: "next" | "previous") => {
      const target =
        direction === "next" ? nextFlaggedProduct : previousFlaggedProduct;
      if (!target) return;
      setSelectedProductId(target.id);
    },
    [nextFlaggedProduct, previousFlaggedProduct],
  );

  useEffect(() => {
    const queueReviewActive =
      qualityFilter === "flagged_imports" ||
      qualityFilter === "low_confidence_imports" ||
      qualityFilter === "missing_tier_groups" ||
      qualityFilter === "price_inversion_groups" ||
      qualityFilter === "duplicate_like_rows" ||
      qualityFilter === "missing_lowes_fields" ||
      selectedReviewGroup !== "all";

    if (!queueReviewActive) return;

    const handleQueueKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        handleReviewQueueNavigation("next");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        handleReviewQueueNavigation("previous");
      }
    };

    window.addEventListener("keydown", handleQueueKeyDown);
    return () => window.removeEventListener("keydown", handleQueueKeyDown);
  }, [handleReviewQueueNavigation, qualityFilter, selectedReviewGroup]);

  const handleCopyHintsToSiblingTiers = async (item: CatalogItem) => {
    if (!canManageCatalog) return;
    if (!orgId) return;
    const groupKey = item.archetypeId || item.equivalentGroup;
    if (!groupKey) return;
    const sourceKeywordHints =
      item.keywordHints && item.keywordHints.length > 0 ? item.keywordHints : [];
    const sourceLowesCategoryHint = item.lowesCategoryHint || "";
    const siblings = products.filter(
      (product) =>
        product.id !== item.id &&
        (product.archetypeId || product.equivalentGroup) === groupKey,
    );
    const eligibleSiblings = siblings.filter((sibling) => {
      const nextTags = Array.from(
        new Set([...(sibling.tags || []), ...sourceKeywordHints]),
      );
      return (
        (sourceKeywordHints.length > 0 &&
          JSON.stringify(sibling.keywordHints || []) !==
            JSON.stringify(sourceKeywordHints)) ||
        (!!sourceLowesCategoryHint &&
          sibling.lowesCategoryHint !== sourceLowesCategoryHint) ||
        JSON.stringify(sibling.tags || []) !== JSON.stringify(nextTags)
      );
    });

    if (eligibleSiblings.length === 0) {
      setCleanupFeedback({
        action: "hints",
        tone: "neutral",
        message: "Sibling tiers already have these review hints and tags.",
        updatedCount: 0,
        groupKey,
      });
      return;
    }

    try {
      const updates = await Promise.all(
        eligibleSiblings.map((sibling) =>
          CatalogService.updateItem(orgId, sibling.id, {
            keywordHints:
              sourceKeywordHints.length > 0
                ? sourceKeywordHints
                : sibling.keywordHints,
            lowesCategoryHint:
              sourceLowesCategoryHint || sibling.lowesCategoryHint,
            tags: Array.from(
              new Set([...(sibling.tags || []), ...sourceKeywordHints]),
            ),
            updatedBy: user?.id || "system",
          }),
        ),
      );
      setProducts((prev) =>
        prev.map((product) =>
          updates.find((update) => update.id === product.id) || product,
        ),
      );
      setCleanupFeedback({
        action: "hints",
        tone: "success",
        message: `Copied hint changes to ${updates.length} sibling ${updates.length === 1 ? "tier" : "tiers"} in the current archetype group.`,
        updatedCount: updates.length,
        groupKey,
      });
    } catch (error) {
      console.error("Failed to copy hints to sibling tiers:", error);
      alert("Failed to copy hints to sibling tiers.");
    }
  };

  const toggleBulkMode = () => {
    setIsBulkMode(!isBulkMode);
    setSelectedItems(new Set());
  };

  const toggleItemSelection = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };

  const handleBulkAction = async (
    action: "activate" | "deactivate" | "delete" | "categorize",
  ) => {
    if (!orgId || selectedItems.size === 0) return;

    if (action === "categorize") {
      setIsBulkCategorizeOpen(true);
      return;
    }

    if (action === "delete") {
      if (
        !confirm(
          `Are you sure you want to delete ${selectedItems.size} items? This action cannot be undone.`,
        )
      )
        return;
    }

    if (action === "deactivate") {
      if (
        !confirm(
          `Are you sure you want to deactivate ${selectedItems.size} items?`,
        )
      )
        return;
    }

    if (action === "activate") {
      if (
        !confirm(
          `Are you sure you want to activate ${selectedItems.size} items?`,
        )
      )
        return;
    }

    setIsProcessing(true);
    try {
      const updates = Array.from(selectedItems).map(async (id: string) => {
        if (action === "activate")
          return CatalogService.updateItem(orgId, id, { isActive: true });
        if (action === "deactivate")
          return CatalogService.updateItem(orgId, id, { isActive: false });
        if (action === "delete") return CatalogService.deleteItem(orgId, id);
      });

      await Promise.all(updates);
      await loadData();
      setSelectedItems(new Set());
      if (action === "delete") setIsBulkMode(false);
    } catch (err) {
      console.error("Bulk action failed", err);
      alert("Bulk action failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkCategorize = async (categoryId: string) => {
    if (!orgId || selectedItems.size === 0) return;
    setIsProcessing(true);

    try {
      const category = categories.find((c) => c.id === categoryId);
      const categoryName = category?.name;

      const updates = Array.from(selectedItems).map((id: string) =>
        CatalogService.updateItem(orgId, id, { categoryId, categoryName }),
      );

      await Promise.all(updates);
      await loadData();
      setSelectedItems(new Set());
      setIsBulkMode(false);
      setIsBulkCategorizeOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to categorize items");
    } finally {
      setIsProcessing(false);
    }
  };

  const topLevelCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-900">Product Catalog</h1>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-bold border border-slate-200">
              {sortedAndFilteredProducts.length} Items
            </span>
            {isBulkMode && (
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200 animate-in fade-in">
                {selectedItems.size} Selected
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canManageCatalog ? (
            <>
              <button
                onClick={() => setShowMaintenance(!showMaintenance)}
                className={`p-2 rounded-lg transition-colors ${showMaintenance ? "bg-slate-200 text-slate-800" : "hover:bg-slate-100 text-slate-500"}`}
                title="Maintenance Tools"
              >
                <Settings size={20} />
              </button>
              <button
                onClick={() => setIsCategoryManagerOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-bold text-sm shadow-sm"
              >
                <FolderPlus size={18} className="text-slate-400" />
                Categories
              </button>
              <button
                onClick={() => setIsCatalogImportOpen(true)}
                data-testid="product-manager-catalog-import"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-bold text-sm shadow-sm"
              >
                <FolderInput size={18} className="text-slate-400" />
                Catalog Import
              </button>
              <button
                onClick={() => {
                  setProductEditorItemId(undefined);
                  setIsProductEditorOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-lowes-blue text-white rounded-lg hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all font-bold text-sm"
              >
                <Plus size={18} />
                Add Product
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              Read-only catalog view. Admin or developer access is required to manage products.
            </div>
          )}
        </div>
      </div>

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {/* Maintenance Panel */}
        {showMaintenance && (
          <div className="animate-in slide-in-from-top-4 fade-in duration-300">
            <CatalogMaintenancePanel
              onScanComplete={() => {
                loadData();
              }}
            />
          </div>
        )}

        {/* Health Panel */}
        <CatalogHealthPanel
          onFilterRequest={(f) => setQualityFilter(f as QualityFilter)}
        />

        {(categoryReviewCount > 0 ||
          autoCategorizedCount > 0 ||
          reviewIntelligence.totals.flaggedItems > 0) && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Imported catalog review</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Imported products already land in usable categories. This review strip surfaces the flagged tail: low-confidence assignments, weak archetype tier coverage, duplicate-like picks, and missing Lowe&apos;s source fields.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">
                  {autoCategorizedCount} auto-categorized
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                  {categoryReviewCount} need review
                </span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
                  {reviewIntelligence.totals.flaggedItems} flagged imports
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Tier coverage
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {reviewIntelligence.totals.missingTierGroups} groups missing tiers
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Price logic
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {reviewIntelligence.totals.priceInversionGroups} groups with price inversion
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Duplicate picks
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {reviewIntelligence.totals.duplicateLikeItems} rows look duplicated
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Source gaps
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {reviewIntelligence.totals.missingSourceItems} manual Lowe&apos;s rows missing source fields
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Clean groups
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-900">
                  {allImportGroups.filter((group) => group.completionState === "clean").length} ready
                </div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                  Almost done
                </div>
                <div className="mt-1 text-sm font-semibold text-blue-900">
                  {allImportGroups.filter((group) => group.completionState === "partially_resolved").length} groups
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  Needs review
                </div>
                <div className="mt-1 text-sm font-semibold text-amber-900">
                  {allImportGroups.filter((group) => group.completionState === "needs_review").length} groups
                </div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                  Blocked
                </div>
                <div className="mt-1 text-sm font-semibold text-rose-900">
                  {allImportGroups.filter((group) => group.completionState === "blocked").length} groups
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setQualityFilter("flagged_imports")}
                data-testid="catalog-review-show-flagged"
                className="px-3 py-2 rounded-lg bg-lowes-blue text-white text-sm font-semibold hover:bg-lowes-hover transition-colors"
              >
                Show flagged imports
              </button>
              {flaggedImportGroups.length > 0 ? (
                <button
                  onClick={() =>
                    setSelectedReviewGroup(flaggedImportGroups[0].groupKey)
                  }
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Focus first flagged archetype
                </button>
              ) : null}
              <button
                onClick={() => setIsCatalogImportOpen(true)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Import more catalog data
              </button>
            </div>
            {flaggedImportGroups.length > 0 ? (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {flaggedImportGroups.slice(0, 4).map((group) => (
                  <button
                    key={group.groupKey}
                    type="button"
                    onClick={() => setSelectedReviewGroup(group.groupKey)}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {group.groupLabel}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {group.itemIds.length} rows • tiers {group.tiersPresent.join(", ")}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                              GROUP_COMPLETION_META[group.completionState].chipClass
                            }`}
                          >
                            {GROUP_COMPLETION_META[group.completionState].label}
                          </span>
                          {group.remainingIssueCount > 0 ? (
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">
                              {group.remainingIssueCount} issues left
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-800">
                        {group.signals.length} signals
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {group.completionMessage}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            {reviewQueueProducts.length > 0 ? (
              <div
                data-testid="catalog-review-queue-panel"
                className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Review queue
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {selectedReviewQueueIndex >= 0
                        ? `Reviewing ${selectedReviewQueueIndex + 1} of ${reviewQueueProducts.length} flagged rows`
                        : `${reviewQueueProducts.length} flagged rows ready`}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {selectedProductReviewInsight?.signals[0]?.message ||
                        nextFlaggedProduct?.title ||
                        "Focus one flagged import at a time and move through siblings without losing context."}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleReviewQueueNavigation("previous")}
                      data-testid="catalog-review-prev-flagged"
                      disabled={!previousFlaggedProduct}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous flagged
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewQueueNavigation("next")}
                      data-testid="catalog-review-next-flagged"
                      disabled={!nextFlaggedProduct}
                      className="rounded-lg bg-lowes-blue px-3 py-2 text-sm font-semibold text-white hover:bg-lowes-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedReviewQueueIndex >= 0 ? "Next flagged" : "Start queue"}
                    </button>
                  </div>
                </div>
                {selectedProductReviewInsight?.groupLabel ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-700">
                      Group: {selectedProductReviewInsight.groupLabel}
                    </span>
                    {selectedReviewGroupInsight ? (
                      <>
                        <span
                          className={`rounded-full px-2 py-1 font-semibold ${
                            GROUP_COMPLETION_META[selectedReviewGroupInsight.completionState]
                              .chipClass
                          }`}
                        >
                          {
                            GROUP_COMPLETION_META[selectedReviewGroupInsight.completionState]
                              .label
                          }
                        </span>
                        <span>{selectedReviewGroupInsight.completionMessage}</span>
                      </>
                    ) : null}
                    <span>
                      {selectedReviewQueueIndex >= 0
                        ? "Use sibling helpers in the inspector to clean this archetype in sequence."
                        : "Use archetype focus to stay inside one trio while reviewing."}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {/* Toolbar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 justify-between">
            {/* Search & Filters */}
            <div className="flex flex-1 gap-4 items-center">
              <div className="relative flex-1 max-w-md group">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-lowes-blue transition-colors"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Search products... (Ctrl+K)"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-lowes-blue focus:border-transparent transition-all outline-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  ref={searchInputRef}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-400 shadow-sm">
                    ⌘K
                  </kbd>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-lowes-blue outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="uncategorized">Uncategorized Only</option>
                  {categories
                    .filter((c) => !c.parentId)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>

                <select
                  data-testid="product-manager-quality-filter"
                  className={`px-4 py-2.5 border rounded-xl text-sm font-medium outline-none cursor-pointer transition-colors ${
                    qualityFilter !== "all"
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                  value={qualityFilter}
                  onChange={(e) =>
                    setQualityFilter(e.target.value as QualityFilter)
                  }
                >
                  <option value="all">All Quality</option>
                  <option value="flagged_imports">Flagged Imports</option>
                  <option value="low_confidence_imports">Low Confidence Imports</option>
                  <option value="missing_tier_groups">Missing Tier Groups</option>
                  <option value="price_inversion_groups">Price Inversion Groups</option>
                  <option value="duplicate_like_rows">Duplicate-like Rows</option>
                  <option value="missing_lowes_fields">Missing Lowe&apos;s Fields</option>
                  <option value="missing_image">Missing Image</option>
                  <option value="missing_item_number">Missing Item #</option>
                  <option value="missing_model_number">Missing Model #</option>
                  <option value="needs_category_review">Needs Category Review</option>
                  <option value="uncategorized">Uncategorized</option>
                  <option value="inactive">Inactive</option>
                </select>

                <select
                  data-testid="product-manager-review-group-filter"
                  className={`px-4 py-2.5 border rounded-xl text-sm font-medium outline-none cursor-pointer transition-colors ${
                    selectedReviewGroup !== "all"
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                  value={selectedReviewGroup}
                  onChange={(e) => setSelectedReviewGroup(e.target.value)}
                >
                    <option value="all">All Archetype Groups</option>
                  {allImportGroups.map((group) => (
                    <option key={group.groupKey} value={group.groupKey}>
                      {group.groupLabel} • {GROUP_COMPLETION_META[group.completionState].label}
                    </option>
                  ))}
                </select>

                {(searchTerm ||
                  selectedCategoryId !== "all" ||
                  qualityFilter !== "all" ||
                  selectedReviewGroup !== "all") && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedCategoryId("all");
                      setQualityFilter("all");
                      setSelectedReviewGroup("all");
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Clear Filters"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-px bg-slate-200 mx-2 hidden lg:block" />

              {canManageCatalog ? (
                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => setIsBulkMode(!isBulkMode)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${isBulkMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Bulk
                  </button>
                  <button
                    onClick={() => setIsDuplicateReviewOpen(true)}
                    className="px-3 py-1.5 rounded-md text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-white/50 transition-all"
                  >
                    Dedup
                  </button>
                </div>
              ) : null}

              <button
                onClick={() => CatalogExportService.exportCatalogToCsv(orgId!)}
                className="p-2.5 text-slate-500 hover:text-lowes-blue hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-100 transition-all"
                title="Export CSV"
              >
                <Download size={20} />
              </button>

              {canManageCatalog ? (
                <button
                  onClick={() => setIsImportWizardOpen(true)}
                  className="p-2.5 text-slate-500 hover:text-lowes-blue hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-100 transition-all"
                  title="Import"
                >
                  <ExternalLink size={20} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {isBulkMode && selectedItems.size > 0 && (
        <div className="px-4 pb-2 flex items-center gap-2 animate-in slide-in-from-top-2">
          <span className="text-xs font-bold text-slate-500 uppercase">
            {selectedItems.size} Selected
          </span>
          <div className="h-4 w-px bg-slate-300 mx-2" />
          <button
            onClick={() => handleBulkAction("activate")}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200 disabled:opacity-50"
          >
            Activate
          </button>
          <button
            onClick={() => handleBulkAction("deactivate")}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 disabled:opacity-50"
          >
            Deactivate
          </button>
          <button
            onClick={() => handleBulkAction("categorize")}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200 disabled:opacity-50"
          >
            Categorize
          </button>
          <button
            onClick={() => handleBulkAction("delete")}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}

      {/* Bulk Categorize Modal */}
      {isBulkCategorizeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              Categorize {selectedItems.size} Items
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
                  Select Category
                </label>
                <select
                  id="bulk-category-select"
                  className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-lowes-blue"
                >
                  <option value="">Uncategorized</option>
                  {topLevelCategories.map((c) => (
                    <React.Fragment key={c.id}>
                      <option value={c.id}>{c.name}</option>
                      {categories
                        .filter((sub) => sub.parentId === c.id)
                        .map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            &nbsp;&nbsp;{sub.name}
                          </option>
                        ))}
                    </React.Fragment>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setIsBulkCategorizeOpen(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const select = document.getElementById(
                      "bulk-category-select",
                    ) as HTMLSelectElement;
                    handleBulkCategorize(select.value);
                  }}
                  disabled={isProcessing}
                  className="px-6 py-2 bg-lowes-blue text-white font-bold rounded-lg hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all disabled:opacity-50"
                >
                  {isProcessing ? "Processing..." : "Apply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Product List */}
        <div className="flex-1 overflow-y-auto bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-white border-b border-slate-100 z-10 hidden md:table-header-group">
              <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {isBulkMode && (
                  <th className="px-4 py-3 w-10">
                    <button
                      onClick={() => {
                        if (
                          selectedItems.size ===
                          sortedAndFilteredProducts.length
                        )
                          setSelectedItems(new Set());
                        else
                          setSelectedItems(
                            new Set(sortedAndFilteredProducts.map((p) => p.id)),
                          );
                      }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {selectedItems.size ===
                        sortedAndFilteredProducts.length &&
                      sortedAndFilteredProducts.length > 0 ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Options</th>
                <th className="px-4 py-3 font-semibold">Bundles</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>

            <tbody>
              {sortedAndFilteredProducts.map((item) => {
                const rule = bundleRules.find(
                  (r) => r.triggerCatalogItemId === item.id && r.enabled,
                );
                const hasBundle = !!rule;
                const isSelected = selectedProductId === item.id;
                const isChecked = selectedItems.has(item.id);
                const reviewInsight = reviewIntelligence.itemInsights.get(item.id);
                const isFlaggedRow = Boolean(reviewInsight?.isFlagged);

                // Category display (top + sub if applicable)
                const itemCat = item.categoryId
                  ? categories.find((c) => c.id === item.categoryId)
                  : null;
                const isSub = !!itemCat?.parentId;
                const topCat = isSub
                  ? categories.find((c) => c.id === itemCat!.parentId)
                  : itemCat;
                const subCat = isSub ? itemCat : null;

                const updatedLabel = item.updatedAt
                  ? new Date(item.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "-";

                return (
                  <tr
                    key={item.id}
                    onClick={() => {
                      if (isBulkMode) toggleItemSelection(item.id);
                      else setSelectedProductId(item.id);
                    }}
                    className={`group cursor-pointer border-b border-slate-50 transition-colors ${
                      isSelected
                        ? "bg-blue-50/50"
                        : isFlaggedRow
                          ? "bg-amber-50/40 hover:bg-amber-50"
                        : isChecked
                          ? "bg-slate-50"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    {isBulkMode && (
                      <td className="px-4 py-2 md:py-3 w-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleItemSelection(item.id);
                          }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isChecked ? (
                            <CheckSquare
                              size={16}
                              className="text-lowes-blue"
                            />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-2 md:py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center border border-slate-100 overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title || item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : item.options?.[0]?.imageUrl ? (
                            <img
                              src={item.options[0].imageUrl}
                              alt={item.title || item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="text-slate-400" size={16} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className={`font-semibold text-sm truncate ${isFlaggedRow ? "text-slate-900" : "text-slate-800"}`}>
                            {item.title || item.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {item.categoryAssignment?.needsReview ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                Needs review
                              </span>
                            ) : item.categoryAssignment ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                {Math.round((item.categoryAssignment.confidence || 0) * 100)}% confidence
                              </span>
                            ) : null}
                            {item.importSource && item.importSource !== "manual" ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                {item.importSource.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {(reviewInsight?.signals || [])
                              .slice(0, 2)
                              .map((signal) => (
                                <span
                                  key={`${item.id}-${signal.code}`}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    SIGNAL_META[signal.code].chipClass
                                  }`}
                                >
                                  {SIGNAL_META[signal.code].label}
                                </span>
                              ))}
                          </div>
                          <div className={`md:hidden text-[10px] flex items-center gap-1 ${isFlaggedRow ? "text-slate-600" : "text-slate-400"}`}>
                            {topCat?.name ||
                              item.categoryName ||
                              "Uncategorized"}{" "}
                            • {(item.options || []).length} options
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-700 font-medium">
                          {topCat?.name || "Uncategorized"}
                        </span>
                        {subCat && (
                          <span className="text-[10px] text-slate-400">
                            {subCat.name}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-slate-500 font-medium">
                        {(item.options || []).length}
                      </span>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      {hasBundle ? (
                        <div className="flex items-center gap-1 text-purple-600">
                          <Layers size={14} />
                          <span className="text-xs font-bold">1</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {updatedLabel}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {selectionMode && onSelect ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(item);
                            }}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-1"
                          >
                            <PlusCircle size={14} /> Select
                          </button>
                        ) : canManageCatalog ? (
                          <div
                            ref={menuContainerRef}
                            className="relative inline-block"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuForId((prev) =>
                                  prev === item.id ? null : item.id,
                                );
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                              aria-label="Row actions"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {openMenuForId === item.id && (
                              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-30">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProductId(item.id);
                                    setOpenMenuForId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Edit2 size={14} /> Edit in Inspector
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDuplicate(item.id);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Copy size={14} /> Duplicate
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleManageBundle(item);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Settings size={14} /> Bundle Rules
                                </button>

                                {hasBundle && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTestBundle(item);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs text-emerald-600 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Play size={14} /> Test Bundle
                                  </button>
                                )}

                                <div className="my-1 border-t border-slate-100" />

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(item.id);
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sortedAndFilteredProducts.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
              <div className="p-6 bg-slate-50 rounded-full mb-4">
                <Search size={48} />
              </div>
              <p className="font-semibold text-slate-600">No products found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </div>

        {/* Inspector Panel (Desktop) */}
        <div className="hidden lg:block w-96 border-l border-slate-100 bg-slate-50/50 overflow-y-auto">
          {selectedProduct ? (
            <ProductInspector
              product={selectedProduct}
              categories={categories}
              onChange={handleInspectorChange}
              onDuplicate={() => handleDuplicate(selectedProduct.id)}
              onDelete={() => handleDelete(selectedProduct.id)}
              onManageBundle={() => handleManageBundle(selectedProduct)}
              onTestBundle={() => handleTestBundle(selectedProduct)}
              hasBundle={bundleRules.some(
                (r) =>
                  r.triggerCatalogItemId === selectedProduct.id && r.enabled,
              )}
              isReadOnly={!canManageCatalog}
              reviewInsight={selectedProductReviewInsight}
              reviewGroupInsight={selectedReviewGroupInsight}
              cleanupScope={selectedProductCleanupScope}
              cleanupFeedback={cleanupFeedback}
              onEditFull={() => handleEditProductFull(selectedProduct.id)}
              onRememberCategoryCorrection={() =>
                handleRememberCategoryCorrection(selectedProduct)
              }
              onFocusReviewGroup={(groupKey) => setSelectedReviewGroup(groupKey)}
              onApplyCategoryToSiblingTiers={handleApplyCategoryToSiblingTiers}
              onCopyHintsToSiblingTiers={handleCopyHintsToSiblingTiers}
              canRememberCategoryCorrections={canRememberCategoryCorrections}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                <Edit2 size={32} />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">
                Select a product to edit
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Pick a product from the list to view and modify its details.
              </p>
              <button
                onClick={handleCreateProduct}
                disabled={!canManageCatalog}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all shadow-sm"
              >
                Create New Product
              </button>
            </div>
          )}
        </div>

        {/* Mobile Inspector (Slide-over) */}
        <AnimatePresence>
          {selectedProductId && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="lg:hidden fixed inset-0 z-50 bg-white flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <button
                  onClick={() => setSelectedProductId(null)}
                  className="p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg flex items-center gap-1 text-sm font-medium"
                >
                  <ChevronLeft size={20} /> Back
                </button>
                <div className="flex items-center gap-2">
                  {canManageCatalog ? (
                    <>
                      <button
                        onClick={() => handleDuplicate(selectedProductId)}
                        className="p-2 text-slate-400 hover:text-slate-600"
                      >
                        <Copy size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(selectedProductId)}
                        className="p-2 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50/50">
                {selectedProduct && (
                  <ProductInspector
                    product={selectedProduct}
                    categories={categories}
                    onChange={handleInspectorChange}
                    onDuplicate={() => handleDuplicate(selectedProduct.id)}
                    onDelete={() => handleDelete(selectedProduct.id)}
                    onManageBundle={() => handleManageBundle(selectedProduct)}
                    onTestBundle={() => handleTestBundle(selectedProduct)}
                    hasBundle={bundleRules.some(
                      (r) =>
                        r.triggerCatalogItemId === selectedProduct.id &&
                        r.enabled,
                    )}
                    isReadOnly={!canManageCatalog}
                    reviewInsight={selectedProductReviewInsight}
                    reviewGroupInsight={selectedReviewGroupInsight}
                    cleanupScope={selectedProductCleanupScope}
                    cleanupFeedback={cleanupFeedback}
                    onEditFull={() => handleEditProductFull(selectedProduct.id)}
                    onRememberCategoryCorrection={() =>
                      handleRememberCategoryCorrection(selectedProduct)
                    }
                    onFocusReviewGroup={(groupKey) =>
                      setSelectedReviewGroup(groupKey)
                    }
                    onApplyCategoryToSiblingTiers={handleApplyCategoryToSiblingTiers}
                    onCopyHintsToSiblingTiers={handleCopyHintsToSiblingTiers}
                    canRememberCategoryCorrections={canRememberCategoryCorrections}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Category Manager */}
      {isCategoryManagerOpen && (
        <CategoryManager
          onClose={() => {
            setIsCategoryManagerOpen(false);
            loadData(); // Reload categories
          }}
        />
      )}

      {/* Product Editor Modal */}
      {isProductEditorOpen && (
        <ProductEditor
          itemId={productEditorItemId}
          categories={categories}
          onSave={() => {
            loadData();
            // If editing selected product, reload it
            if (productEditorItemId === selectedProductId) {
              // loadData updates products list, selectedProduct is derived from it
            }
          }}
          onClose={() => setIsProductEditorOpen(false)}
        />
      )}

      {/* Duplicate Review Panel */}
      {isDuplicateReviewOpen && (
        <DuplicateReviewPanel onClose={() => setIsDuplicateReviewOpen(false)} />
      )}

      {/* Import Wizard */}
      {isImportWizardOpen && (
        <ImportWizard
          onClose={() => setIsImportWizardOpen(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {/* Staging Area */}
      {isStagingAreaOpen && (
        <StagingArea onClose={() => setIsStagingAreaOpen(false)} />
      )}

      {isCatalogImportOpen && orgId && (
        <CatalogImportModal
          orgId={orgId}
          categories={categories}
          onClose={() => setIsCatalogImportOpen(false)}
          onImportComplete={() => {
            void loadData();
          }}
        />
      )}

      {/* Product Editor Modal (New Products only) - REMOVED, using unified ProductEditor above */}

      {/* Bundle Rules Manager */}
      {managingBundleForItem && (
        <BundleManager
          triggerItem={managingBundleForItem}
          rule={currentBundle}
          catalogItems={products}
          onSave={async (rule) => {
            if (!orgId) return;
            try {
              const updated = await BundleRuleService.upsertRule(
                orgId,
                rule.triggerCatalogItemId,
                rule.companions,
                rule.enabled,
              );
              setCurrentBundle(updated);
              setManagingBundleForItem(null);
              const rules = await BundleRuleService.getRules(orgId);
              setBundleRules(rules);
            } catch (error) {
              console.error("Failed to save bundle rule:", error);
              alert("Failed to save bundle rule");
            }
          }}
          onClose={() => setManagingBundleForItem(null)}
        />
      )}

      {/* Test Bundle Modal */}
      {testBundleItem && testBundleRule && (
        <BundleSuggestionsModal
          isOpen={true}
          onClose={() => {
            setTestBundleItem(null);
            setTestBundleRule(null);
          }}
          onConfirm={() => {
            setTestBundleItem(null);
            setTestBundleRule(null);
          }}
          triggerItem={testBundleItem}
          rule={testBundleRule}
          catalogItems={products}
          mode="preview"
        />
      )}

      {/* Import Modal (Removed) */}

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {confirmDialog.title}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {confirmDialog.message}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() =>
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
                }
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg shadow-red-100 transition-all"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ProductInspectorProps {
  product: CatalogItem;
  categories: Category[];
  isReadOnly: boolean;
  reviewInsight?: CatalogReviewItemInsight;
  reviewGroupInsight?: CatalogReviewGroupInsight;
  cleanupScope: CleanupScopeSummary | null;
  cleanupFeedback: CleanupFeedbackState | null;
  onChange: (updates: Partial<CatalogItem>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onManageBundle: () => void;
  onTestBundle: () => void;
  hasBundle: boolean;
  onEditFull: () => void;
  onRememberCategoryCorrection: () => void;
  onFocusReviewGroup: (groupKey: string) => void;
  onApplyCategoryToSiblingTiers: (item: CatalogItem) => void;
  onCopyHintsToSiblingTiers: (item: CatalogItem) => void;
  canRememberCategoryCorrections: boolean;
}

import {
  CatalogUsageService,
  ProductUsageSummary,
} from "../core/services/CatalogUsageService";

// ... existing imports

// ... inside ProductInspector component
const ProductInspector: React.FC<ProductInspectorProps> = ({
  product,
  categories,
  isReadOnly,
  reviewInsight,
  reviewGroupInsight,
  cleanupScope,
  cleanupFeedback,
  onChange,
  onDuplicate,
  onDelete,
  onManageBundle,
  onTestBundle,
  hasBundle,
  onEditFull,
  onRememberCategoryCorrection,
  onFocusReviewGroup,
  onApplyCategoryToSiblingTiers,
  onCopyHintsToSiblingTiers,
  canRememberCategoryCorrections,
}) => {
  const [activeTab, setActiveTab] = useState<
    "basics" | "options" | "bundles" | "usage"
  >("basics");
  const [usageSummary, setUsageSummary] = useState<ProductUsageSummary | null>(
    null,
  );
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  useEffect(() => {
    if (activeTab === "usage" && product.orgId) {
      setIsLoadingUsage(true);
      CatalogUsageService.getUsageSummary(product.orgId, product)
        .then(setUsageSummary)
        .catch(console.error)
        .finally(() => setIsLoadingUsage(false));
    }
  }, [activeTab, product]);

  const topLevelCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const computedParentId = useMemo(() => {
    if (!product.categoryId) return "";
    const cat = categories.find((c) => c.id === product.categoryId);
    return cat?.parentId || product.categoryId;
  }, [categories, product.categoryId]);

  const subCategories = useMemo(() => {
    if (!computedParentId) return [];
    return categories.filter((c) => c.parentId === computedParentId);
  }, [categories, computedParentId]);

  const handleAddOption = () => {
    const newOption: ProductOption = {
      id: createId(),
      name: "New Option",
      price: 0,
      sku: "",
      tier: Tier.STANDARD,
    };
    onChange({ options: [...(product.options || []), newOption] });
  };

  const handleUpdateOption = (
    optionId: string,
    updates: Partial<ProductOption>,
  ) => {
    const newOptions = (product.options || []).map((opt) =>
      opt.id === optionId ? { ...opt, ...updates } : opt,
    );
    onChange({ options: newOptions });
  };

  const handleRemoveOption = (optionId: string) => {
    onChange({
      options: (product.options || []).filter((opt) => opt.id !== optionId),
    });
  };

  return (
    <div className="flex flex-col h-full bg-white lg:bg-transparent">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-white">
        {isReadOnly ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Read-only catalog access. Admin or developer access is required to edit products, categories, imports, and bundle mappings.
          </div>
        ) : null}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={product.title || product.name || ""}
              onChange={(e) =>
                onChange({ title: e.target.value, name: e.target.value })
              }
              className="w-full text-xl font-bold text-slate-900 border-none p-0 focus:ring-0 bg-transparent placeholder-slate-300"
              placeholder="Product Name"
            />
            <div className="flex items-center gap-2 mt-1">
              <span
                className="px-2 py-0.5 bg-blue-50 text-lowes-blue text-[10px] font-bold rounded uppercase tracking-wider truncate max-w-[200px]"
                title={
                  categories.find((c) => c.id === product.categoryId)?.path ||
                  product.categoryName
                }
              >
                {categories.find((c) => c.id === product.categoryId)?.path ||
                  product.categoryName ||
                  "Uncategorized"}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Updated{" "}
                {product.updatedAt
                  ? new Date(product.updatedAt).toLocaleDateString()
                  : "-"}
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1">
            <button
              onClick={onEditFull}
              disabled={isReadOnly}
              className="p-2 text-slate-400 hover:text-lowes-blue hover:bg-blue-50 rounded-lg transition-all"
              title="Edit Full Details"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={onDuplicate}
              disabled={isReadOnly}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              title="Duplicate"
            >
              <Copy size={16} />
            </button>
            <button
              onClick={onDelete}
              disabled={isReadOnly}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          {(["basics", "options", "bundles", "usage"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                activeTab === tab
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto p-6 space-y-8 ${isReadOnly ? "[&_input]:cursor-not-allowed [&_select]:cursor-not-allowed [&_textarea]:cursor-not-allowed" : ""}`}>
        {activeTab === "basics" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Quality & Metadata
              </h4>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {!product.imageUrl &&
                    !product.options?.some((o) => o.imageUrl) && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded flex items-center gap-1">
                        <AlertTriangle size={10} /> Missing Image
                      </span>
                    )}
                  {!product.itemNumber && (
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded flex items-center gap-1">
                      <AlertTriangle size={10} /> Missing Item #
                    </span>
                  )}
                  {!product.modelNumber && (
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded flex items-center gap-1">
                      <AlertTriangle size={10} /> Missing Model #
                    </span>
                  )}
                  {!product.categoryId && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded flex items-center gap-1">
                      <AlertTriangle size={10} /> Uncategorized
                    </span>
                  )}
                  {!product.isActive && (
                    <span className="px-2 py-1 bg-slate-200 text-slate-600 text-[10px] font-bold rounded flex items-center gap-1">
                      <Archive size={10} /> Inactive
                    </span>
                  )}
                  {product.isActive &&
                    product.imageUrl &&
                    product.itemNumber &&
                    product.categoryId && (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded flex items-center gap-1">
                        <CheckSquare size={10} /> Healthy
                      </span>
                    )}
                </div>

                {product.categoryAssignment ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Category assignment
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                              product.categoryAssignment.needsReview
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {product.categoryAssignment.needsReview
                              ? "Needs review"
                              : "Ready"}
                          </span>
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-800">
                            {Math.round((product.categoryAssignment.confidence || 0) * 100)}% confidence
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                            {product.categoryAssignment.assignmentMethod.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                      {canRememberCategoryCorrections &&
                      product.importSource &&
                      product.importSource !== "manual" &&
                      product.categoryId ? (
                        <button
                          onClick={onRememberCategoryCorrection}
                          data-testid="product-inspector-remember-category"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          Remember for this org
                        </button>
                      ) : null}
                    </div>
                    {reviewInsight?.signals.length ? (
                      <div
                        data-testid="catalog-review-signal-panel"
                        className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Review signals
                          </div>
                          {reviewInsight.groupLabel ? (
                            <button
                              type="button"
                              onClick={() => onFocusReviewGroup(reviewInsight.groupKey || "all")}
                              data-testid="catalog-review-focus-group"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                            >
                              Focus archetype group
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reviewInsight.signals.map((signal) => (
                            <span
                              key={`${product.id}-${signal.code}-inspector`}
                              className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                SIGNAL_META[signal.code].chipClass
                              }`}
                            >
                              {SIGNAL_META[signal.code].label}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                          {reviewInsight.signals.map((signal) => (
                            <div key={`${product.id}-${signal.code}-message`}>
                              {signal.message}
                            </div>
                          ))}
                        </div>
                        {reviewGroupInsight ? (
                          <div
                            data-testid="catalog-review-group-completion"
                            className="mt-3 rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  GROUP_COMPLETION_META[reviewGroupInsight.completionState]
                                    .chipClass
                                }`}
                              >
                                {
                                  GROUP_COMPLETION_META[reviewGroupInsight.completionState]
                                    .label
                                }
                              </span>
                              {reviewGroupInsight.remainingIssueCount > 0 ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                                  {reviewGroupInsight.remainingIssueCount} issues left
                                </span>
                              ) : null}
                              {reviewGroupInsight.remainingRowCount > 0 ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                                  {reviewGroupInsight.remainingRowCount} rows still flagged
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs text-slate-600">
                              {reviewGroupInsight.completionMessage}
                            </div>
                          </div>
                        ) : null}
                        {cleanupScope ? (
                          <div
                            data-testid="catalog-review-sibling-scope"
                            className="mt-3 rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  Sibling cleanup scope
                                </div>
                                <div className="mt-1 text-xs font-semibold text-slate-900">
                                  {cleanupScope.groupLabel}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                                <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">
                                  {cleanupScope.categoryEligibleCount} category updates
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                                  {cleanupScope.hintsEligibleCount} hint updates
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 text-[11px] text-slate-600">
                              These helpers only update sibling tiers in this archetype group. They never touch the current row or unrelated imports.
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium text-slate-500">
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                                Will change
                              </span>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                Already matches
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                                No change
                              </span>
                            </div>
                            {cleanupScope.siblingRows.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {cleanupScope.siblingRows.map((row) => (
                                  <div
                                    key={row.id}
                                    data-testid={`catalog-review-sibling-row-${row.id}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-medium text-slate-800">
                                        {row.title}
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                                          {row.tierLabel}
                                        </span>
                                        {row.willChangeCategory ? (
                                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                            Category will change
                                          </span>
                                        ) : null}
                                        {row.willChangeHints ? (
                                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                            Hints will change
                                          </span>
                                        ) : null}
                                        {!row.willChangeCategory &&
                                        !row.willChangeHints ? (
                                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                            No cleanup needed
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                                        <div
                                          data-testid={`catalog-review-sibling-category-diff-${row.id}`}
                                          className="flex flex-wrap items-center gap-1"
                                        >
                                          <span className="font-semibold text-slate-500">
                                            Category:
                                          </span>
                                          <span>{row.currentCategoryLabel}</span>
                                          {row.willChangeCategory ? (
                                            <>
                                              <span className="text-slate-400">→</span>
                                              <span className="font-semibold text-blue-700">
                                                {row.proposedCategoryLabel}
                                              </span>
                                            </>
                                          ) : (
                                            <span className="text-emerald-700">
                                              already matches
                                            </span>
                                          )}
                                        </div>
                                        <div
                                          data-testid={`catalog-review-sibling-hints-diff-${row.id}`}
                                          className="flex flex-wrap items-center gap-1"
                                        >
                                          <span className="font-semibold text-slate-500">
                                            Hints:
                                          </span>
                                          <span>{row.currentHintsLabel}</span>
                                          {row.willChangeHints ? (
                                            <>
                                              <span className="text-slate-400">→</span>
                                              <span className="font-semibold text-slate-700">
                                                {row.proposedHintsLabel}
                                              </span>
                                            </>
                                          ) : (
                                            <span className="text-emerald-700">
                                              no change
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-3 text-xs text-slate-600">
                                No sibling tiers are in this archetype group yet.
                              </div>
                            )}
                          </div>
                        ) : null}
                        {cleanupFeedback &&
                        (!cleanupScope ||
                          cleanupFeedback.groupKey === cleanupScope.groupKey) ? (
                          <div
                            data-testid="catalog-review-cleanup-feedback"
                            className={`mt-3 rounded-xl border px-3 py-2 text-xs font-medium ${
                              cleanupFeedback.tone === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {cleanupFeedback.message}
                          </div>
                        ) : null}
                        {reviewInsight.groupKey ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {product.categoryId ? (
                              <button
                                type="button"
                                onClick={() => onApplyCategoryToSiblingTiers(product)}
                                data-testid="catalog-review-copy-category-to-siblings"
                                disabled={
                                  cleanupScope
                                    ? cleanupScope.categoryEligibleCount === 0
                                    : false
                                }
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Apply category to sibling tiers
                                {cleanupScope
                                  ? ` (${cleanupScope.categoryEligibleCount})`
                                  : ""}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onCopyHintsToSiblingTiers(product)}
                              data-testid="catalog-review-copy-hints-to-siblings"
                              disabled={
                                cleanupScope
                                  ? cleanupScope.hintsEligibleCount === 0
                                  : false
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Copy hints to sibling tiers
                              {cleanupScope
                                ? ` (${cleanupScope.hintsEligibleCount})`
                                : ""}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {product.categoryAssignment.matchedSignals.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {product.categoryAssignment.matchedSignals.slice(0, 3).map((signal) => (
                          <div key={signal} className="text-xs text-slate-600">
                            {signal}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {product.categoryAssignment.sourceCategoryPath ? (
                      <div className="mt-2 text-[10px] text-slate-500">
                        Imported category hint: {product.categoryAssignment.sourceCategoryPath}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                  <div>
                    <span className="text-[10px] text-slate-400 block">
                      Source
                    </span>
                    <span className="text-xs font-medium text-slate-700">
                      {product.source || "Manual"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">
                      Source Ref
                    </span>
                    <span className="text-xs font-medium text-slate-700 font-mono">
                      {product.sourceRef || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">
                      Created
                    </span>
                    <span
                      className="text-xs font-medium text-slate-700"
                      title={product.createdAt}
                    >
                      {product.createdAt
                        ? new Date(product.createdAt).toLocaleDateString()
                        : "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">
                      Last Verified
                    </span>
                    <span className="text-xs font-medium text-slate-700">
                      {product.lastVerifiedAt
                        ? new Date(product.lastVerifiedAt).toLocaleDateString()
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Categorization
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Category
                  </label>
                  <select
                    data-testid="product-inspector-category-select"
                    value={computedParentId}
                    onChange={(e) => {
                      const catId = e.target.value;
                      const cat = categories.find((c) => c.id === catId);
                      onChange({
                        categoryId: catId || undefined,
                        categoryName: cat?.name,
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-lowes-blue"
                  >
                    <option value="">Uncategorized</option>
                    {topLevelCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Subcategory
                  </label>
                  <select
                    data-testid="product-inspector-subcategory-select"
                    value={
                      product.categoryId &&
                      categories.find((c) => c.id === product.categoryId)
                        ?.parentId
                        ? product.categoryId
                        : ""
                    }
                    onChange={(e) => {
                      const catId = e.target.value;
                      if (!catId) {
                        // no subcategory selected, keep parent as categoryId
                        const parent = categories.find(
                          (c) => c.id === computedParentId,
                        );
                        onChange({
                          categoryId: computedParentId || undefined,
                          categoryName: parent?.name,
                        });
                        return;
                      }

                      const cat = categories.find((c) => c.id === catId);
                      onChange({ categoryId: catId, categoryName: cat?.name });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-lowes-blue"
                    disabled={!subCategories.length}
                  >
                    <option value="">None</option>
                    {subCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Inventory Defaults
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Default Qty
                  </label>
                  <input
                    type="number"
                    value={product.defaultQty}
                    onChange={(e) =>
                      onChange({ defaultQty: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-lowes-blue"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={product.unit}
                    onChange={(e) => onChange({ unit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-lowes-blue"
                    placeholder="ea, box, ft"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {(product.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg"
                  >
                    {tag}
                    <button
                      onClick={() =>
                        onChange({
                          tags: (product.tags || []).filter((t) => t !== tag),
                        })
                      }
                      className="hover:text-red-500 transition-colors"
                      aria-label="Remove tag"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}

                <input
                  type="text"
                  placeholder="Add tag..."
                  className="px-2 py-1 border border-dashed border-slate-300 text-[10px] font-bold rounded-lg focus:ring-1 focus:ring-lowes-blue focus:border-lowes-blue outline-none w-24 bg-transparent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = e.currentTarget.value.trim();
                      if (val && !(product.tags || []).includes(val)) {
                        onChange({ tags: [...(product.tags || []), val] });
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Vendor Mapping
              </h4>
              <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                <ExternalLink size={20} className="text-slate-300 mb-2" />
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Coming Soon
                </p>
                <p className="text-[10px] text-slate-400">
                  Direct integration with Lowe&apos;s Pro supply chain
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "options" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Product Options ({(product.options || []).length})
              </h4>
              <button
                onClick={handleAddOption}
                className="text-lowes-blue hover:text-lowes-hover text-[10px] font-bold uppercase flex items-center gap-1"
              >
                <PlusCircle size={14} /> Add Option
              </button>
            </div>

            <div className="space-y-3">
              {(product.options || []).map((option) => (
                <div
                  key={option.id}
                  className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 group/opt"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden group/img relative">
                      {option.imageUrl ? (
                        <img
                          src={option.imageUrl}
                          alt={option.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="text-slate-300" size={20} />
                      )}

                      <div className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
                        <input
                          type="text"
                          placeholder="Image URL"
                          className="w-full text-[8px] bg-white/20 border border-white/30 rounded px-1 py-0.5 text-white placeholder-white/50 focus:bg-white focus:text-slate-900 focus:placeholder-slate-400 outline-none"
                          defaultValue={option.imageUrl || ""}
                          onBlur={(e) => {
                            const url = e.target.value.trim();
                            if (url !== option.imageUrl)
                              handleUpdateOption(option.id, { imageUrl: url });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={option.name}
                        onChange={(e) =>
                          handleUpdateOption(option.id, {
                            name: e.target.value,
                          })
                        }
                        className="w-full text-sm font-bold text-slate-900 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="Option Name"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <select
                          value={option.tier}
                          onChange={(e) =>
                            handleUpdateOption(option.id, {
                              tier: e.target.value as Tier,
                            })
                          }
                          className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded px-1 py-0.5 focus:ring-0"
                        >
                          {Object.values(Tier).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-slate-400">
                          SKU: {option.sku || "N/A"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveOption(option.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover/opt:opacity-100 transition-all"
                      aria-label="Remove option"
                    >
                      <MinusCircle size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-slate-200/50">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">
                        $
                      </span>
                      <input
                        type="number"
                        value={option.price}
                        onChange={(e) =>
                          handleUpdateOption(option.id, {
                            price: Number(e.target.value),
                          })
                        }
                        className="w-full text-xs font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">
                        SKU
                      </span>
                      <input
                        type="text"
                        value={option.sku}
                        onChange={(e) =>
                          handleUpdateOption(option.id, { sku: e.target.value })
                        }
                        className="w-full text-xs font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {(product.options || []).length === 0 && (
                <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    No options yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Add an option (like “Delta Faucet – Chrome”) to store
                    SKU/price/tier.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "bundles" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Bundle Rules
              </h4>

              <div
                className={`p-6 rounded-2xl border transition-all ${
                  hasBundle
                    ? "bg-purple-50 border-purple-100"
                    : "bg-slate-50 border-slate-100"
                }`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      hasBundle
                        ? "bg-purple-600 text-white shadow-lg shadow-purple-200"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    <Layers size={24} />
                  </div>

                  <div>
                    <h5
                      className={`font-bold text-sm ${hasBundle ? "text-purple-900" : "text-slate-900"}`}
                    >
                      {hasBundle ? "Active Bundle Rule" : "No Active Bundle"}
                    </h5>
                    <p className="text-xs text-slate-500">
                      Suggest companion products when this item is added.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={onManageBundle}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                      hasBundle
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-100"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
                    }`}
                  >
                    <Settings size={14} />{" "}
                    {hasBundle ? "Edit Bundle Rules" : "Create Bundle Rule"}
                  </button>

                  {hasBundle && (
                    <button
                      onClick={onTestBundle}
                      className="w-full py-2.5 bg-white border border-purple-200 text-purple-600 rounded-xl font-bold text-xs hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Play size={14} /> Test Suggestion Flow
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "usage" && (
          <div className="space-y-6">
            {isLoadingUsage ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-slate-400" />
              </div>
            ) : usageSummary ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-2xl font-bold text-slate-900">
                      {usageSummary.instanceCount}
                    </div>
                    <div className="text-xs font-bold text-slate-500 uppercase">
                      Total Uses
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-2xl font-bold text-slate-900">
                      {usageSummary.bundleRules.asTrigger.length +
                        usageSummary.bundleRules.asCompanion.length}
                    </div>
                    <div className="text-xs font-bold text-slate-500 uppercase">
                      Bundle Refs
                    </div>
                  </div>
                </div>

                {/* Recent Inspections */}
                <div>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Recent Inspections
                  </h4>
                  {usageSummary.recentInspections.length > 0 ? (
                    <div className="space-y-2">
                      {usageSummary.recentInspections.map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg shadow-sm"
                        >
                          <div
                            className="font-medium text-sm text-slate-700 truncate max-w-[180px]"
                            title={i.title}
                          >
                            {i.title}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {i.date}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-dashed border-slate-200 text-center">
                      No recent inspections found.
                    </div>
                  )}
                </div>

                {/* Bundle Rules */}
                {(usageSummary.bundleRules.asTrigger.length > 0 ||
                  usageSummary.bundleRules.asCompanion.length > 0) && (
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Bundle Rules
                    </h4>
                    <div className="space-y-2">
                      {usageSummary.bundleRules.asTrigger.map((r) => (
                        <div
                          key={r.id}
                          className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-800 flex items-center gap-2"
                        >
                          <Layers size={14} />
                          <span>
                            Triggers a bundle with {r.companions.length}{" "}
                            companions.
                          </span>
                        </div>
                      ))}
                      {usageSummary.bundleRules.asCompanion.map((r) => (
                        <div
                          key={r.id}
                          className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 flex items-center gap-2"
                        >
                          <Layers size={14} />
                          <span>Appears as companion in a bundle.</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Import Info */}
                {usageSummary.isImported && (
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Origin
                    </h4>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                      Imported from {usageSummary.source || "External Source"}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

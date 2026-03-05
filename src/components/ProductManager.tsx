import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CatalogItem, Category, Tier, BundleRule, ProductOption } from '../core/models/types';
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
} from 'lucide-react';

// If your project uses framer-motion instead, swap this import accordingly.
// import { motion, AnimatePresence } from 'framer-motion';
import { motion, AnimatePresence } from 'motion/react';

import { createId } from '../services/storage';
import { CatalogService } from '../core/services/CatalogService';
import { CategoryService } from '../core/services/CategoryService';
import { BundleRuleService } from '../core/services/BundleRuleService';
import { useAppContext } from '../core/hooks/useAppContext';
import { ProductEditor } from './ProductEditor';
import { BundleManager } from './BundleManager';
import { BundleSuggestionsModal } from './BundleSuggestionsModal';
import { useDebouncedCallback } from '../core/hooks/useDebouncedCallback';

interface ProductManagerProps {
  initialCategory?: string | null;
  onImport?: () => void;
}

type SortKey = 'name' | 'category' | 'updatedAt';
type SortOrder = 'asc' | 'desc';

export const ProductManager: React.FC<ProductManagerProps> = ({ initialCategory }) => {
  const { org } = useAppContext();
  const orgId = org?.id;

  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bundleRules, setBundleRules] = useState<BundleRule[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all' | 'uncategorized'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Create Category Modal State
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string>('');
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Bundle Management State
  const [managingBundleForItem, setManagingBundleForItem] = useState<CatalogItem | null>(null);
  const [currentBundle, setCurrentBundle] = useState<BundleRule | null>(null);

  // Test Bundle State
  const [testBundleItem, setTestBundleItem] = useState<CatalogItem | null>(null);
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
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Import State
  // const [isImporting, setIsImporting] = useState(false);
  // const [importUrl, setImportUrl] = useState('');
  // const [isResolving, setIsResolving] = useState(false);
  // const [importError, setImportError] = useState<string | null>(null);

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
      console.error('Failed to load catalog data:', error);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpenMenuForId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close kebab menu when clicking outside
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!openMenuForId) return;
      const target = e.target as Node;
      if (menuContainerRef.current && !menuContainerRef.current.contains(target)) {
        setOpenMenuForId(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [openMenuForId]);

  const sortedAndFilteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    let result = products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q));

      let matchesCategory = true;
      if (selectedCategoryId === 'all') matchesCategory = true;
      else if (selectedCategoryId === 'uncategorized') matchesCategory = !p.categoryId;
      else {
        // Match selected category OR any of its subcategories
        const subCategoryIds = categories.filter((c) => c.parentCategoryId === selectedCategoryId).map((c) => c.id);
        matchesCategory = p.categoryId === selectedCategoryId || (p.categoryId ? subCategoryIds.includes(p.categoryId) : false);
      }

      return matchesSearch && matchesCategory;
    });

    result.sort((a, b) => {
      let comparison = 0;

      if (sortKey === 'name') {
        comparison = (a.name || '').localeCompare(b.name || '');
      } else if (sortKey === 'category') {
        comparison = (a.categoryName || '').localeCompare(b.categoryName || '');
      } else if (sortKey === 'updatedAt') {
        const aU = a.updatedAt ?? 0;
        const bU = b.updatedAt ?? 0;
        comparison = aU - bU;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [products, searchTerm, selectedCategoryId, categories, sortKey, sortOrder]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const debouncedUpdate = useDebouncedCallback(async (item: CatalogItem) => {
    if (!orgId) return;
    try {
      const updated = await CatalogService.updateItem(orgId, item.id, item);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (error) {
      console.error('Failed to autosave item:', error);
    }
  }, 400);

  const handleInspectorChange = (updates: Partial<CatalogItem>) => {
    if (!selectedProduct) return;
    const updatedItem: CatalogItem = { ...selectedProduct, ...updates, updatedAt: Date.now() };

    // Optimistic update
    setProducts((prev) => prev.map((p) => (p.id === updatedItem.id ? updatedItem : p)));

    // Debounced persistence
    debouncedUpdate(updatedItem);
  };

  const handleAddCategory = () => {
    setIsCreateCategoryOpen(true);
    setNewCategoryName('');
    setNewCategoryParentId('');
    setCreateCategoryError(null);
  };

  /**
   * IMPORTANT FIX:
   * Your CategoryService.addCategory currently accepts (orgId, name) only.
   * But the UI wants parentCategoryId (sub-category assignment).
   * So we create the category first, then (if needed) update it to set parentCategoryId.
   * This avoids changing service code and makes the button actually work.
   */
  const handleCreateCategorySubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!orgId) return;
    if (!newCategoryName.trim()) return;

    setIsCreatingCategory(true);
    setCreateCategoryError(null);

    try {
      const created = await CategoryService.addCategory(
        orgId,
        newCategoryName.trim(),
        newCategoryParentId || null
      );

      setCategories((prev) => {
        const without = prev.filter((c) => c.id !== created.id);
        return [...without, created];
      });

      setSelectedCategoryId(created.id);
      setIsCreateCategoryOpen(false);
      setNewCategoryName('');
      setNewCategoryParentId('');
    } catch (err: any) {
      console.error('Failed to create category:', err);
      setCreateCategoryError(err?.message || 'Failed to create category');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleSaveNewItem = async (item: CatalogItem) => {
    if (!orgId) return;
    try {
      // ProductEditor gives a fully shaped item; CatalogService.addItem usually wants a “create input”
      const { id, orgId: _orgId, createdAt, updatedAt, ...createData } = item as any;
      const created = await CatalogService.addItem(orgId, createData);
      setProducts((prev) => [...prev, created]);
      setIsCreating(false);
      setSelectedProductId(created.id);
    } catch (error) {
      console.error('Failed to create item:', error);
      alert('Failed to create item');
    }
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder for future PDF import
    alert('Lowe’s Quote (PDF) import coming soon!');
  };

  const handleDuplicate = async (itemId: string) => {
    if (!orgId) return;
    try {
      const duplicated = await CatalogService.duplicateItem(orgId, itemId);
      setProducts((prev) => [...prev, duplicated]);
      setSelectedProductId(duplicated.id);
      setOpenMenuForId(null);
    } catch (error) {
      console.error('Failed to duplicate item:', error);
      alert('Failed to duplicate item');
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!orgId) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Product',
      message: 'Are you sure you want to delete this catalog item? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await CatalogService.deleteItem(orgId, itemId);
          setProducts((prev) => prev.filter((p) => p.id !== itemId));
          if (selectedProductId === itemId) setSelectedProductId(null);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          setOpenMenuForId(null);
        } catch (error) {
          console.error('Failed to delete item:', error);
          alert('Failed to delete item');
        }
      },
    });
  };

  const handleManageBundle = async (item: CatalogItem) => {
    if (!orgId) return;
    try {
      const rule = await BundleRuleService.getRuleByTrigger(orgId, item.id);
      setCurrentBundle(rule);
      setManagingBundleForItem(item);
      setOpenMenuForId(null);
    } catch (error) {
      console.error('Failed to load bundle rule:', error);
    }
  };

  const handleTestBundle = async (item: CatalogItem) => {
    if (!orgId) return;
    try {
      const rule = await BundleRuleService.getRuleByTrigger(orgId, item.id);
      if (rule && rule.enabled) {
        setTestBundleItem(item);
        setTestBundleRule(rule);
        setOpenMenuForId(null);
      } else {
        alert('No active bundle rule found for this item.');
      }
    } catch (error) {
      console.error('Failed to load bundle rule for test:', error);
    }
  };

  const topLevelCategories = useMemo(() => categories.filter((c) => !c.parentCategoryId), [categories]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative">
      {/* Toolbar */}
      <header className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-white z-10">
        <div className="flex items-center gap-2 mr-4">
          <Package className="text-lowes-blue" size={20} />
          <h1 className="font-bold text-slate-900 hidden sm:block">Products</h1>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search catalog... (Ctrl+K)"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-lowes-blue transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="relative">
            <select
              className="appearance-none pl-9 pr-8 py-2 bg-slate-50 border-none rounded-xl text-sm font-medium text-slate-600 focus:ring-2 focus:ring-lowes-blue cursor-pointer"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value as any)}
            >
              <option value="all">All Categories</option>
              <option value="uncategorized">Uncategorized</option>

              {topLevelCategories.map((cat) => {
                const subs = categories.filter((sub) => sub.parentCategoryId === cat.id);
                return (
                  <React.Fragment key={cat.id}>
                    <option value={cat.id}>{cat.name}</option>
                    {subs.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        &nbsp;&nbsp;{sub.name}
                      </option>
                    ))}
                  </React.Fragment>
                );
              })}
            </select>
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              className="appearance-none pl-9 pr-8 py-2 bg-slate-50 border-none rounded-xl text-sm font-medium text-slate-600 focus:ring-2 focus:ring-lowes-blue cursor-pointer"
              value={`${sortKey}-${sortOrder}`}
              onChange={(e) => {
                const [key, order] = e.target.value.split('-') as [SortKey, SortOrder];
                setSortKey(key);
                setSortOrder(order);
              }}
            >
              <option value="updatedAt-desc">Newest First</option>
              <option value="updatedAt-asc">Oldest First</option>
              <option value="name-asc">Name (A–Z)</option>
              <option value="name-desc">Name (Z–A)</option>
              <option value="category-asc">Category (A–Z)</option>
              <option value="category-desc">Category (Z–A)</option>
            </select>
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddCategory}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold text-sm transition-all active:scale-95"
          >
            <FolderPlus size={16} /> <span className="hidden lg:inline">New Category</span>
          </button>

          <button
            disabled
            className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-400 rounded-xl cursor-not-allowed font-semibold text-sm transition-all"
            title="Import Lowe’s Quote (PDF) — coming next"
          >
            <ExternalLink size={16} /> <span className="hidden lg:inline">Import PDF (Soon)</span>
          </button>

          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-lowes-blue text-white rounded-xl hover:bg-lowes-hover shadow-lg shadow-blue-100 font-semibold text-sm transition-all active:scale-95"
          >
            <Plus size={16} /> <span className="hidden sm:inline">New Product</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Product List */}
        <div className="flex-1 overflow-y-auto bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-white border-b border-slate-100 z-10 hidden md:table-header-group">
              <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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
                const rule = bundleRules.find((r) => r.triggerCatalogItemId === item.id && r.enabled);
                const hasBundle = !!rule;
                const isSelected = selectedProductId === item.id;

                // Category display (top + sub if applicable)
                const itemCat = item.categoryId ? categories.find((c) => c.id === item.categoryId) : null;
                const isSub = !!itemCat?.parentCategoryId;
                const topCat = isSub ? categories.find((c) => c.id === itemCat!.parentCategoryId) : itemCat;
                const subCat = isSub ? itemCat : null;

                const updatedLabel = item.updatedAt
                  ? new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : '-';

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedProductId(item.id)}
                    className={`group cursor-pointer border-b border-slate-50 transition-colors ${
                      isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-2 md:py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center border border-slate-100 overflow-hidden">
                          {item.options?.[0]?.imageUrl ? (
                            <img src={item.options[0].imageUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="text-slate-400" size={16} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm truncate">{item.name}</div>
                          <div className="md:hidden text-[10px] text-slate-500 flex items-center gap-1">
                            {topCat?.name || item.categoryName || 'Uncategorized'} • {(item.options || []).length} options
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-700 font-medium">{topCat?.name || 'Uncategorized'}</span>
                        {subCat && <span className="text-[10px] text-slate-400">{subCat.name}</span>}
                      </div>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-slate-500 font-medium">{(item.options || []).length}</span>
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
                      <span className="text-[10px] text-slate-400 font-medium">{updatedLabel}</span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div ref={menuContainerRef} className="relative inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuForId((prev) => (prev === item.id ? null : item.id));
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
              hasBundle={bundleRules.some((r) => r.triggerCatalogItemId === selectedProduct.id && r.enabled)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                <Edit2 size={32} />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Select a product to edit</h3>
              <p className="text-sm text-slate-500 mb-6">Pick a product from the list to view and modify its details.</p>
              <button
                onClick={() => setIsCreating(true)}
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
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
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
                  <button onClick={() => handleDuplicate(selectedProductId)} className="p-2 text-slate-400 hover:text-slate-600">
                    <Copy size={18} />
                  </button>
                  <button onClick={() => handleDelete(selectedProductId)} className="p-2 text-slate-400 hover:text-red-600">
                    <Trash2 size={18} />
                  </button>
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
                    hasBundle={bundleRules.some((r) => r.triggerCatalogItemId === selectedProduct.id && r.enabled)}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Create Category Modal */}
      {isCreateCategoryOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
          onMouseDown={(e) => {
            // click outside closes
            if (e.target === e.currentTarget) setIsCreateCategoryOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold text-slate-900 mb-4">New Category</h2>

            <form onSubmit={handleCreateCategorySubmit}>
              <div className="mb-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g., Electrical, Plumbing"
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    disabled={isCreatingCategory}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Parent Category (Optional)
                  </label>
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-lowes-blue transition-all appearance-none"
                    value={newCategoryParentId}
                    onChange={(e) => setNewCategoryParentId(e.target.value)}
                    disabled={isCreatingCategory}
                  >
                    <option value="">None (Top-level)</option>
                    {topLevelCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {createCategoryError && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <X size={14} /> {createCategoryError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreateCategoryOpen(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg transition-colors"
                  disabled={isCreatingCategory}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newCategoryName.trim() || isCreatingCategory}
                  className="px-6 py-2 bg-lowes-blue text-white font-bold rounded-lg hover:bg-lowes-hover shadow-lg shadow-blue-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingCategory ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Editor Modal (New Products only) */}
      {isCreating && (
        <ProductEditor
          item={{
            id: createId(),
            orgId: orgId || '',
            name: '',
            tags: [],
            defaultQty: 1,
            unit: 'ea',
            defaultTier: Tier.STANDARD,
            options: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }}
          categories={categories}
          onSave={handleSaveNewItem}
          onClose={() => setIsCreating(false)}
        />
      )}

      {/* Bundle Rules Manager */}
      {managingBundleForItem && (
        <BundleManager
          triggerItem={managingBundleForItem}
          rule={currentBundle}
          catalogItems={products}
          onSave={async (rule) => {
            if (!orgId) return;
            try {
              const updated = await BundleRuleService.upsertRule(orgId, rule.triggerCatalogItemId, rule.companions, rule.enabled);
              setCurrentBundle(updated);
              setManagingBundleForItem(null);
              const rules = await BundleRuleService.getRules(orgId);
              setBundleRules(rules);
            } catch (error) {
              console.error('Failed to save bundle rule:', error);
              alert('Failed to save bundle rule');
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
            <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
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
  onChange: (updates: Partial<CatalogItem>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onManageBundle: () => void;
  onTestBundle: () => void;
  hasBundle: boolean;
}

const ProductInspector: React.FC<ProductInspectorProps> = ({
  product,
  categories,
  onChange,
  onDuplicate,
  onDelete,
  onManageBundle,
  onTestBundle,
  hasBundle,
}) => {
  const [activeTab, setActiveTab] = useState<'basics' | 'options' | 'bundles'>('basics');

  const topLevelCategories = useMemo(() => categories.filter((c) => !c.parentCategoryId), [categories]);

  const computedParentId = useMemo(() => {
    if (!product.categoryId) return '';
    const cat = categories.find((c) => c.id === product.categoryId);
    return cat?.parentCategoryId || product.categoryId;
  }, [categories, product.categoryId]);

  const subCategories = useMemo(() => {
    if (!computedParentId) return [];
    return categories.filter((c) => c.parentCategoryId === computedParentId);
  }, [categories, computedParentId]);

  const handleAddOption = () => {
    const newOption: ProductOption = {
      id: createId(),
      name: 'New Option',
      price: 0,
      sku: '',
      tier: Tier.STANDARD,
    };
    onChange({ options: [...(product.options || []), newOption] });
  };

  const handleUpdateOption = (optionId: string, updates: Partial<ProductOption>) => {
    const newOptions = (product.options || []).map((opt) => (opt.id === optionId ? { ...opt, ...updates } : opt));
    onChange({ options: newOptions });
  };

  const handleRemoveOption = (optionId: string) => {
    onChange({ options: (product.options || []).filter((opt) => opt.id !== optionId) });
  };

  return (
    <div className="flex flex-col h-full bg-white lg:bg-transparent">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-white">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={product.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="w-full text-xl font-bold text-slate-900 border-none p-0 focus:ring-0 bg-transparent placeholder-slate-300"
              placeholder="Product Name"
            />
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-blue-50 text-lowes-blue text-[10px] font-bold rounded uppercase tracking-wider">
                {product.categoryName || 'Uncategorized'}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Updated {product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : '-'}
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1">
            <button
              onClick={onDuplicate}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              title="Duplicate"
            >
              <Copy size={16} />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          {(['basics', 'options', 'bundles'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {activeTab === 'basics' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Categorization</h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Category</label>
                  <select
                    value={computedParentId}
                    onChange={(e) => {
                      const catId = e.target.value;
                      const cat = categories.find((c) => c.id === catId);
                      onChange({ categoryId: catId || undefined, categoryName: cat?.name });
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
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Subcategory</label>
                  <select
                    value={
                      product.categoryId && categories.find((c) => c.id === product.categoryId)?.parentCategoryId ? product.categoryId : ''
                    }
                    onChange={(e) => {
                      const catId = e.target.value;
                      if (!catId) {
                        // no subcategory selected, keep parent as categoryId
                        const parent = categories.find((c) => c.id === computedParentId);
                        onChange({ categoryId: computedParentId || undefined, categoryName: parent?.name });
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
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Inventory Defaults</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Default Qty</label>
                  <input
                    type="number"
                    value={product.defaultQty}
                    onChange={(e) => onChange({ defaultQty: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-lowes-blue"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Unit</label>
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
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tags</h4>
              <div className="flex flex-wrap gap-2">
                {(product.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg"
                  >
                    {tag}
                    <button
                      onClick={() => onChange({ tags: (product.tags || []).filter((t) => t !== tag) })}
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
                    if (e.key === 'Enter') {
                      const val = e.currentTarget.value.trim();
                      if (val && !(product.tags || []).includes(val)) {
                        onChange({ tags: [...(product.tags || []), val] });
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vendor Mapping</h4>
              <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                <ExternalLink size={20} className="text-slate-300 mb-2" />
                <p className="text-[10px] font-bold text-slate-400 uppercase">Coming Soon</p>
                <p className="text-[10px] text-slate-400">Direct integration with Lowe&apos;s Pro supply chain</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'options' && (
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
                <div key={option.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 group/opt">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden group/img relative">
                      {option.imageUrl ? (
                        <img src={option.imageUrl} alt={option.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="text-slate-300" size={20} />
                      )}

                      <div className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
                        <input
                          type="text"
                          placeholder="Image URL"
                          className="w-full text-[8px] bg-white/20 border border-white/30 rounded px-1 py-0.5 text-white placeholder-white/50 focus:bg-white focus:text-slate-900 focus:placeholder-slate-400 outline-none"
                          defaultValue={option.imageUrl || ''}
                          onBlur={(e) => {
                            const url = e.target.value.trim();
                            if (url !== option.imageUrl) handleUpdateOption(option.id, { imageUrl: url });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={option.name}
                        onChange={(e) => handleUpdateOption(option.id, { name: e.target.value })}
                        className="w-full text-sm font-bold text-slate-900 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="Option Name"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <select
                          value={option.tier}
                          onChange={(e) => handleUpdateOption(option.id, { tier: e.target.value as Tier })}
                          className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded px-1 py-0.5 focus:ring-0"
                        >
                          {Object.values(Tier).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-slate-400">SKU: {option.sku || 'N/A'}</span>
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
                      <span className="text-[10px] font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        value={option.price}
                        onChange={(e) => handleUpdateOption(option.id, { price: Number(e.target.value) })}
                        className="w-full text-xs font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">SKU</span>
                      <input
                        type="text"
                        value={option.sku}
                        onChange={(e) => handleUpdateOption(option.id, { sku: e.target.value })}
                        className="w-full text-xs font-bold text-slate-700 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {(product.options || []).length === 0 && (
                <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                  <p className="text-sm font-semibold text-slate-700">No options yet</p>
                  <p className="text-xs text-slate-500 mt-1">Add an option (like “Delta Faucet – Chrome”) to store SKU/price/tier.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'bundles' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Bundle Rules</h4>

              <div
                className={`p-6 rounded-2xl border transition-all ${
                  hasBundle ? 'bg-purple-50 border-purple-100' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      hasBundle ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    <Layers size={24} />
                  </div>

                  <div>
                    <h5 className={`font-bold text-sm ${hasBundle ? 'text-purple-900' : 'text-slate-900'}`}>
                      {hasBundle ? 'Active Bundle Rule' : 'No Active Bundle'}
                    </h5>
                    <p className="text-xs text-slate-500">Suggest companion products when this item is added.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={onManageBundle}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                      hasBundle
                        ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-100'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                    }`}
                  >
                    <Settings size={14} /> {hasBundle ? 'Edit Bundle Rules' : 'Create Bundle Rule'}
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
      </div>
    </div>
  );
};

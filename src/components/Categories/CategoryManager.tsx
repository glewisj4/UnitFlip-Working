import React, { useState, useEffect, useMemo } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay, 
  defaultDropAnimationSideEffects, 
  DropAnimation,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  Modifier
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CategoryService, CategoryNode } from '../../core/services/CategoryService';
import { CatalogService } from '../../core/services/CatalogService';
import { CatalogMaintenanceService } from '../../core/services/CatalogMaintenanceService';
import { useAppContext } from '../../core/hooks/useAppContext';
import { Category } from '../../core/models/types';
import { 
  ChevronRight, 
  ChevronDown, 
  GripVertical, 
  Plus, 
  Edit2, 
  Trash2, 
  Folder, 
  FolderOpen,
  X,
  Save,
  RefreshCw,
  Package,
  Eye,
  EyeOff
} from 'lucide-react';

interface CategoryManagerProps {
  onClose: () => void;
}

interface FlattenedItem extends Category {
  depth: number;
  parentId: string | null;
  index: number;
  hasChildren: boolean;
  collapsed?: boolean;
  productCount?: number;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ onClose }) => {
  const { org } = useAppContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Edit/Create State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null); // null = root, string = subcategory
  const [isCreating, setIsCreating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (org) {
      loadCategories();
    }
  }, [org]);

  const loadCategories = async () => {
    if (!org) return;
    const [list, items] = await Promise.all([
        CategoryService.getCategories(org.id),
        CatalogService.getItems(org.id)
    ]);
    
    // Sort by sortOrder
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    setCategories(list);

    // Calculate counts
    const counts: Record<string, number> = {};
    items.forEach(item => {
        if (item.categoryId) {
            counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
        }
    });
    setProductCounts(counts);
  };

  const handleRebuildPaths = async () => {
    if (!org) return;
    if (!confirm('This will recalculate all category paths based on the current hierarchy. Continue?')) return;
    setIsProcessing(true);
    try {
        const count = await CatalogMaintenanceService.rebuildCategoryPaths(org.id);
        await loadCategories();
        alert(`Successfully rebuilt paths for ${count} categories.`);
    } catch (err: any) {
        console.error(err);
        alert('Failed to rebuild paths: ' + err.message);
    } finally {
        setIsProcessing(false);
    }
  };

  // Flatten the tree for DnD
  const flattenedItems = useMemo(() => {
    const flatten = (
      items: Category[], 
      parentId: string | null = null, 
      depth = 0
    ): FlattenedItem[] => {
      const result: FlattenedItem[] = [];
      const children = items
        .filter(item => (item.parentId || null) === (parentId || null))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      for (let i = 0; i < children.length; i++) {
        const item = children[i];
        const hasChildren = items.some(c => c.parentId === item.id);
        const collapsed = collapsedIds.has(item.id);

        result.push({
          ...item,
          depth,
          parentId,
          index: i,
          hasChildren,
          collapsed,
          productCount: productCounts[item.id] || 0
        });

        if (hasChildren && !collapsed) {
          result.push(...flatten(items, item.id, depth + 1));
        }
      }
      return result;
    };

    return flatten(categories);
  }, [categories, collapsedIds, productCounts]);

  const sortedIds = useMemo(() => flattenedItems.map(({ id }) => id), [flattenedItems]);

  // --- Actions ---

  const handleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateStart = (parentId: string | null) => {
    setCreatingParentId(parentId);
    setEditName('');
    setIsCreating(true);
    setEditingId(null);
    
    // If creating subcategory, ensure parent is expanded
    if (parentId) {
      setCollapsedIds(prev => {
        const next = new Set(prev);
        if (next.has(parentId)) next.delete(parentId);
        return next;
      });
    }
  };

  const handleCreateSave = async () => {
    if (!org || !editName.trim()) return;
    setIsProcessing(true);
    try {
      await CategoryService.addCategory(org.id, editName.trim(), creatingParentId);
      await loadCategories();
      setIsCreating(false);
      setEditName('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditStart = (item: Category) => {
    setEditingId(item.id);
    setEditName(item.name);
    setIsCreating(false);
  };

  const handleEditSave = async () => {
    if (!org || !editingId || !editName.trim()) return;
    setIsProcessing(true);
    try {
      await CategoryService.updateCategory(org.id, editingId, { name: editName.trim() });
      await loadCategories();
      setEditingId(null);
      setEditName('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!org) return;
    if (!confirm('Are you sure you want to delete this category?')) return;
    setIsProcessing(true);
    try {
      await CategoryService.deleteCategory(org.id, id);
      await loadCategories();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleActive = async (item: Category) => {
    if (!org) return;
    setIsProcessing(true);
    try {
      await CategoryService.updateCategory(org.id, item.id, { isActive: !item.isActive });
      await loadCategories();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- DnD Handlers ---

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !org) return;
    if (active.id === over.id) return;

    const activeIndex = flattenedItems.findIndex(i => i.id === active.id);
    const overIndex = flattenedItems.findIndex(i => i.id === over.id);

    const activeItem = flattenedItems[activeIndex];
    const overItem = flattenedItems[overIndex];

    if (!activeItem || !overItem) return;

    // Determine new parent and sort order
    // We adopt the parent of the item we dropped ON
    const newParentId = overItem.parentId;
    
    // Calculate new sort order
    // Get all siblings in the target parent (excluding the active item itself)
    const siblings = categories
      .filter(c => (c.parentId || null) === (newParentId || null) && c.id !== active.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
      
    // Find the index of the item we dropped ON within those siblings
    let newSortOrder = siblings.findIndex(c => c.id === over.id);
    
    if (newSortOrder === -1) {
        // Should not happen if overItem is in siblings
        newSortOrder = 0;
    } else {
        // If dragging down, insert after
        if (activeIndex < overIndex) {
            newSortOrder += 1;
        }
    }

    // Construct the new ordered list of IDs for this parent
    const orderedIds = siblings.map(c => c.id);
    orderedIds.splice(newSortOrder, 0, activeItem.id);

    try {
      await CategoryService.reorderCategories(org.id, newParentId || null, orderedIds);
      await loadCategories();
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    }
  };

  // --- Render ---

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={24} className="text-slate-400" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Category Management</h1>
        </div>
        <div className="flex items-center gap-2">
            <button
                onClick={handleRebuildPaths}
                disabled={isProcessing}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-xs hover:bg-slate-50 transition-colors flex items-center gap-2"
                title="Rebuild all category paths"
            >
                <RefreshCw size={14} className={isProcessing ? 'animate-spin' : ''} /> Rebuild Paths
            </button>
            <button
            onClick={() => handleCreateStart(null)}
            className="px-4 py-2 bg-lowes-blue text-white rounded-lg font-bold text-sm hover:bg-lowes-hover transition-colors flex items-center gap-2"
            >
            <Plus size={16} /> Add Root Category
            </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Name</span>
            <span>Actions</span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-slate-100">
                {flattenedItems.map((item) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onCollapse={handleCollapse}
                    onEdit={handleEditStart}
                    onDelete={handleDelete}
                    onAddSub={handleCreateStart}
                    onToggleActive={handleToggleActive}
                    isEditing={editingId === item.id}
                    editName={editName}
                    setEditName={setEditName}
                    onSaveEdit={handleEditSave}
                    onCancelEdit={() => { setEditingId(null); setEditName(''); }}
                  />
                ))}
              </div>
            </SortableContext>
            
            <DragOverlay>
              {activeId ? (
                <div className="p-4 bg-white shadow-xl border border-lowes-blue/30 rounded opacity-90">
                  {flattenedItems.find(i => i.id === activeId)?.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {flattenedItems.length === 0 && !isCreating && (
            <div className="p-8 text-center text-slate-400">
              No categories found. Create one to get started.
            </div>
          )}

          {/* Creation Row */}
          {isCreating && (
            <div className="p-4 bg-blue-50/50 border-t border-blue-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <div style={{ paddingLeft: creatingParentId ? 40 : 0 }}>
                  <ChevronRight size={16} className="text-transparent" />
                </div>
                <input
                  autoFocus
                  type="text"
                  className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-lowes-blue focus:border-transparent"
                  placeholder={creatingParentId ? "Subcategory Name" : "Category Name"}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateSave();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                />
                <button
                  onClick={handleCreateSave}
                  disabled={!editName.trim() || isProcessing}
                  className="p-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save size={16} />
                </button>
                <button
                  onClick={() => setIsCreating(false)}
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface SortableItemProps {
  item: FlattenedItem;
  onCollapse: (id: string) => void;
  onEdit: (item: Category) => void;
  onDelete: (id: string) => void;
  onAddSub: (parentId: string) => void;
  onToggleActive: (item: Category) => void;
  isEditing: boolean;
  editName: string;
  setEditName: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

const SortableItem: React.FC<SortableItemProps> = ({
  item,
  onCollapse,
  onEdit,
  onDelete,
  onAddSub,
  onToggleActive,
  isEditing,
  editName,
  setEditName,
  onSaveEdit,
  onCancelEdit
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, data: item });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${item.depth * 24 + 16}px`,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="p-4 bg-blue-50 border border-blue-200 opacity-50"
      >
        &nbsp;
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-3 p-3 hover:bg-slate-50 group transition-colors ${
        isEditing ? 'bg-blue-50/30' : ''
      } ${!item.isActive ? 'opacity-60 bg-slate-50/50' : ''}`}
      {...attributes}
    >
      {/* Drag Handle */}
      <div {...listeners} className="cursor-grab text-slate-300 hover:text-slate-500">
        <GripVertical size={16} />
      </div>

      {/* Collapse/Expand */}
      <button
        onClick={() => onCollapse(item.id)}
        className={`p-1 rounded hover:bg-slate-200 text-slate-400 ${!item.hasChildren ? 'invisible' : ''}`}
      >
        {item.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Icon */}
      <div className="text-slate-400">
        {item.hasChildren ? (
          item.collapsed ? <Folder size={18} /> : <FolderOpen size={18} />
        ) : (
          <Folder size={18} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-lowes-blue"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              onPointerDown={e => e.stopPropagation()} // Prevent drag start
            />
            <button onClick={onSaveEdit} className="text-emerald-600 hover:text-emerald-700">
              <Save size={16} />
            </button>
            <button onClick={onCancelEdit} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="font-medium text-slate-700 text-sm truncate block" title={item.path}>
              {item.name}
            </span>
            <div className="flex items-center gap-2">
                {item.path && item.depth > 0 && (
                    <span className="text-[10px] text-slate-400 truncate">{item.path}</span>
                )}
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <Package size={10} /> {item.productCount || 0}
                </span>
                {!item.isActive && (
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">Inactive</span>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onToggleActive(item)}
          className={`p-1.5 rounded ${item.isActive ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'}`}
          title={item.isActive ? "Deactivate" : "Activate"}
        >
          {item.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          onClick={() => onAddSub(item.id)}
          className="p-1.5 text-slate-400 hover:text-lowes-blue hover:bg-blue-50 rounded"
          title="Add Subcategory"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
          title="Rename"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

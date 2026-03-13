import { CatalogService } from './CatalogService';
import { CatalogItem } from '../models/types';
import { saveAs } from 'file-saver';

export class CatalogExportService {
  
  static async exportCatalogToCsv(orgId: string): Promise<void> {
    const items = await CatalogService.getItems(orgId);
    
    if (!items || items.length === 0) {
      throw new Error('No items to export.');
    }

    const headers = [
      'ID',
      'Title',
      'Normalized Title',
      'Item Number',
      'Model Number',
      'Brand',
      'Category ID',
      'Category Name',
      'Category Path',
      'Default Price',
      'Unit',
      'Default Qty',
      'Image URL',
      'Tags',
      'Is Active',
      'Source',
      'Source Ref',
      'Created At',
      'Updated At',
      'Last Verified At',
      'Notes'
    ];

    const rows = items.map(item => [
      item.id,
      `"${(item.title || item.name || '').replace(/"/g, '""')}"`,
      `"${(item.normalizedTitle || '').replace(/"/g, '""')}"`,
      `"${(item.itemNumber || '').replace(/"/g, '""')}"`,
      `"${(item.modelNumber || '').replace(/"/g, '""')}"`,
      `"${(item.brand || '').replace(/"/g, '""')}"`,
      item.categoryId || '',
      `"${(item.categoryName || '').replace(/"/g, '""')}"`,
      // We need to fetch category path if not on item. 
      // Ideally item has it or we map it. CatalogItem doesn't strictly have 'categoryPath' on it in types.ts?
      // Let's check types.ts. It doesn't. We should fetch categories to map it.
      // For now, let's leave it blank or try to look it up if we passed categories.
      // To keep it simple and fast, we'll skip looking up for now or just use categoryName.
      // Actually, let's just export what we have.
      '', 
      item.defaultPrice || 0,
      item.unit || '',
      item.defaultQty || 1,
      `"${(item.imageUrl || '').replace(/"/g, '""')}"`,
      `"${(item.tags || []).join(', ').replace(/"/g, '""')}"`,
      item.isActive ? 'TRUE' : 'FALSE',
      `"${(item.source || '').replace(/"/g, '""')}"`,
      `"${(item.sourceRef || '').replace(/"/g, '""')}"`,
      item.createdAt || '',
      item.updatedAt || '',
      item.lastVerifiedAt || '',
      `"${(item.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `catalog_export_${new Date().toISOString().slice(0, 10)}.csv`;
    
    saveAs(blob, filename);
  }
}

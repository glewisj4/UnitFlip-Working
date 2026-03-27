import { Category } from '../models/types';
import { CategoryService } from './CategoryService';

export const PRODUCT_CATEGORY_TREE: Array<{ name: string; children: string[] }> = [
  { name: 'Interior Finishes', children: ['Paint & Primers', 'Flooring', 'Trim & Molding', 'Interior Doors', 'Wall Repair'] },
  { name: 'Plumbing', children: ['Faucets & Fixtures', 'Toilets', 'Shower & Tub', 'Pipes & Fittings', 'Valves & Shutoffs'] },
  { name: 'Electrical & Lighting', children: ['Switches & Outlets', 'Light Fixtures', 'Bulbs & Drivers', 'Wiring & Boxes', 'Panels & Breakers'] },
  { name: 'Appliances', children: ['Kitchen Appliances', 'Laundry', 'HVAC Systems', 'Small Replacement Parts'] },
  { name: 'Hardware & Fasteners', children: ['Door Hardware', 'Cabinet Hardware', 'Fasteners', 'Anchors'] },
  { name: 'Windows & Coverings', children: ['Blinds & Shades', 'Curtains', 'Window Units', 'Screens'] },
  { name: 'Cleaning & Turnover Supplies', children: ['Cleaning Chemicals', 'Tools & Kits', 'Consumables'] },
  { name: 'Structural & Exterior', children: ['Roofing', 'Siding', 'Concrete & Masonry', 'Decking'] },
  { name: 'Tools & Equipment', children: ['Hand Tools', 'Power Tools', 'Ladders', 'Specialty Equipment'] },
];

export const PRODUCT_FUNCTIONAL_TAGS = [
  'task:paint_touchup',
  'task:replace_toilet',
  'task:patch_drywall',
  'task:install_blinds',
  'task:replace_outlet',
  'room:kitchen',
  'room:bathroom',
  'grade:budget',
  'grade:standard',
  'grade:premium',
  'turn:quick_turn',
  'turn:full_reno',
];

export class ProductCatalogFoundationService {
  static async ensureDefaultCategories(orgId: string): Promise<Category[]> {
    const existing = await CategoryService.getCategories(orgId);
    let categories = [...existing];

    for (const topLevel of PRODUCT_CATEGORY_TREE) {
      let parent = categories.find(
        (category) => category.name.toLowerCase() === topLevel.name.toLowerCase() && !category.parentCategoryId,
      );
      if (!parent) {
        parent = await CategoryService.addCategory(orgId, topLevel.name, null);
        categories.push(parent);
      }

      for (const childName of topLevel.children) {
        const child = categories.find(
          (category) =>
            category.name.toLowerCase() === childName.toLowerCase() && category.parentCategoryId === parent!.id,
        );
        if (!child) {
          categories.push(await CategoryService.addCategory(orgId, childName, parent.id));
        }
      }
    }

    return categories.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  }

  static resolveCategoryPath(categories: Category[], categoryId?: string) {
    if (!categoryId) {
      return { topLevelCategory: undefined, subcategory: undefined };
    }

    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      return { topLevelCategory: undefined, subcategory: undefined };
    }

    if (!category.parentCategoryId) {
      return { topLevelCategory: category.name, subcategory: undefined };
    }

    const parent = categories.find((item) => item.id === category.parentCategoryId);
    return {
      topLevelCategory: parent?.name || category.name,
      subcategory: category.name,
    };
  }

  static findCategoryIdByPath(categories: Category[], topLevelCategory?: string, subcategory?: string) {
    if (!topLevelCategory) return undefined;
    const parent = categories.find(
      (category) => !category.parentCategoryId && category.name.toLowerCase() === topLevelCategory.trim().toLowerCase(),
    );
    if (!parent) return undefined;
    if (!subcategory) return parent.id;

    return categories.find(
      (category) =>
        category.parentCategoryId === parent.id &&
        category.name.toLowerCase() === subcategory.trim().toLowerCase(),
    )?.id;
  }
}

import { Category } from '../models/types';
import { CategoryService } from './CategoryService';
import { UNCATEGORIZED_CATEGORY_NAME } from './CatalogCategoryAssignmentService';

type CategorySeedNode = {
  name: string;
  aliases?: string[];
  keywordHints?: string[];
  lowesCategoryHints?: string[];
  children?: CategorySeedNode[];
};

export const PRODUCT_CATEGORY_TREE: CategorySeedNode[] = [
  {
    name: 'Interior Finishes',
    aliases: ['interior finish', 'finishes'],
    keywordHints: ['paint', 'primer', 'flooring', 'trim', 'molding', 'interior door', 'drywall patch'],
    children: [
      { name: 'Paint & Primers', aliases: ['paint', 'primer'], keywordHints: ['paint', 'primer', 'eggshell', 'satin', 'semi gloss'], lowesCategoryHints: ['paint'] },
      { name: 'Flooring', aliases: ['floor', 'lvp', 'vinyl plank', 'carpet', 'pad'], keywordHints: ['flooring', 'lvp', 'vinyl plank', 'carpet', 'pad', 'tile'], lowesCategoryHints: ['flooring'] },
      { name: 'Trim & Molding', aliases: ['trim', 'baseboard', 'molding'], keywordHints: ['baseboard', 'trim', 'molding', 'quarter round'] },
      { name: 'Interior Doors', aliases: ['door slab', 'prehung door'], keywordHints: ['door slab', 'prehung', 'hollow core door'] },
      { name: 'Wall Repair', aliases: ['drywall', 'patch'], keywordHints: ['drywall', 'spackle', 'joint compound', 'patch'] },
    ],
  },
  {
    name: 'Plumbing',
    aliases: ['plumbing supplies'],
    keywordHints: ['faucet', 'toilet', 'shower', 'tub', 'valve', 'supply line'],
    children: [
      { name: 'Faucets & Fixtures', aliases: ['faucets', 'fixtures'], keywordHints: ['faucet', 'sink fixture', 'bath faucet'] },
      { name: 'Toilets', aliases: ['toilet'], keywordHints: ['toilet', 'wax ring', 'tank lever'] },
      { name: 'Shower & Tub', aliases: ['shower', 'tub'], keywordHints: ['shower', 'tub', 'shower head', 'drain cover'] },
      { name: 'Pipes & Fittings', aliases: ['pipe', 'fitting'], keywordHints: ['pvc', 'pipe', 'fitting', 'coupling'] },
      { name: 'Valves & Shutoffs', aliases: ['valves', 'shutoff'], keywordHints: ['angle stop', 'shutoff', 'valve'] },
    ],
  },
  {
    name: 'Electrical & Lighting',
    aliases: ['electrical', 'lighting'],
    keywordHints: ['outlet', 'switch', 'light fixture', 'bulb', 'breaker', 'detector'],
    children: [
      { name: 'Switches & Outlets', aliases: ['outlets', 'switches', 'faceplates'], keywordHints: ['outlet', 'switch', 'faceplate', 'gfci', 'receptacle'], lowesCategoryHints: ['electrical'] },
      { name: 'Light Fixtures', aliases: ['lighting fixtures'], keywordHints: ['light fixture', 'vanity light', 'ceiling light'] },
      { name: 'Bulbs & Drivers', aliases: ['bulbs', 'lamps'], keywordHints: ['bulb', 'led', 'driver', 'lamp'] },
      { name: 'Wiring & Boxes', aliases: ['wire', 'boxes'], keywordHints: ['wire', 'junction box', 'electrical box'] },
      { name: 'Panels & Breakers', aliases: ['breaker', 'panel'], keywordHints: ['breaker', 'panel', 'service panel'] },
    ],
  },
  {
    name: 'Appliances',
    aliases: ['appliance'],
    keywordHints: ['refrigerator', 'range', 'washer', 'dryer', 'filter'],
    children: [
      { name: 'Kitchen Appliances', aliases: ['kitchen appliance'], keywordHints: ['dishwasher', 'range', 'microwave', 'refrigerator'] },
      { name: 'Laundry', aliases: ['laundry appliance'], keywordHints: ['washer', 'dryer'] },
      { name: 'HVAC Systems', aliases: ['hvac', 'air filters'], keywordHints: ['hvac', 'filter', 'air filter', 'return grille'], lowesCategoryHints: ['filters'] },
      { name: 'Small Replacement Parts', aliases: ['replacement parts'], keywordHints: ['knob', 'handle', 'part', 'replacement'] },
    ],
  },
  {
    name: 'Hardware & Fasteners',
    aliases: ['hardware'],
    keywordHints: ['knob', 'hinge', 'screw', 'anchor', 'fastener'],
    children: [
      { name: 'Door Hardware', aliases: ['locks', 'knobs'], keywordHints: ['door knob', 'passage knob', 'deadbolt', 'hinge'], lowesCategoryHints: ['door hardware'] },
      { name: 'Cabinet Hardware', aliases: ['cabinet pulls'], keywordHints: ['cabinet pull', 'cabinet knob', 'drawer pull'] },
      { name: 'Fasteners', aliases: ['screws'], keywordHints: ['screw', 'nail', 'bolt'] },
      { name: 'Anchors', aliases: ['wall anchors'], keywordHints: ['anchor', 'toggle bolt'] },
    ],
  },
  {
    name: 'Windows & Coverings',
    aliases: ['window coverings', 'windows'],
    keywordHints: ['blind', 'shade', 'screen', 'window'],
    children: [
      { name: 'Blinds & Shades', aliases: ['blinds', 'shades'], keywordHints: ['blind', 'mini blind', 'shade', 'window treatment'], lowesCategoryHints: ['blinds'] },
      { name: 'Curtains', aliases: ['drapes'], keywordHints: ['curtain', 'drape'] },
      { name: 'Window Units', aliases: ['window ac'], keywordHints: ['window unit', 'window ac'] },
      { name: 'Screens', aliases: ['window screens'], keywordHints: ['screen', 'screen repair'] },
    ],
  },
  {
    name: 'Cleaning & Turnover Supplies',
    aliases: ['turnover supplies', 'cleaning supplies'],
    keywordHints: ['cleaner', 'trash bag', 'caulk', 'painter tape', 'turnover'],
    children: [
      { name: 'Cleaning Chemicals', aliases: ['cleaners'], keywordHints: ['cleaner', 'degreaser', 'bleach'] },
      { name: 'Tools & Kits', aliases: ['turn kits'], keywordHints: ['tool kit', 'repair kit'] },
      { name: 'Consumables', aliases: ['supplies'], keywordHints: ['caulk', 'tape', 'trash bag', 'roller cover'] },
    ],
  },
  {
    name: 'Structural & Exterior',
    aliases: ['exterior'],
    keywordHints: ['roofing', 'siding', 'concrete', 'masonry', 'deck'],
    children: [
      { name: 'Roofing', keywordHints: ['roofing', 'shingle'] },
      { name: 'Siding', keywordHints: ['siding'] },
      { name: 'Concrete & Masonry', aliases: ['masonry'], keywordHints: ['concrete', 'mortar', 'masonry'] },
      { name: 'Decking', keywordHints: ['decking', 'deck board'] },
    ],
  },
  {
    name: 'Tools & Equipment',
    aliases: ['tools'],
    keywordHints: ['drill', 'ladder', 'saw', 'tool'],
    children: [
      { name: 'Hand Tools', keywordHints: ['hammer', 'screwdriver', 'pliers'] },
      { name: 'Power Tools', keywordHints: ['drill', 'saw', 'impact driver'] },
      { name: 'Ladders', keywordHints: ['ladder'] },
      { name: 'Specialty Equipment', keywordHints: ['specialty equipment'] },
    ],
  },
  {
    name: UNCATEGORIZED_CATEGORY_NAME,
    aliases: ['uncategorized', 'needs review', 'general', 'misc'],
    keywordHints: ['unknown'],
  },
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

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

export class ProductCatalogFoundationService {
  static async ensureDefaultCategories(orgId: string): Promise<Category[]> {
    const existing = await CategoryService.getCategories(orgId);
    const categories = [...existing];

    const upsertNode = async (node: CategorySeedNode, parentId: string | null) => {
      let category = categories.find(
        (entry) => normalize(entry.name) === normalize(node.name) && (entry.parentId || null) === (parentId || null)
      );

      if (!category) {
        category = await CategoryService.addCategory(orgId, node.name, parentId);
        categories.push(category);
      }

      const mergedAliases = Array.from(new Set([...(category.aliases || []), ...(node.aliases || [])]));
      const mergedKeywordHints = Array.from(new Set([...(category.keywordHints || []), ...(node.keywordHints || [])]));
      const mergedLowesHints = Array.from(new Set([...(category.lowesCategoryHints || []), ...(node.lowesCategoryHints || [])]));

      if (
        JSON.stringify(category.aliases || []) !== JSON.stringify(mergedAliases) ||
        JSON.stringify(category.keywordHints || []) !== JSON.stringify(mergedKeywordHints) ||
        JSON.stringify(category.lowesCategoryHints || []) !== JSON.stringify(mergedLowesHints)
      ) {
        category = await CategoryService.updateCategory(orgId, category.id, {
          aliases: mergedAliases,
          keywordHints: mergedKeywordHints,
          lowesCategoryHints: mergedLowesHints,
        });
        const index = categories.findIndex((entry) => entry.id === category!.id);
        if (index >= 0) categories[index] = category;
      }

      for (const child of node.children || []) {
        await upsertNode(child, category.id);
      }
    };

    for (const node of PRODUCT_CATEGORY_TREE) {
      await upsertNode(node, null);
    }

    return (await CategoryService.getCategories(orgId)).sort(
      (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
    );
  }

  static resolveCategoryPath(categories: Category[], categoryId?: string) {
    if (!categoryId) {
      return { topLevelCategory: undefined, subcategory: undefined };
    }

    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      return { topLevelCategory: undefined, subcategory: undefined };
    }

    if (!category.parentId) {
      return { topLevelCategory: category.name, subcategory: undefined };
    }

    const parent = categories.find((item) => item.id === category.parentId);
    return {
      topLevelCategory: parent?.name || category.name,
      subcategory: category.name,
    };
  }

  static findCategoryIdByPath(categories: Category[], topLevelCategory?: string, subcategory?: string) {
    if (!topLevelCategory) return undefined;
    const parent = categories.find(
      (category) => !category.parentId && category.name.toLowerCase() === topLevelCategory.trim().toLowerCase()
    );
    if (!parent) return undefined;
    if (!subcategory) return parent.id;

    return categories.find(
      (category) =>
        category.parentId === parent.id &&
        category.name.toLowerCase() === subcategory.trim().toLowerCase()
    )?.id;
  }
}

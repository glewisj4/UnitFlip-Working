import { AppState, CatalogItem, ProductStatus, Tier, RepairTemplate } from '../models/types';

// Default Templates Data
export const DEFAULT_REPAIR_TEMPLATES: RepairTemplate[] = [
  {
    id: 'tpl-paint',
    name: 'Interior Painting',
    description: 'Full room repaint kit including prep materials',
    items: [
      { id: 'item-1', name: 'Interior Paint (Gallon)', description: 'Satin or Eggshell Finish', defaultPrice: 45.00, tier: Tier.STANDARD },
      { id: 'item-2', name: 'Paint Roller Frame', description: '9-inch standard frame', defaultPrice: 8.98, tier: Tier.STANDARD },
      { id: 'item-3', name: 'Roller Covers (3-Pack)', description: '3/8 inch nap for smooth surfaces', defaultPrice: 12.98, tier: Tier.STANDARD },
      { id: 'item-4', name: 'Angled Sash Brush', description: '2.5 inch for cutting in', defaultPrice: 14.98, tier: Tier.STANDARD },
      { id: 'item-5', name: 'Painter\'s Tape', description: 'Blue multi-surface tape', defaultPrice: 7.98, tier: Tier.STANDARD },
      { id: 'item-6', name: 'Plastic Drop Cloths', description: 'Pack of 3 heavy duty', defaultPrice: 9.98, tier: Tier.BUDGET },
      { id: 'item-7', name: 'Paint Tray Set', description: 'Tray and liner', defaultPrice: 6.98, tier: Tier.BUDGET },
      { id: 'item-8', name: 'Spackling Paste', description: 'For minor hole repair', defaultPrice: 5.98, tier: Tier.STANDARD },
    ]
  },
  {
    id: 'tpl-drywall',
    name: 'Drywall Repair',
    description: 'Patching holes and damaged sections',
    items: [
      { id: 'item-9', name: 'Joint Compound', description: 'All-purpose, 3.5qt', defaultPrice: 16.98, tier: Tier.STANDARD },
      { id: 'item-10', name: 'Drywall Joint Tape', description: 'Paper tape roll', defaultPrice: 2.98, tier: Tier.BUDGET },
      { id: 'item-11', name: 'Drywall Patch Kit', description: '4x4 aluminum patch', defaultPrice: 6.98, tier: Tier.STANDARD },
      { id: 'item-12', name: 'Putty Knife Set', description: '3-piece plastic set', defaultPrice: 4.98, tier: Tier.BUDGET },
      { id: 'item-13', name: 'Sanding Sponge', description: 'Medium/Fine grit', defaultPrice: 3.98, tier: Tier.STANDARD },
      { id: 'item-14', name: 'Primer (Quart)', description: 'PVA drywall primer', defaultPrice: 14.98, tier: Tier.STANDARD },
    ]
  },
  {
    id: 'tpl-toilet',
    name: 'Toilet Replacement',
    description: 'Standard replacement with install kit',
    items: [
      { id: 'item-15', name: 'Toilet (Complete Kit)', description: 'Elongated bowl, chair height', defaultPrice: 149.00, tier: Tier.STANDARD },
      { id: 'item-16', name: 'Wax Ring Kit', description: 'Extra thick with bolts', defaultPrice: 6.98, tier: Tier.PREMIUM },
      { id: 'item-17', name: 'Water Supply Line', description: '12-inch braided steel', defaultPrice: 8.98, tier: Tier.STANDARD },
      { id: 'item-18', name: 'Caulk (White)', description: 'Kitchen & Bath silicone', defaultPrice: 5.98, tier: Tier.STANDARD },
    ]
  },
  {
    id: 'tpl-cleaning',
    name: 'Deep Cleaning',
    description: 'Turnover cleaning supplies',
    items: [
      { id: 'item-19', name: 'Heavy Duty Degreaser', description: 'Zep or similar', defaultPrice: 11.98, tier: Tier.STANDARD },
      { id: 'item-20', name: 'Magic Erasers (4-pack)', description: 'Melamine foam sponges', defaultPrice: 4.98, tier: Tier.BUDGET },
      { id: 'item-21', name: 'Glass Cleaner', description: 'Streak-free formula', defaultPrice: 3.98, tier: Tier.STANDARD },
      { id: 'item-22', name: 'Trash Bags', description: 'Contractor bags box', defaultPrice: 19.98, tier: Tier.STANDARD },
      { id: 'item-23', name: 'Paper Towels', description: 'Bulk pack', defaultPrice: 14.98, tier: Tier.STANDARD },
    ]
  }
];

export const REPAIR_TEMPLATES = DEFAULT_REPAIR_TEMPLATES;

// CSV Data Processing
const CSV_ITEMS = [
  { type: "Outlet cover", sub: "1 gang", name: "Eaton 1 -Gang Standard Size White Thermoplastic Indoor Duplex Wall Plate", sku: "70639", cost: 0.53, img: "https://mobileimages.lowes.com/productimages/f3c550a8-9ea7-4b48-9424-8934cba136a9/12411374.jpg?size=pdhism" },
  { type: "Outlet cover", sub: "2 gang", name: "Eaton 2 -Gang Midsize Size White Polycarbonate Indoor Duplex Wall Plate", sku: "97792", cost: 2.38, img: "https://mobileimages.lowes.com/productimages/7c417924-a746-4c36-9936-32426a59eacc/67203722.jpeg?size=pdhism" },
  { type: "Outlet", sub: "single", name: "Eaton 15 -Amp 125-volt Residential Duplex Outlet Receptacles , White", sku: "70684", cost: 0.77, img: "https://mobileimages.lowes.com/productimages/f4e2a911-cc90-425c-b75e-337189405fe6/71187451.jpeg?size=pdhism" },
  { type: "Outlet", sub: "10 pack", name: "Eaton 15 -Amp 125-volt Residential Duplex Outlet Receptacles , White 10 -Pack", sku: "72604", cost: 5.60, img: "https://mobileimages.lowes.com/productimages/cdb2dd16-6650-4ab7-a3b1-df95e4babf8d/77561336.jpeg?size=pdhism" },
  { type: "Outlet box", sub: "1 gang old", name: "CANTEX 1 -Gang Plastic Old work Switch/Outlet Electrical Box", sku: "2987582", cost: 1.88, img: "https://mobileimages.lowes.com/productimages/c3ca12c0-de13-4d91-850a-cb21dd6e28e3/47952854.jpg?size=pdhism" },
  { type: "Outlet box", sub: "1 gang new", name: "CANTEX 1 -Gang PVC New work Switch/Outlet Electrical Box", sku: "2987573", cost: 0.85, img: "https://mobileimages.lowes.com/productimages/bbe3345c-2a2b-40dd-9eb8-57fe18a446a1/42063242.jpg?size=pdhism" },
  { type: "Outlet box", sub: "2 gang new", name: "CANTEX 2 -Gang PVC New work Switch/Outlet Electrical Box", sku: "2987584", cost: 4.58, img: "https://mobileimages.lowes.com/productimages/3581280a-a13e-4389-b910-b4b6dd601605/47952872.jpg?size=pdhism" },
  { type: "Outlet box", sub: "2 gang old", name: "CANTEX 2 -Gang PVC Old work Switch/Outlet Electrical Box", sku: "2987565", cost: 4.33, img: "https://mobileimages.lowes.com/productimages/c4279482-a207-4fad-bde8-647300623994/00600127.jpg?size=pdhism" },
  { type: "Light switch", sub: "single", name: "Eaton 15-amp Single-pole Toggle Light Switch , White", sku: "70610", cost: 0.91, img: "https://mobileimages.lowes.com/productimages/119b05f4-d95f-40f5-b73e-ab547cc3dd5d/12360177.jpg?size=pdhism" },
  { type: "Light switch", sub: "10 pack", name: "Eaton 15-amp Single-pole Toggle Light Switch , White 10 -Pack", sku: "73112", cost: 8.06, img: "https://mobileimages.lowes.com/productimages/a801d150-bf21-4f0d-95d1-05bcca2449b3/80289725.jpeg?size=pdhism" },
  { type: "Light switch", sub: "3-way", name: "Eaton 15-amp 3-way Toggle Light Switch , White", sku: "70406", cost: 2.58, img: "https://mobileimages.lowes.com/productimages/7ce574db-7e4b-4b19-b75c-9c85aa9a44dc/12334963.jpg?size=pdhism" },
  { type: "Light switch", sub: "3-way 10 pack", name: "Eaton 15-amp 3-way Toggle Light Switch , White 10 -Pack", sku: "69275", cost: 18.51, img: "https://mobileimages.lowes.com/productimages/c2e3b43c-1c78-44cf-829f-4e33880e8d81/80289723.jpeg?size=pdhism" },
  { type: "Outlet cover", sub: "single", name: "Eaton 1 -Gang Midsize Size White Polycarbonate Indoor Toggle Wall Plate", sku: "72560", cost: 0.62, img: "https://mobileimages.lowes.com/productimages/4872a44e-e6c6-4483-9a9a-9305d75a9020/67204828.jpeg?size=pdhism" },
  { type: "Outlet cover", sub: "10 pack", name: "Eaton 1 -Gang Midsize Size White Polycarbonate Indoor Toggle Wall Plate 10 -Pack", sku: "23556", cost: 4.90, img: "https://mobileimages.lowes.com/productimages/edd96b65-5ae9-4462-b1dc-f8740598ef91/67204921.jpeg?size=pdhism" },
  { type: "Outlet cover", sub: "2 gang", name: "Eaton 2 -Gang Standard Size White Thermoplastic Indoor Toggle Wall Plate", sku: "658627", cost: 1.78, img: "https://mobileimages.lowes.com/productimages/7c3d363c-8096-4a15-be24-ecf16400a966/46775831_1.jpg?size=pdhism" },
  { type: "Outlet cover", sub: "1 gang 10 pack", name: "Eaton 1 -Gang Standard Size White Thermoplastic Indoor Duplex Wall Plate 10 -Pack", sku: "72606", cost: 4.42, img: "https://mobileimages.lowes.com/productimages/f3c550a8-9ea7-4b48-9424-8934cba136a9/12411374.jpg?size=pdhism" }
];

const electricalProducts: CatalogItem[] = CSV_ITEMS.map((item, index) => ({
  id: `elec-${index}`,
  orgId: 'default-org',
  name: `${item.type} (${item.sub})`,
  description: `Standard ${item.type} replacement`,
  tags: ['Electrical'],
  defaultQty: 1,
  unit: 'ea',
  defaultTier: Tier.STANDARD,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  options: [{
    id: `opt-${index}`,
    name: item.name,
    price: item.cost,
    sku: item.sku,
    tier: Tier.STANDARD,
    imageUrl: item.img,
    description: item.sub,
    brand: 'Eaton'
  }],
  // Legacy fields
  roomId: 'room-electrical',
  category: 'Electrical',
  status: ProductStatus.PLANNING,
  actualCost: 0,
  quantity: 1
}));

const INITIAL_DATA: AppState = {
  rooms: [
    { id: 'room-global', name: 'Unit Wide', icon: 'Home', description: 'Whole unit budget and items', budget: 15000 },
    { id: 'room-electrical', name: 'General / Electrical', icon: 'Plug', description: 'Outlets, Switches, Plates', budget: 500 },
    { id: 'room-1', name: 'Kitchen', icon: 'ChefHat', description: 'Cooking and dining areas', budget: 5000 },
    { id: 'room-2', name: 'Bathroom', icon: 'Bath', description: 'Main and guest baths', budget: 3000 },
    { id: 'room-3', name: 'Living Room', icon: 'Sofa', description: 'Common areas', budget: 1000 },
    { id: 'room-4', name: 'Bedroom', icon: 'Bed', description: 'Sleeping quarters', budget: 1000 },
    { id: 'room-5', name: 'Exterior', icon: 'Briefcase', description: 'Curb appeal and structure', budget: 2000 },
  ],
  products: [
    {
      id: 'prod-1',
      orgId: 'default-org',
      name: 'Kitchen Faucet',
      categoryId: 'cat-plumbing',
      categoryName: 'Plumbing',
      description: 'Single handle pull-down sprayer',
      tags: ['Plumbing', 'Kitchen'],
      defaultQty: 1,
      unit: 'ea',
      defaultTier: Tier.STANDARD,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      options: [
        {
          id: 'opt-1',
          name: 'Project Source Single Handle',
          price: 49.98,
          sku: '123456',
          tier: Tier.BUDGET,
          url: 'https://www.lowes.com',
          brand: 'Project Source',
          modelNumber: 'PS-100'
        },
        {
          id: 'opt-2',
          name: 'Moen Adler Spot Resist',
          price: 119.00,
          sku: '789012',
          tier: Tier.STANDARD,
          url: 'https://www.lowes.com',
          brand: 'Moen',
          modelNumber: '87654'
        }
      ]
    },
    ...electricalProducts.map(p => ({
      ...p,
      orgId: 'default-org',
      categoryId: 'cat-electrical',
      categoryName: 'Electrical',
      tags: ['Electrical'],
      defaultQty: p.quantity || 1,
      defaultTier: Tier.STANDARD,
      updatedAt: Date.now()
    }))
  ],
  repairTemplates: DEFAULT_REPAIR_TEMPLATES,
  categories: [
    { id: 'cat-electrical', orgId: 'default-org', name: 'Electrical', sortOrder: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'cat-plumbing', orgId: 'default-org', name: 'Plumbing', sortOrder: 1, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'cat-paint', orgId: 'default-org', name: 'Paint', sortOrder: 2, createdAt: Date.now(), updatedAt: Date.now() },
  ],
  bundleRules: []
};

export const createInitialAppState = (): AppState => {
  // Return a deep copy to avoid reference sharing
  return JSON.parse(JSON.stringify(INITIAL_DATA));
};

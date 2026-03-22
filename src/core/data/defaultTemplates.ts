import {
  ChecklistTemplate,
  LayoutChecklistMapping,
  LayoutTemplate,
} from '../models/templates';

const SYSTEM_TIMESTAMP = Date.UTC(2026, 0, 1);
const STANDARD_CHECKLIST_TEMPLATE_ID = 'checklist-standard-turn-v1';

const createSystemLayout = (
  layout: Omit<LayoutTemplate, 'orgId' | 'isSystem' | 'isActive' | 'version' | 'createdAt' | 'updatedAt'>
): LayoutTemplate => ({
  ...layout,
  orgId: null,
  isSystem: true,
  isActive: true,
  version: 1,
  createdAt: SYSTEM_TIMESTAMP,
  updatedAt: SYSTEM_TIMESTAMP,
});

const createSystemChecklist = (
  checklist: Omit<ChecklistTemplate, 'orgId' | 'isSystem' | 'isActive' | 'version' | 'createdAt' | 'updatedAt'>
): ChecklistTemplate => ({
  ...checklist,
  orgId: null,
  isSystem: true,
  isActive: true,
  version: 1,
  createdAt: SYSTEM_TIMESTAMP,
  updatedAt: SYSTEM_TIMESTAMP,
});

const createSystemMapping = (
  mapping: Omit<LayoutChecklistMapping, 'orgId' | 'isActive' | 'createdAt' | 'updatedAt'>
): LayoutChecklistMapping => ({
  ...mapping,
  orgId: null,
  isActive: true,
  createdAt: SYSTEM_TIMESTAMP,
  updatedAt: SYSTEM_TIMESTAMP,
});

export const DEFAULT_LAYOUT_TEMPLATES: LayoutTemplate[] = [
  createSystemLayout({
    id: 'layout-studio-v1',
    name: 'Studio',
    slug: 'studio',
    unitType: 'apartment',
    bedrooms: 0,
    bathroomsFull: 1,
    bathroomsHalf: 0,
    defaultChecklistTemplateId: STANDARD_CHECKLIST_TEMPLATE_ID,
    roomBlueprint: [
      { id: 'layout-studio-room-living-space', roomType: 'living_room', label: 'Living Space', order: 10, required: true },
      { id: 'layout-studio-room-kitchen', roomType: 'kitchen', label: 'Kitchen', order: 20, required: true },
      { id: 'layout-studio-room-bathroom', roomType: 'bathroom', label: 'Bathroom', order: 30, required: true },
    ],
  }),
  createSystemLayout({
    id: 'layout-1br-1ba-v1',
    name: '1 Bed / 1 Bath',
    slug: '1-bed-1-bath',
    unitType: 'apartment',
    bedrooms: 1,
    bathroomsFull: 1,
    bathroomsHalf: 0,
    defaultChecklistTemplateId: STANDARD_CHECKLIST_TEMPLATE_ID,
    roomBlueprint: [
      { id: 'layout-1br-1ba-room-living-room', roomType: 'living_room', label: 'Living Room', order: 10, required: true },
      { id: 'layout-1br-1ba-room-kitchen', roomType: 'kitchen', label: 'Kitchen', order: 20, required: true },
      { id: 'layout-1br-1ba-room-bedroom-1', roomType: 'bedroom', label: 'Bedroom 1', order: 30, required: true, sequence: 1 },
      { id: 'layout-1br-1ba-room-bathroom', roomType: 'bathroom', label: 'Bathroom', order: 40, required: true },
    ],
  }),
  createSystemLayout({
    id: 'layout-2br-1ba-v1',
    name: '2 Bed / 1 Bath',
    slug: '2-bed-1-bath',
    unitType: 'apartment',
    bedrooms: 2,
    bathroomsFull: 1,
    bathroomsHalf: 0,
    defaultChecklistTemplateId: STANDARD_CHECKLIST_TEMPLATE_ID,
    roomBlueprint: [
      { id: 'layout-2br-1ba-room-living-room', roomType: 'living_room', label: 'Living Room', order: 10, required: true },
      { id: 'layout-2br-1ba-room-kitchen', roomType: 'kitchen', label: 'Kitchen', order: 20, required: true },
      { id: 'layout-2br-1ba-room-bedroom-1', roomType: 'bedroom', label: 'Bedroom 1', order: 30, required: true, sequence: 1 },
      { id: 'layout-2br-1ba-room-bedroom-2', roomType: 'bedroom', label: 'Bedroom 2', order: 40, required: true, sequence: 2 },
      { id: 'layout-2br-1ba-room-bathroom', roomType: 'bathroom', label: 'Bathroom', order: 50, required: true },
    ],
  }),
  createSystemLayout({
    id: 'layout-2br-2ba-v1',
    name: '2 Bed / 2 Bath',
    slug: '2-bed-2-bath',
    unitType: 'apartment',
    bedrooms: 2,
    bathroomsFull: 2,
    bathroomsHalf: 0,
    defaultChecklistTemplateId: STANDARD_CHECKLIST_TEMPLATE_ID,
    roomBlueprint: [
      { id: 'layout-2br-2ba-room-living-room', roomType: 'living_room', label: 'Living Room', order: 10, required: true },
      { id: 'layout-2br-2ba-room-kitchen', roomType: 'kitchen', label: 'Kitchen', order: 20, required: true },
      { id: 'layout-2br-2ba-room-bedroom-1', roomType: 'bedroom', label: 'Bedroom 1', order: 30, required: true, sequence: 1 },
      { id: 'layout-2br-2ba-room-bedroom-2', roomType: 'bedroom', label: 'Bedroom 2', order: 40, required: true, sequence: 2 },
      { id: 'layout-2br-2ba-room-bathroom-1', roomType: 'bathroom', label: 'Bathroom 1', order: 50, required: true, sequence: 1 },
      { id: 'layout-2br-2ba-room-bathroom-2', roomType: 'bathroom', label: 'Bathroom 2', order: 60, required: true, sequence: 2 },
    ],
  }),
];

export const DEFAULT_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  createSystemChecklist({
    id: STANDARD_CHECKLIST_TEMPLATE_ID,
    name: 'Standard Turn Checklist',
    slug: 'standard-turn-checklist',
    recipeSections: [
      {
        id: 'recipe-general-condition',
        title: 'General Condition',
        appliesTo: 'unit',
        order: 10,
        items: [
          { id: 'recipe-general-condition-walls', label: 'Check overall wall condition', category: 'general_condition', required: true },
          { id: 'recipe-general-condition-doors', label: 'Check doors and hardware', category: 'general_condition', required: true },
          { id: 'recipe-general-condition-odors', label: 'Check for odors or moisture concerns', category: 'general_condition', required: true },
        ],
      },
      {
        id: 'recipe-safety-checks',
        title: 'Safety Checks',
        appliesTo: 'unit',
        order: 20,
        items: [
          { id: 'recipe-safety-smoke-detectors', label: 'Verify smoke detectors are present and functional', category: 'safety', required: true },
          { id: 'recipe-safety-gfci', label: 'Verify GFCI protection where required', category: 'safety', required: true },
          { id: 'recipe-safety-egress', label: 'Confirm egress paths are unobstructed', category: 'safety', required: true },
        ],
      },
      {
        id: 'recipe-kitchen-turnover',
        title: 'Kitchen',
        appliesTo: 'specific_room_type',
        roomType: 'kitchen',
        order: 30,
        items: [
          { id: 'recipe-kitchen-cabinets', label: 'Inspect cabinets and drawers', category: 'kitchen', required: true },
          { id: 'recipe-kitchen-appliances', label: 'Test appliance operation', category: 'kitchen', required: true },
          { id: 'recipe-kitchen-sink', label: 'Inspect sink and faucet for leaks', category: 'kitchen', required: true, photoRecommended: true },
          { id: 'recipe-kitchen-countertops', label: 'Check countertops and backsplash', category: 'kitchen', required: true },
          { id: 'recipe-kitchen-flooring', label: 'Check kitchen flooring condition', category: 'kitchen', required: true },
        ],
      },
      {
        id: 'recipe-bathroom-turnover',
        title: 'Bathroom',
        appliesTo: 'each_room_type',
        roomType: 'bathroom',
        order: 40,
        items: [
          { id: 'recipe-bathroom-toilet', label: 'Inspect toilet operation and seal', category: 'bathroom', required: true },
          { id: 'recipe-bathroom-sink', label: 'Inspect sink and vanity condition', category: 'bathroom', required: true },
          { id: 'recipe-bathroom-shower', label: 'Inspect shower or tub surfaces', category: 'bathroom', required: true, photoRecommended: true },
          { id: 'recipe-bathroom-ventilation', label: 'Verify ventilation fan operation', category: 'bathroom', required: true },
          { id: 'recipe-bathroom-flooring', label: 'Check bathroom flooring condition', category: 'bathroom', required: true },
        ],
      },
      {
        id: 'recipe-bedroom-turnover',
        title: 'Bedroom',
        appliesTo: 'each_room_type',
        roomType: 'bedroom',
        order: 50,
        items: [
          { id: 'recipe-bedroom-walls', label: 'Inspect walls and trim', category: 'bedroom', required: true },
          { id: 'recipe-bedroom-closet', label: 'Inspect closet doors and shelving', category: 'bedroom', required: true },
          { id: 'recipe-bedroom-windows', label: 'Check window operation and screens', category: 'bedroom', required: true },
          { id: 'recipe-bedroom-flooring', label: 'Check bedroom flooring condition', category: 'bedroom', required: true },
        ],
      },
      {
        id: 'recipe-living-room-turnover',
        title: 'Living Room',
        appliesTo: 'specific_room_type',
        roomType: 'living_room',
        order: 60,
        items: [
          { id: 'recipe-living-room-walls', label: 'Inspect walls and baseboards', category: 'living_room', required: true },
          { id: 'recipe-living-room-lighting', label: 'Test lighting and switches', category: 'living_room', required: true },
          { id: 'recipe-living-room-windows', label: 'Check windows and coverings', category: 'living_room', required: true },
          { id: 'recipe-living-room-flooring', label: 'Check living area flooring', category: 'living_room', required: true },
        ],
      },
      {
        id: 'recipe-final-cleaning',
        title: 'Final Cleaning',
        appliesTo: 'unit',
        order: 70,
        items: [
          { id: 'recipe-final-cleaning-debris', label: 'Remove debris and leftover materials', category: 'cleaning', required: true },
          { id: 'recipe-final-cleaning-surfaces', label: 'Confirm surfaces are clean and ready', category: 'cleaning', required: true },
          { id: 'recipe-final-cleaning-photos', label: 'Capture final ready-state photos', category: 'cleaning', required: false, photoRecommended: true },
        ],
      },
    ],
  }),
];

export const DEFAULT_LAYOUT_CHECKLIST_MAPPINGS: LayoutChecklistMapping[] = DEFAULT_LAYOUT_TEMPLATES.map((layoutTemplate) =>
  createSystemMapping({
    id: `mapping-${layoutTemplate.id}-${STANDARD_CHECKLIST_TEMPLATE_ID}`,
    layoutTemplateId: layoutTemplate.id,
    checklistTemplateId: STANDARD_CHECKLIST_TEMPLATE_ID,
    isDefault: true,
  })
);

export const DEFAULT_CHECKLIST_TEMPLATE_ID = STANDARD_CHECKLIST_TEMPLATE_ID;

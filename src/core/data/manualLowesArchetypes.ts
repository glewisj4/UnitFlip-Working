import { CatalogArchetype } from '../models/types';

export const MANUAL_LOWES_ARCHETYPES: CatalogArchetype[] = [
  {
    id: 'duplex_outlet_standard_white',
    displayName: 'Duplex Outlet (White)',
    categoryHint: 'Electrical & Lighting > Switches & Outlets',
    keywords: ['outlet', 'receptacle', 'duplex outlet', 'wall outlet', '15 amp'],
    unitType: 'each',
    lowesCategoryHint: 'Electrical > Outlets',
    equivalentGroup: 'duplex_outlet_standard_white',
  },
  {
    id: 'blind_white_35x64_standard',
    displayName: 'Cordless Blind 35x64',
    categoryHint: 'Windows & Coverings > Blinds & Shades',
    keywords: ['blind', 'window blind', 'cordless blind', '35x64', 'faux wood blind'],
    unitType: 'each',
    lowesCategoryHint: 'Windows & Coverings > Blinds',
    equivalentGroup: 'blind_white_35x64_standard',
  },
  {
    id: 'smoke_detector_standard_battery',
    displayName: 'Smoke / CO Detector Battery Pack',
    categoryHint: 'Electrical & Lighting > Bulbs & Drivers',
    keywords: ['smoke detector battery', 'alarm battery', '9v battery', 'aa battery', 'detector battery'],
    unitType: 'pack',
    lowesCategoryHint: 'Electrical > Batteries',
    equivalentGroup: 'smoke_detector_standard_battery',
  },
  {
    id: 'interior_wall_paint_touchup_neutral',
    displayName: 'Interior Wall Paint (Neutral)',
    categoryHint: 'Interior Finishes > Paint & Primers',
    keywords: ['interior paint', 'wall paint', 'touch up paint', 'eggshell paint', 'neutral paint'],
    unitType: 'gallon',
    lowesCategoryHint: 'Paint > Interior Paint',
    equivalentGroup: 'interior_wall_paint_touchup_neutral',
  },
  {
    id: 'hvac_filter_standard',
    displayName: 'HVAC Filter 16x25x1',
    categoryHint: 'Appliances > Small Replacement Parts',
    keywords: ['hvac filter', 'air filter', 'furnace filter', '16x25x1', 'pleated filter'],
    unitType: 'each',
    lowesCategoryHint: 'Heating & Cooling > Air Filters',
    equivalentGroup: 'hvac_filter_standard',
  },
];

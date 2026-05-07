import { TurnoverPreset } from '../models/templates';

export const DEFAULT_TURNOVER_PRESETS: TurnoverPreset[] = [
  {
    id: 'luxury',
    label: 'Luxury',
    description: 'Bias turnover toward premium-ready replacement standards and higher-finish replacement preferences.',
    preferredProductTier: 'high',
    rules: [
      { templateItemId: 'recipe-standard-air-filter', actionMode: 'always_replace', preferredReplaceOption: 'High-performance HVAC filter', preferredProductTier: 'high', notes: 'Premium-ready air quality standard.' },
      { templateItemId: 'recipe-standard-smoke-detector-batteries', actionMode: 'always_replace', preferredReplaceOption: 'Replace batteries during every turn', preferredProductTier: 'high', notes: 'Luxury turns replace batteries proactively.' },
      { templateItemId: 'recipe-standard-outlet-covers', actionMode: 'always_replace', preferredReplaceOption: 'Decor wall plates', preferredProductTier: 'high', notes: 'Upgrade visible finish hardware.' },
      { templateItemId: 'recipe-bedroom-blinds', actionMode: 'always_replace', preferredReplaceOption: 'Replace blinds with premium cordless set', preferredProductTier: 'high', notes: 'Window coverings default to replacement.' },
      { templateItemId: 'recipe-living-room-flooring-replace', actionMode: 'always_replace', preferredReplaceOption: 'Premium LVP or upgraded flooring package', preferredProductTier: 'high', notes: 'Living area flooring favors premium replacement planning.' },
      { templateItemId: 'recipe-general-condition-walls', actionMode: 'inspect', preferredReplaceOption: 'Full repaint if finish quality is below standard', preferredProductTier: 'high', notes: 'Paint remains inspected first but biases toward premium refresh decisions.' },
    ],
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Use balanced turnover defaults that preserve the current standard-turn inspection behavior.',
    preferredProductTier: 'mid',
    rules: [
      { templateItemId: 'recipe-standard-air-filter', actionMode: 'always_replace', preferredReplaceOption: 'Standard HVAC filter', preferredProductTier: 'mid', notes: 'Baseline turn standard.' },
      { templateItemId: 'recipe-standard-smoke-detector-batteries', actionMode: 'always_replace', preferredReplaceOption: 'Standard detector battery pack', preferredProductTier: 'mid', notes: 'Baseline turn standard.' },
      { templateItemId: 'recipe-standard-outlet-covers', actionMode: 'always_replace', preferredReplaceOption: 'Standard white cover plate', preferredProductTier: 'mid', notes: 'Baseline visible finish replacement.' },
      { templateItemId: 'recipe-bedroom-blinds', actionMode: 'always_replace', preferredReplaceOption: 'Standard cordless blinds', preferredProductTier: 'mid', notes: 'Window coverings replace by default.' },
      { templateItemId: 'recipe-living-room-flooring-replace', actionMode: 'always_replace', preferredReplaceOption: 'Standard replacement flooring', preferredProductTier: 'mid', notes: 'Main living flooring replaces by default when this standard item is used.' },
    ],
  },
  {
    id: 'budget',
    label: 'Budget',
    description: 'Keep strong turnover essentials, but reduce automatic replacement on higher-cost finish items when inspection can decide first.',
    preferredProductTier: 'low',
    rules: [
      { templateItemId: 'recipe-standard-air-filter', actionMode: 'always_replace', preferredReplaceOption: 'Budget HVAC filter', preferredProductTier: 'low', notes: 'Always replace essential filter with budget tier preference.' },
      { templateItemId: 'recipe-standard-smoke-detector-batteries', actionMode: 'always_replace', preferredReplaceOption: 'Standard detector batteries', preferredProductTier: 'low', notes: 'Safety consumables still replace every turn.' },
      { templateItemId: 'recipe-standard-outlet-covers', actionMode: 'always_replace', preferredReplaceOption: 'Basic wall plate', preferredProductTier: 'low', notes: 'Visible low-cost refresh still replaces every turn.' },
      { templateItemId: 'recipe-bedroom-blinds', actionMode: 'inspect', preferredReplaceOption: 'Replace blinds only when damaged or missing', preferredProductTier: 'low', notes: 'Measurement-capable blind replacement becomes inspection-led.' },
      { templateItemId: 'recipe-living-room-flooring-replace', actionMode: 'inspect', preferredReplaceOption: 'Replace flooring only when damage or wear requires it', preferredProductTier: 'low', notes: 'High-cost finish replacement becomes inspection-led.' },
      { templateItemId: 'recipe-general-condition-walls', actionMode: 'inspect', preferredReplaceOption: 'Spot paint before full repaint', preferredProductTier: 'low', notes: 'Paint decisions stay inspection-first with budget bias.' },
    ],
  },
];

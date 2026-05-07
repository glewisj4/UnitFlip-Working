import { DEFAULT_TURNOVER_PRESETS } from '../data/defaultTurnoverPresets';
import { TurnoverPreset, TurnoverPresetId } from '../models/templates';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const TurnoverPresetService = {
  listAll(): TurnoverPreset[] {
    return DEFAULT_TURNOVER_PRESETS.map((preset) => clone(preset));
  },

  getById(id?: TurnoverPresetId | null): TurnoverPreset | null {
    if (!id) return null;
    const preset = DEFAULT_TURNOVER_PRESETS.find((entry) => entry.id === id) || null;
    return preset ? clone(preset) : null;
  },
};

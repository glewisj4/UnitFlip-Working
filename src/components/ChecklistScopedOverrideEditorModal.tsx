import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  ChecklistScopedOverride,
  ChecklistTemplate,
  CHECKLIST_DEFAULT_ACTION_MODES,
  CHECKLIST_OVERRIDE_SCOPE_TYPES,
  TurnoverPresetProductTier,
} from '../core/models/templates';
import { Unit } from '../core/models/inspections';
import { ChecklistScopedOverrideService } from '../core/services/ChecklistScopedOverrideService';

interface ChecklistScopedOverrideEditorModalProps {
  isOpen: boolean;
  organizationId: string;
  organizationLabel: string;
  units: Unit[];
  checklists: ChecklistTemplate[];
  override?: ChecklistScopedOverride | null;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSaved: () => void;
}

const PRODUCT_TIER_OPTIONS: TurnoverPresetProductTier[] = ['high', 'mid', 'low'];

const buildPropertyOptions = (units: Unit[]) =>
  Array.from(
    new Map(
      units
        .flatMap((unit) =>
          [unit.buildingName, unit.facilityName]
            .map((value) => value?.trim())
            .filter(Boolean)
            .map((label) => [label!.toLowerCase(), label!] as const)
        )
        .sort((left, right) => left[1].localeCompare(right[1]))
    ).values()
  );

export const ChecklistScopedOverrideEditorModal: React.FC<ChecklistScopedOverrideEditorModalProps> = ({
  isOpen,
  organizationId,
  organizationLabel,
  units,
  checklists,
  override,
  mode,
  onClose,
  onSaved,
}) => {
  const [scopeType, setScopeType] = useState<ChecklistScopedOverride['scopeType']>('organization');
  const [scopeRefId, setScopeRefId] = useState('');
  const [templateItemId, setTemplateItemId] = useState('');
  const [actionMode, setActionMode] = useState<ChecklistScopedOverride['actionMode'] | ''>('');
  const [preferredReplaceOption, setPreferredReplaceOption] = useState('');
  const [preferredProductTier, setPreferredProductTier] = useState<TurnoverPresetProductTier | ''>('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const propertyOptions = useMemo(() => buildPropertyOptions(units), [units]);
  const itemOptions = useMemo(
    () =>
      checklists.flatMap((checklist) =>
        checklist.recipeSections.flatMap((section) =>
          section.items.map((item) => ({
            id: item.id,
            label: `${checklist.name} • ${section.title} • ${item.label}`,
          }))
        )
      ),
    [checklists]
  );

  useEffect(() => {
    if (!isOpen) return;
    setScopeType(override?.scopeType || 'organization');
    setScopeRefId(override?.scopeRefId || organizationId);
    setTemplateItemId(override?.templateItemId || itemOptions[0]?.id || '');
    setActionMode(override?.actionMode || '');
    setPreferredReplaceOption(override?.preferredReplaceOption || '');
    setPreferredProductTier(override?.preferredProductTier || '');
    setNotes(override?.notes || '');
    setErrorMessage(null);
  }, [isOpen, override, organizationId, itemOptions]);

  useEffect(() => {
    if (!isOpen) return;
    if (scopeType === 'organization') {
      setScopeRefId(organizationId);
      return;
    }
    if (scopeType === 'property' && !propertyOptions.includes(scopeRefId)) {
      setScopeRefId(propertyOptions[0] || '');
      return;
    }
    if (scopeType === 'unit' && !units.some((unit) => unit.id === scopeRefId)) {
      setScopeRefId(units[0]?.id || '');
    }
  }, [isOpen, organizationId, propertyOptions, scopeRefId, scopeType, units]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const payload = {
        organizationId,
        scopeType,
        scopeRefId: scopeRefId.trim(),
        templateItemId,
        actionMode: actionMode || undefined,
        preferredReplaceOption: preferredReplaceOption.trim() || undefined,
        preferredProductTier: preferredProductTier || undefined,
        notes: notes.trim() || undefined,
      };

      if (mode === 'edit' && override) {
        await ChecklistScopedOverrideService.update({
          ...override,
          ...payload,
        });
      } else {
        await ChecklistScopedOverrideService.create(payload);
      }

      onSaved();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save checklist override.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 p-4">
      <div className="flex h-full items-center justify-center overflow-y-auto">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {mode === 'edit' ? 'Edit Scoped Override' : 'New Scoped Override'}
            </h2>
            <p className="text-sm text-slate-500">Override checklist behavior by organization, property, or unit.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">How overrides resolve</div>
            <div className="mt-1 text-sm text-slate-600">Generation applies template defaults, then preset rules, then the best matching override. Unit beats property, and property beats organization.</div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Scope Type</label>
              <select
                value={scopeType}
                onChange={(event) => setScopeType(event.target.value as ChecklistScopedOverride['scopeType'])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                {CHECKLIST_OVERRIDE_SCOPE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Scope Target</label>
              {scopeType === 'organization' ? (
                <input value={organizationLabel} disabled className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2" />
              ) : scopeType === 'property' ? (
                <select
                  value={scopeRefId}
                  onChange={(event) => setScopeRefId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  {propertyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={scopeRefId}
                  onChange={(event) => setScopeRefId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Checklist Item</label>
            <select
              value={templateItemId}
              onChange={(event) => setTemplateItemId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
            >
              {itemOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Resolved behavior</div>
              <div className="mt-1 text-sm text-slate-500">Only fill the fields you want this scope to override. Blank fields leave the preset and template result unchanged.</div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Action Mode</label>
              <select
                value={actionMode}
                onChange={(event) => setActionMode((event.target.value || '') as ChecklistScopedOverride['actionMode'] | '')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="">No override</option>
                {CHECKLIST_DEFAULT_ACTION_MODES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Preferred Product Tier</label>
              <select
                value={preferredProductTier}
                onChange={(event) => setPreferredProductTier((event.target.value || '') as TurnoverPresetProductTier | '')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="">No override</option>
                {PRODUCT_TIER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Preferred Replace Option</label>
              <input
                value={preferredReplaceOption}
                onChange={(event) => setPreferredReplaceOption(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Optional"
              />
            </div>
          </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 resize-none"
              placeholder="Optional traceability notes"
            />
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            Save Override
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

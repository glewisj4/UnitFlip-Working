import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, Plus, X } from 'lucide-react';
import { Unit } from '../core/models/inspections';
import { LayoutTemplate, TurnoverPreset } from '../core/models/templates';
import { LayoutTemplateService } from '../core/services/LayoutTemplateService';
import { LayoutChecklistMappingService } from '../core/services/LayoutChecklistMappingService';
import {
  InspectionTemplateGenerationResult,
  InspectionTemplateGenerationService,
} from '../core/services/InspectionTemplateGenerationService';
import { InspectionService } from '../core/services/InspectionService';
import { UnitService } from '../core/services/UnitService';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';
import { TurnoverPresetService } from '../core/services/TurnoverPresetService';

interface NewInspectionModalProps {
  isOpen: boolean;
  unitId: string;
  onClose: () => void;
  onCreated: (inspectionId: string) => void;
}

const formatRoomSummary = (layout: LayoutTemplate): string => {
  const bedroomLabel = `${layout.bedrooms} bedroom${layout.bedrooms === 1 ? '' : 's'}`;
  const bathroomTotal = layout.bathroomsFull + layout.bathroomsHalf * 0.5;
  const bathroomLabel = `${bathroomTotal} bathroom${bathroomTotal === 1 ? '' : 's'}`;
  return `${bedroomLabel}, ${bathroomLabel}`;
};

export const NewInspectionModal: React.FC<NewInspectionModalProps> = ({
  isOpen,
  unitId,
  onClose,
  onCreated,
}) => {
  const { org, user } = useAppContext();
  const { log } = useAuditLogger();
  const [title, setTitle] = useState('');
  const [layouts, setLayouts] = useState<LayoutTemplate[]>([]);
  const [unitRecord, setUnitRecord] = useState<Unit | null>(null);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>('');
  const [turnoverPresets, setTurnoverPresets] = useState<TurnoverPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('standard');
  const [isLoadingLayouts, setIsLoadingLayouts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setLayouts([]);
      setUnitRecord(null);
      setSelectedLayoutId('');
      setTurnoverPresets([]);
      setSelectedPresetId('standard');
      setErrorMessage(null);
      return;
    }

    const loadSetup = async () => {
      setIsLoadingLayouts(true);
      setErrorMessage(null);
      try {
        const [availableLayouts, loadedUnit] = await Promise.all([
          LayoutTemplateService.listActive(org?.id || null),
          org?.id ? UnitService.getUnit(org.id, unitId) : Promise.resolve(null),
        ]);
        const availablePresets = TurnoverPresetService.listAll();
        setLayouts(availableLayouts);
        setUnitRecord(loadedUnit);
        setTurnoverPresets(availablePresets);

        const preferredLayoutId =
          loadedUnit?.assignedLayoutTemplateId &&
          availableLayouts.some((layout) => layout.id === loadedUnit.assignedLayoutTemplateId)
            ? loadedUnit.assignedLayoutTemplateId
            : availableLayouts[0]?.id || '';

        if (availableLayouts.length > 0 || preferredLayoutId) {
          setSelectedLayoutId((current) => current || preferredLayoutId);
        }
        setSelectedPresetId((current) => current || availablePresets[1]?.id || availablePresets[0]?.id || 'standard');
      } catch (error) {
        console.error(error);
        setErrorMessage('Failed to load inspection setup data.');
      } finally {
        setIsLoadingLayouts(false);
      }
    };

    void loadSetup();
  }, [isOpen, org?.id, unitId]);

  const selectedLayout = useMemo(
    () => layouts.find((layout) => layout.id === selectedLayoutId) || null,
    [layouts, selectedLayoutId]
  );
  const selectedPreset = useMemo(
    () => turnoverPresets.find((preset) => preset.id === selectedPresetId) || null,
    [selectedPresetId, turnoverPresets]
  );
  const creationSummary = useMemo(() => {
    if (!selectedLayout) {
      return 'Choose a layout template to generate rooms and checklist items, or create without one.';
    }
    if (selectedPreset) {
      return `${selectedLayout.name} with the ${selectedPreset.label} preset will generate a checklist snapshot for this inspection.`;
    }
    return `${selectedLayout.name} will generate the inspection checklist snapshot.`;
  }, [selectedLayout, selectedPreset]);

  if (!isOpen) return null;

  const createInspectionWithOptionalTemplate = async (useTemplate: boolean) => {
    if (!org || !user) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Inspection title is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let generation: InspectionTemplateGenerationResult | null = null;

      if (useTemplate) {
        if (!selectedLayout) {
          throw new Error('Select a layout template or create the inspection without a template.');
        }

        await LayoutChecklistMappingService.resolveChecklistTemplate(selectedLayout.id, org.id);
        generation = await InspectionTemplateGenerationService.generateFromLayout({
          layoutTemplateId: selectedLayout.id,
          orgId: org.id,
          turnoverPresetId: selectedPreset?.id || null,
          unit: unitRecord,
        });
      }

      const newInspection = await InspectionService.createInspection(org.id, unitId, trimmedTitle, user.id, {
        templateSnapshot: generation?.snapshot,
        generatedSections: generation?.sections || [],
        generatedItems: generation?.items || [],
      });

      log('INSPECTION_CREATED', {
        entityId: newInspection.id,
        message: `Created inspection: ${trimmedTitle}`,
        metadata: generation
          ? {
              layoutTemplateId: generation.snapshot.layoutTemplateId,
              checklistTemplateId: generation.snapshot.checklistTemplateId,
              turnoverPresetId: generation.snapshot.turnoverPresetId,
              generatedSectionCount: generation.sections.length,
              generatedItemCount: generation.items.length,
            }
          : { createdWithoutTemplate: true },
      });

      onCreated(newInspection.id);
      onClose();
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create inspection from the selected layout.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 bg-slate-950/40 p-4">
      <div className="flex h-full items-start justify-center overflow-y-auto">
        <div
          data-testid="new-inspection-modal"
          className="flex h-[calc(100vh-2rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">New Inspection</h2>
              <p className="text-sm text-slate-500">Choose the layout first, then confirm the turnover preset that should shape the checklist snapshot.</p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-slate-100">
              <X size={18} className="text-slate-500" />
            </button>
          </div>

          <div data-testid="new-inspection-modal-body" className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-slate-50/60 p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Inspection setup</div>
                <div className="mt-1 text-sm text-slate-500">Give this inspection a clear label so it is easy to resume and review later.</div>
              </div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Inspection Title</label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Move-out Check"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-transparent focus:ring-2 focus:ring-lowes-blue"
              />
            </div>

          {unitRecord ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-semibold text-emerald-900">Unit reference data available</div>
              <div className="mt-2 text-sm text-emerald-800">
                {unitRecord.assignedLayoutTemplateId
                  ? 'This unit has a saved layout assignment, so Inspection starts from the unit standard by default.'
                  : 'No saved unit layout assignment yet. You can still choose a layout for this inspection.'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                {unitRecord.assignedLayoutTemplateId ? <span className="rounded-full bg-white px-2.5 py-1">Template standard ready</span> : null}
                {unitRecord.managementData?.maintenanceCheatSheet?.airFilterSize ? (
                  <span className="rounded-full bg-white px-2.5 py-1">
                    Filter {unitRecord.managementData.maintenanceCheatSheet.airFilterSize}
                  </span>
                ) : null}
                {unitRecord.managementData?.maintenanceCheatSheet?.mainWaterShutoffLocation ? (
                  <span className="rounded-full bg-white px-2.5 py-1">Water shut-off logged</span>
                ) : null}
                {unitRecord.favoriteProductIds?.length ? (
                  <span className="rounded-full bg-white px-2.5 py-1">{unitRecord.favoriteProductIds.length} favorites saved</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Step 1</div>
                <label className="mt-1 block text-base font-semibold text-slate-800">Choose the layout template</label>
                <div className="mt-1 text-sm text-slate-500">This defines the rooms and mapped checklist used to generate the inspection snapshot.</div>
              </div>
              <span className="text-right text-xs text-slate-400">
                {unitRecord?.assignedLayoutTemplateId ? 'Preselected from the unit record when available' : 'Optional fallback: create without template'}
              </span>
            </div>

            {isLoadingLayouts ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Loading layouts...
              </div>
            ) : layouts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No active layout templates found. You can still create an inspection without a template.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {layouts.map((layout) => {
                  const isSelected = selectedLayoutId === layout.id;
                  return (
                    <button
                      key={layout.id}
                      type="button"
                      onClick={() => setSelectedLayoutId(layout.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        isSelected
                          ? 'border-lowes-blue bg-blue-50 shadow-sm ring-1 ring-lowes-blue/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-800">{layout.name}</div>
                          <div className="text-sm text-slate-500 mt-1">{formatRoomSummary(layout)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                              <CheckCircle2 size={12} />
                              Selected
                            </span>
                          ) : null}
                          {layout.isSystem ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              System
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              Custom
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-slate-400">
                        {layout.roomBlueprint.map((room) => room.label).join(', ')}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {turnoverPresets.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Step 2</div>
                  <label className="mt-1 block text-base font-semibold text-slate-800">Choose the turnover preset</label>
                  <div className="mt-1 text-sm text-slate-500">Presets adjust generation-time defaults like inspect vs always replace and preferred product tier.</div>
                </div>
                <span className="text-right text-xs text-slate-400">Applies deterministic checklist defaults at generation time</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {turnoverPresets.map((preset) => {
                  const isSelected = preset.id === selectedPresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        isSelected
                          ? 'border-lowes-blue bg-blue-50 shadow-sm ring-1 ring-lowes-blue/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-800">{preset.label}</div>
                          <div className="mt-1 text-sm text-slate-500">{preset.description}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                              <CheckCircle2 size={12} />
                              Selected
                            </span>
                          ) : null}
                          {preset.preferredProductTier ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {preset.preferredProductTier} tier
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {selectedLayout ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <ClipboardList size={16} />
                Generated checklist preview
              </div>
              <div className="mt-2 text-sm text-slate-500">
                The inspection will use <span className="font-medium text-slate-700">{selectedLayout.name}</span> and resolve its mapped checklist automatically.
              </div>
              {selectedPreset ? (
                <div className="mt-2 text-sm text-slate-500">
                  Turnover preset: <span className="font-medium text-slate-700">{selectedPreset.label}</span>.
                </div>
              ) : null}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
          </div>

          <div
            data-testid="new-inspection-modal-footer"
            className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-4"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-600">
                <div className="font-medium text-slate-800">Ready to create</div>
                <div className="mt-1 text-xs text-slate-500">{creationSummary}</div>
              </div>
              <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center">
                <button
                  type="button"
                  onClick={() => void createInspectionWithOptionalTemplate(false)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  Create Without Template
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createInspectionWithOptionalTemplate(true)}
                  disabled={isSubmitting || layouts.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Create With Layout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, Loader2, Plus, X } from 'lucide-react';
import { LayoutTemplate } from '../core/models/templates';
import { LayoutTemplateService } from '../core/services/LayoutTemplateService';
import { LayoutChecklistMappingService } from '../core/services/LayoutChecklistMappingService';
import {
  InspectionTemplateGenerationResult,
  InspectionTemplateGenerationService,
} from '../core/services/InspectionTemplateGenerationService';
import { InspectionService } from '../core/services/InspectionService';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';

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
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>('');
  const [isLoadingLayouts, setIsLoadingLayouts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setLayouts([]);
      setSelectedLayoutId('');
      setErrorMessage(null);
      return;
    }

    const loadLayouts = async () => {
      setIsLoadingLayouts(true);
      setErrorMessage(null);
      try {
        const availableLayouts = await LayoutTemplateService.listActive(org?.id || null);
        setLayouts(availableLayouts);
        if (availableLayouts.length > 0) {
          setSelectedLayoutId((current) => current || availableLayouts[0].id);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage('Failed to load layout templates.');
      } finally {
        setIsLoadingLayouts(false);
      }
    };

    void loadLayouts();
  }, [isOpen, org?.id]);

  const selectedLayout = useMemo(
    () => layouts.find((layout) => layout.id === selectedLayoutId) || null,
    [layouts, selectedLayoutId]
  );

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-800">New Inspection</h2>
            <p className="text-sm text-slate-500">Choose a layout to generate a checklist snapshot.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Inspection Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Move-out Check"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-lowes-blue focus:border-transparent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-700">Layout Template</label>
              <span className="text-xs text-slate-400">Optional fallback: create without template</span>
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
                          ? 'border-lowes-blue bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-800">{layout.name}</div>
                          <div className="text-sm text-slate-500 mt-1">{formatRoomSummary(layout)}</div>
                        </div>
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
                      <div className="mt-3 text-xs text-slate-400">
                        {layout.roomBlueprint.map((room) => room.label).join(', ')}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedLayout ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <ClipboardList size={16} />
                Generated checklist preview
              </div>
              <div className="mt-2 text-sm text-slate-500">
                The inspection will use <span className="font-medium text-slate-700">{selectedLayout.name}</span> and resolve its mapped checklist automatically.
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 md:flex-row md:justify-between">
          <button
            type="button"
            onClick={() => void createInspectionWithOptionalTemplate(false)}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Create Without Template
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createInspectionWithOptionalTemplate(true)}
              disabled={isSubmitting || layouts.length === 0}
              className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Create With Layout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

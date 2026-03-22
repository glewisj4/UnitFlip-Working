import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  ChecklistTemplate,
  LayoutChecklistMapping,
  LayoutTemplate,
} from '../core/models/templates';
import { LayoutChecklistMappingService } from '../core/services/LayoutChecklistMappingService';

interface MappingEditorModalProps {
  isOpen: boolean;
  orgId: string;
  layouts: LayoutTemplate[];
  checklists: ChecklistTemplate[];
  mapping?: LayoutChecklistMapping | null;
  mode: 'create' | 'edit' | 'customize';
  onClose: () => void;
  onSaved: () => void;
}

export const MappingEditorModal: React.FC<MappingEditorModalProps> = ({
  isOpen,
  orgId,
  layouts,
  checklists,
  mapping,
  mode,
  onClose,
  onSaved,
}) => {
  const [layoutTemplateId, setLayoutTemplateId] = useState('');
  const [checklistTemplateId, setChecklistTemplateId] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLayoutTemplateId(mapping?.layoutTemplateId || layouts[0]?.id || '');
    setChecklistTemplateId(mapping?.checklistTemplateId || checklists[0]?.id || '');
    setIsDefault(mapping?.isDefault ?? true);
    setIsActive(mapping?.isActive ?? true);
    setErrorMessage(null);
  }, [isOpen, mapping, layouts, checklists]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (mode === 'edit' && mapping) {
        await LayoutChecklistMappingService.update({
          ...mapping,
          layoutTemplateId,
          checklistTemplateId,
          isDefault,
          isActive,
        });
      } else {
        await LayoutChecklistMappingService.create({
          orgId,
          layoutTemplateId,
          checklistTemplateId,
          isDefault,
          isActive,
        });
      }

      onSaved();
      onClose();
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save mapping.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {mode === 'edit' ? 'Edit Mapping' : mode === 'customize' ? 'Customize Mapping' : 'New Mapping'}
            </h2>
            <p className="text-sm text-slate-500">Link a layout template to its checklist template.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Layout Template</label>
            <select
              value={layoutTemplateId}
              onChange={(event) => setLayoutTemplateId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
            >
              {layouts.filter((layout) => layout.isActive).map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Checklist Template</label>
            <select
              value={checklistTemplateId}
              onChange={(event) => setChecklistTemplateId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
            >
              {checklists.filter((checklist) => checklist.isActive).map((checklist) => (
                <option key={checklist.id} value={checklist.id}>
                  {checklist.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
            Default mapping for this layout
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            Active mapping
          </label>

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex justify-end gap-3">
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
            className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            Save Mapping
          </button>
        </div>
      </div>
    </div>
  );
};

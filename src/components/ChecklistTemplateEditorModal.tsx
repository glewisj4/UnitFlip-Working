import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  CHECKLIST_APPLICATION_MODES,
  CHECKLIST_DEFAULT_ACTION_MODES,
  CHECKLIST_ITEM_INPUT_MODES,
  CHECKLIST_ITEM_TYPES,
  ChecklistDefaultActionMode,
  ChecklistItemInputMode,
  ChecklistItemTemplate,
  ChecklistItemType,
  ChecklistRecipeSection,
  ChecklistTemplate,
  LAYOUT_ROOM_TYPES,
} from '../core/models/templates';
import { ChecklistTemplateService } from '../core/services/ChecklistTemplateService';
import { createPrefixedId } from '../services/storage';

interface ChecklistTemplateEditorModalProps {
  isOpen: boolean;
  orgId: string;
  template?: ChecklistTemplate | null;
  mode: 'create' | 'edit' | 'customize';
  onClose: () => void;
  onSaved: () => void;
}

const createDefaultItem = (): ChecklistItemTemplate => ({
  id: createPrefixedId('chk_item_'),
  label: '',
  category: 'general',
  required: true,
  itemType: 'inspection',
  inputMode: 'none',
  supportsAlwaysReplace: false,
  defaultActionMode: 'inspect',
});

const createDefaultSection = (index: number): ChecklistRecipeSection => ({
  id: createPrefixedId('chk_section_'),
  title: `Section ${index + 1}`,
  appliesTo: 'unit',
  order: index + 1,
  items: [createDefaultItem()],
});

export const ChecklistTemplateEditorModal: React.FC<ChecklistTemplateEditorModalProps> = ({
  isOpen,
  orgId,
  template,
  mode,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [sections, setSections] = useState<ChecklistRecipeSection[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (template) {
      setName(mode === 'customize' ? `${template.name} (Custom)` : template.name);
      setSections(
        template.recipeSections.map((section, sectionIndex) => ({
          ...section,
          id: mode === 'edit' ? section.id : createPrefixedId(`chk_section_${sectionIndex}_`),
          items: section.items.map((item, itemIndex) => ({
            ...item,
            id: mode === 'edit' ? item.id : createPrefixedId(`chk_item_${sectionIndex}_${itemIndex}_`),
          })),
        }))
      );
    } else {
      setName('');
      setSections([createDefaultSection(0)]);
    }

    setErrorMessage(null);
  }, [isOpen, template, mode]);

  if (!isOpen) return null;

  const updateSections = (nextSections: ChecklistRecipeSection[]) => {
    setSections(
      nextSections.map((section, index) => ({
        ...section,
        order: index + 1,
        items: section.items.map((item) => ({ ...item })),
      }))
    );
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    const index = sections.findIndex((section) => section.id === sectionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return;
    const nextSections = [...sections];
    [nextSections[index], nextSections[nextIndex]] = [nextSections[nextIndex], nextSections[index]];
    updateSections(nextSections);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        name,
        slug: template?.slug || '',
        recipeSections: sections.map((section, sectionIndex) => ({
          ...section,
          title: section.title.trim(),
          order: sectionIndex + 1,
          roomType: section.appliesTo === 'unit' ? undefined : section.roomType,
          items: section.items.map((item) => {
            const itemType = item.itemType || 'inspection';
            const inputMode = item.inputMode || 'none';
            const defaultQuantity =
              inputMode === 'count' && typeof item.defaultQuantity === 'number' && item.defaultQuantity > 0
                ? item.defaultQuantity
                : undefined;

            return {
              ...item,
              label: item.label.trim(),
              category: item.category.trim() || 'general',
              itemType,
              inputMode,
              defaultQuantity,
              supportsAlwaysReplace: Boolean(item.supportsAlwaysReplace || itemType === 'always_replace'),
              defaultActionMode:
                item.defaultActionMode || (itemType === 'always_replace' ? 'always_replace' : 'inspect'),
            };
          }),
        })),
      };

      if (mode === 'edit' && template) {
        await ChecklistTemplateService.update({
          ...template,
          ...payload,
        });
      } else {
        await ChecklistTemplateService.create({
          ...payload,
          orgId,
        });
      }

      onSaved();
      onClose();
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save checklist template.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {mode === 'edit' ? 'Edit Checklist Template' : mode === 'customize' ? 'Customize Checklist Template' : 'New Checklist Template'}
            </h2>
            <p className="text-sm text-slate-500">Define reusable recipe sections and checklist items.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Template Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-lowes-blue"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Recipe Sections</h3>
              <p className="text-sm text-slate-500">Each section can target the unit or a room type.</p>
            </div>
            <button
              type="button"
              onClick={() => updateSections([...sections, createDefaultSection(sections.length)])}
              className="rounded-lg bg-lowes-blue px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={16} />
              Add Section
            </button>
          </div>

          <div className="space-y-4">
            {sections.map((section, sectionIndex) => (
              <div key={section.id} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="font-semibold text-slate-800">Section {sectionIndex + 1}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, -1)}
                      disabled={sectionIndex === 0}
                      className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={sectionIndex === sections.length - 1}
                      className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSections(sections.filter((entry) => entry.id !== section.id))}
                      className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Section Title</label>
                      <input
                        value={section.title}
                        onChange={(event) =>
                          updateSections(
                            sections.map((entry) =>
                              entry.id === section.id ? { ...entry, title: event.target.value } : entry
                            )
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Application Mode</label>
                      <select
                        value={section.appliesTo}
                        onChange={(event) =>
                          updateSections(
                            sections.map((entry) =>
                              entry.id === section.id
                                ? {
                                    ...entry,
                                    appliesTo: event.target.value as ChecklistRecipeSection['appliesTo'],
                                    roomType: event.target.value === 'unit' ? undefined : entry.roomType || 'bedroom',
                                  }
                                : entry
                            )
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                      >
                        {CHECKLIST_APPLICATION_MODES.map((modeOption) => (
                          <option key={modeOption} value={modeOption}>
                            {modeOption.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Room Type</label>
                      <select
                        value={section.roomType || ''}
                        disabled={section.appliesTo === 'unit'}
                        onChange={(event) =>
                          updateSections(
                            sections.map((entry) =>
                              entry.id === section.id
                                ? { ...entry, roomType: event.target.value as ChecklistRecipeSection['roomType'] }
                                : entry
                            )
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white disabled:bg-slate-100"
                      >
                        <option value="">Select room type</option>
                        {LAYOUT_ROOM_TYPES.map((roomType) => (
                          <option key={roomType} value={roomType}>
                            {roomType.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {section.items.map((item, itemIndex) => (
                      <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto] gap-3 items-start rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Item Label</label>
                          <input
                            value={item.label}
                            onChange={(event) =>
                              updateSections(
                                sections.map((entry) =>
                                  entry.id !== section.id
                                    ? entry
                                    : {
                                        ...entry,
                                        items: entry.items.map((listItem) =>
                                          listItem.id === item.id
                                            ? { ...listItem, label: event.target.value }
                                            : listItem
                                        ),
                                      }
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                          <input
                            value={item.category}
                            onChange={(event) =>
                              updateSections(
                                sections.map((entry) =>
                                  entry.id !== section.id
                                    ? entry
                                    : {
                                        ...entry,
                                        items: entry.items.map((listItem) =>
                                          listItem.id === item.id
                                            ? { ...listItem, category: event.target.value }
                                            : listItem
                                        ),
                                      }
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Item Type</label>
                          <select
                            value={item.itemType || 'inspection'}
                            onChange={(event) => {
                              const nextItemType = event.target.value as ChecklistItemType;
                              updateSections(
                                sections.map((entry) =>
                                  entry.id !== section.id
                                    ? entry
                                    : {
                                        ...entry,
                                        items: entry.items.map((listItem) =>
                                          listItem.id === item.id
                                            ? {
                                                ...listItem,
                                                itemType: nextItemType,
                                                supportsAlwaysReplace:
                                                  nextItemType === 'always_replace' || Boolean(listItem.supportsAlwaysReplace),
                                                defaultActionMode:
                                                  nextItemType === 'always_replace'
                                                    ? 'always_replace'
                                                    : listItem.defaultActionMode === 'always_replace'
                                                      ? 'inspect'
                                                      : listItem.defaultActionMode || 'inspect',
                                                inputMode:
                                                  nextItemType === 'always_replace' && (!listItem.inputMode || listItem.inputMode === 'none')
                                                    ? 'count'
                                                    : listItem.inputMode || 'none',
                                                defaultQuantity:
                                                  nextItemType === 'always_replace' && (!listItem.inputMode || listItem.inputMode === 'none')
                                                    ? listItem.defaultQuantity || 1
                                                    : listItem.defaultQuantity,
                                              }
                                            : listItem
                                        ),
                                      }
                                )
                              );
                            }}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white capitalize"
                          >
                            {CHECKLIST_ITEM_TYPES.map((itemType) => (
                              <option key={itemType} value={itemType}>
                                {itemType.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Input Mode</label>
                          <select
                            value={item.inputMode || 'none'}
                            onChange={(event) => {
                              const nextInputMode = event.target.value as ChecklistItemInputMode;
                              updateSections(
                                sections.map((entry) =>
                                  entry.id !== section.id
                                    ? entry
                                    : {
                                        ...entry,
                                        items: entry.items.map((listItem) =>
                                          listItem.id === item.id
                                            ? {
                                                ...listItem,
                                                inputMode: nextInputMode,
                                                defaultQuantity:
                                                  nextInputMode === 'count' ? listItem.defaultQuantity || 1 : undefined,
                                              }
                                            : listItem
                                        ),
                                      }
                                )
                              );
                            }}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white capitalize"
                          >
                            {CHECKLIST_ITEM_INPUT_MODES.map((inputMode) => (
                              <option key={inputMode} value={inputMode}>
                                {inputMode.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Default Mode</label>
                          <select
                            value={item.defaultActionMode || 'inspect'}
                            onChange={(event) => {
                              const nextActionMode = event.target.value as ChecklistDefaultActionMode;
                              updateSections(
                                sections.map((entry) =>
                                  entry.id !== section.id
                                    ? entry
                                    : {
                                        ...entry,
                                        items: entry.items.map((listItem) =>
                                          listItem.id === item.id
                                            ? {
                                                ...listItem,
                                                defaultActionMode: nextActionMode,
                                                itemType:
                                                  nextActionMode === 'always_replace'
                                                    ? 'always_replace'
                                                    : listItem.itemType || 'inspection',
                                                supportsAlwaysReplace:
                                                  nextActionMode === 'always_replace' || Boolean(listItem.supportsAlwaysReplace),
                                                inputMode:
                                                  nextActionMode === 'always_replace' && (!listItem.inputMode || listItem.inputMode === 'none')
                                                    ? 'count'
                                                    : listItem.inputMode || 'none',
                                                defaultQuantity:
                                                  nextActionMode === 'always_replace' && (!listItem.inputMode || listItem.inputMode === 'none')
                                                    ? listItem.defaultQuantity || 1
                                                    : listItem.defaultQuantity,
                                              }
                                            : listItem
                                        ),
                                      }
                                )
                              );
                            }}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white capitalize"
                          >
                            {CHECKLIST_DEFAULT_ACTION_MODES.map((actionMode) => (
                              <option key={actionMode} value={actionMode}>
                                {actionMode.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                          {(item.inputMode || 'none') === 'count' ? (
                            <label className="mt-2 block text-xs font-medium text-slate-500">
                              Default Quantity
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={item.defaultQuantity || 1}
                                onChange={(event) => {
                                  const nextQuantity = Math.max(1, Math.floor(Number(event.target.value) || 1));
                                  updateSections(
                                    sections.map((entry) =>
                                      entry.id !== section.id
                                        ? entry
                                        : {
                                            ...entry,
                                            items: entry.items.map((listItem) =>
                                              listItem.id === item.id
                                                ? { ...listItem, defaultQuantity: nextQuantity }
                                                : listItem
                                            ),
                                          }
                                    )
                                  );
                                }}
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              />
                            </label>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                          <button
                            type="button"
                            onClick={() =>
                              updateSections(
                                sections.map((entry) =>
                                  entry.id !== section.id
                                    ? entry
                                    : {
                                        ...entry,
                                        items: entry.items.filter((listItem) => listItem.id !== item.id),
                                      }
                                )
                              )
                            }
                            className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={item.required}
                              onChange={(event) =>
                                updateSections(
                                  sections.map((entry) =>
                                    entry.id !== section.id
                                      ? entry
                                      : {
                                          ...entry,
                                          items: entry.items.map((listItem) =>
                                            listItem.id === item.id
                                              ? { ...listItem, required: event.target.checked }
                                              : listItem
                                          ),
                                        }
                                  )
                                )
                              }
                            />
                            Required
                          </label>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        updateSections(
                          sections.map((entry) =>
                            entry.id !== section.id
                              ? entry
                              : { ...entry, items: [...entry.items, createDefaultItem()] }
                          )
                        )
                      }
                      className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Plus size={14} />
                      Add Item
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

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
            Save Checklist
          </button>
        </div>
      </div>
    </div>
  );
};

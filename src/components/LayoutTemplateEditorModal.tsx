import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  LAYOUT_ROOM_TYPES,
  LAYOUT_UNIT_TYPES,
  ChecklistTemplate,
  LayoutRoomBlueprint,
  LayoutTemplate,
} from '../core/models/templates';
import { LayoutTemplateService } from '../core/services/LayoutTemplateService';
import { createPrefixedId } from '../services/storage';

interface LayoutTemplateEditorModalProps {
  isOpen: boolean;
  orgId: string;
  checklistTemplates: ChecklistTemplate[];
  template?: LayoutTemplate | null;
  mode: 'create' | 'edit' | 'customize';
  onClose: () => void;
  onSaved: () => void;
}

const defaultRoom = (index: number): LayoutRoomBlueprint => ({
  id: createPrefixedId('layout_room_'),
  roomType: 'bedroom',
  label: `Room ${index + 1}`,
  order: index + 1,
  required: true,
});

export const LayoutTemplateEditorModal: React.FC<LayoutTemplateEditorModalProps> = ({
  isOpen,
  orgId,
  checklistTemplates,
  template,
  mode,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState<(typeof LAYOUT_UNIT_TYPES)[number]>('apartment');
  const [bedrooms, setBedrooms] = useState(1);
  const [bathroomsFull, setBathroomsFull] = useState(1);
  const [bathroomsHalf, setBathroomsHalf] = useState(0);
  const [defaultChecklistTemplateId, setDefaultChecklistTemplateId] = useState<string>('');
  const [roomBlueprint, setRoomBlueprint] = useState<LayoutRoomBlueprint[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (template) {
      setName(mode === 'customize' ? `${template.name} (Custom)` : template.name);
      setUnitType(template.unitType);
      setBedrooms(template.bedrooms);
      setBathroomsFull(template.bathroomsFull);
      setBathroomsHalf(template.bathroomsHalf);
      setDefaultChecklistTemplateId(template.defaultChecklistTemplateId || '');
      setRoomBlueprint(
        template.roomBlueprint.map((room) => ({
          ...room,
          id: mode === 'edit' ? room.id : createPrefixedId('layout_room_'),
        }))
      );
    } else {
      setName('');
      setUnitType('apartment');
      setBedrooms(1);
      setBathroomsFull(1);
      setBathroomsHalf(0);
      setDefaultChecklistTemplateId('');
      setRoomBlueprint([
        {
          id: createPrefixedId('layout_room_'),
          roomType: 'living_room',
          label: 'Living Room',
          order: 1,
          required: true,
        },
        {
          id: createPrefixedId('layout_room_'),
          roomType: 'kitchen',
          label: 'Kitchen',
          order: 2,
          required: true,
        },
        {
          id: createPrefixedId('layout_room_'),
          roomType: 'bathroom',
          label: 'Bathroom',
          order: 3,
          required: true,
        },
      ]);
    }

    setErrorMessage(null);
  }, [isOpen, template, mode]);

  if (!isOpen) return null;

  const updateRooms = (nextRooms: LayoutRoomBlueprint[]) => {
    setRoomBlueprint(
      nextRooms.map((room, index) => ({
        ...room,
        order: index + 1,
      }))
    );
  };

  const moveRoom = (roomId: string, direction: -1 | 1) => {
    const index = roomBlueprint.findIndex((room) => room.id === roomId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= roomBlueprint.length) return;

    const nextRooms = [...roomBlueprint];
    [nextRooms[index], nextRooms[nextIndex]] = [nextRooms[nextIndex], nextRooms[index]];
    updateRooms(nextRooms);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        name,
        slug: template?.slug || '',
        unitType,
        bedrooms,
        bathroomsFull,
        bathroomsHalf,
        defaultChecklistTemplateId: defaultChecklistTemplateId || null,
        roomBlueprint: roomBlueprint.map((room, index) => ({
          ...room,
          label: room.label.trim(),
          sequence: room.sequence ?? index + 1,
          order: index + 1,
        })),
      };

      if (mode === 'edit' && template) {
        await LayoutTemplateService.update({
          ...template,
          ...payload,
        });
      } else {
        await LayoutTemplateService.create({
          ...payload,
          orgId,
        });
      }

      onSaved();
      onClose();
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save layout template.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {mode === 'edit' ? 'Edit Layout Template' : mode === 'customize' ? 'Customize Layout Template' : 'New Layout Template'}
            </h2>
            <p className="text-sm text-slate-500">Create a layout blueprint for future inspections.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-lowes-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit Type</label>
              <select
                value={unitType}
                onChange={(event) => setUnitType(event.target.value as (typeof LAYOUT_UNIT_TYPES)[number])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                {LAYOUT_UNIT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bedrooms</label>
              <input
                type="number"
                min={0}
                value={bedrooms}
                onChange={(event) => setBedrooms(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-lowes-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Bathrooms</label>
              <input
                type="number"
                min={0}
                value={bathroomsFull}
                onChange={(event) => setBathroomsFull(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-lowes-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Half Bathrooms</label>
              <input
                type="number"
                min={0}
                value={bathroomsHalf}
                onChange={(event) => setBathroomsHalf(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-lowes-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Checklist</label>
              <select
                value={defaultChecklistTemplateId}
                onChange={(event) => setDefaultChecklistTemplateId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="">None</option>
                {checklistTemplates
                  .filter((checklist) => checklist.isActive)
                  .map((checklist) => (
                    <option key={checklist.id} value={checklist.id}>
                      {checklist.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Room Blueprint</h3>
                <p className="text-sm text-slate-500">Add rooms and set their types, labels, and order.</p>
              </div>
              <button
                type="button"
                onClick={() => updateRooms([...roomBlueprint, defaultRoom(roomBlueprint.length)])}
                className="rounded-lg bg-lowes-blue px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={16} />
                Add Room
              </button>
            </div>

            <div className="space-y-3">
              {roomBlueprint.map((room, index) => (
                <div key={room.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_auto] gap-3 items-start">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Room Label</label>
                      <input
                        value={room.label}
                        onChange={(event) =>
                          updateRooms(
                            roomBlueprint.map((entry) =>
                              entry.id === room.id ? { ...entry, label: event.target.value } : entry
                            )
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Room Type</label>
                      <select
                        value={room.roomType}
                        onChange={(event) =>
                          updateRooms(
                            roomBlueprint.map((entry) =>
                              entry.id === room.id
                                ? {
                                    ...entry,
                                    roomType: event.target.value as LayoutRoomBlueprint['roomType'],
                                  }
                                : entry
                            )
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                      >
                        {LAYOUT_ROOM_TYPES.map((roomType) => (
                          <option key={roomType} value={roomType}>
                            {roomType.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6 md:pt-0">
                      <button
                        type="button"
                        onClick={() => moveRoom(room.id, -1)}
                        disabled={index === 0}
                        className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRoom(room.id, 1)}
                        disabled={index === roomBlueprint.length - 1}
                        className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRooms(roomBlueprint.filter((entry) => entry.id !== room.id))}
                        className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
            Save Layout
          </button>
        </div>
      </div>
    </div>
  );
};

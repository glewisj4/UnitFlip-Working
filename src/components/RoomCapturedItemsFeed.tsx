import React from 'react';
import { AlertCircle, Camera, ChevronDown, ClipboardList, Loader2, PackagePlus, Pencil, StickyNote, Trash2, TriangleAlert, Wrench } from 'lucide-react';
import { InspectionCaptureDraft, InspectionCaptureKind } from '../core/services/InspectionCaptureParserService';

export interface RoomCapturedFeedItem {
  id: string;
  entityId: string;
  entityType: 'finding' | 'task';
  title: string;
  type: InspectionCaptureKind;
  quantity?: number;
  roomLabel?: string;
  source: 'manual' | 'parsed' | 'photo' | 'checklist' | 'voice';
  checklistLabel?: string;
  aliasMatched?: string;
  inferredTrade?: string;
  attachmentCount?: number;
  notes?: string;
  transcriptPreview?: string;
  transcriptState?: 'available' | 'partial' | 'empty' | 'unsupported';
  voiceFallbackLabel?: string;
  voiceDurationLabel?: string;
  audioAttachmentPresent?: boolean;
  timestampLabel?: string;
  statusLabel?: string;
  priorityLabel?: string;
  chips: string[];
}

interface RoomCapturedItemsFeedProps {
  items: RoomCapturedFeedItem[];
  roomOptions: Array<{ id: string; label: string }>;
  editingDraft: InspectionCaptureDraft | null;
  expandedItemId: string | null;
  photoPreviewUrls: Record<string, string>;
  stagedPhotos: Array<{ id: string; previewUrl: string; fileName: string }>;
  pendingRemovedPhotoIds: string[];
  saveState: {
    phase: 'idle' | 'uploading_media' | 'saving_update' | 'failed';
    message?: string;
    errorMessage?: string;
  };
  isSaving: boolean;
  onToggleExpand: (itemId: string) => void;
  onDraftChange: (draft: InspectionCaptureDraft) => void;
  onStagePhoto: (file: File) => void;
  onRemoveStagedPhoto: (stagedPhotoId: string) => void;
  onToggleSavedPhotoRemoval: (photoId: string) => void;
  onSaveDraft: () => Promise<void> | void;
  onCancelEdit: () => void;
  onDeleteItem: (item: RoomCapturedFeedItem) => Promise<void> | void;
  recommendationPanel?: React.ReactNode;
}

const iconByType: Record<InspectionCaptureKind, React.ComponentType<{ size?: number; className?: string }>> = {
  replace: PackagePlus,
  repair: Wrench,
  missing: TriangleAlert,
  quantity: ClipboardList,
  note: StickyNote,
  task: Wrench,
};

const typeChipStyles: Record<InspectionCaptureKind, string> = {
  replace: 'bg-blue-100 text-blue-800',
  repair: 'bg-amber-100 text-amber-800',
  missing: 'bg-rose-100 text-rose-800',
  quantity: 'bg-sky-100 text-sky-800',
  note: 'bg-slate-200 text-slate-700',
  task: 'bg-emerald-100 text-emerald-800',
};

const sourceChipStyles: Record<RoomCapturedFeedItem['source'], string> = {
  manual: 'bg-white text-slate-600',
  parsed: 'bg-white text-slate-600',
  photo: 'bg-white text-slate-600',
  checklist: 'bg-white text-slate-600',
  voice: 'bg-indigo-100 text-indigo-800',
};
const transcriptStateLabels = {
  available: 'Transcript ready',
  partial: 'Transcript may be incomplete',
  empty: 'No words detected',
  unsupported: 'Transcript unavailable',
} as const;

const KIND_OPTIONS: InspectionCaptureKind[] = ['replace', 'repair', 'missing', 'quantity', 'note', 'task'];
type CapturedFeedGroupId = 'attention' | 'follow_up' | 'progress' | 'completed';

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeStatus = (value?: string) => (value || '').trim().toLowerCase();

const getCapturedFeedGroup = (item: RoomCapturedFeedItem): CapturedFeedGroupId => {
  const status = normalizeStatus(item.statusLabel);
  const priority = normalizeStatus(item.priorityLabel);
  if (status.includes('blocked') || status.includes('failed') || priority.includes('high') || priority.includes('urgent') || item.type === 'missing') {
    return 'attention';
  }
  if (status.includes('completed') || status.includes('resolved')) {
    return 'completed';
  }
  if (item.entityType === 'task' || item.type === 'replace' || item.type === 'repair' || item.type === 'task') {
    return 'follow_up';
  }
  return 'progress';
};

const getCapturedFeedGroupWeight = (item: RoomCapturedFeedItem) => {
  const status = normalizeStatus(item.statusLabel);
  const priority = normalizeStatus(item.priorityLabel);
  if (status.includes('blocked') || status.includes('failed')) return 0;
  if (priority.includes('high') || priority.includes('urgent')) return 1;
  if (item.type === 'missing') return 2;
  if (item.entityType === 'task') return 3;
  if (item.type === 'replace') return 4;
  if (item.type === 'repair') return 5;
  if (status.includes('completed') || status.includes('resolved')) return 7;
  return 6;
};

export const RoomCapturedItemsFeed: React.FC<RoomCapturedItemsFeedProps> = ({
  items,
  roomOptions,
  editingDraft,
  expandedItemId,
  photoPreviewUrls,
  stagedPhotos,
  pendingRemovedPhotoIds,
  saveState,
  isSaving,
  onToggleExpand,
  onDraftChange,
  onStagePhoto,
  onRemoveStagedPhoto,
  onToggleSavedPhotoRemoval,
  onSaveDraft,
  onCancelEdit,
  onDeleteItem,
  recommendationPanel,
}) => {
  const groupedItems = {
    attention: items
      .filter((item) => getCapturedFeedGroup(item) === 'attention')
      .sort((left, right) => getCapturedFeedGroupWeight(left) - getCapturedFeedGroupWeight(right)),
    follow_up: items
      .filter((item) => getCapturedFeedGroup(item) === 'follow_up')
      .sort((left, right) => getCapturedFeedGroupWeight(left) - getCapturedFeedGroupWeight(right)),
    progress: items
      .filter((item) => getCapturedFeedGroup(item) === 'progress')
      .sort((left, right) => getCapturedFeedGroupWeight(left) - getCapturedFeedGroupWeight(right)),
    completed: items
      .filter((item) => getCapturedFeedGroup(item) === 'completed')
      .sort((left, right) => getCapturedFeedGroupWeight(left) - getCapturedFeedGroupWeight(right)),
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Structured Scope From Capture</h3>
          <p className="text-sm text-slate-500">Every saved capture becomes a real finding or repair task here. Open any item to edit the same record instead of managing a separate draft.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            {groupedItems.attention.length} need attention
          </span>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
            {groupedItems.follow_up.length} need follow-up
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {items.length} total
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No structured findings or repair tasks exist for this room yet. Capture a note, photo, or checklist issue to create the first one.
        </div>
      ) : (
        <div className="space-y-3">
          {([
            {
              id: 'attention',
              title: 'Needs Attention',
              detail: 'Blocked, failed, missing, or otherwise high-priority captured items.',
              tone: 'border-amber-200 bg-amber-50',
              items: groupedItems.attention,
            },
            {
              id: 'follow_up',
              title: 'Needs Materials / Follow-up',
              detail: 'Repair and replacement records that are most likely to drive downstream work.',
              tone: 'border-blue-200 bg-blue-50',
              items: groupedItems.follow_up,
            },
            {
              id: 'progress',
              title: 'In Progress',
              detail: 'Captured notes and findings that are saved but still need review or refinement.',
              tone: 'border-slate-200 bg-slate-50',
              items: groupedItems.progress,
            },
            {
              id: 'completed',
              title: 'Completed',
              detail: 'Resolved captured items stay available here for auditability without crowding active work.',
              tone: 'border-emerald-200 bg-emerald-50',
              items: groupedItems.completed,
            },
          ] as Array<{
            id: CapturedFeedGroupId;
            title: string;
            detail: string;
            tone: string;
            items: RoomCapturedFeedItem[];
          }>).map((group) => {
            if (group.items.length === 0) return null;
            const GroupWrapper: React.ElementType = group.id === 'completed' ? 'details' : 'div';
            const groupWrapperProps =
              group.id === 'completed'
                ? { className: `rounded-xl border p-3 ${group.tone}`, open: false }
                : { className: `rounded-xl border p-3 ${group.tone}` };

            return (
              <GroupWrapper key={group.id} {...groupWrapperProps}>
                {group.id === 'completed' ? (
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{group.title}</h4>
                      <p className="mt-1 text-xs text-slate-600">{group.detail}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {group.items.length}
                    </span>
                  </summary>
                ) : (
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{group.title}</h4>
                      <p className="mt-1 text-xs text-slate-600">{group.detail}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {group.items.length}
                    </span>
                  </div>
                )}

                <div className={`space-y-2 ${group.id === 'completed' ? 'mt-3' : ''}`}>
          {group.items.map((item) => {
            const Icon = iconByType[item.type];
            const isExpanded = expandedItemId === item.id && editingDraft?.existingEntityId === item.entityId;
            const visibleChips = item.chips.slice(0, 3);
            const extraChipCount = Math.max(0, item.chips.length - visibleChips.length);

            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-2xl border transition-colors ${
                  isExpanded ? 'border-lowes-blue bg-blue-50/50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => onToggleExpand(item.id)}
                  className="flex w-full items-start gap-3 p-3 text-left disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-600">
                    <Icon size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${typeChipStyles[item.type]}`}>
                            {titleCase(item.type)}
                          </span>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                            {item.entityType === 'task' ? 'Task' : 'Finding'}
                          </span>
                          {item.statusLabel ? (
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
                              {item.statusLabel}
                            </span>
                          ) : null}
                          {typeof item.quantity === 'number' ? (
                            <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-800">
                              x{item.quantity}
                            </span>
                          ) : null}
                          {visibleChips.map((chip) => (
                            <span
                              key={chip}
                              className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                chip === 'Voice Source' ? sourceChipStyles.voice : 'bg-white text-slate-600'
                              }`}
                            >
                              {chip}
                            </span>
                          ))}
                          {item.attachmentCount ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-800">
                              Evidence {item.attachmentCount}
                            </span>
                          ) : null}
                          {extraChipCount > 0 ? (
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-500">
                              +{extraChipCount} more
                            </span>
                          ) : null}
                        </div>
                        {item.transcriptPreview || item.notes ? (
                          <div className="mt-2 space-y-1">
                            {item.source === 'voice' ? (
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                {item.transcriptPreview ? 'Voice text' : 'Voice note'}
                              </div>
                            ) : null}
                            <p className="line-clamp-2 text-xs text-slate-500">{item.transcriptPreview || item.notes}</p>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                          {item.priorityLabel ? <span>Priority: {item.priorityLabel}</span> : null}
                          {item.timestampLabel ? <span>{item.timestampLabel}</span> : null}
                        </div>
                      </div>

                      <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${
                        isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-600'
                      }`}>
                        <Pencil size={12} />
                        {isExpanded ? 'Editing' : 'Edit'}
                        <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </span>
                    </div>
                  </div>
                </button>

                {isExpanded && editingDraft ? (
                  <div className="border-t border-blue-100 bg-white p-3">
                    <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-800">Editing saved record</div>
                      <div className="mt-1 text-xs text-blue-900">Changes stay local until you save. Saved media remains evidence on this item unless you mark it for removal.</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-slate-700">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Type</span>
                        <select
                          value={editingDraft.kind}
                          disabled={isSaving}
                          onChange={(event) =>
                            onDraftChange({
                              ...editingDraft,
                              kind: event.target.value as InspectionCaptureKind,
                              persistenceTarget:
                                event.target.value === 'replace' || event.target.value === 'repair' || event.target.value === 'task'
                                  ? 'task'
                                  : 'finding',
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {KIND_OPTIONS.map((kind) => (
                            <option key={kind} value={kind}>
                              {kind}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm text-slate-700">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Quantity</span>
                        <input
                          type="number"
                          min={0}
                          disabled={isSaving}
                          value={editingDraft.quantity ?? ''}
                          onChange={(event) =>
                            onDraftChange({
                              ...editingDraft,
                              quantity: event.target.value ? Number(event.target.value) : undefined,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>

                      <label className="text-sm text-slate-700 md:col-span-2">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Room</span>
                        <select
                          value={editingDraft.roomId || ''}
                          disabled={isSaving}
                          onChange={(event) => {
                            const room = roomOptions.find((option) => option.id === event.target.value);
                            onDraftChange({
                              ...editingDraft,
                              roomId: room?.id,
                              roomLabel: room?.label || editingDraft.roomLabel,
                            });
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {roomOptions.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm text-slate-700 md:col-span-2">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Label</span>
                        <input
                          type="text"
                          disabled={isSaving}
                          value={editingDraft.label}
                          onChange={(event) => onDraftChange({ ...editingDraft, label: event.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>

                      <label className="text-sm text-slate-700 md:col-span-2">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Notes</span>
                        <textarea
                          rows={2}
                          disabled={isSaving}
                          value={editingDraft.notes}
                          onChange={(event) => onDraftChange({ ...editingDraft, notes: event.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>

                      <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence</div>
                            <p className="mt-1 text-xs text-slate-500">Saved photos stay linked to this item. New photos and removals stay local until you save edits.</p>
                          </div>
                          <label className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 ${isSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                            {isSaving ? 'Working...' : 'Add Photo'}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              multiple
                              disabled={isSaving}
                              className="hidden"
                              onChange={(event) => {
                                const files = Array.from(event.target.files || []);
                                for (const file of files) {
                                  onStagePhoto(file);
                                }
                                event.target.value = '';
                              }}
                            />
                          </label>
                        </div>

                        <div className="mt-3 space-y-3">
                          {editingDraft.photoIds.length > 0 ? (
                            <div>
                              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Saved Media</div>
                              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                {editingDraft.photoIds.map((photoId) => (
                                  <div
                                    key={photoId}
                                    className={`rounded-xl border p-2 ${
                                      pendingRemovedPhotoIds.includes(photoId)
                                        ? 'border-rose-200 bg-rose-50'
                                        : 'border-slate-200 bg-white'
                                    }`}
                                  >
                                    <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                                      {photoPreviewUrls[photoId] ? (
                                        <img
                                          src={photoPreviewUrls[photoId]}
                                          alt="Saved evidence"
                                          className={`h-full w-full object-cover ${pendingRemovedPhotoIds.includes(photoId) ? 'opacity-40' : ''}`}
                                        />
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-[11px] font-medium text-slate-400">Loading</div>
                                      )}
                                      <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => onToggleSavedPhotoRemoval(photoId)}
                                        className={`absolute right-1 top-1 rounded-full p-1 text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                                          pendingRemovedPhotoIds.includes(photoId) ? 'bg-emerald-600/90' : 'bg-black/70'
                                        }`}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                    <div className={`mt-2 text-[11px] font-medium ${pendingRemovedPhotoIds.includes(photoId) ? 'text-rose-700' : 'text-emerald-700'}`}>
                                      {pendingRemovedPhotoIds.includes(photoId) ? 'Remove on save' : 'Saved'}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => onToggleSavedPhotoRemoval(photoId)}
                                      className={`mt-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                                        pendingRemovedPhotoIds.includes(photoId) ? 'text-emerald-700' : 'text-rose-700'
                                      }`}
                                    >
                                      {pendingRemovedPhotoIds.includes(photoId) ? 'Keep photo' : 'Remove from item'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {stagedPhotos.length > 0 ? (
                            <div>
                              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">New Media</div>
                              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                {stagedPhotos.map((photo) => (
                                  <div key={photo.id} className="rounded-xl border border-sky-200 bg-sky-50 p-2">
                                    <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                                      <img src={photo.previewUrl} alt="Staged evidence" className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => onRemoveStagedPhoto(photo.id)}
                                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                    <div className="mt-2 truncate text-[11px] font-medium text-sky-800">{photo.fileName}</div>
                                    <div className="text-[11px] font-medium text-amber-700">New until save</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {editingDraft.photoIds.length === 0 && stagedPhotos.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                              No media linked yet. Add photos here to update the existing captured item.
                            </div>
                          ) : null}

                          {pendingRemovedPhotoIds.length > 0 ? (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                              {pendingRemovedPhotoIds.length} saved photo{pendingRemovedPhotoIds.length === 1 ? '' : 's'} will be unlinked from this item when you save.
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {[ 
                          item.checklistLabel ? `Checklist: ${item.checklistLabel}` : null,
                          item.aliasMatched ? `Alias: ${item.aliasMatched}` : null,
                          item.inferredTrade ? `Trade: ${item.inferredTrade}` : null,
                          item.attachmentCount ? `Photos: ${item.attachmentCount}` : null,
                          item.voiceDurationLabel ? `Voice: ${item.voiceDurationLabel}` : null,
                          item.transcriptState ? transcriptStateLabels[item.transcriptState] : null,
                          item.voiceFallbackLabel ? item.voiceFallbackLabel : null,
                          item.audioAttachmentPresent ? 'Audio attached' : null,
                        ]
                          .filter(Boolean)
                          .join(' • ') || 'No additional capture metadata'}
                      </div>
                    </div>

                    {saveState.phase === 'uploading_media' || saveState.phase === 'saving_update' ? (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        <Loader2 size={14} className="animate-spin" />
                        <span>{saveState.message || 'Saving changes...'}</span>
                      </div>
                    ) : null}

                    {saveState.phase === 'failed' && saveState.errorMessage ? (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{saveState.errorMessage}</span>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void onSaveDraft()}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSaving ? 'Working...' : 'Save Edits'}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={onCancelEdit}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void onDeleteItem(item)}
                        className="ml-auto rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="flex items-center gap-2">
                          <Trash2 size={14} />
                          Delete
                        </span>
                      </button>
                    </div>

                    {recommendationPanel ? <div className="mt-3">{recommendationPanel}</div> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
                </div>
              </GroupWrapper>
            );
          })}
        </div>
      )}
    </section>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Mic, MessageSquarePlus, PackagePlus, PencilLine, Wrench, Hash, Sparkles } from 'lucide-react';
import { InspectionCaptureAction, InspectionCaptureDraft, InspectionCaptureKind } from '../core/services/InspectionCaptureParserService';
import { VoiceCapturePanel } from './VoiceCapturePanel';
import { VoiceCaptureResult } from '../core/services/VoiceCaptureService';

interface InspectionCaptureStripProps {
  selectedAction: InspectionCaptureAction;
  onActionChange: (action: InspectionCaptureAction) => void;
  onSubmit: (action: InspectionCaptureAction, value: string) => Promise<void> | void;
  onPhotoCapture: (file: File, value: string) => Promise<void> | void;
  draft: InspectionCaptureDraft | null;
  roomOptions: Array<{ id: string; label: string }>;
  onDraftChange: (draft: InspectionCaptureDraft) => void;
  onDraftCommit: () => Promise<void> | void;
  onDraftCancel: () => void;
  onVoiceParseReview: (payload: { transcript: string; result: VoiceCaptureResult }) => Promise<void> | void;
  onVoiceSaveNote: (payload: { transcript: string; result: VoiceCaptureResult }) => Promise<void> | void;
  voiceLogContext?: {
    orgId?: string;
    userId?: string;
    inspectionId?: string;
    roomId?: string;
    roomLabel?: string;
  };
  disabled?: boolean;
  isUploading?: boolean;
  recommendationPanel?: React.ReactNode;
}

const ACTIONS: Array<{
  action: InspectionCaptureAction;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { action: 'replace', label: 'Replace', icon: PackagePlus },
  { action: 'repair', label: 'Repair', icon: Wrench },
  { action: 'quantity', label: 'Quantity', icon: Hash },
  { action: 'note', label: 'Rapid Text', icon: PencilLine },
  { action: 'photo', label: 'Photo', icon: Camera },
];

const KIND_OPTIONS: InspectionCaptureKind[] = ['replace', 'repair', 'missing', 'quantity', 'note', 'task'];
const voiceTranscriptStateLabels = {
  available: 'Transcript ready',
  partial: 'Transcript may be incomplete',
  empty: 'No words detected',
  unsupported: 'Transcript unavailable',
} as const;
const voiceFallbackLabels = {
  manual_note: 'Manual note',
  manual_transcript: 'Manual entry',
  transcript: 'Transcript',
} as const;

const getDraftEntityLabel = (draft: InspectionCaptureDraft) =>
  draft.persistenceTarget === 'finding' ? 'finding' : 'repair task';

const getDraftTitle = (draft: InspectionCaptureDraft) =>
  draft.persistenceTarget === 'finding' ? 'Suggested Finding' : 'Suggested Repair Task';

const getDraftSummary = (draft: InspectionCaptureDraft) => {
  if (draft.checklistContext?.checklistOrigin) {
    return `This checklist issue is ready to become a structured ${getDraftEntityLabel(draft)}. Save it here and the checklist stays linked.`;
  }

  if (draft.source === 'photo') {
    return `This photo capture is ready to become a structured ${getDraftEntityLabel(draft)} with evidence already attached.`;
  }

  if (draft.source === 'voice') {
    return `This voice capture was parsed into a suggested ${getDraftEntityLabel(draft)}. Review it quickly, then save it into scope.`;
  }

  return `This capture is ready to become a structured ${getDraftEntityLabel(draft)} for the room feed and downstream scope.`;
};

const getDraftImpactLabel = (draft: InspectionCaptureDraft) =>
  draft.persistenceTarget === 'finding'
    ? 'Creates a finding that can drive repair tasks and materials next.'
    : 'Creates a repair task that can drive materials and procurement next.';

export const InspectionCaptureStrip: React.FC<InspectionCaptureStripProps> = ({
  selectedAction,
  onActionChange,
  onSubmit,
  onPhotoCapture,
  draft,
  roomOptions,
  onDraftChange,
  onDraftCommit,
  onDraftCancel,
  onVoiceParseReview,
  onVoiceSaveNote,
  voiceLogContext,
  disabled = false,
  isUploading = false,
  recommendationPanel,
}) => {
  const [value, setValue] = useState('');
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (draft) {
      setValue(draft.rawText);
    }
  }, [draft]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    await onSubmit(selectedAction, trimmed);
    if (!draft) {
      setValue('');
    }
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || disabled) return;

    await onPhotoCapture(file, value.trim());
    setValue('');
    event.target.value = '';
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Capture Strip</h3>
          <p className="text-sm text-slate-500">Capture a note, photo, or checklist issue and turn it into a finding or repair task without leaving the room workspace.</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!isVoicePanelOpen) {
              setIsVoicePanelOpen(true);
            }
          }}
          className={`flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
            isVoicePanelOpen
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-300 text-slate-600'
          }`}
          title="Capture voice locally and review before commit."
        >
          <Mic size={16} />
          {isVoicePanelOpen ? 'Voice Open' : 'Voice'}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {ACTIONS.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            onClick={() => {
              onActionChange(action);
              if (action === 'photo') {
                fileInputRef.current?.click();
              }
            }}
            disabled={disabled || (action === 'photo' && isUploading)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              selectedAction === action
                ? 'border-lowes-blue bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            } ${disabled ? 'opacity-50' : ''}`}
          >
            <span className="flex items-center gap-2">
              <Icon size={16} />
              {label}
            </span>
          </button>
        ))}
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="flex gap-2">
        <div className="relative flex-1">
          <MessageSquarePlus size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={
              selectedAction === 'note'
                ? 'Try: 2 broken blinds, paint walls, missing fridge'
                : `Add a ${selectedAction} item for this room`
            }
            disabled={disabled}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-lowes-blue focus:bg-white"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Capture
        </button>
      </form>

      <p className="mt-2 text-xs text-slate-500">
        Confident captures save as structured scope right away. Ambiguous captures stay local as a suggested finding or task until you confirm them.
      </p>

      {draft ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-700" />
                <h4 className="text-sm font-semibold text-slate-900">{getDraftTitle(draft)}</h4>
              </div>
              <p className="mt-1 text-xs text-slate-600">{getDraftSummary(draft)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.matchedRules.map((rule) => (
                <span key={rule} className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                  {rule.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">
              {draft.persistenceTarget === 'finding' ? 'Creates finding:' : 'Creates repair task:'}
            </span>{' '}
            {draft.label}
            <div className="mt-1 text-slate-600">{getDraftImpactLabel(draft)}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {draft.source === 'voice' ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 md:col-span-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-indigo-700">
                  <span>Voice</span>
                  {draft.voiceMetadata?.transcriptState ? (
                    <span>{voiceTranscriptStateLabels[draft.voiceMetadata.transcriptState]}</span>
                  ) : null}
                  {draft.voiceMetadata?.durationMs ? <span>{Math.round(draft.voiceMetadata.durationMs / 1000)}s</span> : null}
                  {draft.voiceMetadata?.fallbackMode ? <span>{voiceFallbackLabels[draft.voiceMetadata.fallbackMode]}</span> : null}
                </div>
                {(draft.voiceMetadata?.editedTranscript || draft.voiceMetadata?.rawTranscript) ? (
                  <div className="mt-2 rounded-lg bg-white/70 p-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-700">Voice text</div>
                    <p className="mt-1 text-xs text-indigo-900/80">
                    {draft.voiceMetadata?.editedTranscript || draft.voiceMetadata?.rawTranscript}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Type</span>
              <select
                value={draft.kind}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    kind: event.target.value as InspectionCaptureKind,
                    persistenceTarget:
                      event.target.value === 'replace' || event.target.value === 'repair' || event.target.value === 'task'
                        ? 'task'
                        : 'finding',
                  })
                }
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
              >
                {KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Room</span>
              <select
                value={draft.roomId || ''}
                onChange={(event) => {
                  const room = roomOptions.find((option) => option.id === event.target.value);
                  onDraftChange({
                    ...draft,
                    roomId: room?.id,
                    roomLabel: room?.label || draft.roomLabel,
                  });
                }}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
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
                value={draft.label}
                onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
              />
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Quantity</span>
              <input
                type="number"
                min={0}
                value={draft.quantity ?? ''}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    quantity: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
              />
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Source</span>
              <input
                type="text"
                value={draft.source}
                disabled
                className="w-full rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 text-slate-600 outline-none"
              />
            </label>

            <label className="text-sm text-slate-700 md:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Notes</span>
              <textarea
                rows={2}
                value={draft.notes}
                onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void onDraftCommit()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {draft.persistenceTarget === 'finding' ? 'Create Finding' : 'Create Task'}
            </button>
            <button
              type="button"
              onClick={onDraftCancel}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Dismiss
            </button>
          </div>

          {recommendationPanel ? <div className="mt-3">{recommendationPanel}</div> : null}
        </div>
      ) : null}

      <VoiceCapturePanel
        isOpen={isVoicePanelOpen}
        disabled={disabled}
        logContext={voiceLogContext}
        onClose={() => setIsVoicePanelOpen(false)}
        onParseAndReview={async (payload) => {
          await onVoiceParseReview(payload);
          setIsVoicePanelOpen(false);
        }}
        onSaveAsNote={async (payload) => {
          await onVoiceSaveNote(payload);
          setIsVoicePanelOpen(false);
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handlePhotoChange(event)}
      />
    </section>
  );
};

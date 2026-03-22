export type InspectionCaptureAction = 'replace' | 'repair' | 'quantity' | 'note' | 'photo';

export type InspectionCaptureKind = 'replace' | 'repair' | 'missing' | 'quantity' | 'note' | 'task';

export type InspectionCaptureConfidence = 'high' | 'medium' | 'low';

export interface InspectionCaptureRoomContext {
  roomId?: string;
  roomLabel: string;
  roomType?: string;
}

export interface InspectionCaptureDraft {
  id: string;
  rawText: string;
  kind: InspectionCaptureKind;
  label: string;
  canonicalLabel?: string;
  aliasMatched?: string;
  quantity?: number;
  roomId?: string;
  roomLabel: string;
  roomType?: string;
  notes: string;
  source: 'manual' | 'parsed' | 'photo' | 'checklist' | 'voice';
  confidence: InspectionCaptureConfidence;
  matchedRules: string[];
  requiresReview: boolean;
  selectedAction: InspectionCaptureAction;
  persistenceTarget: 'finding' | 'task';
  inferredTrade?: string;
  photoIds: string[];
  voiceMetadata?: {
    rawTranscript?: string;
    editedTranscript?: string;
    durationMs?: number;
    transcriptAvailable: boolean;
    transcriptState?: 'available' | 'partial' | 'empty' | 'unsupported';
    permissionState?: 'unknown' | 'granted' | 'denied' | 'dismissed_or_interrupted';
    recordingSupported?: boolean;
    speechSupported?: boolean;
    fallbackMode?: 'transcript' | 'manual_transcript' | 'manual_note';
    startedAt?: string;
    completedAt?: string;
    audioAttachmentPresent?: boolean;
  };
  checklistContext?: {
    checklistOrigin: true;
    checklistSectionId: string;
    checklistSectionLabel: string;
    checklistItemId?: string;
    checklistItemLabel?: string;
  };
  existingEntityId?: string;
  existingEntityType?: 'finding' | 'task';
}

interface ParseOptions {
  rawText: string;
  room: InspectionCaptureRoomContext;
  selectedAction: InspectionCaptureAction;
  source?: 'manual' | 'parsed' | 'photo' | 'checklist' | 'voice';
  checklistContext?: InspectionCaptureDraft['checklistContext'];
  photoIds?: string[];
  voiceMetadata?: InspectionCaptureDraft['voiceMetadata'];
}

const TASK_VERBS = ['paint', 'clean', 'install', 'caulk', 'patch', 'replace', 'repair', 'fix', 'touch up'] as const;

const ALIAS_ENTRIES = [
  { alias: 'fridge', canonical: 'refrigerator' },
  { alias: 'stove', canonical: 'range' },
  { alias: 'blinds', canonical: 'window blinds' },
  { alias: 'blind', canonical: 'window blind' },
  { alias: 'smoke alarm', canonical: 'smoke detector' },
  { alias: 'smoke alarms', canonical: 'smoke detectors' },
] as const;

const TRADE_ENTRIES = [
  { pattern: /\bpaint|primer|wall(s)?\b/i, trade: 'paint' },
  { pattern: /\boutlet(s)?|switch(es)?|smoke detector(s)?|smoke alarm(s)?\b/i, trade: 'electrical' },
  { pattern: /\bsink|faucet|toilet|drain\b/i, trade: 'plumbing' },
  { pattern: /\bcabinet(s)?|door(s)?|trim|baseboard(s)?\b/i, trade: 'general' },
  { pattern: /\bclean|cleanup\b/i, trade: 'cleaning' },
] as const;

const createDraftId = () => `capture_draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const extractQuantity = (value: string): number | undefined => {
  const match = value.match(/\b(\d+)\b/);
  if (!match) return undefined;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) ? quantity : undefined;
};

const stripLeadingQuantity = (value: string) => normalizeWhitespace(value.replace(/^\d+\s+/, ''));

const stripLeadingPhrase = (value: string, pattern: RegExp) => normalizeWhitespace(value.replace(pattern, ''));

const normalizeLabel = (value: string) => {
  const cleaned = normalizeWhitespace(
    value
      .replace(/\b(not working|doesn't work|does not work|won't work|is missing|are missing)\b/gi, '')
      .replace(/\bbroken\b/gi, '')
  );
  return titleCase(cleaned || value);
};

const applyAlias = (value: string): { label: string; aliasMatched?: string; canonicalLabel?: string } => {
  let next = value;
  let matchedAlias: string | undefined;
  let canonicalLabel: string | undefined;

  for (const entry of ALIAS_ENTRIES) {
    const pattern = new RegExp(`\\b${entry.alias}\\b`, 'i');
    if (pattern.test(next)) {
      matchedAlias = entry.alias;
      canonicalLabel = titleCase(entry.canonical);
      next = next.replace(pattern, entry.canonical);
      break;
    }
  }

  return {
    label: next,
    aliasMatched: matchedAlias,
    canonicalLabel,
  };
};

const inferTrade = (value: string): string | undefined => {
  const match = TRADE_ENTRIES.find((entry) => entry.pattern.test(value));
  return match?.trade;
};

const determinePersistenceTarget = (kind: InspectionCaptureKind): 'finding' | 'task' =>
  kind === 'replace' || kind === 'repair' || kind === 'task' ? 'task' : 'finding';

const buildDraft = (
  room: InspectionCaptureRoomContext,
  selectedAction: InspectionCaptureAction,
  kind: InspectionCaptureKind,
  rawText: string,
  label: string,
  quantity: number | undefined,
  confidence: InspectionCaptureConfidence,
  matchedRules: string[],
  source: 'manual' | 'parsed' | 'photo' | 'checklist' | 'voice',
  requiresReview: boolean,
  notes?: string,
  extras?: Partial<Pick<InspectionCaptureDraft, 'checklistContext' | 'photoIds' | 'voiceMetadata'>>
): InspectionCaptureDraft => ({
  ...(extras || {}),
  id: createDraftId(),
  rawText,
  kind,
  ...(() => {
    const aliased = applyAlias(normalizeLabel(label || rawText));
    return {
      label: aliased.label,
      aliasMatched: aliased.aliasMatched,
      canonicalLabel: aliased.canonicalLabel,
      inferredTrade: inferTrade(aliased.label),
    };
  })(),
  quantity,
  roomId: room.roomId,
  roomLabel: room.roomLabel,
  roomType: room.roomType,
  notes: notes || '',
  source,
  confidence,
  matchedRules,
  requiresReview,
  selectedAction,
  persistenceTarget: determinePersistenceTarget(kind),
  photoIds: extras?.photoIds || [],
});

export const InspectionCaptureParserService = {
  parse({ rawText, room, selectedAction, source, checklistContext, photoIds, voiceMetadata }: ParseOptions): InspectionCaptureDraft {
    const normalizedText = normalizeWhitespace(rawText);
    const lowered = normalizedText.toLowerCase();
    const quantity = extractQuantity(normalizedText);
    const matchedRules: string[] = [];
    const draftSource = source || (selectedAction === 'note' ? 'parsed' : 'manual');
    const extras = { checklistContext, photoIds, voiceMetadata };

    if (selectedAction === 'replace') {
      matchedRules.push('manual_replace');
      return buildDraft(
        room,
        selectedAction,
        'replace',
        normalizedText,
        stripLeadingPhrase(stripLeadingQuantity(normalizedText), /^(replace|swap)\s+/i),
        quantity,
        'high',
        matchedRules,
        draftSource,
        false,
        undefined,
        extras
      );
    }

    if (selectedAction === 'repair') {
      matchedRules.push('manual_repair');
      return buildDraft(
        room,
        selectedAction,
        'repair',
        normalizedText,
        stripLeadingPhrase(stripLeadingQuantity(normalizedText), /^(repair|fix)\s+/i),
        quantity,
        'high',
        matchedRules,
        draftSource,
        false,
        undefined,
        extras
      );
    }

    if (selectedAction === 'quantity') {
      matchedRules.push('manual_quantity');
      return buildDraft(
        room,
        selectedAction,
        'quantity',
        normalizedText,
        stripLeadingQuantity(normalizedText),
        quantity,
        quantity ? 'high' : 'medium',
        matchedRules,
        draftSource,
        !quantity,
        undefined,
        extras
      );
    }

    if (/^(replace|swap)\b/.test(lowered)) {
      matchedRules.push('replace_verb');
      return buildDraft(
        room,
        selectedAction,
        'replace',
        normalizedText,
        stripLeadingPhrase(stripLeadingQuantity(normalizedText), /^(replace|swap)\s+/i),
        quantity,
        'high',
        matchedRules,
        draftSource,
        false,
        undefined,
        extras
      );
    }

    if (/\bmissing\b/.test(lowered)) {
      matchedRules.push('missing_keyword');
      return buildDraft(
        room,
        selectedAction,
        'missing',
        normalizedText,
        normalizeWhitespace(
          stripLeadingQuantity(
            normalizedText
              .replace(/\bis missing\b/gi, '')
              .replace(/\bare missing\b/gi, '')
              .replace(/\bmissing\b/gi, '')
          )
        ),
        quantity,
        'high',
        matchedRules,
        draftSource,
        false,
        normalizedText,
        extras
      );
    }

    if (/^(repair|fix)\b/.test(lowered) || /\b(not working|doesn't work|does not work|won't work|broken)\b/.test(lowered)) {
      matchedRules.push('repair_signal');
      return buildDraft(
        room,
        selectedAction,
        'repair',
        normalizedText,
        stripLeadingPhrase(stripLeadingQuantity(normalizedText), /^(repair|fix)\s+/i),
        quantity,
        quantity ? 'high' : 'medium',
        matchedRules,
        draftSource,
        false,
        /\bbroken\b/.test(lowered) || /\bnot working\b/.test(lowered) ? normalizedText : '',
        extras
      );
    }

    const taskVerb = TASK_VERBS.find((verb) => lowered.startsWith(`${verb} `));
    if (taskVerb && taskVerb !== 'replace' && taskVerb !== 'repair' && taskVerb !== 'fix') {
      matchedRules.push('task_verb');
      return buildDraft(
        room,
        selectedAction,
        'task',
        normalizedText,
        normalizedText,
        quantity,
        'high',
        matchedRules,
        draftSource,
        false,
        undefined,
        extras
      );
    }

    if (quantity) {
      matchedRules.push('quantity_detected');
      return buildDraft(
        room,
        selectedAction,
        'quantity',
        normalizedText,
        stripLeadingQuantity(normalizedText),
        quantity,
        'medium',
        matchedRules,
        draftSource,
        true,
        normalizedText,
        extras
      );
    }

    matchedRules.push('fallback_note');
    return buildDraft(
      room,
      selectedAction,
      'note',
      normalizedText,
      normalizedText,
      undefined,
      'low',
      matchedRules,
      draftSource,
      selectedAction === 'note',
      normalizedText,
      extras
    );
  },
};

import { Finding, RepairTask } from '../models/operations';
import { FindingService } from './FindingService';
import { RepairTaskService } from './RepairTaskService';
import { InspectionCaptureDraft } from './InspectionCaptureParserService';

interface CommitContext {
  orgId: string;
  userId: string;
  inspectionId: string;
  unitId: string;
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const buildMetadata = (draft: InspectionCaptureDraft) => ({
  source: draft.source === 'parsed' ? 'hybrid_capture_strip' : draft.source,
  captureKind: draft.kind,
  captureSource: draft.source,
  captureConfidence: draft.confidence,
  matchedRules: draft.matchedRules,
  roomId: draft.roomId,
  roomLabel: draft.roomLabel,
  roomType: draft.roomType,
  quantity: draft.quantity,
  rawText: draft.rawText,
  selectedAction: draft.selectedAction,
  canonicalLabel: draft.canonicalLabel,
  aliasMatched: draft.aliasMatched,
  inferredTrade: draft.inferredTrade,
  attachmentPhotoIds: draft.photoIds,
  attachmentCount: draft.photoIds.length,
  rawTranscript: draft.voiceMetadata?.rawTranscript,
  editedTranscript: draft.voiceMetadata?.editedTranscript,
  voiceDurationMs: draft.voiceMetadata?.durationMs,
  transcriptAvailable: draft.voiceMetadata?.transcriptAvailable,
  transcriptState: draft.voiceMetadata?.transcriptState,
  permissionState: draft.voiceMetadata?.permissionState,
  recordingSupported: draft.voiceMetadata?.recordingSupported,
  speechSupported: draft.voiceMetadata?.speechSupported,
  voiceFallbackMode: draft.voiceMetadata?.fallbackMode,
  voiceStartedAt: draft.voiceMetadata?.startedAt,
  voiceCompletedAt: draft.voiceMetadata?.completedAt,
  audioAttachmentPresent: draft.voiceMetadata?.audioAttachmentPresent || false,
  checklistSectionId: draft.checklistContext?.checklistSectionId,
  checklistSectionLabel: draft.checklistContext?.checklistSectionLabel,
  checklistItemId: draft.checklistContext?.checklistItemId,
  checklistItemLabel: draft.checklistContext?.checklistItemLabel,
  checklistOrigin: draft.checklistContext?.checklistOrigin || false,
});

const createTaskTitle = (draft: InspectionCaptureDraft) => {
  if (draft.kind === 'task') return draft.label;
  return `${titleCase(draft.kind)} ${draft.label}`.trim();
};

const mergeMetadata = (existing: Record<string, unknown> | undefined, draft: InspectionCaptureDraft) => ({
  ...(existing || {}),
  ...buildMetadata(draft),
});

export const InspectionCaptureCommitService = {
  async commitDraft(context: CommitContext, draft: InspectionCaptureDraft): Promise<{ entityType: 'finding' | 'task'; entityId: string }> {
    if (draft.persistenceTarget === 'task') {
      const task = await RepairTaskService.createTask(
        context.orgId,
        {
          orgId: context.orgId,
          inspectionId: context.inspectionId,
          unitId: context.unitId,
          findingIds: [],
          title: createTaskTitle(draft),
          trade:
            draft.inferredTrade === 'paint' ||
            draft.inferredTrade === 'electrical' ||
            draft.inferredTrade === 'plumbing' ||
            draft.inferredTrade === 'cleaning' ||
            draft.inferredTrade === 'general'
              ? draft.inferredTrade
              : draft.kind === 'task' && draft.label.toLowerCase().startsWith('paint')
                ? 'paint'
                : 'general',
          priority: draft.kind === 'replace' ? 'high' : 'medium',
          status: 'draft',
          notes: draft.notes || undefined,
          metadata: buildMetadata(draft),
        },
        context.userId
      );

      return { entityType: 'task', entityId: task.id };
    }

    const finding = await FindingService.createFinding(
      context.orgId,
      {
        orgId: context.orgId,
        inspectionId: context.inspectionId,
        unitId: context.unitId,
        area: draft.roomLabel,
        category: draft.kind === 'missing' ? 'appliance' : draft.kind === 'quantity' ? 'general' : 'general',
        severity: draft.kind === 'missing' ? 'major' : 'minor',
        priority: draft.kind === 'missing' ? 'high' : 'medium',
        status: 'open',
        description: draft.label,
        notes: draft.notes || undefined,
        recommendedTrade:
          draft.inferredTrade === 'paint' ||
          draft.inferredTrade === 'electrical' ||
          draft.inferredTrade === 'plumbing' ||
          draft.inferredTrade === 'cleaning' ||
          draft.inferredTrade === 'general'
            ? draft.inferredTrade
            : draft.kind === 'missing'
              ? 'appliance'
              : 'general',
        photoIds: draft.photoIds,
        metadata: buildMetadata(draft),
      },
      context.userId
    );

    return { entityType: 'finding', entityId: finding.id };
  },

  async updateDraft(
    context: CommitContext,
    draft: InspectionCaptureDraft,
    entities: { finding?: Finding; task?: RepairTask }
  ): Promise<{ entityType: 'finding' | 'task'; entityId: string }> {
    if (draft.existingEntityType === 'task' && entities.task && draft.persistenceTarget === 'task') {
      const updatedTask: RepairTask = {
        ...entities.task,
        title: createTaskTitle(draft),
        notes: draft.notes || undefined,
        trade:
          draft.inferredTrade === 'paint' ||
          draft.inferredTrade === 'electrical' ||
          draft.inferredTrade === 'plumbing' ||
          draft.inferredTrade === 'cleaning' ||
          draft.inferredTrade === 'general'
            ? draft.inferredTrade
            : draft.kind === 'task' && draft.label.toLowerCase().startsWith('paint')
              ? 'paint'
              : entities.task.trade,
        metadata: mergeMetadata(entities.task.metadata, draft),
      };
      const task = await RepairTaskService.updateTask(context.orgId, updatedTask, context.userId);
      return { entityType: 'task', entityId: task.id };
    }

    if (draft.existingEntityType === 'finding' && entities.finding && draft.persistenceTarget === 'finding') {
      const updatedFinding: Finding = {
        ...entities.finding,
        area: draft.roomLabel,
        description: draft.label,
        notes: draft.notes || undefined,
        photoIds: draft.photoIds,
        metadata: mergeMetadata(entities.finding.metadata, draft),
      };
      const finding = await FindingService.updateFinding(context.orgId, updatedFinding, context.userId);
      return { entityType: 'finding', entityId: finding.id };
    }

    if (draft.existingEntityType === 'task' && entities.task) {
      await RepairTaskService.deleteTask(context.orgId, entities.task.id, context.userId);
    }

    if (draft.existingEntityType === 'finding' && entities.finding) {
      await FindingService.deleteFinding(context.orgId, entities.finding.id, context.userId);
    }

    return this.commitDraft(context, draft);
  },

  async deleteEntity(context: Pick<CommitContext, 'orgId' | 'userId'>, entityType: 'finding' | 'task', entityId: string): Promise<void> {
    if (entityType === 'task') {
      await RepairTaskService.deleteTask(context.orgId, entityId, context.userId);
      return;
    }

    await FindingService.deleteFinding(context.orgId, entityId, context.userId);
  },
};

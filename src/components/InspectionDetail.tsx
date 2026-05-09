import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Save, Camera, Trash2, Loader2, FileText, Download, AlertCircle, Share2, Copy, XCircle, Clock, CheckCircle2, Wrench, PackagePlus, TriangleAlert, StickyNote, ChevronDown, Ruler, Hash } from 'lucide-react';
import { Inspection, InspectionStatus } from '../core/models/inspections';
import { InspectionService } from '../core/services/InspectionService';
import { MediaService } from '../core/services/MediaService';
import { ReportService } from '../core/services/ReportService';
import { ShareLinkService } from '../core/services/ShareLinkService';
import { ReportJob } from '../core/models/reports';
import { ShareLink } from '../core/models/share';
import { useAppContext } from '../core/hooks/useAppContext';
import { useAuditLogger } from '../core/hooks/useAuditLogger';
import { useSyncEngine } from '../core/hooks/useSyncEngine';
import { PhotoAsset } from '../core/models/media';
import { useCatalog } from '../core/hooks/useCatalog';
import { ProductInstanceService } from '../core/services/ProductInstanceService';
import { CatalogService } from '../core/services/CatalogService';
import { ProductInstance, CatalogItem } from '../core/models/types';
import { ProductSelectorModal } from './ProductSelectorModal';
import { Package, PlusCircle, MinusCircle } from 'lucide-react';
import { InspectionIntelligencePanel } from './InspectionIntelligencePanel';
import { GeneratedInspectionSection, GeneratedInspectionItem, GeneratedInspectionItemStatus } from '../core/models/templates';
import { Finding, MaterialRequirement, RepairTask } from '../core/models/operations';
import { FindingService } from '../core/services/FindingService';
import { MaterialRequirementService } from '../core/services/MaterialRequirementService';
import { RepairTaskService } from '../core/services/RepairTaskService';
import { createInspectionOperationalSummary } from '../core/services/InspectionReportSnapshotService';
import { ReportProcurementInsights } from './ReportProcurementInsights';
import { InspectionCaptureStrip } from './InspectionCaptureStrip';
import { InspectionRoomWorkspace, InspectionWorkspaceRoom } from './InspectionRoomWorkspace';
import { RoomCapturedFeedItem, RoomCapturedItemsFeed } from './RoomCapturedItemsFeed';
import { VoiceCaptureResult } from '../core/services/VoiceCaptureService';
import {
  InspectionCaptureAction,
  InspectionCaptureDraft,
  InspectionCaptureKind,
  InspectionCaptureParserService,
} from '../core/services/InspectionCaptureParserService';
import { InspectionCaptureCommitService } from '../core/services/InspectionCaptureCommitService';
import { ClientLoggerService } from '../core/services/ClientLoggerService';
import { ErrorBoundary } from './ErrorBoundary';
import { UnitService } from '../core/services/UnitService';
import { Unit } from '../core/models/inspections';
import { ProductRecommendationPanel } from './ProductRecommendationPanel';
import { ProductRecommendationService } from '../core/services/ProductRecommendationService';
import { ChecklistAlwaysReplaceService } from '../core/services/ChecklistAlwaysReplaceService';
import { ProcurementBundleService } from '../core/services/ProcurementBundleService';
import { ProcurementProductResolutionService } from '../core/services/ProcurementProductResolutionService';
import { Role } from '../core/models/auth';

interface InspectionDetailProps {
  inspectionId: string;
  initialScopeSection?: 'findings' | 'tasks' | 'materials' | null;
  initialScopeTarget?: {
    entityType: 'finding' | 'task' | 'material';
    entityId: string;
    originLabel?: string | null;
  } | null;
  originContextLabel?: string | null;
  onOpenProcurement?: (options?: { unitId?: string; focus?: 'all' | 'procurement' | 'vendor' | 'receiving' | 'verification' }) => void;
  onOpenUnitWorkspace?: (
    unitId: string,
    context?: {
      preferredTab?: 'overview' | 'inspection' | 'scope' | 'procurement' | 'vendor' | 'verification' | null;
      inspectionId?: string | null;
      scopeSection?: 'findings' | 'tasks' | 'materials' | null;
      scopeTarget?: {
        entityType: 'finding' | 'task' | 'material';
        entityId: string;
        originLabel?: string | null;
      } | null;
      reasonLabel?: string | null;
      reasonDetail?: string | null;
    }
  ) => void;
  onPersistInspectionContext?: (context: {
    scopeSection?: 'findings' | 'tasks' | 'materials' | null;
    scopeTarget?: {
      entityType: 'finding' | 'task' | 'material';
      entityId: string;
      originLabel?: string | null;
    } | null;
  }) => void;
  onBack: () => void;
}

interface ChecklistDraftCaptureState {
  sectionId: string;
  sectionLabel: string;
  itemId: string;
  itemLabel: string;
  selectedAction: 'repair' | 'replace' | 'missing' | 'note' | 'photo';
  label: string;
  quantity: string;
  notes: string;
  stagedPhotos: Array<{
    id: string;
    file: File;
    previewUrl: string;
  }>;
  stagedPhotoRestoreNoticeCount: number;
  stagedPhotoRestoreNoticeNames: string[];
  restoredFromSession: boolean;
}

interface SerializedChecklistDraftCaptureState {
  sectionId: string;
  sectionLabel: string;
  itemId: string;
  itemLabel: string;
  selectedAction: 'repair' | 'replace' | 'missing' | 'note' | 'photo';
  label: string;
  quantity: string;
  notes: string;
  stagedPhotoRestoreNoticeCount: number;
  stagedPhotoRestoreNoticeNames: string[];
}

interface SerializedInspectionChecklistDraftSession {
  version: 1;
  activeChecklistDraftItemId: string | null;
  draftsByItemId: Record<string, SerializedChecklistDraftCaptureState>;
}

type ChecklistAttentionFilter = 'all' | 'drafts' | 'attention' | 'done';

interface FeedEditStagedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

type FeedEditSavePhase = 'idle' | 'uploading_media' | 'saving_update' | 'failed';

interface FeedEditSaveState {
  phase: FeedEditSavePhase;
  message?: string;
  errorMessage?: string;
  startedAt?: number;
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const isAlwaysReplaceChecklistItem = (item: GeneratedInspectionItem) => item.itemType === 'always_replace';
const getAlwaysReplaceCountQuantity = (item: GeneratedInspectionItem) =>
  Math.max(1, Math.round(Number(item.inputValue?.quantity ?? item.defaultQuantity ?? 1)) || 1);
const hasLinkedAlwaysReplaceRecords = (item: GeneratedInspectionItem) =>
  ((item.repairTaskIds?.length || 0) > 0) || ((item.materialRequirementIds?.length || 0) > 0);
const isAlwaysReplaceInputComplete = (item: GeneratedInspectionItem) => {
  if (!isAlwaysReplaceChecklistItem(item)) return false;
  if (hasLinkedAlwaysReplaceRecords(item)) return true;
  if (item.inputMode === 'count') {
    return typeof item.inputValue?.quantity === 'number' && item.inputValue.quantity > 0;
  }
  if (item.inputMode === 'dimensions') {
    return Boolean(item.inputValue?.dimensions && item.inputValue.dimensions.width > 0 && item.inputValue.dimensions.height > 0);
  }
  if (item.inputMode === 'area') {
    return Boolean(item.inputValue?.area && item.inputValue.area > 0);
  }
  return true;
};
const getAlwaysReplaceInputSummary = (item: GeneratedInspectionItem) => {
  if (item.inputMode === 'count') {
    const quantity = getAlwaysReplaceCountQuantity(item);
    return typeof quantity === 'number' && quantity > 0 ? `${quantity} ${item.materialReference?.unit || 'ea'}` : 'Count needed';
  }

  if (item.inputMode === 'dimensions') {
    const dimensions = item.inputValue?.dimensions;
    return dimensions ? `${dimensions.width} x ${dimensions.height} ${dimensions.unit || 'in'}` : 'Width x height needed';
  }

  if (item.inputMode === 'area') {
    return typeof item.inputValue?.area === 'number' && item.inputValue.area > 0
      ? `${item.inputValue.area} ${item.materialReference?.unit || 'sq_ft'}`
      : 'Area needed';
  }

  return 'Standard replacement';
};

const buildChecklistGuidance = (item: GeneratedInspectionItem) => {
  if (item.itemType === 'always_replace') {
    if (item.requiresMeasurements && item.dataFields.length > 0) {
      return `Capture ${item.dataFields.join(', ')} before saving this standard replacement.`;
    }
    return 'Save the standard replacement directly into a repair task and material requirement.';
  }

  if (item.focusedAction === 'repair' && item.repairOptions.length > 0) {
    return `Repair options: ${item.repairOptions.join(', ')}.`;
  }
  if (item.focusedAction === 'replace' && item.replaceOptions.length > 0) {
    const presetSuffix = item.preferredReplaceOption ? ` Preset preference: ${item.preferredReplaceOption}.` : '';
    return `Replace options: ${item.replaceOptions.join(', ')}.${presetSuffix}`;
  }
  if (item.requiresMeasurements && item.dataFields.length > 0) {
    return `Measurements may be needed: ${item.dataFields.join(', ')}.`;
  }
  return null;
};

type RoomChecklistEntry = {
  section: GeneratedInspectionSection;
  item: GeneratedInspectionItem;
  hasUnsavedDraft: boolean;
  isCompleted: boolean;
  hasCommittedCapture: boolean;
  needsAttention: boolean;
  rowState: 'draft' | 'completed' | 'captured' | 'untouched';
};

type RoomChecklistIntentGroupId = 'attention' | 'progress' | 'done';
type GeneratedSnapshotEntry = {
  section: GeneratedInspectionSection;
  item: GeneratedInspectionItem;
  needsAttention: boolean;
  isComplete: boolean;
  hasProcurementImpact: boolean;
};

const getRoomChecklistEntrySortWeight = (entry: RoomChecklistEntry) => {
  if (entry.hasUnsavedDraft) return 0;
  if (entry.item.status === 'failed') return 1;
  if (entry.item.status === 'blocked') return 2;
  if (entry.rowState === 'untouched') return 3;
  if (entry.rowState === 'captured') return 4;
  if (entry.rowState === 'completed') return 5;
  return 6;
};

const getRoomChecklistIntentGroup = (entry: RoomChecklistEntry): RoomChecklistIntentGroupId => {
  if (entry.hasUnsavedDraft || entry.rowState === 'untouched' || entry.item.status === 'failed' || entry.item.status === 'blocked') {
    return 'attention';
  }
  if (entry.rowState === 'captured') {
    return 'progress';
  }
  return 'done';
};

const inspectionStatusBadgeClass = (status: InspectionStatus) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-800';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

const formatTimestampLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

const formatVoiceDurationLabel = (durationMs?: number) => {
  if (!durationMs) return undefined;
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getTranscriptLengthBucket = (transcript?: string) => {
  const length = transcript?.trim().length || 0;
  if (length === 0) return 'empty';
  if (length <= 24) return 'short';
  if (length <= 120) return 'medium';
  return 'long';
};

const getDurationBucket = (durationMs?: number) => {
  if (!durationMs || durationMs <= 0) return 'none';
  if (durationMs < 5000) return 'short';
  if (durationMs < 15000) return 'medium';
  return 'long';
};

const normalizeRoomKey = (value?: string | null) => (value || 'unit-overview').trim().toLowerCase();

const normalizeCaptureKind = (value: unknown, fallback: InspectionCaptureKind): InspectionCaptureKind => {
  if (value === 'replace' || value === 'repair' || value === 'missing' || value === 'quantity' || value === 'note' || value === 'task') {
    return value;
  }
  return fallback;
};

const buildCaptureBridgeMessage = (
  draft: InspectionCaptureDraft,
  committed: { entityType: 'finding' | 'task'; entityId: string }
) => {
  if (committed.entityType === 'finding') {
    if (draft.checklistContext?.checklistOrigin) {
      return 'Finding created from checklist issue. It now appears in Findings and can drive repair tasks and materials next.';
    }

    if (draft.source === 'photo') {
      return 'Finding created from photo capture. It now appears in Findings with evidence attached and can drive repair tasks next.';
    }

    return 'Finding created. It now appears in Findings and can drive repair tasks and materials next.';
  }

  return 'Repair task created from capture. It now appears in scope and can drive material requirements next.';
};

const createFocusedScopeRecord = (
  entityType: 'finding' | 'task' | 'material',
  entityId: string,
  originLabel?: string | null
) => ({
  entityType,
  entityId,
  token: Date.now(),
  originLabel: originLabel || null,
});

const createChecklistPhotoDraftId = () => `checklist_photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const createFeedEditPhotoDraftId = () => `feed_edit_photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const buildChecklistDraftSessionStorageKey = (inspectionId: string) => `unitflip:inspection:${inspectionId}:checklist-drafts:v1`;

export const InspectionDetail: React.FC<InspectionDetailProps> = ({
  inspectionId,
  initialScopeSection = null,
  initialScopeTarget = null,
  originContextLabel = null,
  onOpenProcurement,
  onOpenUnitWorkspace,
  onPersistInspectionContext,
  onBack,
}) => {
  const { org, user, role, flags } = useAppContext();
  const { log } = useAuditLogger();
  const { triggerSyncNow } = useSyncEngine();
  const { addCatalogItemToList } = useCatalog();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [unitRecord, setUnitRecord] = useState<Unit | null>(null);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [productInstances, setProductInstances] = useState<ProductInstance[]>([]);
  const [catalogItems, setCatalogItems] = useState<Record<string, CatalogItem>>({});
  const [catalogLibrary, setCatalogLibrary] = useState<CatalogItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [latestReport, setLatestReport] = useState<ReportJob | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportStatusMessage, setReportStatusMessage] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [generatedSections, setGeneratedSections] = useState<GeneratedInspectionSection[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [repairTasks, setRepairTasks] = useState<RepairTask[]>([]);
  const [materialRequirements, setMaterialRequirements] = useState<MaterialRequirement[]>([]);
  const [checklistMessage, setChecklistMessage] = useState<string | null>(null);
  const [captureBridgeMessage, setCaptureBridgeMessage] = useState<string | null>(null);
  const [captureBridgeTarget, setCaptureBridgeTarget] = useState<{ entityType: 'finding' | 'task'; entityId: string } | null>(null);
  const [inspectionIntelligenceRefreshToken, setInspectionIntelligenceRefreshToken] = useState(0);
  const [focusedScopeRecord, setFocusedScopeRecord] = useState<{
    entityType: 'finding' | 'task' | 'material';
    entityId: string;
    token: number;
    originLabel?: string | null;
  } | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedCaptureAction, setSelectedCaptureAction] = useState<InspectionCaptureAction>('note');
  const [pendingCaptureDraft, setPendingCaptureDraft] = useState<InspectionCaptureDraft | null>(null);
  const [expandedFeedItemId, setExpandedFeedItemId] = useState<string | null>(null);
  const [editingFeedDraft, setEditingFeedDraft] = useState<InspectionCaptureDraft | null>(null);
  const [feedEditStagedPhotos, setFeedEditStagedPhotos] = useState<FeedEditStagedPhoto[]>([]);
  const [feedEditPendingRemovedPhotoIds, setFeedEditPendingRemovedPhotoIds] = useState<string[]>([]);
  const [feedEditSaveState, setFeedEditSaveState] = useState<FeedEditSaveState>({ phase: 'idle' });
  const [expandedChecklistItemId, setExpandedChecklistItemId] = useState<string | null>(null);
  const [activeChecklistDraftItemId, setActiveChecklistDraftItemId] = useState<string | null>(null);
  const [checklistDraftsByItemId, setChecklistDraftsByItemId] = useState<Record<string, ChecklistDraftCaptureState>>({});
  const [checklistAttentionFilter, setChecklistAttentionFilter] = useState<ChecklistAttentionFilter>('all');
  const checklistDraftsRef = useRef<Record<string, ChecklistDraftCaptureState>>({});
  const feedEditStagedPhotosRef = useRef<FeedEditStagedPhoto[]>([]);
  const hasHydratedChecklistDraftsRef = useRef(false);
  const recommendationLogKeysRef = useRef<Set<string>>(new Set());
  
  // Share state
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [shareStatusMessage, setShareStatusMessage] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [expiryDays, setExpiryDays] = useState(7);

  // Product selection state
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<InspectionStatus>('draft');
  const [notes, setNotes] = useState('');
  const currentChecklistDraft =
    activeChecklistDraftItemId ? checklistDraftsByItemId[activeChecklistDraftItemId] || null : null;
  const hasUnsavedChecklistDrafts = Object.keys(checklistDraftsByItemId).length > 0;
  const checklistDraftSessionStorageKey = buildChecklistDraftSessionStorageKey(inspectionId);
  const isFeedEditSaveBusy =
    feedEditSaveState.phase === 'uploading_media' || feedEditSaveState.phase === 'saving_update';
  const buildInspectionLogContext = (params?: {
    category?: string;
    eventType?: string;
    roomId?: string;
    checklistItemId?: string;
    checklistSectionId?: string;
    metadata?: Record<string, unknown>;
  }) => ({
    category: params?.category || 'inspection.checklist',
    eventType: params?.eventType || 'inspection.detail.event',
    route: window.location.pathname || '/inspection',
    screen: 'InspectionDetail',
    contextIds: {
      orgId: org?.id,
      userId: user?.id,
      inspectionId,
      roomId: params?.roomId || selectedRoomId || undefined,
      checklistItemId: params?.checklistItemId,
      checklistSectionId: params?.checklistSectionId,
    },
    metadata: params?.metadata,
  });

  useEffect(() => {
    if (org && inspectionId) {
      loadInspection();
      loadLatestReport();
      loadProductInstances();
      loadCatalogLibrary();
      loadFindings();
      loadRepairTasks();
      loadMaterialRequirements();
      if (flags?.public_share_links) {
        loadShareLinks();
      }
    }
    return () => {
      // Cleanup object URLs
      Object.values(previews).forEach(url => URL.revokeObjectURL(url as string));
    };
  }, [org, inspectionId, flags?.public_share_links]);

  // Listen for product instance additions (from useCatalog hook)
  useEffect(() => {
    const handleInstanceAdded = (e: any) => {
      const instance = e.detail as ProductInstance;
      if (instance.listRef.kind === 'inspection' && instance.listRef.id === inspectionId) {
        setProductInstances(prev => [...prev, instance]);
        loadCatalogItemsForInstances([...productInstances, instance]);
      }
    };
    window.addEventListener('product-instance-added', handleInstanceAdded);
    return () => window.removeEventListener('product-instance-added', handleInstanceAdded);
  }, [inspectionId, productInstances]);

  // Poll for report status updates if generating
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (latestReport && (latestReport.status === 'queued' || latestReport.status === 'generating')) {
      interval = setInterval(loadLatestReport, 2000);
    }
    return () => clearInterval(interval);
  }, [latestReport]);

  useEffect(() => {
    if (selectedRoomId) return;

    const firstRoomId =
      generatedSections.find((section) => section.roomLabel)?.id ||
      generatedSections[0]?.id ||
      '';

    if (firstRoomId) {
      setSelectedRoomId(firstRoomId);
    }
  }, [generatedSections, selectedRoomId]);

  useEffect(() => {
    setCaptureBridgeMessage(null);
    setCaptureBridgeTarget(null);
  }, [selectedRoomId]);

  useEffect(() => {
    if (!initialScopeTarget) return;
    setFocusedScopeRecord(
      createFocusedScopeRecord(
        initialScopeTarget.entityType,
        initialScopeTarget.entityId,
        initialScopeTarget.originLabel || originContextLabel || 'Opened from a connected workflow'
      )
    );
  }, [initialScopeTarget, originContextLabel]);

  useEffect(() => {
    checklistDraftsRef.current = checklistDraftsByItemId;
  }, [checklistDraftsByItemId]);

  useEffect(() => {
    feedEditStagedPhotosRef.current = feedEditStagedPhotos;
  }, [feedEditStagedPhotos]);

  useEffect(() => {
    return () => {
      Object.values(checklistDraftsRef.current as Record<string, ChecklistDraftCaptureState>).forEach((draft) => {
        draft.stagedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      });
      feedEditStagedPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  useEffect(() => {
    hasHydratedChecklistDraftsRef.current = false;
    setChecklistDraftsByItemId({});
    setActiveChecklistDraftItemId(null);
  }, [inspectionId]);

  useEffect(() => {
    if (hasHydratedChecklistDraftsRef.current) return;

    let restoredDraftCount = 0;
    try {
      const rawSession = window.localStorage.getItem(checklistDraftSessionStorageKey);
      if (rawSession) {
        const parsedSession = JSON.parse(rawSession) as SerializedInspectionChecklistDraftSession;
        if (parsedSession?.version === 1 && parsedSession.draftsByItemId && typeof parsedSession.draftsByItemId === 'object') {
          const restoredDrafts = Object.entries(parsedSession.draftsByItemId).reduce<Record<string, ChecklistDraftCaptureState>>(
            (accumulator, [itemId, draft]) => {
              const safeDraft = draft as SerializedChecklistDraftCaptureState;
              if (!draft || typeof draft !== 'object') return accumulator;
              accumulator[itemId] = {
                sectionId: safeDraft.sectionId,
                sectionLabel: safeDraft.sectionLabel,
                itemId: safeDraft.itemId,
                itemLabel: safeDraft.itemLabel,
                selectedAction: safeDraft.selectedAction,
                label: safeDraft.label,
                quantity: safeDraft.quantity,
                notes: safeDraft.notes,
                stagedPhotos: [],
                stagedPhotoRestoreNoticeCount: safeDraft.stagedPhotoRestoreNoticeCount || 0,
                stagedPhotoRestoreNoticeNames: Array.isArray(safeDraft.stagedPhotoRestoreNoticeNames)
                  ? safeDraft.stagedPhotoRestoreNoticeNames.filter((entry): entry is string => typeof entry === 'string')
                  : [],
                restoredFromSession: true,
              };
              return accumulator;
            },
            {}
          );

          restoredDraftCount = Object.keys(restoredDrafts).length;
          setChecklistDraftsByItemId(restoredDrafts);
          setActiveChecklistDraftItemId(
            parsedSession.activeChecklistDraftItemId && restoredDrafts[parsedSession.activeChecklistDraftItemId]
              ? parsedSession.activeChecklistDraftItemId
              : null
          );
          setExpandedChecklistItemId(null);
        }
      }
    } catch (error) {
      console.error('Failed to restore inspection checklist drafts.', error);
      ClientLoggerService.error(
        'Failed to restore checklist draft session.',
        buildInspectionLogContext({
          eventType: 'inspection.checklist.restore_failed',
          metadata: { error },
        })
      );
      window.localStorage.removeItem(checklistDraftSessionStorageKey);
    } finally {
      hasHydratedChecklistDraftsRef.current = true;
    }

    if (restoredDraftCount > 0) {
      ClientLoggerService.info(
        'Restored checklist draft session.',
        buildInspectionLogContext({
          eventType: 'inspection.checklist.restore_session',
          metadata: {
            restoredDraftCount,
          },
        })
      );
      setChecklistMessage(
        'Restored unsaved checklist drafts for this inspection. Staged local photos need to be reattached before save.'
      );
    }
  }, [checklistDraftSessionStorageKey]);

  useEffect(() => {
    if (!hasHydratedChecklistDraftsRef.current) return;

    if (!hasUnsavedChecklistDrafts) {
      window.localStorage.removeItem(checklistDraftSessionStorageKey);
      return;
    }

    const serializedSession: SerializedInspectionChecklistDraftSession = {
      version: 1,
      activeChecklistDraftItemId,
      draftsByItemId: (Object.entries(checklistDraftsByItemId) as Array<[string, ChecklistDraftCaptureState]>).reduce<Record<string, SerializedChecklistDraftCaptureState>>(
        (accumulator, [itemId, draft]) => {
          // File objects are not safely restorable across reloads, so only persist a reattach notice.
          accumulator[itemId] = {
            sectionId: draft.sectionId,
            sectionLabel: draft.sectionLabel,
            itemId: draft.itemId,
            itemLabel: draft.itemLabel,
            selectedAction: draft.selectedAction,
            label: draft.label,
            quantity: draft.quantity,
            notes: draft.notes,
            stagedPhotoRestoreNoticeCount: draft.stagedPhotoRestoreNoticeCount + draft.stagedPhotos.length,
            stagedPhotoRestoreNoticeNames: [
              ...draft.stagedPhotoRestoreNoticeNames,
              ...draft.stagedPhotos.map((photo) => photo.file.name).filter(Boolean),
            ],
          };
          return accumulator;
        },
        {}
      ),
    };

    window.localStorage.setItem(checklistDraftSessionStorageKey, JSON.stringify(serializedSession));
  }, [
    activeChecklistDraftItemId,
    checklistDraftSessionStorageKey,
    checklistDraftsByItemId,
    hasUnsavedChecklistDrafts,
  ]);

  useEffect(() => {
    if (!hasUnsavedChecklistDrafts) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      ClientLoggerService.warn(
        'Browser unload warning triggered for unsaved checklist drafts.',
        buildInspectionLogContext({
          eventType: 'inspection.checklist.unsaved_warning_beforeunload',
          metadata: {
            unsavedDraftCount: Object.keys(checklistDraftsRef.current).length,
          },
        })
      );
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChecklistDrafts]);

  const loadInspection = async () => {
    if (!org) return;
    const list = await InspectionService.listInspections(org.id);
    const found = list.find(i => i.id === inspectionId);
    if (found) {
      setInspection(found);
      const loadedUnit = await UnitService.getUnit(org.id, found.unitId);
      setUnitRecord(loadedUnit);
      setTitle(found.title);
      setStatus(found.status);
      setNotes(found.notes || '');
      setGeneratedSections(found.generatedSections || []);
      loadPhotos(found.photoIds);
    }
  };

  const loadLatestReport = async () => {
      if (!org) return;
      const report = await ReportService.getLatestReport(org.id, inspectionId);
      setLatestReport(report);
  };

  const loadShareLinks = async () => {
      if (!org) return;
      const links = await ShareLinkService.listLinks(org.id, { inspectionId });
      setShareLinks(links);
  };

  const loadProductInstances = async () => {
    if (!org) return;
    const instances = await ProductInstanceService.listInstances(org.id, { kind: 'inspection', id: inspectionId });
    setProductInstances(instances);
    await loadCatalogItemsForInstances(instances);
  };

  const loadCatalogLibrary = async () => {
    if (!org) return;
    const items = await CatalogService.getItems(org.id);
    setCatalogLibrary(items);
  };

  const loadFindings = async () => {
    if (!org) return;
    const nextFindings = await FindingService.listFindings(org.id, { inspectionId });
    setFindings(nextFindings);
  };

  const loadRepairTasks = async () => {
    if (!org) return;
    const nextTasks = await RepairTaskService.listTasks(org.id, { inspectionId });
    setRepairTasks(nextTasks);
  };

  const loadMaterialRequirements = async () => {
    if (!org) return;
    const nextRequirements = await MaterialRequirementService.listRequirements(org.id, { inspectionId });
    setMaterialRequirements(nextRequirements);
  };

  const refreshCaptureData = async () => {
    await Promise.all([loadFindings(), loadRepairTasks(), loadMaterialRequirements()]);
    setInspectionIntelligenceRefreshToken((current) => current + 1);
  };

  const loadCatalogItemsForInstances = async (instances: ProductInstance[]) => {
    if (!org) return;
    const itemIds = Array.from(new Set(instances.map(i => i.catalogItemId)));
    const items = await Promise.all(itemIds.map(id => CatalogService.getItem(org.id, id)));
    const itemMap: Record<string, CatalogItem> = {};
    items.forEach(item => {
      if (item) itemMap[item.id] = item;
    });
    setCatalogItems(prev => ({ ...prev, ...itemMap }));
  };

  const loadPhotos = async (photoIds: string[]) => {
    if (!org) return;
    const allPhotos = await MediaService.listPhotos({ orgId: org.id, limit: 1000 }); // Inefficient but simple for MVP
    const attached = allPhotos.filter(p => photoIds.includes(p.id));
    setPhotos(attached);

    // Generate previews
    const newPreviews: Record<string, string> = {};
    for (const photo of attached) {
        if (!previews[photo.id]) {
            // Use thumbnail for preview
            const blob = await MediaService.getPhotoBlob(photo.id, 'thumb');
            if (blob) {
                newPreviews[photo.id] = URL.createObjectURL(blob);
            }
        }
    }
    setPreviews(prev => ({ ...prev, ...newPreviews }));
  };

  const ensurePhotoPreviews = async (photoIds: string[]) => {
    const missingPhotoIds = photoIds.filter((photoId) => !previews[photoId]);
    if (missingPhotoIds.length === 0) return;

    const nextPreviews: Record<string, string> = {};
    for (const photoId of missingPhotoIds) {
      const blob = await MediaService.getPhotoBlob(photoId, 'thumb');
      if (blob) {
        nextPreviews[photoId] = URL.createObjectURL(blob);
      }
    }

    if (Object.keys(nextPreviews).length > 0) {
      setPreviews((prev) => ({ ...prev, ...nextPreviews }));
    }
  };

  const clearFeedEditStagedPhotos = () => {
    setFeedEditStagedPhotos((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
  };

  const clearFeedEditPendingRemovedPhotoIds = () => {
    setFeedEditPendingRemovedPhotoIds([]);
  };

  const handleSave = async () => {
    if (!org || !user || !inspection) return;
    setIsSaving(true);
    try {
      const updated = {
        ...inspection,
        title,
        status,
        notes,
        generatedSections,
        generatedItems: generatedSections.flatMap((section) => section.items),
      };
      await InspectionService.updateInspection(org.id, updated, user.id);
      log('INSPECTION_UPDATED', { entityId: inspection.id, message: `Updated inspection: ${title}` });
      setInspection(updated);
    } catch (e) {
      console.error(e);
      alert('Failed to save inspection');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoFileCapture = async (file: File): Promise<string | null> => {
    if (!org || !user || !inspection) return null;

    setIsUploading(true);
    try {
      const asset = await MediaService.savePhotoFromFile({
        orgId: org.id,
        file,
        source: 'camera',
      });
      
      await InspectionService.addPhoto(org.id, inspection.id, asset.id, user.id);
      
      log('PHOTO_CAPTURED', { 
        entityId: inspection.id, 
        metadata: { 
            photoId: asset.id,
            originalBytes: asset.originalBytes,
            compressedBytes: asset.compressedBytes,
            targetBytes: asset.maxBytesTarget
        } 
      });
      
      // Refresh photos
      const updatedList = await InspectionService.listInspections(org.id);
      const updated = updatedList.find(i => i.id === inspectionId);
      if (updated) {
          setInspection(updated);
          loadPhotos(updated.photoIds);
      }
      return asset.id;
    } catch (error) {
      console.error('Failed to add photo', error);
      alert('Failed to add photo');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handlePhotoFileCapture(file);
    e.target.value = '';
  };

  const handleRemovePhoto = async (photoId: string) => {
    if (!org || !user || !inspection || !confirm('Remove this photo from inspection?')) return;
    
    try {
        await InspectionService.removePhoto(org.id, inspection.id, photoId, user.id);
        await MediaService.deletePhoto({ orgId: org.id, photoId });
        
        log('PHOTO_DELETED', { entityId: inspection.id, metadata: { photoId } });
        
        // Refresh
        const updatedList = await InspectionService.listInspections(org.id);
        const updated = updatedList.find(i => i.id === inspectionId);
        if (updated) {
            setInspection(updated);
            loadPhotos(updated.photoIds);
        }
    } catch (e) {
        console.error(e);
    }
  };

  const handleAddProduct = async (item: CatalogItem) => {
    if (!org) return;
    await addCatalogItemToList({ kind: 'inspection', id: inspectionId }, item.id, org.id);
  };

  const handleRemoveProductInstance = async (instanceId: string) => {
    if (!org || !confirm('Remove this product from inspection?')) return;
    try {
      await ProductInstanceService.deleteInstance(org.id, instanceId);
      setProductInstances(prev => prev.filter(i => i.id !== instanceId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateProductQty = async (instanceId: string, qty: number) => {
    if (!org) return;
    try {
      await ProductInstanceService.updateInstance(org.id, instanceId, { qty });
      setProductInstances(prev => prev.map(i => i.id === instanceId ? { ...i, qty } : i));
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateReport = async () => {
      if (!org || !user) return;
      setReportStatusMessage(null);
      setIsGeneratingReport(true);
      try {
          const report = await ReportService.createReportRequest({
              orgId: org.id,
              inspectionId,
              userId: user.id,
              options: { includePhotos: true }
          });
          setLatestReport(report);
          log('PDF_REPORT_REQUESTED', { entityId: inspectionId, metadata: { reportId: report.id } });
          
          // Trigger sync immediately to start processing
          triggerSyncNow();
          setReportStatusMessage({
            tone: 'info',
            text: 'Report request queued. UnitFlip is generating a fresh handoff report now.',
          });
      } catch (e) {
          console.error(e);
          setReportStatusMessage({
            tone: 'error',
            text: 'Failed to request report generation. Check your connection and try again.',
          });
      } finally {
          setIsGeneratingReport(false);
      }
  };

  const handleCreateShareLink = async () => {
    if (!org || !user || !latestReport || !role) return;
    setShareStatusMessage(null);
    setIsCreatingLink(true);
    try {
        const link = await ShareLinkService.createLink({
            orgId: org.id,
            userId: user.id,
            role: role as Role,
            reportId: latestReport.id,
            inspectionId,
            expiresAt: Date.now() + expiryDays * 24 * 60 * 60 * 1000,
            resourceBucket: latestReport.pdf?.bucket,
            resourcePath: latestReport.pdf?.path,
            resourceContentType: 'text/html; charset=utf-8',
            resourceLabel: inspection?.title || 'Inspection report',
        });
        setShareLinks(prev => [link, ...prev]);
        log('SHARE_LINK_CREATED', { entityId: inspectionId, metadata: { token: link.token } });
        setShareStatusMessage({
          tone: 'success',
          text: `Public link created. It will stay active until ${new Date(link.expiresAt).toLocaleDateString()}.`,
        });
    } catch (e) {
        console.error(e);
        setShareStatusMessage({
          tone: 'error',
          text: 'Failed to create a public link. Make sure the report is ready and your role can manage share links.',
        });
    } finally {
        setIsCreatingLink(false);
    }
  };

  const handleRevokeLink = async (token: string) => {
      if (!org || !user || !role || !confirm('Revoke this share link? It will no longer be accessible.')) return;
      setShareStatusMessage(null);
      setRevokingToken(token);
      try {
          await ShareLinkService.revokeLink({
              orgId: org.id,
              userId: user.id,
              role: role as Role,
              token
          });
          const revokedAt = Date.now();
          setShareLinks(prev => prev.map(l => l.token === token ? { ...l, revokedAt } : l));
          log('SHARE_LINK_REVOKED', { entityId: inspectionId, metadata: { token } });
          setShareStatusMessage({
            tone: 'info',
            text: 'Public link revoked. Anyone using the old URL will now see a revoked state.',
          });
      } catch (e) {
          console.error(e);
          setShareStatusMessage({
            tone: 'error',
            text: 'Failed to revoke the public link. Try again once the network connection is stable.',
          });
      } finally {
          setRevokingToken(null);
      }
  };

  const copyToClipboard = async (token: string) => {
      const url = `${window.location.origin}/share/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareStatusMessage({
          tone: 'success',
          text: 'Public link copied to the clipboard.',
        });
      } catch (error) {
        console.error(error);
        setShareStatusMessage({
          tone: 'error',
          text: 'Failed to copy the public link. Copy it manually from the browser address bar.',
        });
      }
  };

  const handleGeneratedItemStatusChange = (
    sectionId: string,
    itemId: string,
    nextStatus: GeneratedInspectionItemStatus
  ) => {
    setGeneratedSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      status: nextStatus,
                      completedAt:
                        nextStatus === 'completed' || nextStatus === 'not_applicable'
                          ? Date.now()
                          : undefined,
                      updatedAt: Date.now(),
                    }
                  : item
              ),
            }
      )
    );
  };

  const handleGeneratedItemNotesChange = (sectionId: string, itemId: string, nextNotes: string) => {
    setGeneratedSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, notes: nextNotes, updatedAt: Date.now() } : item
              ),
            }
      )
    );
  };

  const handleGeneratedItemPhotoToggle = (sectionId: string, itemId: string, photoId: string) => {
    setGeneratedSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              items: section.items.map((item) =>
                item.id !== itemId
                  ? item
                  : {
                      ...item,
                      photoIds: item.photoIds.includes(photoId)
                        ? item.photoIds.filter((id) => id !== photoId)
                        : [...item.photoIds, photoId],
                      updatedAt: Date.now(),
                    }
              ),
            }
      )
    );
  };

  const handleGeneratedItemInputValueChange = (
    sectionId: string,
    itemId: string,
    updater: (current: GeneratedInspectionItem['inputValue']) => GeneratedInspectionItem['inputValue']
  ) => {
    setGeneratedSections((prev) =>
      prev.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              items: section.items.map((item) =>
                item.id !== itemId
                  ? item
                  : {
                      ...item,
                      inputValue: updater(item.inputValue),
                      updatedAt: Date.now(),
                    }
              ),
            }
      )
    );
  };

  const persistInspectionSections = async (nextSections: GeneratedInspectionSection[]) => {
    if (!org || !user || !inspection) return;
    const updated = {
      ...inspection,
      title,
      status,
      notes,
      generatedSections: nextSections,
      generatedItems: nextSections.flatMap((section) => section.items),
    };
    await InspectionService.updateInspection(org.id, updated, user.id);
    setInspection(updated);
  };

  const commitAlwaysReplaceItem = async (
    section: GeneratedInspectionSection,
    item: GeneratedInspectionItem,
    options?: { collapse?: boolean; checklistMessage?: string; bridgeMessage?: string; focusMaterial?: boolean }
  ) => {
    if (!org || !user || !inspection) return;

    try {
      const existingRequirementCandidates = await MaterialRequirementService.listRequirements(org.id, { inspectionId: inspection.id });
      const existingRequirement =
        (item.materialRequirementIds || [])
          .map((id) => existingRequirementCandidates.find((entry) => entry.id === id) || null)
          .find(Boolean) ||
        existingRequirementCandidates.find((entry) => entry.sourceGeneratedItemId === item.id) ||
        null;
      const existingTask =
        (item.repairTaskIds || []).map((id) => repairTasks.find((entry) => entry.id === id) || null).find(Boolean) ||
        repairTasks.find((entry) => entry.metadata?.sourceGeneratedItemId === item.id) ||
        null;

      const committed = await ChecklistAlwaysReplaceService.commitItem({
        orgId: org.id,
        userId: user.id,
        inspectionId: inspection.id,
        unitId: inspection.unitId,
        section,
        item,
        existingTask,
        existingRequirement,
      });

      const nextSections = generatedSections.map((entry) =>
        entry.id !== section.id
          ? entry
          : {
              ...entry,
              items: entry.items.map((listItem) =>
                listItem.id !== item.id
                  ? listItem
                  : {
                      ...listItem,
                      inputValue: item.inputValue,
                      status: 'completed',
                      repairTaskIds: Array.from(new Set([...(listItem.repairTaskIds || []), committed.task.id])),
                      materialRequirementIds: Array.from(new Set([...(listItem.materialRequirementIds || []), committed.requirement.id])),
                      updatedAt: Date.now(),
                    }
              ),
            }
      );

      setGeneratedSections(nextSections);
      setRepairTasks((current) => {
        const others = current.filter((entry) => entry.id !== committed.task.id);
        return [committed.task, ...others];
      });
      await persistInspectionSections(nextSections);
      setMaterialRequirements((current) => {
        const others = current.filter((entry) => entry.id !== committed.requirement.id);
        return [committed.requirement, ...others];
      });
      setChecklistMessage(options?.checklistMessage || 'Always-replace item saved directly into repair tasks and material requirements.');
      setCaptureBridgeMessage(
        options?.bridgeMessage || 'Turnover standard saved without creating a finding. Open the generated material requirement or repair task when you are ready.'
      );
      setCaptureBridgeTarget({ entityType: 'task', entityId: committed.task.id });
      if (options?.focusMaterial !== false) {
        setFocusedScopeRecord(createFocusedScopeRecord('material', committed.requirement.id, 'Created from always-replace checklist item'));
      }
      if (options?.collapse !== false) {
        setExpandedChecklistItemId(null);
      }
      setActiveChecklistDraftItemId(null);
    } catch (error) {
      console.error(error);
      setChecklistMessage(error instanceof Error ? error.message : 'Failed to save the always-replace item.');
    }
  };

  const handleAlwaysReplaceSave = async (sectionId: string, itemId: string) => {
    if (!org || !user || !inspection) return;

    const section = generatedSections.find((entry) => entry.id === sectionId);
    const item = section?.items.find((entry) => entry.id === itemId);
    if (!section || !item) {
      setChecklistMessage('The selected checklist item could not be found.');
      return;
    }

    if (!isAlwaysReplaceChecklistItem(item)) {
      setChecklistMessage('Only always-replace checklist items can use this direct save path.');
      return;
    }

    await commitAlwaysReplaceItem(section, item);
  };

  const handleAlwaysReplaceQuantityCommit = async (sectionId: string, itemId: string, quantity: number) => {
    if (!org || !user || !inspection) return;

    const section = generatedSections.find((entry) => entry.id === sectionId);
    const item = section?.items.find((entry) => entry.id === itemId);
    if (!section || !item) {
      setChecklistMessage('The selected checklist item could not be found.');
      return;
    }

    if (!isAlwaysReplaceChecklistItem(item) || item.inputMode !== 'count') {
      setChecklistMessage('Only count-based always-replace checklist items can use quantity controls.');
      return;
    }

    const nextQuantity = Math.max(1, Math.round(Number(quantity)) || 1);
    const itemWithQuantity: GeneratedInspectionItem = {
      ...item,
      status: 'completed',
      inputValue: {
        ...(item.inputValue || {}),
        quantity: nextQuantity,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };

    await commitAlwaysReplaceItem(section, itemWithQuantity, {
      collapse: false,
      focusMaterial: false,
      checklistMessage: `${item.label} quantity saved to materials.`,
      bridgeMessage: 'Standard quantity saved without creating a finding.',
    });
  };

  const handleCreateFindingFromChecklistItem = async (sectionId: string, itemId: string) => {
    if (!org || !user || !inspection) return;

    const section = generatedSections.find((entry) => entry.id === sectionId);
    const item = section?.items.find((entry) => entry.id === itemId);
    if (!section || !item) {
      setChecklistMessage('The selected checklist item could not be found.');
      return;
    }

    if (item.findingIds && item.findingIds.length > 0) {
      setChecklistMessage('A finding has already been created for this checklist item.');
      return;
    }

    try {
      const createdFinding = await FindingService.createFinding(
        org.id,
        {
          orgId: org.id,
          inspectionId: inspection.id,
          unitId: inspection.unitId,
          area: item.roomLabel || section.title,
          category: 'general',
          severity:
            item.status === 'failed' ? 'major' : item.status === 'blocked' ? 'moderate' : 'minor',
          priority: item.priority || (item.status === 'failed' ? 'high' : 'medium'),
          status: 'open',
          description: item.label,
          notes: item.notes || undefined,
          recommendedTrade: 'general',
          photoIds: item.photoIds,
          metadata: {
            source: 'generated_checklist',
            generatedSectionId: section.id,
            generatedItemId: item.id,
            sourceRoomLabel: item.roomLabel,
            sourceRoomType: item.roomType,
            sourceChecklistLabel: item.label,
          },
        },
        user.id
      );

      setGeneratedSections((prev) =>
        prev.map((entry) =>
          entry.id !== sectionId
            ? entry
            : {
                ...entry,
                items: entry.items.map((listItem) =>
                  listItem.id !== itemId
                    ? listItem
                    : {
                        ...listItem,
                        findingIds: [...(listItem.findingIds || []), createdFinding.id],
                        updatedAt: Date.now(),
                      }
                ),
              }
        )
      );

      setChecklistMessage('Finding created from checklist issue. It now appears in Findings and can drive repair tasks next. Save inspection changes to persist checklist links.');
      setCaptureBridgeMessage('Checklist issue converted into a structured finding. Open the linked finding or generate repair tasks when you are ready.');
      setCaptureBridgeTarget({ entityType: 'finding', entityId: createdFinding.id });
      setFocusedScopeRecord(createFocusedScopeRecord('finding', createdFinding.id, 'Created from checklist'));
    } catch (error) {
      console.error(error);
      setChecklistMessage(error instanceof Error ? error.message : 'Failed to create finding from checklist item.');
    }
  };

  const buildCommitContext = () => {
    if (!org || !user || !inspection) return null;
    return {
      orgId: org.id,
      userId: user.id,
      inspectionId: inspection.id,
      unitId: inspection.unitId,
    };
  };

  const buildRoomContext = () => {
    const activeRoom = roomWorkspaceRooms.find((room) => room.id === selectedRoomId);
    return {
      roomId: activeRoom?.id,
      roomLabel: activeRoom?.label || 'Unit Overview',
      roomType: activeRoom?.subtitle,
    };
  };

  const deriveScopeSectionFromTarget = (target?: { entityType: 'finding' | 'task' | 'material' } | null) => {
    if (!target) return initialScopeSection || null;
    if (target.entityType === 'finding') return 'findings';
    if (target.entityType === 'task') return 'tasks';
    return 'materials';
  };

  const persistInspectionContext = (overrideTarget?: {
    entityType: 'finding' | 'task' | 'material';
    entityId: string;
    originLabel?: string | null;
  } | null) => {
    const target = overrideTarget || (focusedScopeRecord
      ? {
          entityType: focusedScopeRecord.entityType,
          entityId: focusedScopeRecord.entityId,
          originLabel: focusedScopeRecord.originLabel || originContextLabel,
        }
      : initialScopeTarget);

    onPersistInspectionContext?.({
      scopeSection: deriveScopeSectionFromTarget(target),
      scopeTarget: target || null,
    });
  };

  const buildVoiceMetadata = (
    transcript: string,
    result: VoiceCaptureResult,
    fallbackModeOverride?: 'transcript' | 'manual_transcript' | 'manual_note'
  ) => ({
    rawTranscript: result.transcript,
    editedTranscript: transcript,
    durationMs: result.durationMs,
    transcriptAvailable: result.transcriptAvailable,
    transcriptState: result.transcriptState,
    permissionState: result.permissionState,
    recordingSupported: result.capabilities.mediaRecordingSupported,
    speechSupported: result.capabilities.speechRecognitionSupported,
    fallbackMode: fallbackModeOverride || (!result.transcriptAvailable
      ? 'manual_note'
      : transcript.trim() !== result.transcript.trim()
        ? 'manual_transcript'
        : 'transcript'),
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    audioAttachmentPresent: false,
  });

  const upsertChecklistDraft = (itemId: string, updater: (draft: ChecklistDraftCaptureState) => ChecklistDraftCaptureState) => {
    setChecklistDraftsByItemId((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      return {
        ...prev,
        [itemId]: updater(existing),
      };
    });
  };

  const clearChecklistDraft = (itemId: string | null) => {
    if (!itemId) return;
    setChecklistDraftsByItemId((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      existing.stagedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const confirmLeaveWithUnsavedDrafts = () => {
    if (!hasUnsavedChecklistDrafts) return true;
    ClientLoggerService.warn(
      'In-app navigation warning triggered for unsaved checklist drafts.',
      buildInspectionLogContext({
        eventType: 'inspection.checklist.unsaved_warning_navigation',
        metadata: {
          unsavedDraftCount: Object.keys(checklistDraftsByItemId).length,
        },
      })
    );
    const confirmed = window.confirm('You have unsaved checklist drafts. Leave this inspection and discard that unsaved work?');
    ClientLoggerService.info(
      'Unsaved checklist draft navigation decision recorded.',
      buildInspectionLogContext({
        eventType: 'inspection.checklist.unsaved_warning_decision',
        metadata: {
          confirmed,
          unsavedDraftCount: Object.keys(checklistDraftsByItemId).length,
        },
      })
    );
    return confirmed;
  };

  const handleProtectedBack = () => {
    if (!confirmLeaveWithUnsavedDrafts()) return;
    onBack();
  };

  const buildChecklistDraft = (
    section: GeneratedInspectionSection,
    item: GeneratedInspectionSection['items'][number],
    action: InspectionCaptureAction,
    overrides?: Partial<Pick<InspectionCaptureDraft, 'notes' | 'photoIds' | 'label' | 'rawText' | 'quantity'>>
  ) =>
    ({
      ...InspectionCaptureParserService.parse({
        rawText: overrides?.rawText || item.label,
        selectedAction: action,
        room: {
          roomId: selectedRoomId,
          roomLabel: item.roomLabel || section.roomLabel || currentRoom?.label || section.title,
          roomType: item.roomType || section.roomType,
        },
        source: 'checklist',
        checklistContext: {
          checklistOrigin: true,
          checklistSectionId: section.id,
          checklistSectionLabel: section.title,
          checklistItemId: item.id,
          checklistItemLabel: item.label,
        },
        photoIds: overrides?.photoIds || [],
      }),
      label: overrides?.label || item.label,
      quantity: overrides?.quantity,
      notes: overrides?.notes ?? item.notes ?? '',
    }) as InspectionCaptureDraft;

  const handleCaptureSubmit = async (action: InspectionCaptureAction, value: string) => {
    const commitContext = buildCommitContext();
    if (!commitContext) return;

    const draft = InspectionCaptureParserService.parse({
      rawText: value,
      selectedAction: action,
      room: buildRoomContext(),
    });

    if (draft.requiresReview) {
      setPendingCaptureDraft(draft);
      return;
    }

    const committed = await InspectionCaptureCommitService.commitDraft(
      commitContext,
      draft
    );

    setPendingCaptureDraft(null);
    setCaptureBridgeMessage(buildCaptureBridgeMessage(draft, committed));
    setCaptureBridgeTarget({ entityType: committed.entityType, entityId: committed.entityId });
    setFocusedScopeRecord(createFocusedScopeRecord(committed.entityType, committed.entityId, 'Created from capture'));
    await refreshCaptureData();
  };

  const handleWorkspacePhotoCapture = async (file: File, value: string) => {
    const commitContext = buildCommitContext();
    const photoId = await handlePhotoFileCapture(file);

    if (commitContext && photoId) {
      const draftText = value.trim() || `${buildRoomContext().roomLabel} photo`;
      const draft = InspectionCaptureParserService.parse({
        rawText: draftText,
        selectedAction: 'note',
        room: buildRoomContext(),
        source: 'photo',
        photoIds: [photoId],
      });

      const noteDraft: InspectionCaptureDraft = {
        ...draft,
        source: 'photo',
        requiresReview: false,
      };

      const committed = await InspectionCaptureCommitService.commitDraft(
        commitContext,
        noteDraft
      );
      setCaptureBridgeMessage(buildCaptureBridgeMessage(noteDraft, committed));
      setCaptureBridgeTarget({ entityType: committed.entityType, entityId: committed.entityId });
      setFocusedScopeRecord(createFocusedScopeRecord(committed.entityType, committed.entityId, 'Created from photo capture'));
      await refreshCaptureData();
    }
  };

  const handlePendingDraftCommit = async () => {
    const commitContext = buildCommitContext();
    if (!pendingCaptureDraft || !commitContext) return;
    try {
      const committed = await InspectionCaptureCommitService.commitDraft(
        commitContext,
        pendingCaptureDraft
      );

      if (pendingCaptureDraft.source === 'voice') {
        ClientLoggerService.info(
          'Voice capture committed.',
          buildInspectionLogContext({
            category: 'inspection.voice',
            eventType: 'inspection.voice_capture.committed',
            metadata: {
              entityId: committed.entityId,
              entityType: committed.entityType,
              durationMs: pendingCaptureDraft.voiceMetadata?.durationMs,
              durationBucket: getDurationBucket(pendingCaptureDraft.voiceMetadata?.durationMs),
              transcriptPresent: Boolean(pendingCaptureDraft.voiceMetadata?.editedTranscript || pendingCaptureDraft.voiceMetadata?.rawTranscript),
              transcriptAvailable: pendingCaptureDraft.voiceMetadata?.transcriptAvailable,
              transcriptState: pendingCaptureDraft.voiceMetadata?.transcriptState,
              transcriptLengthBucket: getTranscriptLengthBucket(
                pendingCaptureDraft.voiceMetadata?.editedTranscript || pendingCaptureDraft.voiceMetadata?.rawTranscript
              ),
              permissionState: pendingCaptureDraft.voiceMetadata?.permissionState,
              fallbackMode: pendingCaptureDraft.voiceMetadata?.fallbackMode,
              audioAttachmentPresent: pendingCaptureDraft.voiceMetadata?.audioAttachmentPresent || false,
              parserConfidence: pendingCaptureDraft.confidence,
            },
          })
        );
      }

      setCaptureBridgeMessage(buildCaptureBridgeMessage(pendingCaptureDraft, committed));
      setCaptureBridgeTarget({ entityType: committed.entityType, entityId: committed.entityId });
      setFocusedScopeRecord(createFocusedScopeRecord(committed.entityType, committed.entityId, 'Created from reviewed capture'));
      setPendingCaptureDraft(null);
      await refreshCaptureData();
    } catch (error) {
      if (pendingCaptureDraft.source === 'voice') {
        ClientLoggerService.error(
          'Voice capture commit failed.',
          buildInspectionLogContext({
            category: 'inspection.voice',
            eventType: 'inspection.voice_capture.commit_failed',
            metadata: {
              durationMs: pendingCaptureDraft.voiceMetadata?.durationMs,
              transcriptState: pendingCaptureDraft.voiceMetadata?.transcriptState,
              fallbackMode: pendingCaptureDraft.voiceMetadata?.fallbackMode,
              parserConfidence: pendingCaptureDraft.confidence,
              error,
            },
          })
        );
      }
      throw error;
    }
  };

  const handleVoiceParseReview = async ({
    transcript,
    result,
  }: {
    transcript: string;
    result: VoiceCaptureResult;
  }) => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) return;

    ClientLoggerService.info(
      'Voice capture parsed for review.',
      buildInspectionLogContext({
        category: 'inspection.voice',
        eventType: 'inspection.voice_capture.parsed',
        metadata: {
          roomLabel: buildRoomContext().roomLabel,
          durationMs: result.durationMs,
          durationBucket: getDurationBucket(result.durationMs),
          transcriptPresent: trimmedTranscript.length > 0,
          transcriptAvailable: result.transcriptAvailable,
          transcriptState: result.transcriptState,
          transcriptLengthBucket: getTranscriptLengthBucket(trimmedTranscript),
          permissionState: result.permissionState,
          audioAttachmentPresent: false,
        },
      })
    );

    const parsedDraft = InspectionCaptureParserService.parse({
      rawText: trimmedTranscript,
      selectedAction: 'note',
      room: buildRoomContext(),
      source: 'voice',
      voiceMetadata: buildVoiceMetadata(trimmedTranscript, result, !result.transcriptAvailable ? 'manual_transcript' : undefined),
    });

    ClientLoggerService.info(
      'Voice refinement draft opened.',
      buildInspectionLogContext({
        category: 'inspection.voice',
        eventType: 'inspection.voice_capture.refinement_opened',
        metadata: {
          roomLabel: buildRoomContext().roomLabel,
          transcriptState: result.transcriptState,
          transcriptLengthBucket: getTranscriptLengthBucket(trimmedTranscript),
          parserConfidence: parsedDraft.confidence,
        },
      })
    );

    setPendingCaptureDraft({
      ...parsedDraft,
      requiresReview: true,
    });
  };

  const handleVoiceSaveAsNote = async ({
    transcript,
    result,
  }: {
    transcript: string;
    result: VoiceCaptureResult;
  }) => {
    const commitContext = buildCommitContext();
    const trimmedTranscript = transcript.trim();
    if (!commitContext || !trimmedTranscript) return;

    ClientLoggerService.info(
      'Voice capture saving as note.',
      buildInspectionLogContext({
        category: 'inspection.voice',
        eventType: 'inspection.voice_capture.saved_as_note',
        metadata: {
          roomLabel: buildRoomContext().roomLabel,
          durationMs: result.durationMs,
          durationBucket: getDurationBucket(result.durationMs),
          transcriptPresent: trimmedTranscript.length > 0,
          transcriptAvailable: result.transcriptAvailable,
          transcriptState: result.transcriptState,
          transcriptLengthBucket: getTranscriptLengthBucket(trimmedTranscript),
          permissionState: result.permissionState,
          audioAttachmentPresent: false,
        },
      })
    );

    const noteDraft = InspectionCaptureParserService.parse({
      rawText: trimmedTranscript,
      selectedAction: 'note',
      room: buildRoomContext(),
      source: 'voice',
      voiceMetadata: buildVoiceMetadata(trimmedTranscript, result, !result.transcriptAvailable ? 'manual_note' : undefined),
    });
    try {
      const committed = await InspectionCaptureCommitService.commitDraft(commitContext, {
        ...noteDraft,
        kind: 'note',
        label: trimmedTranscript,
        notes: trimmedTranscript,
        requiresReview: false,
        persistenceTarget: 'finding',
        source: 'voice',
        voiceMetadata: buildVoiceMetadata(trimmedTranscript, result, !result.transcriptAvailable ? 'manual_note' : undefined),
      });

      ClientLoggerService.info(
        'Voice capture committed.',
        buildInspectionLogContext({
          category: 'inspection.voice',
          eventType: 'inspection.voice_capture.committed',
          metadata: {
            entityId: committed.entityId,
            entityType: committed.entityType,
            durationMs: result.durationMs,
            durationBucket: getDurationBucket(result.durationMs),
            transcriptPresent: trimmedTranscript.length > 0,
            transcriptAvailable: result.transcriptAvailable,
            transcriptState: result.transcriptState,
            transcriptLengthBucket: getTranscriptLengthBucket(trimmedTranscript),
            permissionState: result.permissionState,
            fallbackMode: !result.transcriptAvailable ? 'manual_note' : trimmedTranscript !== result.transcript.trim() ? 'manual_transcript' : 'transcript',
            audioAttachmentPresent: false,
          },
        })
      );

      setCaptureBridgeMessage(buildCaptureBridgeMessage(noteDraft, committed));
      setCaptureBridgeTarget({ entityType: committed.entityType, entityId: committed.entityId });
      setFocusedScopeRecord(createFocusedScopeRecord(committed.entityType, committed.entityId, 'Created from voice capture'));
      await refreshCaptureData();
    } catch (error) {
      ClientLoggerService.error(
        'Voice capture commit failed.',
        buildInspectionLogContext({
          category: 'inspection.voice',
          eventType: 'inspection.voice_capture.commit_failed',
          metadata: {
            durationMs: result.durationMs,
            transcriptState: result.transcriptState,
            permissionState: result.permissionState,
            error,
          },
        })
      );
      throw error;
    }
  };

  const handleChecklistGood = async (sectionId: string, itemId: string) => {
    ClientLoggerService.info(
      'Checklist item marked good.',
      buildInspectionLogContext({
        eventType: 'inspection.checklist.mark_good',
        checklistItemId: itemId,
        checklistSectionId: sectionId,
      })
    );
    handleGeneratedItemStatusChange(sectionId, itemId, 'completed');
    setChecklistMessage('Checklist item marked good.');
    setExpandedChecklistItemId(null);
    setActiveChecklistDraftItemId(null);
    clearChecklistDraft(itemId);
  };

  const handleChecklistStartDraft = (
    section: GeneratedInspectionSection,
    item: GeneratedInspectionSection['items'][number],
    action: 'repair' | 'replace' | 'missing' | 'note' | 'photo'
  ) => {
    ClientLoggerService.info(
      'Checklist item entered draft mode.',
      buildInspectionLogContext({
        eventType: 'inspection.checklist.enter_draft',
        checklistItemId: item.id,
        checklistSectionId: section.id,
        metadata: {
          selectedAction: action,
          hadExistingDraft: Boolean(checklistDraftsByItemId[item.id]),
        },
      })
    );
    setActiveChecklistDraftItemId(item.id);
    setChecklistDraftsByItemId((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: existing
          ? { ...existing, selectedAction: action }
          : {
              sectionId: section.id,
              sectionLabel: section.title,
              itemId: item.id,
              itemLabel: item.label,
              selectedAction: action,
              label: item.label,
              quantity: '',
              notes: item.notes || '',
              stagedPhotos: [],
              stagedPhotoRestoreNoticeCount: 0,
              stagedPhotoRestoreNoticeNames: [],
              restoredFromSession: false,
            },
      };
    });
  };

  const handleChecklistDraftSave = async (mode: 'save' | 'save_next') => {
    const commitContext = buildCommitContext();
    if (!commitContext || !currentChecklistDraft) return;

    const section = currentRoomChecklistSections.find((entry) => entry.id === currentChecklistDraft.sectionId);
    const item = section?.items.find((entry) => entry.id === currentChecklistDraft.itemId);
    if (!section || !item) return;
    ClientLoggerService.info(
      mode === 'save_next' ? 'Checklist draft save and next started.' : 'Checklist draft save started.',
      buildInspectionLogContext({
        eventType: mode === 'save_next' ? 'inspection.checklist.save_next_started' : 'inspection.checklist.save_started',
        checklistItemId: item.id,
        checklistSectionId: section.id,
        metadata: {
          selectedAction: currentChecklistDraft.selectedAction,
          stagedPhotoCount: currentChecklistDraft.stagedPhotos.length,
          restoredPhotoNoticeCount: currentChecklistDraft.stagedPhotoRestoreNoticeCount,
        },
      })
    );

    try {
      const photoIds: string[] = [];
      for (const stagedPhoto of currentChecklistDraft.stagedPhotos) {
        const photoId = await handlePhotoFileCapture(stagedPhoto.file);
        if (photoId) {
          photoIds.push(photoId);
          handleGeneratedItemPhotoToggle(section.id, item.id, photoId);
        }
      }

      const selectedAction: InspectionCaptureAction =
        currentChecklistDraft.selectedAction === 'repair' || currentChecklistDraft.selectedAction === 'replace'
          ? currentChecklistDraft.selectedAction
          : 'note';
      const parsedQuantityValue = currentChecklistDraft.quantity.trim() ? Number(currentChecklistDraft.quantity.trim()) : undefined;
      const parsedQuantity = parsedQuantityValue !== undefined && Number.isFinite(parsedQuantityValue) ? parsedQuantityValue : undefined;
      const rawText = [
        parsedQuantity ? String(parsedQuantity) : '',
        currentChecklistDraft.label.trim(),
        currentChecklistDraft.notes.trim(),
      ]
        .filter(Boolean)
        .join(' ');

      const parsedDraft = buildChecklistDraft(section, item, selectedAction, {
        rawText: rawText || currentChecklistDraft.label.trim(),
        label: currentChecklistDraft.label.trim() || item.label,
        notes: currentChecklistDraft.notes.trim(),
        photoIds,
        quantity: parsedQuantity,
      });

      const normalizedDraft: InspectionCaptureDraft = {
        ...parsedDraft,
        kind:
          currentChecklistDraft.selectedAction === 'photo'
            ? 'note'
            : currentChecklistDraft.selectedAction,
        persistenceTarget:
          currentChecklistDraft.selectedAction === 'repair' || currentChecklistDraft.selectedAction === 'replace'
            ? 'task'
            : 'finding',
        selectedAction,
        requiresReview: false,
        source: 'checklist',
      };

      await InspectionCaptureCommitService.commitDraft(commitContext, normalizedDraft);

      if (currentChecklistDraft.notes.trim()) {
        handleGeneratedItemNotesChange(section.id, item.id, currentChecklistDraft.notes.trim());
      }
      if (currentChecklistDraft.selectedAction === 'missing') {
        handleGeneratedItemStatusChange(section.id, item.id, 'failed');
      }
      if (currentChecklistDraft.selectedAction === 'repair' || currentChecklistDraft.selectedAction === 'replace') {
        handleGeneratedItemStatusChange(section.id, item.id, 'blocked');
      }

      const savedAction = currentChecklistDraft.selectedAction;
      setChecklistMessage(`${titleCase(savedAction)} capture saved.`);
      clearChecklistDraft(item.id);
      setActiveChecklistDraftItemId(null);
      setExpandedChecklistItemId(null);
      await refreshCaptureData();

      ClientLoggerService.info(
        mode === 'save_next' ? 'Checklist draft save and next completed.' : 'Checklist draft save completed.',
        buildInspectionLogContext({
          eventType: mode === 'save_next' ? 'inspection.checklist.save_next_completed' : 'inspection.checklist.save_completed',
          checklistItemId: item.id,
          checklistSectionId: section.id,
          metadata: {
            selectedAction: savedAction,
            persistedPhotoCount: photoIds.length,
            quantity: parsedQuantity,
          },
        })
      );

      if (mode === 'save_next') {
        const checklistItems = currentRoomChecklistSections.flatMap((entry) =>
          entry.items.map((checklistItem) => ({
            section: entry,
            item: checklistItem,
          }))
        );
        const currentIndex = checklistItems.findIndex((entry) => entry.item.id === item.id);
        const nextEntry = currentIndex >= 0 ? checklistItems[currentIndex + 1] : undefined;
        if (nextEntry) {
          setActiveChecklistDraftItemId(nextEntry.item.id);
          setChecklistDraftsByItemId((prev) => ({
            ...prev,
            [nextEntry.item.id]: prev[nextEntry.item.id] || {
              sectionId: nextEntry.section.id,
              sectionLabel: nextEntry.section.title,
              itemId: nextEntry.item.id,
              itemLabel: nextEntry.item.label,
              selectedAction:
                savedAction === 'repair' || savedAction === 'replace' || savedAction === 'missing'
                  ? savedAction
                  : 'note',
              label: nextEntry.item.label,
              quantity: '',
              notes: nextEntry.item.notes || '',
              stagedPhotos: [],
              stagedPhotoRestoreNoticeCount: 0,
              stagedPhotoRestoreNoticeNames: [],
              restoredFromSession: false,
            },
          }));
          if (savedAction === 'repair' || savedAction === 'replace' || savedAction === 'missing') {
            upsertChecklistDraft(nextEntry.item.id, (draft) => ({
              ...draft,
              selectedAction: savedAction,
            }));
          }
        }
      }
    } catch (error) {
      ClientLoggerService.error(
        'Checklist draft save failed.',
        buildInspectionLogContext({
          eventType: mode === 'save_next' ? 'inspection.checklist.save_next_failed' : 'inspection.checklist.save_failed',
          checklistItemId: item.id,
          checklistSectionId: section.id,
          metadata: {
            selectedAction: currentChecklistDraft.selectedAction,
            error,
          },
        })
      );
      throw error;
    }
  };

  const createDraftFromFinding = (finding: Finding): InspectionCaptureDraft => ({
    id: `feed_draft_${finding.id}`,
    rawText: String(finding.metadata?.rawText || finding.description),
    kind: normalizeCaptureKind(finding.metadata?.captureKind, 'note'),
    label: finding.description,
    canonicalLabel: typeof finding.metadata?.canonicalLabel === 'string' ? finding.metadata.canonicalLabel : undefined,
    aliasMatched: typeof finding.metadata?.aliasMatched === 'string' ? finding.metadata.aliasMatched : undefined,
    quantity: typeof finding.metadata?.quantity === 'number' ? finding.metadata.quantity : undefined,
    roomId: typeof finding.metadata?.roomId === 'string' ? finding.metadata.roomId : undefined,
    roomLabel: typeof finding.metadata?.roomLabel === 'string' ? finding.metadata.roomLabel : finding.area,
    roomType: typeof finding.metadata?.roomType === 'string' ? finding.metadata.roomType : undefined,
    notes: finding.notes || '',
    source:
      finding.metadata?.captureSource === 'manual' ||
      finding.metadata?.captureSource === 'parsed' ||
      finding.metadata?.captureSource === 'photo' ||
      finding.metadata?.captureSource === 'checklist' ||
      finding.metadata?.captureSource === 'voice'
        ? finding.metadata.captureSource
        : 'manual',
    confidence:
      finding.metadata?.captureConfidence === 'high' ||
      finding.metadata?.captureConfidence === 'medium' ||
      finding.metadata?.captureConfidence === 'low'
        ? finding.metadata.captureConfidence
        : 'medium',
    matchedRules: Array.isArray(finding.metadata?.matchedRules)
      ? finding.metadata.matchedRules.filter((entry): entry is string => typeof entry === 'string')
      : [],
    requiresReview: false,
    inferredTrade: typeof finding.metadata?.inferredTrade === 'string' ? finding.metadata.inferredTrade : undefined,
    photoIds: finding.photoIds,
    voiceMetadata:
      typeof finding.metadata?.transcriptAvailable === 'boolean' ||
      typeof finding.metadata?.voiceDurationMs === 'number' ||
      typeof finding.metadata?.rawTranscript === 'string' ||
      typeof finding.metadata?.editedTranscript === 'string'
        ? {
            rawTranscript: typeof finding.metadata?.rawTranscript === 'string' ? finding.metadata.rawTranscript : undefined,
            editedTranscript:
              typeof finding.metadata?.editedTranscript === 'string' ? finding.metadata.editedTranscript : undefined,
            durationMs: typeof finding.metadata?.voiceDurationMs === 'number' ? finding.metadata.voiceDurationMs : undefined,
            transcriptAvailable: Boolean(finding.metadata?.transcriptAvailable),
            transcriptState:
              finding.metadata?.transcriptState === 'available' ||
              finding.metadata?.transcriptState === 'partial' ||
              finding.metadata?.transcriptState === 'empty' ||
              finding.metadata?.transcriptState === 'unsupported'
                ? finding.metadata.transcriptState
                : undefined,
            permissionState:
              finding.metadata?.permissionState === 'unknown' ||
              finding.metadata?.permissionState === 'granted' ||
              finding.metadata?.permissionState === 'denied' ||
              finding.metadata?.permissionState === 'dismissed_or_interrupted'
                ? finding.metadata.permissionState
                : undefined,
            recordingSupported: typeof finding.metadata?.recordingSupported === 'boolean' ? finding.metadata.recordingSupported : undefined,
            speechSupported: typeof finding.metadata?.speechSupported === 'boolean' ? finding.metadata.speechSupported : undefined,
            fallbackMode:
              finding.metadata?.voiceFallbackMode === 'transcript' ||
              finding.metadata?.voiceFallbackMode === 'manual_transcript' ||
              finding.metadata?.voiceFallbackMode === 'manual_note'
                ? finding.metadata.voiceFallbackMode
                : undefined,
            startedAt: typeof finding.metadata?.voiceStartedAt === 'string' ? finding.metadata.voiceStartedAt : undefined,
            completedAt:
              typeof finding.metadata?.voiceCompletedAt === 'string' ? finding.metadata.voiceCompletedAt : undefined,
            audioAttachmentPresent: Boolean(finding.metadata?.audioAttachmentPresent),
          }
        : undefined,
    checklistContext:
      typeof finding.metadata?.checklistOrigin === 'boolean' && finding.metadata.checklistOrigin
        ? {
            checklistOrigin: true,
            checklistSectionId: String(finding.metadata?.checklistSectionId || ''),
            checklistSectionLabel: String(finding.metadata?.checklistSectionLabel || ''),
            checklistItemId: typeof finding.metadata?.checklistItemId === 'string' ? finding.metadata.checklistItemId : undefined,
            checklistItemLabel: typeof finding.metadata?.checklistItemLabel === 'string' ? finding.metadata.checklistItemLabel : undefined,
          }
        : undefined,
    selectedAction:
      finding.metadata?.selectedAction === 'replace' ||
      finding.metadata?.selectedAction === 'repair' ||
      finding.metadata?.selectedAction === 'quantity' ||
      finding.metadata?.selectedAction === 'note' ||
      finding.metadata?.selectedAction === 'photo'
        ? finding.metadata.selectedAction
        : 'note',
    persistenceTarget: 'finding',
    existingEntityId: finding.id,
    existingEntityType: 'finding',
  });

  const createDraftFromTask = (task: RepairTask): InspectionCaptureDraft => ({
    id: `feed_draft_${task.id}`,
    rawText: String(task.metadata?.rawText || task.title),
    kind: normalizeCaptureKind(task.metadata?.captureKind, task.title.toLowerCase().startsWith('replace') ? 'replace' : 'task'),
    label: task.title.replace(/^(Replace|Repair)\s+/i, ''),
    canonicalLabel: typeof task.metadata?.canonicalLabel === 'string' ? task.metadata.canonicalLabel : undefined,
    aliasMatched: typeof task.metadata?.aliasMatched === 'string' ? task.metadata.aliasMatched : undefined,
    quantity: typeof task.metadata?.quantity === 'number' ? task.metadata.quantity : undefined,
    roomId: typeof task.metadata?.roomId === 'string' ? task.metadata.roomId : undefined,
    roomLabel: typeof task.metadata?.roomLabel === 'string' ? task.metadata.roomLabel : 'Unit Overview',
    roomType: typeof task.metadata?.roomType === 'string' ? task.metadata.roomType : undefined,
    notes: task.notes || '',
    source:
      task.metadata?.captureSource === 'manual' ||
      task.metadata?.captureSource === 'parsed' ||
      task.metadata?.captureSource === 'photo' ||
      task.metadata?.captureSource === 'checklist' ||
      task.metadata?.captureSource === 'voice'
        ? task.metadata.captureSource
        : 'manual',
    confidence:
      task.metadata?.captureConfidence === 'high' ||
      task.metadata?.captureConfidence === 'medium' ||
      task.metadata?.captureConfidence === 'low'
        ? task.metadata.captureConfidence
        : 'medium',
    matchedRules: Array.isArray(task.metadata?.matchedRules)
      ? task.metadata.matchedRules.filter((entry): entry is string => typeof entry === 'string')
      : [],
    requiresReview: false,
    inferredTrade: typeof task.metadata?.inferredTrade === 'string' ? task.metadata.inferredTrade : undefined,
    photoIds:
      Array.isArray(task.metadata?.attachmentPhotoIds)
        ? task.metadata.attachmentPhotoIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
    voiceMetadata:
      typeof task.metadata?.transcriptAvailable === 'boolean' ||
      typeof task.metadata?.voiceDurationMs === 'number' ||
      typeof task.metadata?.rawTranscript === 'string' ||
      typeof task.metadata?.editedTranscript === 'string'
        ? {
            rawTranscript: typeof task.metadata?.rawTranscript === 'string' ? task.metadata.rawTranscript : undefined,
            editedTranscript: typeof task.metadata?.editedTranscript === 'string' ? task.metadata.editedTranscript : undefined,
            durationMs: typeof task.metadata?.voiceDurationMs === 'number' ? task.metadata.voiceDurationMs : undefined,
            transcriptAvailable: Boolean(task.metadata?.transcriptAvailable),
            transcriptState:
              task.metadata?.transcriptState === 'available' ||
              task.metadata?.transcriptState === 'partial' ||
              task.metadata?.transcriptState === 'empty' ||
              task.metadata?.transcriptState === 'unsupported'
                ? task.metadata.transcriptState
                : undefined,
            permissionState:
              task.metadata?.permissionState === 'unknown' ||
              task.metadata?.permissionState === 'granted' ||
              task.metadata?.permissionState === 'denied' ||
              task.metadata?.permissionState === 'dismissed_or_interrupted'
                ? task.metadata.permissionState
                : undefined,
            recordingSupported: typeof task.metadata?.recordingSupported === 'boolean' ? task.metadata.recordingSupported : undefined,
            speechSupported: typeof task.metadata?.speechSupported === 'boolean' ? task.metadata.speechSupported : undefined,
            fallbackMode:
              task.metadata?.voiceFallbackMode === 'transcript' ||
              task.metadata?.voiceFallbackMode === 'manual_transcript' ||
              task.metadata?.voiceFallbackMode === 'manual_note'
                ? task.metadata.voiceFallbackMode
                : undefined,
            startedAt: typeof task.metadata?.voiceStartedAt === 'string' ? task.metadata.voiceStartedAt : undefined,
            completedAt: typeof task.metadata?.voiceCompletedAt === 'string' ? task.metadata.voiceCompletedAt : undefined,
            audioAttachmentPresent: Boolean(task.metadata?.audioAttachmentPresent),
          }
        : undefined,
    checklistContext:
      typeof task.metadata?.checklistOrigin === 'boolean' && task.metadata.checklistOrigin
        ? {
            checklistOrigin: true,
            checklistSectionId: String(task.metadata?.checklistSectionId || ''),
            checklistSectionLabel: String(task.metadata?.checklistSectionLabel || ''),
            checklistItemId: typeof task.metadata?.checklistItemId === 'string' ? task.metadata.checklistItemId : undefined,
            checklistItemLabel: typeof task.metadata?.checklistItemLabel === 'string' ? task.metadata.checklistItemLabel : undefined,
          }
        : undefined,
    selectedAction:
      task.metadata?.selectedAction === 'replace' ||
      task.metadata?.selectedAction === 'repair' ||
      task.metadata?.selectedAction === 'quantity' ||
      task.metadata?.selectedAction === 'note' ||
      task.metadata?.selectedAction === 'photo'
        ? task.metadata.selectedAction
        : 'repair',
    persistenceTarget: 'task',
    existingEntityId: task.id,
    existingEntityType: 'task',
  });

  const handleToggleFeedItem = (itemId: string) => {
    if (isFeedEditSaveBusy) return;

    if (expandedFeedItemId === itemId) {
      clearFeedEditStagedPhotos();
      clearFeedEditPendingRemovedPhotoIds();
      setExpandedFeedItemId(null);
      setEditingFeedDraft(null);
      setFeedEditSaveState({ phase: 'idle' });
      return;
    }

    const finding = findings.find((entry) => entry.id === itemId);
    if (finding) {
      const draft = createDraftFromFinding(finding);
      void ensurePhotoPreviews(draft.photoIds);
      ClientLoggerService.info(
        'Captured item edit opened.',
        buildInspectionLogContext({
          category: 'inspection.captured_item',
          eventType: 'inspection.captured_item.edit_opened',
          roomId: draft.roomId,
          checklistItemId: draft.checklistContext?.checklistItemId,
          checklistSectionId: draft.checklistContext?.checklistSectionId,
          metadata: {
            captureId: finding.id,
            entityType: 'finding',
            existingMediaCount: draft.photoIds.length,
          },
        })
      );
      if (draft.photoIds.length > 0) {
        ClientLoggerService.info(
          'Existing media loaded for captured item edit.',
          buildInspectionLogContext({
            category: 'inspection.captured_item',
            eventType: 'inspection.captured_item.existing_media_loaded',
            roomId: draft.roomId,
            checklistItemId: draft.checklistContext?.checklistItemId,
            checklistSectionId: draft.checklistContext?.checklistSectionId,
            metadata: {
              captureId: finding.id,
              entityType: 'finding',
              existingMediaCount: draft.photoIds.length,
            },
          })
        );
      }
      clearFeedEditStagedPhotos();
      clearFeedEditPendingRemovedPhotoIds();
      setFeedEditSaveState({ phase: 'idle' });
      setExpandedFeedItemId(itemId);
      setEditingFeedDraft(draft);
      return;
    }

    const task = repairTasks.find((entry) => entry.id === itemId);
    if (task) {
      const draft = createDraftFromTask(task);
      void ensurePhotoPreviews(draft.photoIds);
      ClientLoggerService.info(
        'Captured item edit opened.',
        buildInspectionLogContext({
          category: 'inspection.captured_item',
          eventType: 'inspection.captured_item.edit_opened',
          roomId: draft.roomId,
          checklistItemId: draft.checklistContext?.checklistItemId,
          checklistSectionId: draft.checklistContext?.checklistSectionId,
          metadata: {
            captureId: task.id,
            entityType: 'task',
            existingMediaCount: draft.photoIds.length,
          },
        })
      );
      if (draft.photoIds.length > 0) {
        ClientLoggerService.info(
          'Existing media loaded for captured item edit.',
          buildInspectionLogContext({
            category: 'inspection.captured_item',
            eventType: 'inspection.captured_item.existing_media_loaded',
            roomId: draft.roomId,
            checklistItemId: draft.checklistContext?.checklistItemId,
            checklistSectionId: draft.checklistContext?.checklistSectionId,
            metadata: {
              captureId: task.id,
              entityType: 'task',
              existingMediaCount: draft.photoIds.length,
            },
          })
        );
      }
      clearFeedEditStagedPhotos();
      clearFeedEditPendingRemovedPhotoIds();
      setFeedEditSaveState({ phase: 'idle' });
      setExpandedFeedItemId(itemId);
      setEditingFeedDraft(draft);
    }
  };

  const handleSaveFeedDraft = async () => {
    if (!editingFeedDraft || !org || !user || !inspection || isFeedEditSaveBusy) return;

    const finding = editingFeedDraft.existingEntityType === 'finding'
      ? findings.find((entry) => entry.id === editingFeedDraft.existingEntityId)
      : undefined;
    const task = editingFeedDraft.existingEntityType === 'task'
      ? repairTasks.find((entry) => entry.id === editingFeedDraft.existingEntityId)
      : undefined;
    const saveStartedAt = Date.now();
    let activeSavePhase: FeedEditSavePhase = feedEditStagedPhotos.length > 0 ? 'uploading_media' : 'saving_update';

    setFeedEditSaveState({
      phase: activeSavePhase,
      message: feedEditStagedPhotos.length > 0 ? 'Uploading photos...' : 'Saving changes...',
      startedAt: saveStartedAt,
    });

    ClientLoggerService.info(
      'Captured item edit save started.',
      buildInspectionLogContext({
        category: 'inspection.captured_item',
        eventType: 'inspection.captured_item.save_started',
        roomId: editingFeedDraft.roomId,
        checklistItemId: editingFeedDraft.checklistContext?.checklistItemId,
        checklistSectionId: editingFeedDraft.checklistContext?.checklistSectionId,
        metadata: {
          captureId: editingFeedDraft.existingEntityId,
          entityType: editingFeedDraft.existingEntityType,
          existingMediaCount: editingFeedDraft.photoIds.length,
          stagedMediaCount: feedEditStagedPhotos.length,
          pendingRemovalCount: feedEditPendingRemovedPhotoIds.length,
        },
      })
    );
    ClientLoggerService.info(
      'Captured item edit busy state entered.',
      buildInspectionLogContext({
        category: 'inspection.captured_item',
        eventType: 'inspection.captured_item.save_busy_entered',
        roomId: editingFeedDraft.roomId,
        checklistItemId: editingFeedDraft.checklistContext?.checklistItemId,
        checklistSectionId: editingFeedDraft.checklistContext?.checklistSectionId,
        metadata: {
          captureId: editingFeedDraft.existingEntityId,
          entityType: editingFeedDraft.existingEntityType,
          phase: activeSavePhase,
        },
      })
    );

    try {
      const newPhotoIds: string[] = [];
      if (feedEditStagedPhotos.length > 0) {
        ClientLoggerService.info(
          'Captured item photo upload started.',
          buildInspectionLogContext({
            category: 'inspection.captured_item',
            eventType: 'inspection.captured_item.photo_upload_started',
            roomId: editingFeedDraft.roomId,
            checklistItemId: editingFeedDraft.checklistContext?.checklistItemId,
            checklistSectionId: editingFeedDraft.checklistContext?.checklistSectionId,
            metadata: {
              captureId: editingFeedDraft.existingEntityId,
              entityType: editingFeedDraft.existingEntityType,
              stagedMediaCount: feedEditStagedPhotos.length,
            },
          })
        );
      }
      for (const stagedPhoto of feedEditStagedPhotos) {
        const photoId = await handlePhotoFileCapture(stagedPhoto.file);
        if (photoId) {
          newPhotoIds.push(photoId);
        } else {
          throw new Error(`Photo upload failed for ${stagedPhoto.file.name}`);
        }
      }
      if (feedEditStagedPhotos.length > 0) {
        ClientLoggerService.info(
          'Captured item photo upload completed.',
          buildInspectionLogContext({
            category: 'inspection.captured_item',
            eventType: 'inspection.captured_item.photo_upload_completed',
            roomId: editingFeedDraft.roomId,
            checklistItemId: editingFeedDraft.checklistContext?.checklistItemId,
            checklistSectionId: editingFeedDraft.checklistContext?.checklistSectionId,
            metadata: {
              captureId: editingFeedDraft.existingEntityId,
              entityType: editingFeedDraft.existingEntityType,
              uploadedMediaCount: newPhotoIds.length,
              uploadDurationMs: Date.now() - saveStartedAt,
            },
          })
        );
      }

      const keptSavedPhotoIds = editingFeedDraft.photoIds.filter((photoId) => !feedEditPendingRemovedPhotoIds.includes(photoId));
      const mergedPhotoIds = Array.from(new Set([...keptSavedPhotoIds, ...newPhotoIds]));
      const nextDraft: InspectionCaptureDraft = {
        ...editingFeedDraft,
        photoIds: mergedPhotoIds,
      };
      activeSavePhase = 'saving_update';
      setFeedEditSaveState({
        phase: activeSavePhase,
        message: 'Saving changes...',
        startedAt: saveStartedAt,
      });
      ClientLoggerService.info(
        'Captured item update started.',
        buildInspectionLogContext({
          category: 'inspection.captured_item',
          eventType: 'inspection.captured_item.update_started',
          roomId: nextDraft.roomId,
          checklistItemId: nextDraft.checklistContext?.checklistItemId,
          checklistSectionId: nextDraft.checklistContext?.checklistSectionId,
          metadata: {
            captureId: nextDraft.existingEntityId,
            entityType: nextDraft.existingEntityType,
            mergedMediaCount: mergedPhotoIds.length,
            pendingRemovalCount: feedEditPendingRemovedPhotoIds.length,
          },
        })
      );

      await InspectionCaptureCommitService.updateDraft(
        {
          orgId: org.id,
          userId: user.id,
          inspectionId: inspection.id,
          unitId: inspection.unitId,
        },
        nextDraft,
        { finding, task }
      );
      ClientLoggerService.info(
        'Captured item update completed.',
        buildInspectionLogContext({
          category: 'inspection.captured_item',
          eventType: 'inspection.captured_item.update_completed',
          roomId: nextDraft.roomId,
          checklistItemId: nextDraft.checklistContext?.checklistItemId,
          checklistSectionId: nextDraft.checklistContext?.checklistSectionId,
          metadata: {
            captureId: nextDraft.existingEntityId,
            entityType: nextDraft.existingEntityType,
            updateDurationMs: Date.now() - saveStartedAt,
            attachmentCountBefore: editingFeedDraft.photoIds.length,
            attachmentCountAfter: mergedPhotoIds.length,
          },
        })
      );

      if (feedEditPendingRemovedPhotoIds.length > 0) {
        ClientLoggerService.info(
          'Saved media removal persisted.',
          buildInspectionLogContext({
            category: 'inspection.captured_item',
            eventType: 'inspection.captured_item.saved_media_removal_persisted',
            roomId: nextDraft.roomId,
            checklistItemId: nextDraft.checklistContext?.checklistItemId,
            checklistSectionId: nextDraft.checklistContext?.checklistSectionId,
            metadata: {
              captureId: nextDraft.existingEntityId,
              entityType: nextDraft.existingEntityType,
              removedPhotoCount: feedEditPendingRemovedPhotoIds.length,
              attachmentCountBefore: editingFeedDraft.photoIds.length,
              attachmentCountAfter: mergedPhotoIds.length,
            },
          })
        );
      }

      ClientLoggerService.info(
        'Captured item edit save completed.',
        buildInspectionLogContext({
          category: 'inspection.captured_item',
          eventType: 'inspection.captured_item.save_completed',
          roomId: nextDraft.roomId,
          checklistItemId: nextDraft.checklistContext?.checklistItemId,
          checklistSectionId: nextDraft.checklistContext?.checklistSectionId,
          metadata: {
            captureId: nextDraft.existingEntityId,
            entityType: nextDraft.existingEntityType,
            persistedMediaCount: mergedPhotoIds.length,
            newMediaCount: newPhotoIds.length,
            removedMediaCount: feedEditPendingRemovedPhotoIds.length,
            totalDurationMs: Date.now() - saveStartedAt,
          },
        })
      );

      clearFeedEditStagedPhotos();
      clearFeedEditPendingRemovedPhotoIds();
      setFeedEditSaveState({ phase: 'idle' });
      setExpandedFeedItemId(null);
      setEditingFeedDraft(null);
      await refreshCaptureData();
    } catch (error) {
      setFeedEditSaveState({
        phase: 'failed',
        message: undefined,
        errorMessage:
          activeSavePhase === 'saving_update'
            ? 'Saving changes failed. Review the item and try again.'
            : 'Uploading photos failed. Your staged photos are still here so you can retry.',
        startedAt: saveStartedAt,
      });
      ClientLoggerService.error(
        'Captured item edit save failed.',
        buildInspectionLogContext({
          category: 'inspection.captured_item',
          eventType: 'inspection.captured_item.save_failed',
          roomId: editingFeedDraft.roomId,
          checklistItemId: editingFeedDraft.checklistContext?.checklistItemId,
          checklistSectionId: editingFeedDraft.checklistContext?.checklistSectionId,
          metadata: {
            captureId: editingFeedDraft.existingEntityId,
            entityType: editingFeedDraft.existingEntityType,
            stagedMediaCount: feedEditStagedPhotos.length,
            pendingRemovalCount: feedEditPendingRemovedPhotoIds.length,
            failedPhase: activeSavePhase,
            totalDurationMs: Date.now() - saveStartedAt,
            error,
          },
        })
      );
      return;
    }
  };

  const handleStageFeedEditPhoto = (file: File) => {
    if (!editingFeedDraft) return;

    const previewUrl = URL.createObjectURL(file);
    if (feedEditSaveState.phase === 'failed') {
      setFeedEditSaveState({ phase: 'idle' });
    }
    setFeedEditStagedPhotos((prev) => [
      ...prev,
      {
        id: createFeedEditPhotoDraftId(),
        file,
        previewUrl,
      },
    ]);

    ClientLoggerService.info(
      'New media staged during captured item edit.',
      buildInspectionLogContext({
        category: 'inspection.captured_item',
        eventType: 'inspection.captured_item.media_staged',
        roomId: editingFeedDraft.roomId,
        checklistItemId: editingFeedDraft.checklistContext?.checklistItemId,
        checklistSectionId: editingFeedDraft.checklistContext?.checklistSectionId,
        metadata: {
          captureId: editingFeedDraft.existingEntityId,
          entityType: editingFeedDraft.existingEntityType,
          stagedMediaCount: feedEditStagedPhotos.length + 1,
          fileName: file.name,
          fileSize: file.size,
        },
      })
    );
  };

  const handleRemoveFeedEditStagedPhoto = (stagedPhotoId: string) => {
    if (feedEditSaveState.phase === 'failed') {
      setFeedEditSaveState({ phase: 'idle' });
    }
    setFeedEditStagedPhotos((prev) => {
      const target = prev.find((photo) => photo.id === stagedPhotoId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((photo) => photo.id !== stagedPhotoId);
    });
  };

  const handleToggleSavedFeedEditPhotoRemoval = (photoId: string) => {
    if (!editingFeedDraft || isFeedEditSaveBusy) return;

    const isCurrentlyPendingRemoval = feedEditPendingRemovedPhotoIds.includes(photoId);
    if (feedEditSaveState.phase === 'failed') {
      setFeedEditSaveState({ phase: 'idle' });
    }

    setFeedEditPendingRemovedPhotoIds((prev) =>
      isCurrentlyPendingRemoval ? prev.filter((entry) => entry !== photoId) : [...prev, photoId]
    );

    ClientLoggerService.info(
      isCurrentlyPendingRemoval ? 'Saved media removal unmarked.' : 'Saved media removal marked.',
      buildInspectionLogContext({
        category: 'inspection.captured_item',
        eventType: isCurrentlyPendingRemoval
          ? 'inspection.captured_item.saved_media_removal_unmarked'
          : 'inspection.captured_item.saved_media_removal_marked',
        roomId: editingFeedDraft.roomId,
        checklistItemId: editingFeedDraft.checklistContext?.checklistItemId,
        checklistSectionId: editingFeedDraft.checklistContext?.checklistSectionId,
        metadata: {
          captureId: editingFeedDraft.existingEntityId,
          entityType: editingFeedDraft.existingEntityType,
          photoId,
          attachmentCountBefore: editingFeedDraft.photoIds.length,
          pendingRemovalCount: isCurrentlyPendingRemoval
            ? Math.max(0, feedEditPendingRemovedPhotoIds.length - 1)
            : feedEditPendingRemovedPhotoIds.length + 1,
        },
      })
    );
  };

  const handleFeedDraftChange = (draft: InspectionCaptureDraft) => {
    if (feedEditSaveState.phase === 'failed') {
      setFeedEditSaveState({ phase: 'idle' });
    }
    setEditingFeedDraft(draft);
  };

  const handleDeleteFeedItem = async (item: RoomCapturedFeedItem) => {
    if (!org || !user || isFeedEditSaveBusy) return;

    await InspectionCaptureCommitService.deleteEntity(
      { orgId: org.id, userId: user.id },
      item.entityType,
      item.entityId
    );

    clearFeedEditStagedPhotos();
    clearFeedEditPendingRemovedPhotoIds();
    setFeedEditSaveState({ phase: 'idle' });
    setExpandedFeedItemId(null);
    setEditingFeedDraft(null);
    await refreshCaptureData();
  };

  const activeEditingFinding = useMemo(
    () =>
      editingFeedDraft?.existingEntityType === 'finding'
        ? findings.find((entry) => entry.id === editingFeedDraft.existingEntityId) || null
        : null,
    [editingFeedDraft, findings]
  );

  const activeEditingTask = useMemo(
    () =>
      editingFeedDraft?.existingEntityType === 'task'
        ? repairTasks.find((entry) => entry.id === editingFeedDraft.existingEntityId) || null
        : null,
    [editingFeedDraft, repairTasks]
  );

  const draftRecommendationResult = useMemo(
    () =>
      pendingCaptureDraft
        ? ProductRecommendationService.recommendProducts(catalogLibrary, {
            sourceType: 'draft',
            label: pendingCaptureDraft.label,
            rawText: pendingCaptureDraft.rawText,
            notes: pendingCaptureDraft.notes,
            kind: pendingCaptureDraft.kind,
            roomLabel: pendingCaptureDraft.roomLabel,
            roomType: pendingCaptureDraft.roomType,
            trade: pendingCaptureDraft.inferredTrade,
            unitFavoriteProductIds: unitRecord?.favoriteProductIds || [],
          })
        : null,
    [catalogLibrary, pendingCaptureDraft, unitRecord]
  );

  const feedRecommendationResult = useMemo(
    () =>
      editingFeedDraft
        ? ProductRecommendationService.recommendProducts(catalogLibrary, {
            sourceType: editingFeedDraft.existingEntityType || editingFeedDraft.persistenceTarget,
            label: editingFeedDraft.label,
            rawText: editingFeedDraft.rawText,
            notes: editingFeedDraft.notes,
            kind: editingFeedDraft.kind,
            roomLabel: editingFeedDraft.roomLabel,
            roomType: editingFeedDraft.roomType,
            category: activeEditingFinding?.category,
            trade: activeEditingFinding?.recommendedTrade || activeEditingTask?.trade || editingFeedDraft.inferredTrade,
            unitFavoriteProductIds: unitRecord?.favoriteProductIds || [],
          })
        : null,
    [activeEditingFinding, activeEditingTask, catalogLibrary, editingFeedDraft, unitRecord]
  );

  useEffect(() => {
    if (!pendingCaptureDraft || !draftRecommendationResult || !org) return;
    const logKey = `draft:${pendingCaptureDraft.id}`;
    if (recommendationLogKeysRef.current.has(logKey)) return;
    recommendationLogKeysRef.current.add(logKey);

    if (draftRecommendationResult.suggestedProducts.length === 0) {
      ClientLoggerService.info('No product recommendation match for capture draft.', {
        ...buildInspectionLogContext({
          eventType: 'product_recommendation.no_match',
          metadata: {
            sourceType: 'draft',
            inferredCategory: draftRecommendationResult.inferredTopLevelCategory,
            inferredSubcategory: draftRecommendationResult.inferredSubcategory,
            inferredEquivalentGroup: draftRecommendationResult.inferredEquivalentGroup,
          },
        }),
      });
      return;
    }

    ClientLoggerService.info('Product recommendations generated for capture draft.', {
      ...buildInspectionLogContext({
        eventType: 'product_recommendation.generated',
        metadata: {
          sourceType: 'draft',
          resultCount: draftRecommendationResult.suggestedProducts.length,
          alternateCount: draftRecommendationResult.alternateProducts.length,
          inferredCategory: draftRecommendationResult.inferredTopLevelCategory,
          inferredSubcategory: draftRecommendationResult.inferredSubcategory,
          inferredEquivalentGroup: draftRecommendationResult.inferredEquivalentGroup,
        },
      }),
    });
  }, [draftRecommendationResult, org, pendingCaptureDraft]);

  useEffect(() => {
    if (!editingFeedDraft || !feedRecommendationResult || !org) return;
    const logKey = `feed:${editingFeedDraft.existingEntityType || editingFeedDraft.persistenceTarget}:${editingFeedDraft.existingEntityId || editingFeedDraft.id}`;
    if (recommendationLogKeysRef.current.has(logKey)) return;
    recommendationLogKeysRef.current.add(logKey);

    if (feedRecommendationResult.suggestedProducts.length === 0) {
      ClientLoggerService.info('No product recommendation match for captured item.', {
        ...buildInspectionLogContext({
          eventType: 'product_recommendation.no_match',
          metadata: {
            sourceType: editingFeedDraft.existingEntityType || editingFeedDraft.persistenceTarget,
            inferredCategory: feedRecommendationResult.inferredTopLevelCategory,
            inferredSubcategory: feedRecommendationResult.inferredSubcategory,
            inferredEquivalentGroup: feedRecommendationResult.inferredEquivalentGroup,
          },
        }),
      });
      return;
    }

    ClientLoggerService.info('Product recommendations generated for captured item.', {
      ...buildInspectionLogContext({
        eventType: 'product_recommendation.generated',
        metadata: {
          sourceType: editingFeedDraft.existingEntityType || editingFeedDraft.persistenceTarget,
          resultCount: feedRecommendationResult.suggestedProducts.length,
          alternateCount: feedRecommendationResult.alternateProducts.length,
          inferredCategory: feedRecommendationResult.inferredTopLevelCategory,
          inferredSubcategory: feedRecommendationResult.inferredSubcategory,
          inferredEquivalentGroup: feedRecommendationResult.inferredEquivalentGroup,
        },
      }),
    });
  }, [editingFeedDraft, feedRecommendationResult, org]);

  const handleAddRecommendedProduct = async (item: CatalogItem, source: 'suggested' | 'alternate') => {
    if (!org) return;
    await handleAddProduct(item);
    ClientLoggerService.info('Recommended product added to inspection.', {
      ...buildInspectionLogContext({
        eventType: 'product_recommendation.clicked',
        metadata: {
          source,
          catalogItemId: item.id,
          productName: item.name,
          equivalentGroup: item.equivalentGroup,
        },
      }),
    });
  };

  const handleRecommendationAlternatesOpened = (equivalentGroup: string) => {
    ClientLoggerService.info('Recommendation alternates opened.', {
      ...buildInspectionLogContext({
        eventType: 'product_recommendation.alternate_opened',
        metadata: {
          equivalentGroup,
        },
      }),
    });
  };

  const resolvedProcurementBundles = useMemo(
    () =>
      inspection
        ? ProcurementBundleService.resolveForInspection({
            inspection: {
              ...inspection,
              generatedSections,
              generatedItems: generatedSections.flatMap((section) => section.items),
            },
            requirements: materialRequirements,
          })
        : [],
    [inspection, generatedSections, materialRequirements]
  );
  const resolvedBundleProductRecommendations = useMemo(
    () =>
      inspection
        ? ProcurementProductResolutionService.resolveForBundlesFromCatalog({
            catalogItems: catalogLibrary,
            bundles: resolvedProcurementBundles,
            inspections: [
              {
                ...inspection,
                generatedSections,
                generatedItems: generatedSections.flatMap((section) => section.items),
              },
            ],
          })
        : [],
    [inspection, catalogLibrary, resolvedProcurementBundles, generatedSections]
  );

  if (!inspection) return null;

  const operationalSummary = createInspectionOperationalSummary(
    {
      ...inspection,
      generatedSections,
      generatedItems: generatedSections.flatMap((section) => section.items),
    },
    findings,
    repairTasks,
    materialRequirements
  );
  const checklistSummary = operationalSummary.checklist;
  const canRequestReport =
    Boolean(flags?.pdf_reports) &&
    (inspection.status === 'in_progress' || inspection.status === 'completed' || operationalSummary.scopeReadiness.stage === 'ready_for_report');
  const reportActionDisabledReason = !flags?.pdf_reports
    ? 'Report generation is currently turned off for this organization. Enable PDF reports in feature flags to use this handoff action.'
    : inspection.status === 'draft' && operationalSummary.scopeReadiness.stage !== 'ready_for_report'
      ? 'Move the inspection forward or finish findings, tasks, and materials before generating a handoff report.'
      : inspection.status === 'draft'
        ? 'This inspection is still marked Draft. Move it to In Progress or Completed if you want a finalized handoff report.'
        : null;
  const generatedSnapshotEntries: GeneratedSnapshotEntry[] = generatedSections.flatMap((section) =>
    section.items.map((item) => {
      const hasProcurementImpact =
        (item.materialRequirementIds?.length || 0) > 0 ||
        (item.repairTaskIds?.length || 0) > 0 ||
        isAlwaysReplaceChecklistItem(item) ||
        item.focusedAction === 'replace' ||
        item.focusedAction === 'repair';
      const alwaysReplaceInputComplete = isAlwaysReplaceInputComplete(item);
      const isComplete = item.status === 'completed' || item.status === 'not_applicable' || alwaysReplaceInputComplete;
      const needsAttention =
        !alwaysReplaceInputComplete &&
        (item.status === 'failed' ||
          item.status === 'blocked' ||
          item.status === 'in_progress' ||
          item.status === 'not_started');
      return {
        section,
        item,
        hasProcurementImpact,
        isComplete,
        needsAttention,
      };
    })
  );
  const snapshotAttentionEntries = generatedSnapshotEntries.filter((entry) => entry.needsAttention);
  const snapshotProcurementEntries = generatedSnapshotEntries.filter((entry) => entry.hasProcurementImpact);
  const snapshotCompletedEntries = generatedSnapshotEntries.filter((entry) => entry.isComplete);
  const unitContextLabel = unitRecord?.name || 'Unit';
  const propertyContextLabel =
    unitRecord?.buildingName || unitRecord?.facilityName || unitRecord?.address?.propertyName || null;

  const roomMap = new Map<string, InspectionWorkspaceRoom>();

  generatedSections.forEach((section) => {
    const roomId = section.id;
    const existing = roomMap.get(roomId);
    roomMap.set(roomId, {
      id: roomId,
      label: section.roomLabel || section.title,
      subtitle: section.roomType ? titleCase(section.roomType) : 'Checklist section',
      itemCount: existing?.itemCount || 0,
      checklistCount: section.items.length,
    });
  });

  findings.forEach((finding) => {
    const key = normalizeRoomKey(finding.area);
    const existingRoom = Array.from(roomMap.values()).find((room) => normalizeRoomKey(room.label) === key);

    if (existingRoom) {
      existingRoom.itemCount += 1;
      return;
    }

    roomMap.set(`finding-${key}`, {
      id: `finding-${key}`,
      label: finding.area,
      subtitle: 'Captured finding',
      itemCount: 1,
      checklistCount: 0,
    });
  });

  repairTasks.forEach((task) => {
    const roomLabel = typeof task.metadata?.roomLabel === 'string' ? task.metadata.roomLabel : 'Unit Overview';
    const key = normalizeRoomKey(roomLabel);
    const existingRoom = Array.from(roomMap.values()).find((room) => normalizeRoomKey(room.label) === key);

    if (existingRoom) {
      existingRoom.itemCount += 1;
      return;
    }

    roomMap.set(`task-${key}`, {
      id: `task-${key}`,
      label: roomLabel,
      subtitle: 'Captured task',
      itemCount: 1,
      checklistCount: 0,
    });
  });

  const roomWorkspaceRooms =
    Array.from(roomMap.values()).length > 0
      ? Array.from(roomMap.values())
      : [
          {
            id: 'unit-overview',
            label: 'Unit Overview',
            subtitle: 'Fallback room workspace',
            itemCount: findings.length + repairTasks.length,
            checklistCount: generatedSections.reduce((sum, section) => sum + section.items.length, 0),
          },
        ];
  const currentRoom =
    roomWorkspaceRooms.find((room) => room.id === selectedRoomId) ||
    roomWorkspaceRooms[0] ||
    null;
  const currentRoomIndex = currentRoom ? roomWorkspaceRooms.findIndex((room) => room.id === currentRoom.id) : -1;
  const roomOptions = roomWorkspaceRooms.map((room) => ({ id: room.id, label: room.label }));

  const currentRoomChecklistSections = generatedSections.filter((section) => {
    if (!currentRoom) return false;
    if (section.id === currentRoom.id) return true;
    return normalizeRoomKey(section.roomLabel || section.title) === normalizeRoomKey(currentRoom.label);
  });

  const roomChecklistEntries: RoomChecklistEntry[] = currentRoomChecklistSections.flatMap((section) =>
    section.items.map((item) => {
      const hasUnsavedDraft = Boolean(checklistDraftsByItemId[item.id]);
      const alwaysReplaceInputComplete = isAlwaysReplaceInputComplete(item);
      const isCompleted = item.status === 'completed' || alwaysReplaceInputComplete;
      const hasAlwaysReplaceScope =
        isAlwaysReplaceChecklistItem(item) &&
        alwaysReplaceInputComplete;
      const hasCommittedCapture =
        !hasUnsavedDraft &&
        (
          hasAlwaysReplaceScope ||
          (item.findingIds?.length || 0) > 0 ||
          item.photoIds.length > 0 ||
          item.status === 'failed' ||
          item.status === 'blocked'
        );
      const needsAttention = hasUnsavedDraft || (!isCompleted && !hasCommittedCapture);
      const rowState = hasUnsavedDraft
        ? 'draft'
        : isCompleted
          ? 'completed'
          : hasCommittedCapture
            ? 'captured'
            : 'untouched';

      return {
        section,
        item,
        hasUnsavedDraft,
        isCompleted,
        hasCommittedCapture,
        needsAttention,
        rowState,
      };
    })
  );

  const roomChecklistSummary = {
    total: roomChecklistEntries.length,
    completedCount: roomChecklistEntries.filter((entry) => entry.isCompleted).length,
    unsavedDraftCount: roomChecklistEntries.filter((entry) => entry.hasUnsavedDraft).length,
    capturedCount: roomChecklistEntries.filter((entry) => entry.hasCommittedCapture).length,
    needsAttentionCount: roomChecklistEntries.filter((entry) => entry.needsAttention).length,
  };

  const filteredRoomChecklistEntries = roomChecklistEntries.filter((entry) => {
    if (checklistAttentionFilter === 'drafts') return entry.hasUnsavedDraft;
    if (checklistAttentionFilter === 'attention') return entry.needsAttention;
    if (checklistAttentionFilter === 'done') return entry.isCompleted || entry.hasCommittedCapture;
    return true;
  });

  const filteredChecklistSections = currentRoomChecklistSections
    .map((section) => ({
      ...section,
      items: filteredRoomChecklistEntries
        .filter((entry) => entry.section.id === section.id)
        .map((entry) => entry.item),
    }))
    .filter((section) => section.items.length > 0);

  const groupedRoomChecklistEntries = {
    attention: filteredRoomChecklistEntries
      .filter((entry) => getRoomChecklistIntentGroup(entry) === 'attention')
      .sort((left, right) => {
        const weightDelta = getRoomChecklistEntrySortWeight(left) - getRoomChecklistEntrySortWeight(right);
        if (weightDelta !== 0) return weightDelta;
        return left.item.order - right.item.order;
      }),
    progress: filteredRoomChecklistEntries
      .filter((entry) => getRoomChecklistIntentGroup(entry) === 'progress')
      .sort((left, right) => left.item.order - right.item.order),
    done: filteredRoomChecklistEntries
      .filter((entry) => getRoomChecklistIntentGroup(entry) === 'done')
      .sort((left, right) => left.item.order - right.item.order),
  };

  const checklistNextStepMessage =
    roomChecklistSummary.unsavedDraftCount > 0
      ? `Finish ${roomChecklistSummary.unsavedDraftCount} unsaved draft${roomChecklistSummary.unsavedDraftCount === 1 ? '' : 's'} before leaving this room.`
      : roomChecklistSummary.needsAttentionCount > 0
        ? `Start with the ${roomChecklistSummary.needsAttentionCount} item${roomChecklistSummary.needsAttentionCount === 1 ? '' : 's'} that still need attention in this room.`
        : roomChecklistSummary.capturedCount > 0
          ? 'Captured work is ready for follow-up. Review linked findings, tasks, or materials next.'
          : 'This room is in good shape. Review completed items and move on when ready.';

  const firstRoomDraftEntry = roomChecklistEntries.find((entry) => entry.hasUnsavedDraft);

  const currentRoomFeedItems: RoomCapturedFeedItem[] = [
    ...findings
      .filter((finding) => currentRoom && normalizeRoomKey(finding.area) === normalizeRoomKey(currentRoom.label))
      .map((finding) => ({
        id: finding.id,
        entityId: finding.id,
        entityType: 'finding' as const,
        title: finding.description,
        type: normalizeCaptureKind(finding.metadata?.captureKind, 'note'),
        quantity: typeof finding.metadata?.quantity === 'number' ? finding.metadata.quantity : undefined,
        roomLabel: finding.area,
        source:
          finding.metadata?.captureSource === 'manual' ||
          finding.metadata?.captureSource === 'parsed' ||
          finding.metadata?.captureSource === 'photo' ||
          finding.metadata?.captureSource === 'checklist' ||
          finding.metadata?.captureSource === 'voice'
            ? finding.metadata.captureSource
            : 'manual',
        checklistLabel: typeof finding.metadata?.checklistSectionLabel === 'string' ? finding.metadata.checklistSectionLabel : undefined,
        aliasMatched: typeof finding.metadata?.aliasMatched === 'string' ? finding.metadata.aliasMatched : undefined,
        inferredTrade: typeof finding.metadata?.inferredTrade === 'string' ? finding.metadata.inferredTrade : undefined,
        attachmentCount:
          finding.photoIds.length +
          (typeof finding.metadata?.attachmentCount === 'number' ? Math.max(0, finding.metadata.attachmentCount - finding.photoIds.length) : 0),
        notes: finding.notes,
        transcriptPreview:
          typeof finding.metadata?.editedTranscript === 'string'
            ? finding.metadata.editedTranscript
            : typeof finding.metadata?.rawTranscript === 'string'
              ? finding.metadata.rawTranscript
              : undefined,
        transcriptState:
          finding.metadata?.transcriptState === 'available' ||
          finding.metadata?.transcriptState === 'partial' ||
          finding.metadata?.transcriptState === 'empty' ||
          finding.metadata?.transcriptState === 'unsupported'
            ? finding.metadata.transcriptState
            : undefined,
        voiceFallbackLabel:
          finding.metadata?.voiceFallbackMode === 'manual_note'
            ? 'Note fallback'
            : finding.metadata?.voiceFallbackMode === 'manual_transcript'
              ? 'Manual entry'
              : undefined,
        voiceDurationLabel:
          typeof finding.metadata?.voiceDurationMs === 'number'
            ? formatVoiceDurationLabel(finding.metadata.voiceDurationMs)
            : undefined,
        audioAttachmentPresent: Boolean(finding.metadata?.audioAttachmentPresent),
        timestampLabel: formatTimestampLabel(finding.updatedAt),
        statusLabel: titleCase(finding.status),
        priorityLabel: titleCase(finding.priority),
        chips: [
          finding.area,
          titleCase(typeof finding.metadata?.captureSource === 'string' ? finding.metadata.captureSource : 'manual'),
          typeof finding.metadata?.checklistOrigin === 'boolean' && finding.metadata.checklistOrigin ? 'Checklist' : null,
          typeof finding.metadata?.aliasMatched === 'string' ? 'Alias' : null,
          typeof finding.metadata?.inferredTrade === 'string' ? titleCase(finding.metadata.inferredTrade) : null,
          finding.metadata?.captureSource === 'voice' ? 'Voice Source' : null,
          finding.metadata?.voiceFallbackMode === 'manual_note' ? 'Note fallback' : null,
          finding.metadata?.voiceFallbackMode === 'manual_transcript' ? 'Manual entry' : null,
        ].filter((chip): chip is string => Boolean(chip)),
      })),
    ...repairTasks
      .filter((task) => {
        const roomLabel = typeof task.metadata?.roomLabel === 'string' ? task.metadata.roomLabel : 'Unit Overview';
        return currentRoom && normalizeRoomKey(roomLabel) === normalizeRoomKey(currentRoom.label);
      })
      .map((task) => ({
        id: task.id,
        entityId: task.id,
        entityType: 'task' as const,
        title: task.title,
        type: normalizeCaptureKind(task.metadata?.captureKind, task.title.toLowerCase().startsWith('replace') ? 'replace' : 'task'),
        quantity: typeof task.metadata?.quantity === 'number' ? task.metadata.quantity : undefined,
        roomLabel: typeof task.metadata?.roomLabel === 'string' ? task.metadata.roomLabel : currentRoom?.label,
        source:
          task.metadata?.captureSource === 'manual' ||
          task.metadata?.captureSource === 'parsed' ||
          task.metadata?.captureSource === 'photo' ||
          task.metadata?.captureSource === 'checklist' ||
          task.metadata?.captureSource === 'voice'
            ? task.metadata.captureSource
            : 'manual',
        checklistLabel: typeof task.metadata?.checklistSectionLabel === 'string' ? task.metadata.checklistSectionLabel : undefined,
        aliasMatched: typeof task.metadata?.aliasMatched === 'string' ? task.metadata.aliasMatched : undefined,
        inferredTrade: typeof task.metadata?.inferredTrade === 'string' ? task.metadata.inferredTrade : undefined,
        attachmentCount: typeof task.metadata?.attachmentCount === 'number' ? task.metadata.attachmentCount : 0,
        notes: task.notes,
        transcriptPreview:
          typeof task.metadata?.editedTranscript === 'string'
            ? task.metadata.editedTranscript
            : typeof task.metadata?.rawTranscript === 'string'
              ? task.metadata.rawTranscript
              : undefined,
        transcriptState:
          task.metadata?.transcriptState === 'available' ||
          task.metadata?.transcriptState === 'partial' ||
          task.metadata?.transcriptState === 'empty' ||
          task.metadata?.transcriptState === 'unsupported'
            ? task.metadata.transcriptState
            : undefined,
        voiceFallbackLabel:
          task.metadata?.voiceFallbackMode === 'manual_note'
            ? 'Note fallback'
            : task.metadata?.voiceFallbackMode === 'manual_transcript'
              ? 'Manual entry'
              : undefined,
        voiceDurationLabel:
          typeof task.metadata?.voiceDurationMs === 'number'
            ? formatVoiceDurationLabel(task.metadata.voiceDurationMs)
            : undefined,
        audioAttachmentPresent: Boolean(task.metadata?.audioAttachmentPresent),
        timestampLabel: formatTimestampLabel(task.updatedAt),
        statusLabel: titleCase(task.status),
        priorityLabel: titleCase(task.priority),
        chips: [
          typeof task.metadata?.roomLabel === 'string' ? task.metadata.roomLabel : 'Unit Overview',
          titleCase(typeof task.metadata?.captureSource === 'string' ? task.metadata.captureSource : 'manual'),
          typeof task.metadata?.checklistOrigin === 'boolean' && task.metadata.checklistOrigin ? 'Checklist' : null,
          typeof task.metadata?.aliasMatched === 'string' ? 'Alias' : null,
          typeof task.metadata?.inferredTrade === 'string' ? titleCase(task.metadata.inferredTrade) : null,
          task.metadata?.captureSource === 'voice' ? 'Voice Source' : null,
          task.metadata?.voiceFallbackMode === 'manual_note' ? 'Note fallback' : null,
          task.metadata?.voiceFallbackMode === 'manual_transcript' ? 'Manual entry' : null,
        ].filter((chip): chip is string => Boolean(chip)),
      })),
  ].sort((a, b) => {
    const aTime = findings.find((finding) => finding.id === a.id)?.updatedAt || repairTasks.find((task) => task.id === a.id)?.updatedAt || 0;
    const bTime = findings.find((finding) => finding.id === b.id)?.updatedAt || repairTasks.find((task) => task.id === b.id)?.updatedAt || 0;
    return bTime - aTime;
  });

  const draftRecommendationPanel =
    pendingCaptureDraft && draftRecommendationResult ? (
      <ProductRecommendationPanel
        result={draftRecommendationResult}
        existingCatalogItemIds={productInstances.map((instance) => instance.catalogItemId)}
        onAddProduct={handleAddRecommendedProduct}
        onAlternatesOpened={handleRecommendationAlternatesOpened}
      />
    ) : null;

  const feedRecommendationPanel =
    editingFeedDraft && feedRecommendationResult ? (
      <ProductRecommendationPanel
        result={feedRecommendationResult}
        existingCatalogItemIds={productInstances.map((instance) => instance.catalogItemId)}
        disabled={isFeedEditSaveBusy}
        onAddProduct={handleAddRecommendedProduct}
        onAlternatesOpened={handleRecommendationAlternatesOpened}
      />
    ) : null;

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setExpandedChecklistItemId(null);
    setActiveChecklistDraftItemId(null);
  };

  const handlePreviousRoom = () => {
    if (currentRoomIndex <= 0) return;
    setSelectedRoomId(roomWorkspaceRooms[currentRoomIndex - 1].id);
    setExpandedChecklistItemId(null);
    setActiveChecklistDraftItemId(null);
  };

  const handleNextRoom = () => {
    if (currentRoomIndex < 0 || currentRoomIndex >= roomWorkspaceRooms.length - 1) return;
    setSelectedRoomId(roomWorkspaceRooms[currentRoomIndex + 1].id);
    setExpandedChecklistItemId(null);
    setActiveChecklistDraftItemId(null);
  };

  const handleJumpToDrafts = () => {
    if (!firstRoomDraftEntry) return;
    setChecklistAttentionFilter('drafts');
    setActiveChecklistDraftItemId(firstRoomDraftEntry.item.id);
  };

  const handleCancelFeedEdit = () => {
    if (isFeedEditSaveBusy) return;
    clearFeedEditStagedPhotos();
    clearFeedEditPendingRemovedPhotoIds();
    setFeedEditSaveState({ phase: 'idle' });
    setExpandedFeedItemId(null);
    setEditingFeedDraft(null);
  };

  const sectionActionRowClass = 'flex flex-wrap items-center gap-2';
  const primaryActionButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-lowes-blue px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
  const secondaryActionButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
  const quietActionButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50';
  const sectionEmptyStateClass = 'rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600';
  const activeChecklistDraftSection = currentChecklistDraft
    ? currentRoomChecklistSections.find((section) => section.id === currentChecklistDraft.sectionId)
    : null;
  const activeChecklistDraftItem = activeChecklistDraftSection && currentChecklistDraft
    ? activeChecklistDraftSection.items.find((item) => item.id === currentChecklistDraft.itemId)
    : null;
  const activeChecklistCaptureStrip = currentChecklistDraft && activeChecklistDraftItem ? (
    <div className="mb-3 rounded-xl border border-lowes-blue bg-blue-50 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">Active capture</div>
          <h4 className="mt-1 text-sm font-semibold text-slate-900">{activeChecklistDraftItem.label}</h4>
          <p className="mt-1 text-xs text-slate-600">
            Save updates this row immediately. Photos are optional.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800">
            {titleCase(currentChecklistDraft.selectedAction === 'note' ? 'issue' : currentChecklistDraft.selectedAction)}
          </span>
          {currentChecklistDraft.stagedPhotos.length > 0 ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800">
              {currentChecklistDraft.stagedPhotos.length} photo{currentChecklistDraft.stagedPhotos.length === 1 ? '' : 's'}
            </span>
          ) : null}
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
            Unsaved
          </span>
        </div>
      </div>

      {currentChecklistDraft.stagedPhotoRestoreNoticeCount > 0 ? (
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          Local staged photos from a previous session could not be restored.
          {currentChecklistDraft.stagedPhotoRestoreNoticeNames.length > 0
            ? ` Reattach: ${currentChecklistDraft.stagedPhotoRestoreNoticeNames.join(', ')}.`
            : ' Reattach photos before saving if they are still needed.'}
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-[180px_120px_minmax(0,1fr)]">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-blue-700">Action</span>
          <select
            value={currentChecklistDraft.selectedAction}
            onChange={(event) =>
              upsertChecklistDraft(currentChecklistDraft.itemId, (draft) => ({
                ...draft,
                selectedAction: event.target.value as ChecklistDraftCaptureState['selectedAction'],
              }))
            }
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
          >
            <option value="repair">Repair</option>
            <option value="replace">Replace</option>
            <option value="note">Add Issue</option>
            <option value="missing">Missing</option>
            <option value="photo">Photo Note</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-blue-700">Quantity</span>
          <input
            type="number"
            min={0}
            value={currentChecklistDraft.quantity}
            onChange={(event) =>
              upsertChecklistDraft(currentChecklistDraft.itemId, (draft) => ({
                ...draft,
                quantity: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-blue-700">Issue label</span>
          <input
            type="text"
            value={currentChecklistDraft.label}
            onChange={(event) =>
              upsertChecklistDraft(currentChecklistDraft.itemId, (draft) => ({
                ...draft,
                label: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
          />
        </label>

        <label className="text-sm text-slate-700 md:col-span-3">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-blue-700">Optional note</span>
          <textarea
            rows={2}
            value={currentChecklistDraft.notes}
            onChange={(event) =>
              upsertChecklistDraft(currentChecklistDraft.itemId, (draft) => ({
                ...draft,
                notes: event.target.value,
              }))
            }
            placeholder="Add only what the next person needs to know"
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-lowes-blue"
          />
        </label>
      </div>

      {currentChecklistDraft.stagedPhotos.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {currentChecklistDraft.stagedPhotos.map((photo) => (
            <div key={photo.id} className="rounded-xl border border-blue-100 bg-white p-2">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                <img src={photo.previewUrl} alt="Draft preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    upsertChecklistDraft(currentChecklistDraft.itemId, (draft) => {
                      const target = draft.stagedPhotos.find((entry) => entry.id === photo.id);
                      if (target) {
                        URL.revokeObjectURL(target.previewUrl);
                      }
                      return {
                        ...draft,
                        stagedPhotos: draft.stagedPhotos.filter((entry) => entry.id !== photo.id),
                      };
                    })
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="mt-2 text-[11px] font-medium text-blue-700">Local until save</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 pt-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800">
          <Camera size={14} />
          Add Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                const previewUrl = URL.createObjectURL(file);
                upsertChecklistDraft(currentChecklistDraft.itemId, (draft) => ({
                  ...draft,
                  stagedPhotos: [
                    ...draft.stagedPhotos,
                    {
                      id: createChecklistPhotoDraftId(),
                      file,
                      previewUrl,
                    },
                  ],
                }));
              }
              event.target.value = '';
            }}
          />
        </label>
        <div className={sectionActionRowClass}>
          <button type="button" onClick={() => void handleChecklistDraftSave('save')} className={primaryActionButtonClass}>
            Save Capture
          </button>
          <button type="button" onClick={() => void handleChecklistDraftSave('save_next')} className={secondaryActionButtonClass}>
            Save & Next
          </button>
          <button
            type="button"
            onClick={() => {
              ClientLoggerService.info(
                'Checklist draft canceled.',
                buildInspectionLogContext({
                  eventType: 'inspection.checklist.cancel_draft',
                  checklistItemId: currentChecklistDraft.itemId,
                  checklistSectionId: currentChecklistDraft.sectionId,
                  metadata: {
                    selectedAction: currentChecklistDraft.selectedAction,
                    stagedPhotoCount: currentChecklistDraft.stagedPhotos.length,
                  },
                })
              );
              clearChecklistDraft(currentChecklistDraft.itemId);
              setActiveChecklistDraftItemId(null);
              setExpandedChecklistItemId(null);
            }}
            className={quietActionButtonClass}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;
  const currentRoomAttentionCount = currentRoomFeedItems.filter((item) => {
    const status = (item.statusLabel || '').toLowerCase();
    const priority = (item.priorityLabel || '').toLowerCase();
    return status.includes('blocked') || status.includes('failed') || priority.includes('high') || priority.includes('urgent') || item.type === 'missing';
  }).length;
  const currentRoomFollowUpCount = currentRoomFeedItems.filter(
    (item) => item.entityType === 'task' || item.type === 'repair' || item.type === 'replace' || item.type === 'task'
  ).length;
  const roomSavedStateSummary = (
    <section className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Room saved scope</h3>
          <p className="mt-1 text-xs text-slate-500">
            Row badges are the primary status signal. Open review only when you need saved details.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{currentRoomFeedItems.length} saved</span>
          {currentRoomAttentionCount > 0 ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{currentRoomAttentionCount} attention</span>
          ) : null}
          {currentRoomFollowUpCount > 0 ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">{currentRoomFollowUpCount} follow-up</span>
          ) : null}
        </div>
      </div>
      {currentRoomFeedItems.length > 0 ? (
        <details className="mt-2 rounded-lg border border-slate-100 bg-slate-50">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600">
            Optional saved-detail review
          </summary>
          <div className="border-t border-slate-100 p-3">
            <ErrorBoundary
              surfaceName="captured-items-feed"
              screenName="InspectionDetail"
              contextIds={{
                orgId: org?.id,
                inspectionId,
                roomId: selectedRoomId || undefined,
                checklistItemId: editingFeedDraft?.checklistContext?.checklistItemId,
              }}
              resetKeys={[inspectionId, selectedRoomId, expandedFeedItemId, editingFeedDraft?.existingEntityId]}
              onReturn={handleCancelFeedEdit}
              returnLabel="Close Feed Editor"
            >
              <RoomCapturedItemsFeed
                items={currentRoomFeedItems}
                roomOptions={roomOptions}
                editingDraft={editingFeedDraft}
                expandedItemId={expandedFeedItemId}
                photoPreviewUrls={previews}
                stagedPhotos={feedEditStagedPhotos.map((photo) => ({
                  id: photo.id,
                  previewUrl: photo.previewUrl,
                  fileName: photo.file.name,
                }))}
                pendingRemovedPhotoIds={feedEditPendingRemovedPhotoIds}
                saveState={feedEditSaveState}
                isSaving={isFeedEditSaveBusy}
                onToggleExpand={handleToggleFeedItem}
                onDraftChange={handleFeedDraftChange}
                onStagePhoto={handleStageFeedEditPhoto}
                onRemoveStagedPhoto={handleRemoveFeedEditStagedPhoto}
                onToggleSavedPhotoRemoval={handleToggleSavedFeedEditPhotoRemoval}
                onSaveDraft={handleSaveFeedDraft}
                onCancelEdit={handleCancelFeedEdit}
                onDeleteItem={handleDeleteFeedItem}
                recommendationPanel={feedRecommendationPanel}
              />
            </ErrorBoundary>
          </div>
        </details>
      ) : null}
    </section>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div
        data-testid="inspection-detail-header"
        className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <button onClick={handleProtectedBack} className="rounded-full p-2 transition-colors hover:bg-slate-100">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Inspection detail</div>
              <h2 className="mt-1 truncate text-2xl font-bold text-slate-900">{title || 'Inspection'}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {unitContextLabel}
                </span>
                {propertyContextLabel ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {propertyContextLabel}
                  </span>
                ) : null}
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${inspectionStatusBadgeClass(status)}`}>
                  {titleCase(status)}
                </span>
                {inspection.templateSnapshot?.turnoverPresetLabel ? (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                    Preset: {inspection.templateSnapshot.turnoverPresetLabel}
                  </span>
                ) : null}
                {inspection.templateSnapshot?.appliedScopedOverrideIds?.length ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Overrides: {inspection.templateSnapshot.appliedScopedOverrideIds.length}
                  </span>
                ) : null}
                {originContextLabel ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {originContextLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{checklistSummary.completedCount}/{checklistSummary.total} complete</span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{checklistSummary.failedCount + checklistSummary.blockedCount} blocked or failed</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{materialRequirements.length} materials</span>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`${primaryActionButtonClass} px-6`}
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
        <ErrorBoundary
          surfaceName="inspection-workspace"
          screenName="InspectionDetail"
          contextIds={{
            orgId: org?.id,
            inspectionId,
            roomId: selectedRoomId || undefined,
          }}
          resetKeys={[inspectionId, selectedRoomId, expandedChecklistItemId, expandedFeedItemId]}
          onReturn={handleProtectedBack}
          returnLabel="Return to Inspection"
        >
          <div className="space-y-4">
            {captureBridgeMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="font-semibold">Structured scope updated</div>
                <div className="mt-1 text-emerald-800">{captureBridgeMessage}</div>
                {captureBridgeTarget ? (
                  <button
                    type="button"
                    onClick={() =>
                      setFocusedScopeRecord(
                        createFocusedScopeRecord(
                          captureBridgeTarget.entityType,
                          captureBridgeTarget.entityId,
                          'Opened from capture confirmation'
                        )
                      )
                    }
                    className="mt-3 inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                  >
                    Open created {captureBridgeTarget.entityType === 'task' ? 'repair task' : captureBridgeTarget.entityType}
                  </button>
                ) : null}
              </div>
            ) : null}
            <InspectionRoomWorkspace
              inspectionTitle={title}
              room={currentRoom}
              roomIndex={currentRoomIndex}
              roomCount={roomWorkspaceRooms.length}
              onBack={handleProtectedBack}
              onPreviousRoom={handlePreviousRoom}
              onNextRoom={handleNextRoom}
              onSelectRoom={handleSelectRoom}
              rooms={roomWorkspaceRooms}
              checklistSummaryLabel={`${checklistSummary.completedCount}/${checklistSummary.total} complete • ${checklistSummary.failedCount} failed • ${checklistSummary.blockedCount} blocked`}
              captureStrip={
                <InspectionCaptureStrip
                  selectedAction={selectedCaptureAction}
                  onActionChange={setSelectedCaptureAction}
                  onSubmit={handleCaptureSubmit}
                  onPhotoCapture={handleWorkspacePhotoCapture}
                  draft={pendingCaptureDraft}
                  roomOptions={roomOptions}
                  onDraftChange={setPendingCaptureDraft}
                  onDraftCommit={handlePendingDraftCommit}
                  onDraftCancel={() => setPendingCaptureDraft(null)}
                  onVoiceParseReview={handleVoiceParseReview}
                  onVoiceSaveNote={handleVoiceSaveAsNote}
                  voiceLogContext={{
                    orgId: org?.id,
                    userId: user?.id,
                    inspectionId,
                    roomId: buildRoomContext().roomId,
                    roomLabel: buildRoomContext().roomLabel,
                  }}
                  isUploading={isUploading}
                  recommendationPanel={draftRecommendationPanel}
                />
              }
              checklistPanel={
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Room Checklist</h3>
                  <p className="text-sm text-slate-500">Operational checklist for the current room. Condition issues can become findings, while always-replace standards can go straight to tasks and materials.</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasUnsavedChecklistDrafts ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {roomChecklistSummary.unsavedDraftCount} unsaved draft{roomChecklistSummary.unsavedDraftCount === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {roomChecklistSummary.total}
                  </span>
                </div>
              </div>

              {currentRoomChecklistSections.length === 0 ? (
                <div className={sectionEmptyStateClass}>
                  <div className="font-medium text-slate-700">No generated room checklist yet.</div>
                  <div className="mt-1">
                    This is normal when the selected room has no mapped checklist items in the current template. Choose another room, or review template coverage if work should appear here.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Total</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{roomChecklistSummary.total}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Good / Complete</div>
                      <div className="mt-1 text-lg font-semibold text-emerald-800">{roomChecklistSummary.completedCount}</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Unsaved Drafts</div>
                      <div className="mt-1 text-lg font-semibold text-amber-800">{roomChecklistSummary.unsavedDraftCount}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Needs Attention</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{roomChecklistSummary.needsAttentionCount}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">What to do next</div>
                    <p className="mt-1 text-sm text-slate-600">{checklistNextStepMessage}</p>
                  </div>

                  {activeChecklistCaptureStrip}

                  <div className="flex flex-wrap items-center gap-2">
                    {([
                      { id: 'all', label: 'All', count: roomChecklistSummary.total },
                      { id: 'drafts', label: 'Drafts', count: roomChecklistSummary.unsavedDraftCount },
                      { id: 'attention', label: 'Needs Attention', count: roomChecklistSummary.needsAttentionCount },
                      { id: 'done', label: 'Done', count: roomChecklistSummary.completedCount + roomChecklistSummary.capturedCount },
                    ] as Array<{ id: ChecklistAttentionFilter; label: string; count: number }>).map((filterOption) => (
                      <button
                        key={filterOption.id}
                        type="button"
                        onClick={() => setChecklistAttentionFilter(filterOption.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          checklistAttentionFilter === filterOption.id
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {filterOption.label} {filterOption.count}
                      </button>
                    ))}
                    {firstRoomDraftEntry ? (
                      <button
                        type="button"
                        onClick={handleJumpToDrafts}
                        className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"
                      >
                        Jump to Draft
                      </button>
                    ) : null}
                  </div>

                  {filteredChecklistSections.length === 0 ? (
                    <div className={sectionEmptyStateClass}>
                      <div className="font-medium text-slate-700">Nothing matches this checklist filter.</div>
                      <div className="mt-1">
                        Try <span className="font-medium text-slate-700">All</span> to review the full room list, or switch back to <span className="font-medium text-slate-700">Needs Attention</span> to focus on active work.
                      </div>
                    </div>
                  ) : null}

                  {([
                    {
                      id: 'attention',
                      title: 'Needs Attention',
                      detail: 'Start here. These items are still untouched, failed, blocked, or saved only as local drafts.',
                      tone: 'border-amber-200 bg-amber-50',
                      entries: groupedRoomChecklistEntries.attention,
                    },
                    {
                      id: 'progress',
                      title: 'In Progress',
                      detail: 'These items already have captured scope and are ready for review or downstream follow-up.',
                      tone: 'border-blue-200 bg-blue-50',
                      entries: groupedRoomChecklistEntries.progress,
                    },
                    {
                      id: 'done',
                      title: 'Completed / Good',
                      detail: 'Completed items stay visible here so the room can be reviewed without dominating the active work list.',
                      tone: 'border-emerald-200 bg-emerald-50',
                      entries: groupedRoomChecklistEntries.done,
                    },
                  ] as Array<{
                    id: RoomChecklistIntentGroupId;
                    title: string;
                    detail: string;
                    tone: string;
                    entries: RoomChecklistEntry[];
                  }>).map((group) => {
                    if (group.entries.length === 0) return null;
                    const GroupWrapper: React.ElementType = group.id === 'done' ? 'details' : 'div';
                    const groupWrapperProps =
                      group.id === 'done'
                        ? { className: `rounded-xl border p-3 ${group.tone}`, open: checklistAttentionFilter === 'done' }
                        : { className: `rounded-xl border p-3 ${group.tone}` };
                    return (
                      <GroupWrapper key={group.id} {...groupWrapperProps}>
                        {group.id === 'done' ? (
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900">{group.title}</h4>
                              <p className="mt-1 text-xs text-slate-600">{group.detail}</p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {group.entries.length}
                            </span>
                          </summary>
                        ) : (
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900">{group.title}</h4>
                              <p className="mt-1 text-xs text-slate-600">{group.detail}</p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {group.entries.length}
                            </span>
                          </div>
                        )}
                        <div className={`space-y-2 ${group.id === 'done' ? 'mt-3' : ''}`}>
                        {group.entries.map((roomChecklistEntry) => {
                          const { item, section } = roomChecklistEntry;
                          const isAlwaysReplace = isAlwaysReplaceChecklistItem(item);
                          const rowState = roomChecklistEntry?.rowState || 'untouched';
                          const rowStateLabel =
                            rowState === 'draft'
                              ? 'Draft'
                              : rowState === 'completed'
                                ? isAlwaysReplace
                                  ? 'Saved'
                                  : 'Good'
                                : rowState === 'captured'
                                  ? 'Saved'
                                  : 'New';
                          const rowStateClass =
                            rowState === 'draft'
                              ? 'border-amber-200 bg-amber-50/40'
                              : rowState === 'completed'
                                ? 'border-emerald-100 bg-white'
                                : rowState === 'captured'
                                  ? 'border-blue-100 bg-white'
                                  : 'border-slate-200 bg-white';
                          const isActiveChecklistRow = activeChecklistDraftItemId === item.id;
                          const checklistGuidance = buildChecklistGuidance(item);
                          const isAlwaysReplaceCount = isAlwaysReplace && item.inputMode === 'count';
                          const alwaysReplaceQuantity = getAlwaysReplaceCountQuantity(item);

                          return (
                          <div
                            key={item.id}
                            className={`rounded-lg border transition-colors ${
                              isActiveChecklistRow
                                ? 'border-lowes-blue bg-blue-50/60 shadow-sm ring-1 ring-lowes-blue/30'
                                : expandedChecklistItemId === item.id
                                  ? 'border-lowes-blue bg-white'
                                  : rowStateClass
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const isCurrentlyExpanded = expandedChecklistItemId === item.id;
                                if (!isCurrentlyExpanded && isAlwaysReplace) {
                                  ClientLoggerService.info(
                                    'Checklist item opened.',
                                    buildInspectionLogContext({
                                      eventType: 'inspection.checklist.item_opened',
                                      checklistItemId: item.id,
                                      checklistSectionId: section.id,
                                      metadata: {
                                        rowState,
                                        hasUnsavedDraft: Boolean(checklistDraftsByItemId[item.id]),
                                      },
                                    })
                                  );
                                }
                                if (isAlwaysReplace) {
                                  setExpandedChecklistItemId((current) => (current === item.id ? null : item.id));
                                }
                                if (!isAlwaysReplace && checklistDraftsByItemId[item.id]) {
                                  setActiveChecklistDraftItemId(item.id);
                                } else if (!isAlwaysReplace && rowState !== 'untouched') {
                                  handleChecklistStartDraft(
                                    section,
                                    item,
                                    item.focusedAction === 'repair' || item.focusedAction === 'replace' ? item.focusedAction : 'repair'
                                  );
                                }
                              }}
                              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-medium text-slate-800">{item.label}</p>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    {section.title}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {isAlwaysReplace ? (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                                      Always replace
                                    </span>
                                  ) : null}
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                      rowState === 'draft'
                                        ? 'bg-amber-100 text-amber-800'
                                        : rowState === 'completed'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : rowState === 'captured'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {rowStateLabel}
                                  </span>
                                  {isAlwaysReplace ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                      {getAlwaysReplaceInputSummary(item)}
                                    </span>
                                  ) : null}
                                  {item.photoIds.length > 0 ? (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                      Photo {item.photoIds.length}
                                    </span>
                                  ) : null}
                                  {checklistDraftsByItemId[item.id] ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                      Local
                                    </span>
                                  ) : null}
                                  {isActiveChecklistRow ? (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                                      Editing
                                    </span>
                                  ) : null}
                                </div>
                                {checklistGuidance ? <p className="mt-2 text-xs text-slate-500">{checklistGuidance}</p> : null}
                              </div>
                              {isAlwaysReplace ? (
                                <ChevronDown
                                  size={16}
                                  className={`text-slate-400 transition-transform ${expandedChecklistItemId === item.id ? 'rotate-180' : ''}`}
                                />
                              ) : null}
                            </button>

                            {isAlwaysReplaceCount ? (
                              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-label={`Decrease ${item.label} quantity`}
                                    onClick={() => void handleAlwaysReplaceQuantityCommit(section.id, item.id, alwaysReplaceQuantity - 1)}
                                    disabled={alwaysReplaceQuantity <= 1}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <MinusCircle size={18} />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    aria-label={`${item.label} quantity`}
                                    value={alwaysReplaceQuantity}
                                    onChange={(event) =>
                                      handleGeneratedItemInputValueChange(section.id, item.id, (current) => ({
                                        ...(current || {}),
                                        quantity: Math.max(1, Math.round(Number(event.target.value || 1)) || 1),
                                        updatedAt: Date.now(),
                                      }))
                                    }
                                    onBlur={(event) => void handleAlwaysReplaceQuantityCommit(section.id, item.id, Number(event.target.value || 1))}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    className="h-10 w-20 rounded-lg border border-slate-200 bg-white text-center text-base font-semibold text-slate-900 outline-none focus:border-lowes-blue"
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Increase ${item.label} quantity`}
                                    onClick={() => void handleAlwaysReplaceQuantityCommit(section.id, item.id, alwaysReplaceQuantity + 1)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                                  >
                                    <PlusCircle size={18} />
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {!isAlwaysReplace ? (
                              <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => void handleChecklistGood(section.id, item.id)}
                                  className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <CheckCircle2 size={14} />
                                    Good
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleChecklistStartDraft(section, item, 'repair')}
                                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                                    activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'repair'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Wrench size={14} />
                                    Repair
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleChecklistStartDraft(section, item, 'replace')}
                                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                                    activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'replace'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-blue-50 text-blue-700'
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <PackagePlus size={14} />
                                    Replace
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleChecklistStartDraft(section, item, 'note')}
                                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                                    activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'note'
                                      ? 'bg-slate-200 text-slate-800'
                                      : 'border border-slate-200 bg-white text-slate-700'
                                  }`}
                                >
                                  Add Issue
                                </button>
                              </div>
                            ) : null}

                            {isAlwaysReplace && expandedChecklistItemId === item.id ? (
                              <div className="border-t border-slate-100 px-3 py-3">
                                {isAlwaysReplace ? (
                                  <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-violet-700 px-2.5 py-1 text-[11px] font-semibold text-white">
                                        Turnover standard
                                      </span>
                                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                                        {ChecklistAlwaysReplaceService.describeInput(item)}
                                      </span>
                                    </div>

                                    <p className="text-xs text-slate-600">
                                      This item does not create a finding. Enter the standard replacement input and save it directly into a repair task and material requirement.
                                    </p>

                                    <div className="grid gap-3 md:grid-cols-2">
                                      {item.inputMode === 'count' ? (
                                        <label className="text-sm text-slate-700">
                                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Quantity</span>
                                          <div className="relative">
                                            <Hash size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                              type="number"
                                              min={1}
                                              value={item.inputValue?.quantity ?? item.defaultQuantity ?? ''}
                                              onChange={(event) =>
                                                handleGeneratedItemInputValueChange(section.id, item.id, (current) => ({
                                                  ...(current || {}),
                                                  quantity: Math.max(1, Number(event.target.value || 0)) || undefined,
                                                  updatedAt: Date.now(),
                                                }))
                                              }
                                              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 outline-none focus:border-lowes-blue"
                                            />
                                          </div>
                                        </label>
                                      ) : null}

                                      {item.inputMode === 'dimensions' ? (
                                        <>
                                          <label className="text-sm text-slate-700">
                                            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Width</span>
                                            <div className="relative">
                                              <Ruler size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                              <input
                                                type="number"
                                                min={0}
                                                step="0.1"
                                                value={item.inputValue?.dimensions?.width ?? ''}
                                                onChange={(event) =>
                                                  handleGeneratedItemInputValueChange(section.id, item.id, (current) => ({
                                                    ...(current || {}),
                                                    dimensions: {
                                                      width: Number(event.target.value || 0),
                                                      height: current?.dimensions?.height || 0,
                                                      unit: current?.dimensions?.unit || 'in',
                                                    },
                                                    updatedAt: Date.now(),
                                                  }))
                                                }
                                                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 outline-none focus:border-lowes-blue"
                                              />
                                            </div>
                                          </label>
                                          <label className="text-sm text-slate-700">
                                            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Height</span>
                                            <div className="relative">
                                              <Ruler size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                              <input
                                                type="number"
                                                min={0}
                                                step="0.1"
                                                value={item.inputValue?.dimensions?.height ?? ''}
                                                onChange={(event) =>
                                                  handleGeneratedItemInputValueChange(section.id, item.id, (current) => ({
                                                    ...(current || {}),
                                                    dimensions: {
                                                      width: current?.dimensions?.width || 0,
                                                      height: Number(event.target.value || 0),
                                                      unit: current?.dimensions?.unit || 'in',
                                                    },
                                                    updatedAt: Date.now(),
                                                  }))
                                                }
                                                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 outline-none focus:border-lowes-blue"
                                              />
                                            </div>
                                          </label>
                                        </>
                                      ) : null}

                                      {item.inputMode === 'area' ? (
                                        <label className="text-sm text-slate-700">
                                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Area</span>
                                          <div className="relative">
                                            <Ruler size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                              type="number"
                                              min={0}
                                              step="0.1"
                                              value={item.inputValue?.area ?? ''}
                                              onChange={(event) =>
                                                handleGeneratedItemInputValueChange(section.id, item.id, (current) => ({
                                                  ...(current || {}),
                                                  area: Number(event.target.value || 0) || undefined,
                                                  updatedAt: Date.now(),
                                                }))
                                              }
                                              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 outline-none focus:border-lowes-blue"
                                            />
                                          </div>
                                        </label>
                                      ) : null}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleAlwaysReplaceSave(section.id, item.id)}
                                        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                                      >
                                        {(item.materialRequirementIds?.length || 0) > 0 ? 'Update Standard' : 'Save Standard'}
                                      </button>
                                      {(item.materialRequirementIds?.length || 0) > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setFocusedScopeRecord(
                                              createFocusedScopeRecord(
                                                'material',
                                                item.materialRequirementIds?.[0] || '',
                                                'Opened from always-replace checklist row'
                                              )
                                            )
                                          }
                                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                                        >
                                          Open Material
                                        </button>
                                      ) : null}
                                      {(item.repairTaskIds?.length || 0) > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setFocusedScopeRecord(
                                              createFocusedScopeRecord(
                                                'task',
                                                item.repairTaskIds?.[0] || '',
                                                'Opened from always-replace checklist row'
                                              )
                                            )
                                          }
                                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                                        >
                                          Open Task
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : (
                                <>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleChecklistGood(section.id, item.id)}
                                    className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <CheckCircle2 size={14} />
                                      Good
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleChecklistStartDraft(section, item, 'repair')}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                      activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'repair'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <Wrench size={14} />
                                      Repair
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleChecklistStartDraft(section, item, 'replace')}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                      activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'replace'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-blue-50 text-blue-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <PackagePlus size={14} />
                                      Replace
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleChecklistStartDraft(section, item, 'missing')}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                      activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'missing'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-rose-50 text-rose-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <TriangleAlert size={14} />
                                      Missing
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleChecklistStartDraft(section, item, 'note')}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                      activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'note'
                                        ? 'bg-slate-200 text-slate-800'
                                        : 'border border-slate-200 bg-white text-slate-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <StickyNote size={14} />
                                      + Note
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleChecklistStartDraft(section, item, 'photo')}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                      activeChecklistDraftItemId === item.id && currentChecklistDraft?.selectedAction === 'photo'
                                        ? 'bg-sky-100 text-sky-800'
                                        : 'border border-slate-200 bg-white text-slate-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <Camera size={14} />
                                      + Photo
                                    </span>
                                  </button>
                                </div>

                                {activeChecklistDraftItemId === item.id && currentChecklistDraft ? (
                                  <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex flex-wrap gap-2">
                                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                                        {titleCase(currentChecklistDraft.selectedAction)}
                                      </span>
                                      {currentChecklistDraft.stagedPhotos.length > 0 ? (
                                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                                          Draft Photos {currentChecklistDraft.stagedPhotos.length}
                                        </span>
                                      ) : null}
                                      {currentChecklistDraft.stagedPhotoRestoreNoticeCount > 0 ? (
                                        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-800">
                                          Reattach {currentChecklistDraft.stagedPhotoRestoreNoticeCount} photo{currentChecklistDraft.stagedPhotoRestoreNoticeCount === 1 ? '' : 's'}
                                        </span>
                                      ) : null}
                                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                                        Unsaved Draft
                                      </span>
                                    </div>

                                    <p className="text-xs text-slate-500">
                                      This checklist draft stays local until you press Save Capture or Save & Next.
                                    </p>

                                    {currentChecklistDraft.stagedPhotoRestoreNoticeCount > 0 ? (
                                      <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                                        Local staged photos from a previous session could not be restored.
                                        {currentChecklistDraft.stagedPhotoRestoreNoticeNames.length > 0
                                          ? ` Reattach: ${currentChecklistDraft.stagedPhotoRestoreNoticeNames.join(', ')}.`
                                          : ' Reattach photos before saving if they are still needed.'}
                                      </div>
                                    ) : null}

                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="text-sm text-slate-700 md:col-span-2">
                                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Label</span>
                                        <input
                                          type="text"
                                          value={currentChecklistDraft.label}
                                          onChange={(event) =>
                                            upsertChecklistDraft(item.id, (draft) => ({
                                              ...draft,
                                              label: event.target.value,
                                            }))
                                          }
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
                                        />
                                      </label>

                                      <label className="text-sm text-slate-700">
                                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Quantity</span>
                                        <input
                                          type="number"
                                          min={0}
                                          value={currentChecklistDraft.quantity}
                                          onChange={(event) =>
                                            upsertChecklistDraft(item.id, (draft) => ({
                                              ...draft,
                                              quantity: event.target.value,
                                            }))
                                          }
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-lowes-blue"
                                        />
                                      </label>

                                      <div className="text-sm text-slate-700">
                                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Attach Photo</span>
                                        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                          <span className="flex items-center gap-1.5">
                                            <Camera size={14} />
                                            Add Photo
                                          </span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            onChange={(event) => {
                                              const file = event.target.files?.[0];
                                              if (file) {
                                                const previewUrl = URL.createObjectURL(file);
                                                upsertChecklistDraft(item.id, (draft) => ({
                                                  ...draft,
                                                  stagedPhotos: [
                                                    ...draft.stagedPhotos,
                                                    {
                                                      id: createChecklistPhotoDraftId(),
                                                      file,
                                                      previewUrl,
                                                    },
                                                  ],
                                                }));
                                              }
                                              event.target.value = '';
                                            }}
                                          />
                                        </label>
                                      </div>

                                      <label className="text-sm text-slate-700 md:col-span-2">
                                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Notes</span>
                                        <textarea
                                          rows={2}
                                          value={currentChecklistDraft.notes}
                                          onChange={(event) =>
                                            upsertChecklistDraft(item.id, (draft) => ({
                                              ...draft,
                                              notes: event.target.value,
                                            }))
                                          }
                                          placeholder="Add note for this checklist item"
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-lowes-blue"
                                        />
                                      </label>
                                    </div>

                                    {currentChecklistDraft.stagedPhotos.length > 0 ? (
                                      <div className="space-y-2">
                                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                          Local Photo Preview
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                          {currentChecklistDraft.stagedPhotos.map((photo) => (
                                            <div key={photo.id} className="rounded-xl border border-slate-200 bg-white p-2">
                                              <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                                                <img
                                                  src={photo.previewUrl}
                                                  alt="Draft preview"
                                                  className="h-full w-full object-cover"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    upsertChecklistDraft(item.id, (draft) => {
                                                      const target = draft.stagedPhotos.find((entry) => entry.id === photo.id);
                                                      if (target) {
                                                        URL.revokeObjectURL(target.previewUrl);
                                                      }
                                                      return {
                                                        ...draft,
                                                        stagedPhotos: draft.stagedPhotos.filter((entry) => entry.id !== photo.id),
                                                      };
                                                    })
                                                  }
                                                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                                                >
                                                  <Trash2 size={12} />
                                                </button>
                                              </div>
                                              <div className="mt-2 text-[11px] font-medium text-amber-700">Local only until save</div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}

                                    <div className="border-t border-slate-200 pt-3">
                                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                        Checklist actions
                                      </div>
                                      <div className={sectionActionRowClass}>
                                      <button
                                        type="button"
                                        onClick={() => void handleChecklistDraftSave('save')}
                                        className={primaryActionButtonClass}
                                      >
                                        Save Capture
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleChecklistDraftSave('save_next')}
                                        className={secondaryActionButtonClass}
                                      >
                                        Save & Next
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          ClientLoggerService.info(
                                            'Checklist draft canceled.',
                                            buildInspectionLogContext({
                                              eventType: 'inspection.checklist.cancel_draft',
                                              checklistItemId: item.id,
                                              checklistSectionId: section.id,
                                              metadata: {
                                                selectedAction: currentChecklistDraft.selectedAction,
                                                stagedPhotoCount: currentChecklistDraft.stagedPhotos.length,
                                              },
                                            })
                                          );
                                          clearChecklistDraft(item.id);
                                          setActiveChecklistDraftItemId(null);
                                          setExpandedChecklistItemId(null);
                                        }}
                                        className={quietActionButtonClass}
                                      >
                                        Cancel
                                      </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                                </>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )})}
                        </div>
                      </GroupWrapper>
                    );
                  })}
                </div>
              )}
                </section>
              }
              feed={roomSavedStateSummary}
            />
          </div>
        </ErrorBoundary>

        {/* Basic Info */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Inspection basics</div>
              <div className="mt-1 text-sm text-slate-600">Edit the inspection label, state, and general notes here. The detailed work areas below stay focused on room-level execution and review.</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white px-3 py-1 text-slate-700">{generatedSections.length} sections</span>
              <span className="rounded-full bg-white px-3 py-1 text-slate-700">{findings.length} findings</span>
              <span className="rounded-full bg-white px-3 py-1 text-slate-700">{repairTasks.length} tasks</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:border-transparent outline-none"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InspectionStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:border-transparent outline-none bg-white"
              >
                <option value="draft">Draft</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue focus:border-transparent outline-none resize-none"
              placeholder="General inspection notes..."
            />
          </div>
        </div>

        {/* Generated Checklist Snapshot */}
        {(inspection.templateSnapshot || generatedSections.length > 0) && (
          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Generated Checklist</h3>
                <p className="text-sm text-slate-500">
                  Review snapshot generated at{' '}
                  {inspection.templateSnapshot
                    ? new Date(inspection.templateSnapshot.generatedAt).toLocaleString()
                    : 'inspection creation'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {inspection.templateSnapshot?.turnoverPresetLabel ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      Preset: {inspection.templateSnapshot.turnoverPresetLabel}
                    </span>
                  ) : null}
                  {inspection.templateSnapshot?.appliedScopedOverrideIds?.length ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      Overrides: {inspection.templateSnapshot.appliedScopedOverrideIds.length}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                    {snapshotAttentionEntries.length} unresolved
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {snapshotProcurementEntries.length} procurement-relevant
                  </span>
                </div>
              </div>
              <div className="text-xs text-slate-400 text-right">
                <div>{generatedSections.length} sections</div>
                <div>{generatedSections.reduce((sum, section) => sum + section.items.length, 0)} items</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
                <div className="text-xl font-bold text-slate-800 mt-1">{checklistSummary.total}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Complete</div>
                <div className="text-xl font-bold text-emerald-700 mt-1">{checklistSummary.completedCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Failed</div>
                <div className="text-xl font-bold text-rose-700 mt-1">{checklistSummary.failedCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Blocked</div>
                <div className="text-xl font-bold text-amber-700 mt-1">{checklistSummary.blockedCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">N/A</div>
                <div className="text-xl font-bold text-slate-600 mt-1">{checklistSummary.notApplicableCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Progress</div>
                <div className="text-xl font-bold text-slate-800 mt-1">{checklistSummary.percentComplete}%</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] mb-4">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Snapshot review</div>
                <p className="mt-1 text-sm text-slate-600">
                  Use this section to verify what the generated inspection snapshot implies before reporting or procurement review. The live checklist above remains the editing workspace.
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-800">Why this matters</div>
                <p className="mt-1 text-sm text-blue-900">
                  {snapshotAttentionEntries.length > 0
                    ? `${snapshotAttentionEntries.length} generated item${snapshotAttentionEntries.length === 1 ? '' : 's'} still need review attention, and ${snapshotProcurementEntries.length} item${snapshotProcurementEntries.length === 1 ? '' : 's'} already point toward downstream materials or procurement.`
                    : `The generated checklist is largely complete. ${snapshotProcurementEntries.length} item${snapshotProcurementEntries.length === 1 ? '' : 's'} currently carry downstream materials or procurement relevance.`}
                </p>
              </div>
            </div>

            {checklistMessage ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 mb-4">
                {checklistMessage}
              </div>
            ) : null}

            {generatedSections.length === 0 ? (
              <div className={sectionEmptyStateClass}>
                <div className="font-medium text-slate-700">No generated snapshot is stored for this inspection.</div>
                <div className="mt-1">
                  The inspection record exists, but its generated checklist snapshot is unavailable here. If this unit should have a generated checklist, review the assigned template and inspection setup path.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {snapshotAttentionEntries.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-amber-900">Attention Needed</h4>
                        <p className="mt-1 text-xs text-amber-800">Generated items that are not complete yet, or are blocked/failed and should be reviewed first.</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">
                        {snapshotAttentionEntries.length}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {snapshotAttentionEntries.slice(0, 8).map(({ section, item }) => (
                        <div key={item.id} className="rounded-lg border border-amber-100 bg-white px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {section.roomLabel || section.title}
                                {section.roomType ? ` • ${titleCase(section.roomType)}` : ''}
                                {` • ${titleCase(item.category)}`}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                item.status === 'failed'
                                  ? 'bg-rose-100 text-rose-800'
                                  : item.status === 'blocked'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                              }`}>
                                {titleCase(item.status)}
                              </span>
                              {item.required ? (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">Required</span>
                              ) : null}
                              {(item.findingIds?.length || 0) > 0 ? (
                                <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-800">
                                  Finding linked
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {item.notes ? <p className="mt-2 line-clamp-2 text-xs text-slate-600">{item.notes}</p> : null}
                        </div>
                      ))}
                      {snapshotAttentionEntries.length > 8 ? (
                        <div className="text-xs text-amber-900">
                          +{snapshotAttentionEntries.length - 8} more attention-needed item{snapshotAttentionEntries.length - 8 === 1 ? '' : 's'} in the snapshot
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {snapshotProcurementEntries.length > 0 ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-blue-900">Materials / Procurement Relevance</h4>
                        <p className="mt-1 text-xs text-blue-800">Items already connected to tasks, materials, or always-replace behavior.</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-900">
                        {snapshotProcurementEntries.length}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {snapshotProcurementEntries.slice(0, 6).map(({ section, item }) => (
                        <div key={item.id} className="rounded-lg border border-blue-100 bg-white px-3 py-3">
                          <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {section.roomLabel || section.title} • {titleCase(item.category)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {isAlwaysReplaceChecklistItem(item) ? (
                              <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-800">Always replace</span>
                            ) : null}
                            {(item.repairTaskIds?.length || 0) > 0 ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                {item.repairTaskIds?.length} task{item.repairTaskIds?.length === 1 ? '' : 's'}
                              </span>
                            ) : null}
                            {(item.materialRequirementIds?.length || 0) > 0 ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                                {item.materialRequirementIds?.length} material{item.materialRequirementIds?.length === 1 ? '' : 's'}
                              </span>
                            ) : null}
                            {item.focusedAction ? (
                              <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-800">
                                {titleCase(item.focusedAction)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Snapshot by Section</h4>
                      <p className="mt-1 text-xs text-slate-600">Use this lower-priority view to verify section-level completeness without reopening the live room workspace.</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {generatedSections.length} sections
                    </span>
                  </summary>
                  <div className="mt-4 space-y-3">
                    {generatedSections
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((section) => {
                        const sectionEntries = generatedSnapshotEntries.filter((entry) => entry.section.id === section.id);
                        const sectionAttentionCount = sectionEntries.filter((entry) => entry.needsAttention).length;
                        const sectionCompleteCount = sectionEntries.filter((entry) => entry.isComplete).length;
                        return (
                          <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-800">{section.title}</div>
                                {section.roomLabel && section.roomType ? (
                                  <div className="mt-1 text-xs text-slate-500">
                                    {section.roomLabel} • {titleCase(section.roomType)}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{section.items.length} items</span>
                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{sectionAttentionCount} unresolved</span>
                                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">{sectionCompleteCount} complete</span>
                              </div>
                            </div>
                            <div className="mt-3 space-y-2">
                              {section.items
                                .slice()
                                .sort((a, b) => {
                                  const aNeedsAttention = snapshotAttentionEntries.some((entry) => entry.item.id === a.id);
                                  const bNeedsAttention = snapshotAttentionEntries.some((entry) => entry.item.id === b.id);
                                  if (aNeedsAttention !== bNeedsAttention) return aNeedsAttention ? -1 : 1;
                                  return a.order - b.order;
                                })
                                .map((item) => (
                                  <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                    <div>
                                      <div className="text-sm font-medium text-slate-800">{item.label}</div>
                                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                        <span className="capitalize">{item.category.replace(/_/g, ' ')}</span>
                                        {item.required ? <span>Required</span> : <span>Optional</span>}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                        item.status === 'completed' || item.status === 'not_applicable'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : item.status === 'failed'
                                            ? 'bg-rose-100 text-rose-800'
                                            : item.status === 'blocked'
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-slate-100 text-slate-700'
                                      }`}>
                                        {titleCase(item.status)}
                                      </span>
                                      {(item.findingIds?.length || 0) > 0 ? (
                                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-800">Finding</span>
                                      ) : null}
                                      {(item.materialRequirementIds?.length || 0) > 0 ? (
                                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800">Material</span>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                            </div>
                            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50">
                              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                                Detailed snapshot controls
                              </summary>
                              <div className="divide-y divide-slate-100 border-t border-slate-200">
                                {section.items
                                  .slice()
                                  .sort((a, b) => a.order - b.order)
                                  .map((item) => (
                                    <div key={item.id} className="p-4 space-y-3">
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div>
                                          <div className="font-medium text-slate-800">{item.label}</div>
                                          <div className="text-xs text-slate-500 mt-1 flex gap-2">
                                            <span className="capitalize">{item.category.replace(/_/g, ' ')}</span>
                                            {item.required ? (
                                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                                                Required
                                              </span>
                                            ) : (
                                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                                                Optional
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <select
                                          value={item.status}
                                          onChange={(e) =>
                                            handleGeneratedItemStatusChange(
                                              section.id,
                                              item.id,
                                              e.target.value as GeneratedInspectionItemStatus
                                            )
                                          }
                                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white min-w-[140px]"
                                        >
                                          <option value="not_started">Not Started</option>
                                          <option value="in_progress">In Progress</option>
                                          <option value="completed">Completed</option>
                                          <option value="blocked">Blocked</option>
                                          <option value="not_applicable">N/A</option>
                                          <option value="failed">Failed</option>
                                        </select>
                                      </div>
                                      <textarea
                                        value={item.notes || ''}
                                        onChange={(e) =>
                                          handleGeneratedItemNotesChange(section.id, item.id, e.target.value)
                                        }
                                        rows={2}
                                        placeholder="Item notes..."
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-lowes-blue focus:border-transparent resize-none"
                                      />
                                      <div className="space-y-2">
                                        {photos.length > 0 ? (
                                          <div className="flex flex-wrap gap-2">
                                            {photos.slice(0, 6).map((photo, photoIndex) => (
                                              <button
                                                key={photo.id}
                                                type="button"
                                                onClick={() => handleGeneratedItemPhotoToggle(section.id, item.id, photo.id)}
                                                className={`rounded-full px-2 py-1 text-xs border transition-colors ${
                                                  item.photoIds.includes(photo.id)
                                                    ? 'border-lowes-blue bg-blue-50 text-blue-700'
                                                    : 'border-slate-300 bg-white text-slate-500'
                                                }`}
                                              >
                                                Photo {photoIndex + 1}
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                            Snapshot actions
                                          </div>
                                          <div className={sectionActionRowClass}>
                                            <button
                                              type="button"
                                              onClick={() => void handleCreateFindingFromChecklistItem(section.id, item.id)}
                                              disabled={(item.findingIds?.length || 0) > 0 || (item.status !== 'failed' && item.status !== 'blocked')}
                                              className={
                                                (item.findingIds?.length || 0) === 0 && (item.status === 'failed' || item.status === 'blocked')
                                                  ? primaryActionButtonClass
                                                  : secondaryActionButtonClass
                                              }
                                            >
                                              {(item.findingIds?.length || 0) > 0 ? 'Finding Created' : 'Create Structured Finding'}
                                            </button>
                                            {(item.findingIds?.length || 0) > 0 ? (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setFocusedScopeRecord(
                                                    createFocusedScopeRecord(
                                                      'finding',
                                                      item.findingIds?.[0] || '',
                                                      'Opened from checklist row'
                                                    )
                                                  )
                                                }
                                                className={secondaryActionButtonClass}
                                              >
                                                Open Finding
                                              </button>
                                            ) : null}
                                          </div>
                                          {(item.findingIds?.length || 0) > 0 ? (
                                            <div className="mt-2 text-xs text-slate-500">
                                              Linked findings: {item.findingIds?.length || 0}
                                            </div>
                                          ) : item.status === 'failed' || item.status === 'blocked' ? (
                                            <div className="mt-2 text-xs text-slate-500">
                                              Failed or blocked checklist items can become findings in one step.
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </details>
                          </div>
                        );
                      })}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

        {resolvedProcurementBundles.length > 0 ? (
          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Suggested Procurement Bundles</h3>
                <p className="text-sm text-slate-500">
                  Derived from final generated checklist output and linked material requirements.
                </p>
              </div>
              <div className="text-xs text-slate-400 text-right">
                <div>{resolvedProcurementBundles.length} bundles</div>
              </div>
            </div>
            <div className="space-y-3">
              {resolvedProcurementBundles.map((bundle) => (
                <div key={bundle.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{bundle.label}</div>
                      <div className="mt-1 text-sm text-slate-500">{bundle.description}</div>
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                      <div>{bundle.sourceGeneratedItemIds.length} trigger items</div>
                      <div>{bundle.lines.length} suggested lines</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bundle.preferredProductTier ? (
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700">
                        Tier: {bundle.preferredProductTier}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {bundle.lines.map((line) => (
                      <div key={line.id} className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">
                        <div className="font-medium text-slate-800">{line.label}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {line.quantity === null ? 'Manual quantity' : `${line.quantity} • ${line.quantityStrategy}`}
                          {line.lowesCategory ? ` • ${line.lowesCategory}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {resolvedBundleProductRecommendations.length > 0 ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Bundle Product Recommendations</h4>
                    <p className="text-xs text-slate-500">Catalog-driven matches for the current bundle lines.</p>
                  </div>
                  <div className="text-xs text-slate-400 text-right">
                    <div>
                      {resolvedBundleProductRecommendations.filter((entry) => entry.status === 'resolved').length} resolved
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {resolvedBundleProductRecommendations.slice(0, 4).map((recommendation) => (
                    <div key={recommendation.id} className="rounded-md bg-slate-50 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-800">{recommendation.bundleLineLabel}</div>
                          <div className="mt-1 text-xs text-slate-500">{recommendation.bundleLabel}</div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                            recommendation.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {recommendation.status === 'resolved' ? titleCase(recommendation.resolutionMethod) : 'Manual Needed'}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        {recommendation.status === 'resolved'
                          ? `${recommendation.recommendedProductLabel} • ${recommendation.quantity ?? 'Manual'} ${recommendation.unit}`
                          : 'No safe catalog match yet. Review in procurement.'}
                      </div>
                      {recommendation.alternates.length > 0 ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Alternates: {recommendation.alternates.slice(0, 2).map((alternate) => alternate.productLabel).join(' • ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                <div className="font-medium text-slate-700">No catalog-backed bundle recommendations yet.</div>
                <div className="mt-1">
                  Bundle suggestions exist, but nothing in this inspection resolved into a safe product recommendation. Continue in Procurement if you need manual product selection.
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Photos Section */}
        <div>
            <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-slate-700">Photos ({photos.length})</label>
                <label className={`${primaryActionButtonClass} cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    Add Photo
                    <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        className="hidden" 
                        onChange={handlePhotoCapture}
                        disabled={isUploading}
                    />
                </label>
            </div>
            
            {photos.length === 0 ? (
                <div className={`${sectionEmptyStateClass} text-center`}>
                    <div className="font-medium text-slate-700">No photo evidence yet.</div>
                    <div className="mt-1">Add a photo when this inspection needs visual proof, damage context, or documentation for downstream review.</div>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {photos.map(photo => (
                        <div key={photo.id} className="relative group aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                             {previews[photo.id] ? (
                                <div className="w-full h-full relative">
                                    <img 
                                        src={previews[photo.id]} 
                                        alt="Inspection" 
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white p-1 flex justify-between">
                                        <span>{(photo.originalBytes / 1024).toFixed(0)}KB → {(photo.compressedBytes / 1024).toFixed(0)}KB</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                      <Loader2 size={20} className="animate-spin text-slate-400" />
                                      <span className="text-[11px] font-medium">Loading preview…</span>
                                    </div>
                                </div>
                            )}
                            <button 
                                onClick={() => handleRemovePhoto(photo.id)}
                                className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Products Section */}
        <div className="border-t border-slate-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Package size={20} className="text-slate-600" />
              Products ({productInstances.length})
            </h3>
            <button
              onClick={() => setIsProductSelectorOpen(true)}
              className={primaryActionButtonClass}
            >
              <PlusCircle size={16} />
              Add Product
            </button>
          </div>

          {productInstances.length === 0 ? (
            <div className={`${sectionEmptyStateClass} text-center`}>
              <div className="font-medium text-slate-700">No manual products added yet.</div>
              <div className="mt-1">
                This section is for manually tracked products on the inspection record. Use <span className="font-medium text-slate-700">Add Product</span> if you need to capture catalog items outside the generated materials flow.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {productInstances.map((instance) => {
                const item = catalogItems[instance.catalogItemId];
                return (
                  <div key={instance.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-800">{item?.title || item?.name || 'Catalog details loading…'}</h4>
                      <p className="text-xs text-slate-500">
                        {item?.options[0]?.sku && `SKU: ${item.options[0].sku}`}
                        {item?.options[0]?.price && ` • $${item.options[0].price.toFixed(2)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateProductQty(instance.id, Math.max(1, instance.qty - 1))}
                          className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-200"
                        >
                          <MinusCircle size={18} />
                        </button>
                        <span className="w-8 text-center font-bold text-slate-700">{instance.qty}</span>
                        <button
                          onClick={() => handleUpdateProductQty(instance.id, instance.qty + 1)}
                          className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-200"
                        >
                          <PlusCircle size={18} />
                        </button>
                      </div>
                      <button
                        onClick={() => handleRemoveProductInstance(instance.id)}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <InspectionIntelligencePanel
          inspection={{
            ...inspection,
            generatedSections,
            generatedItems: generatedSections.flatMap((section) => section.items),
          }}
          photos={photos}
          previews={previews}
          refreshToken={inspectionIntelligenceRefreshToken}
          initialFocusSection={initialScopeSection}
          focusedScopeRecord={focusedScopeRecord}
          onOpenProcurement={(options) => {
            persistInspectionContext();
            onOpenProcurement?.(options);
          }}
          onOpenUnitWorkspace={(unitId) => {
            const currentTarget = focusedScopeRecord
              ? {
                  entityType: focusedScopeRecord.entityType,
                  entityId: focusedScopeRecord.entityId,
                  originLabel: focusedScopeRecord.originLabel || originContextLabel,
                }
              : initialScopeTarget;
            persistInspectionContext(currentTarget || null);
            onOpenUnitWorkspace?.(unitId, {
              preferredTab: currentTarget ? 'scope' : 'inspection',
              inspectionId: inspection.id,
              scopeSection: deriveScopeSectionFromTarget(currentTarget),
              scopeTarget: currentTarget || null,
              reasonLabel: currentTarget?.originLabel || originContextLabel || 'Inspection priority context',
              reasonDetail: currentTarget
                ? `Return to the focused ${currentTarget.entityType === 'material' ? 'material requirement' : currentTarget.entityType} when you reopen inspection.`
                : 'Return to the current inspection context without losing track of what matters first.',
            });
          }}
        />

        {/* Reports Section */}
            <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-slate-600" />
                        <h3 className="text-lg font-semibold text-slate-800">Report Handoff</h3>
                    </div>
                    <button
                        onClick={handleGenerateReport}
                        disabled={isGeneratingReport || !canRequestReport || latestReport?.status === 'queued' || latestReport?.status === 'generating'}
                        className={secondaryActionButtonClass}
                        title={reportActionDisabledReason || undefined}
                    >
                        {isGeneratingReport || latestReport?.status === 'queued' || latestReport?.status === 'generating' ? <Loader2 size={14} className="animate-spin" /> : null}
                        {latestReport ? 'Generate Fresh Report' : 'Generate Report'}
                    </button>
                </div>

                {reportStatusMessage ? (
                    <div
                        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                            reportStatusMessage.tone === 'error'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : reportStatusMessage.tone === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-blue-200 bg-blue-50 text-blue-700'
                        }`}
                    >
                        {reportStatusMessage.text}
                    </div>
                ) : null}

                {reportActionDisabledReason ? (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {reportActionDisabledReason}
                    </div>
                ) : null}

                {!latestReport ? (
                    <div className={sectionEmptyStateClass}>
                      <div className="font-medium text-slate-700">No handoff report has been generated yet.</div>
                      <div className="mt-1">That is normal until you are ready to package the inspection for download or sharing. Use <span className="font-medium text-slate-700">Generate Report</span> when this inspection is ready for review.</div>
                    </div>
                ) : (
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-700">Latest Report</span>
                                <span className="text-xs text-slate-400">
                                    {new Date(latestReport.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {latestReport.status === 'queued' && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Loader2 size={10} className="animate-spin" /> Queued
                                    </span>
                                )}
                                {latestReport.status === 'generating' && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Loader2 size={10} className="animate-spin" /> Generating...
                                    </span>
                                )}
                                {latestReport.status === 'ready' && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                        Ready
                                    </span>
                                )}
                                {latestReport.status === 'failed' && (
                                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <AlertCircle size={10} /> Failed
                                    </span>
                                )}
                            </div>
                            {latestReport.errorMessage && (
                                <p className="text-xs text-red-500 mt-1">{latestReport.errorMessage}</p>
                            )}
                            <ReportProcurementInsights
                                optimization={latestReport.snapshot?.procurementOptimization}
                                vendorIntelligence={latestReport.snapshot?.procurementVendorIntelligence}
                                reviewGuidance={latestReport.snapshot?.procurementReviewGuidance}
                            />
                        </div>

                        {latestReport.status === 'ready' && latestReport.pdf?.url && (
                            <a 
                                href={latestReport.pdf.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                            >
                                <Download size={16} />
                                Open Report
                            </a>
                        )}
                         {latestReport.status === 'failed' && (
                            <button 
                                onClick={handleGenerateReport}
                                className="flex items-center gap-2 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}
            </div>

        {/* Share Section (Feature Flagged) */}
        {flags?.public_share_links && (
            <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                    <Share2 size={20} className="text-slate-600" />
                    <h3 className="text-lg font-semibold text-slate-800">Share Report</h3>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
                    {shareStatusMessage ? (
                        <div
                            className={`rounded-xl border px-4 py-3 text-sm ${
                                shareStatusMessage.tone === 'error'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : shareStatusMessage.tone === 'success'
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-blue-200 bg-blue-50 text-blue-700'
                            }`}
                        >
                            {shareStatusMessage.text}
                        </div>
                    ) : null}

                    {/* Create Link Form */}
                    <div className="flex items-end gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Expiration</label>
                            <select 
                                value={expiryDays}
                                onChange={(e) => setExpiryDays(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                                <option value={1}>1 Day</option>
                                <option value={3}>3 Days</option>
                                <option value={7}>7 Days (Default)</option>
                                <option value={14}>14 Days</option>
                                <option value={30}>30 Days</option>
                            </select>
                        </div>
                        <button
                            onClick={handleCreateShareLink}
                            disabled={isCreatingLink || !latestReport || latestReport.status !== 'ready'}
                            className={`${primaryActionButtonClass} h-[40px]`}
                        >
                            {isCreatingLink ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                            Create Public Link
                        </button>
                    </div>
                    
                    {!latestReport || latestReport.status !== 'ready' ? (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Generate a ready PDF report first. Public share links only appear after a downloadable report exists.
                        </p>
                    ) : null}

                    {/* Links List */}
                    {shareLinks.length > 0 && (
                        <div className="space-y-2 mt-4">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Links</h4>
                            {shareLinks.map(link => (
                                <div key={link.id} className={`bg-white p-3 rounded-lg border ${link.revokedAt ? 'border-red-100 bg-red-50' : 'border-slate-200'} flex items-center justify-between`}>
                                    <div className="flex-1 min-w-0 mr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 truncate max-w-[200px]">
                                                .../share/{link.token.substring(0, 8)}...
                                            </span>
                                            {link.revokedAt ? (
                                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">REVOKED</span>
                                            ) : (
                                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    <Clock size={10} />
                                                    Expires {new Date(link.expiresAt).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!link.revokedAt && (
                                            <>
                                                <button 
                                                    onClick={() => copyToClipboard(link.token)}
                                                    className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700"
                                                    title="Copy Link"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleRevokeLink(link.token)}
                                                    disabled={revokingToken === link.token}
                                                    className="p-1.5 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                                                    title="Revoke Link"
                                                >
                                                    {revokingToken === link.token ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>

      <ProductSelectorModal
        isOpen={isProductSelectorOpen}
        onClose={() => setIsProductSelectorOpen(false)}
        onSelect={handleAddProduct}
      />
    </div>
  );
};

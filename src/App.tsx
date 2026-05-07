import React, { useState, useEffect, useRef } from 'react';

import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ChecklistMode } from './components/ChecklistMode';
import { ProductManager } from './components/ProductManager';
import { RepairKitManager } from './components/RepairKitManager';
import { ImportWizard } from './components/ImportWizard';

import { InspectionList } from './components/InspectionList';
import { InspectionDetail } from './components/InspectionDetail';
import { ShareLinkViewer } from './components/ShareLinkViewer';
import { AdminRetentionPanel } from './components/AdminRetentionPanel';
import { TemplateManager } from './components/TemplateManager';
import { ProcurementWorkspace } from './components/ProcurementWorkspace';
import { InspectionHome } from './components/InspectionHome';
import { UnitManagement } from './components/UnitManagement';
import { UnitWorkspace } from './components/UnitWorkspace';
import { LocalSignInScreen } from './components/LocalSignInScreen';
import { FocusedHome } from './components/FocusedHome';
import { FocusedInspectionWorkflow } from './components/FocusedInspectionWorkflow';
import { ClientCrashCapture, ErrorBoundary } from './components/ErrorBoundary';
import { FeedbackManagement } from './pages/FeedbackManagement';

import { CatalogProvider } from './core/hooks/useCatalog';
import { AppState, CatalogItem, RepairTemplate } from './core/models/types';
import { getStoredData, saveData } from './services/storage';

import { useDebouncedCallback } from './core/hooks/useDebouncedCallback';
import { AppContextProvider, useAppContext } from './core/hooks/useAppContext';
import { useAuditLogger } from './core/hooks/useAuditLogger';
import { SyncEngineProvider } from './core/hooks/useSyncEngine';
import { AuthPolicyService, AppView } from './core/services/AuthPolicyService';

type LifecycleTab = 'overview' | 'inspection' | 'scope' | 'procurement' | 'vendor' | 'verification';
type InspectionScopeSection = 'findings' | 'tasks' | 'materials';
type InspectionScopeTarget = {
  entityType: 'finding' | 'task' | 'material';
  entityId: string;
  originLabel?: string | null;
};
type ProcurementFocus = 'all' | 'procurement' | 'vendor' | 'receiving' | 'verification';
type AppMode = 'focused' | 'full';
type FocusedRoute = 'home' | 'unit-select' | 'inspection' | 'summary' | 'materials';
type WorkspaceAttentionContext = {
  unitId: string;
  preferredTab?: LifecycleTab | null;
  inspectionId?: string | null;
  scopeSection?: InspectionScopeSection | null;
  scopeTarget?: InspectionScopeTarget | null;
  reasonLabel?: string | null;
  reasonDetail?: string | null;
  token: number;
};
type RecentWorkSurface = 'inspection' | 'unit_workspace' | 'procurement';
type FocusedProcurementArrivalContext = {
  source: 'focused_submission';
  outcome: 'submitted' | 'queued';
  unitName: string;
  itemCount: number;
  estimatedTotal: number;
  nextStep: string;
};
type FocusedWorkflowSubmissionState = {
  outcome: 'submitted' | 'queued' | 'failed';
  unitName: string;
  itemCount: number;
  estimatedTotal: number;
  requirementIds: string[];
  nextStep: string;
  detail: string;
};
type RecentWorkEntry = {
  id: string;
  surface: RecentWorkSurface;
  unitId: string;
  label: string;
  detail?: string | null;
  preferredTab?: LifecycleTab | null;
  inspectionId?: string | null;
  scopeSection?: InspectionScopeSection | null;
  scopeTarget?: InspectionScopeTarget | null;
  procurementFocus?: ProcurementFocus;
  requirementId?: string | null;
  originLabel?: string | null;
};
type FocusedWorkflowSession = {
  intent: 'inspection' | 'materials';
  step: FocusedRoute | 'select';
  unitId?: string | null;
  inspectionId?: string | null;
  roomId?: string | null;
  itemId?: string | null;
  scopeSection?: InspectionScopeSection | null;
  scopeTarget?: InspectionScopeTarget | null;
  procurementRequirementId?: string | null;
  submissionState?: FocusedWorkflowSubmissionState | null;
} | null;

const RECENT_WORK_LIMIT = 5;
const APP_MODE_STORAGE_KEY = 'unitflip:app-mode:v1';
const getShareTokenFromLocation = (): string | null => {
  const pathname = window.location.pathname || '';
  if (!pathname.startsWith('/share/')) return null;

  // Remove "/share/" prefix
  let tokenPart = pathname.slice('/share/'.length);

  // Defensive cleanup: strip query/hash (shouldn't exist in pathname, but safe),
  // trim trailing slashes, and ignore empty.
  tokenPart = tokenPart.split('?')[0].split('#')[0].replace(/\/+$/, '');

  return tokenPart.length > 0 ? tokenPart : null;
};

const buildRecentWorkId = (entry: Omit<RecentWorkEntry, 'id'>) =>
  [
    entry.surface,
    entry.unitId,
    entry.inspectionId || 'inspection:none',
    entry.scopeSection || 'scope:none',
    entry.scopeTarget?.entityType || 'target:none',
    entry.scopeTarget?.entityId || 'entity:none',
    entry.procurementFocus || 'focus:none',
    entry.requirementId || 'requirement:none',
    entry.preferredTab || 'tab:none',
  ].join('::');

const buildRecentWorkStorageKey = (role?: string | null) => `unitflip:recent-work:${role || 'anonymous'}`;
const buildFocusedWorkflowStorageKey = (role?: string | null) => `unitflip:focused-workflow:${role || 'anonymous'}`;
const normalizeFocusedWorkflowSession = (value: unknown): FocusedWorkflowSession => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Exclude<FocusedWorkflowSession, null>>;
  if (candidate.intent !== 'inspection' && candidate.intent !== 'materials') return null;
  return {
    intent: candidate.intent,
    step: candidate.step || 'inspection',
    unitId: candidate.unitId || null,
    inspectionId: candidate.inspectionId || null,
    roomId: candidate.roomId || null,
    itemId: candidate.itemId || null,
    scopeSection: candidate.scopeSection || null,
    scopeTarget: candidate.scopeTarget || null,
    procurementRequirementId: candidate.procurementRequirementId || null,
    submissionState: candidate.submissionState || null,
  };
};
const readFocusedWorkflowSession = (role?: string | null): FocusedWorkflowSession => {
  if (typeof window === 'undefined') return null;
  const storageKey = buildFocusedWorkflowStorageKey(role);
  try {
    const raw = window.localStorage.getItem(storageKey) || window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const normalized = normalizeFocusedWorkflowSession(JSON.parse(raw));
    if (!normalized) {
      window.localStorage.removeItem(storageKey);
      window.sessionStorage.removeItem(storageKey);
    }
    return normalized;
  } catch {
    window.localStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
};

const readRecentWork = (role?: string | null): RecentWorkEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(buildRecentWorkStorageKey(role));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_WORK_LIMIT) : [];
  } catch {
    return [];
  }
};

const trimRouteOriginLabel = (value?: string | null) =>
  value
    ?.replace(/^Opened from [^•]+ • /, '')
    ?.replace(/^Opened from [^•]+$/, '')
    ?.trim() || null;

const AppContent: React.FC = () => {
  // NOTE: This AppState is legacy/local-only for Rooms/Products/Templates.
  // Units/Inspections/Photos/Reports/ShareLinks live in their own services/stores.
  const [data, setData] = useState<AppState>({ rooms: [], products: [], repairTemplates: [], categories: [], bundleRules: [] });

  const [isAppDataLoaded, setIsAppDataLoaded] = useState(false);
  const [currentView, setCurrentView] = useState('inspections');
  const [appMode, setAppMode] = useState<AppMode>(() => {
    if (typeof window === 'undefined') return 'focused';
    const stored = window.localStorage.getItem(APP_MODE_STORAGE_KEY);
    return stored === 'full' ? 'full' : 'focused';
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedWorkspaceUnitId, setSelectedWorkspaceUnitId] = useState<string | null>(null);
  const [selectedWorkspaceAttentionContext, setSelectedWorkspaceAttentionContext] = useState<WorkspaceAttentionContext | null>(null);
  const [recentWork, setRecentWork] = useState<RecentWorkEntry[]>([]);

  // Inspection Flow State
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [selectedInspectionScopeSection, setSelectedInspectionScopeSection] = useState<InspectionScopeSection | null>(null);
  const [selectedInspectionScopeTarget, setSelectedInspectionScopeTarget] = useState<InspectionScopeTarget | null>(null);
  const [selectedInspectionOriginLabel, setSelectedInspectionOriginLabel] = useState<string | null>(null);
  const [focusedProcurementUnitId, setFocusedProcurementUnitId] = useState<string | null>(null);
  const [focusedProcurementStage, setFocusedProcurementStage] = useState<ProcurementFocus>('all');
  const [focusedProcurementRequirementId, setFocusedProcurementRequirementId] = useState<string | null>(null);
  const [focusedProcurementRequirementIds, setFocusedProcurementRequirementIds] = useState<string[]>([]);
  const [focusedProcurementOriginLabel, setFocusedProcurementOriginLabel] = useState<string | null>(null);
  const [focusedProcurementArrivalContext, setFocusedProcurementArrivalContext] = useState<FocusedProcurementArrivalContext | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<FocusedRoute>('home');
  const [focusedWorkflowSession, setFocusedWorkflowSession] = useState<FocusedWorkflowSession>(null);
  const focusedWorkflowSessionRef = useRef<FocusedWorkflowSession>(null);

  // Share Viewer State
  const [shareToken, setShareToken] = useState<string | null>(null);

  const { log } = useAuditLogger();
  const { role, isLoaded: isSessionLoaded, session, permissions } = useAppContext();

  const normalizeViewForRole = (nextView: string): AppView => {
    if (!role) return 'inspections';
    const candidateView = nextView as AppView;
    return AuthPolicyService.canAccessView(permissions, candidateView)
      ? candidateView
      : AuthPolicyService.getDefaultViewForRole(role);
  };

  useEffect(() => {
    setRecentWork(readRecentWork(role));
  }, [role]);

  useEffect(() => {
    const nextFocusedSession = readFocusedWorkflowSession(role);
    focusedWorkflowSessionRef.current = nextFocusedSession;
    setFocusedWorkflowSession(nextFocusedSession);
  }, [role]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, appMode);
  }, [appMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(buildRecentWorkStorageKey(role), JSON.stringify(recentWork.slice(0, RECENT_WORK_LIMIT)));
    } catch {
      // Ignore session-scoped UI persistence failures.
    }
  }, [recentWork, role]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = buildFocusedWorkflowStorageKey(role);
      if (focusedWorkflowSession) {
        const serializedSession = JSON.stringify(focusedWorkflowSession);
        window.sessionStorage.setItem(storageKey, serializedSession);
        window.localStorage.setItem(storageKey, serializedSession);
      } else {
        window.sessionStorage.removeItem(storageKey);
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore session-scoped UI persistence failures.
    }
  }, [focusedWorkflowSession, role]);

  useEffect(() => {
    if (appMode !== 'focused' || focusedRoute !== 'home' || !focusedWorkflowSession) return;
    if (!focusedWorkflowSession.inspectionId && !focusedWorkflowSession.unitId) return;
    setFocusedRoute(
      focusedWorkflowSession.step === 'select' || focusedWorkflowSession.step === 'unit-select'
        ? 'inspection'
        : focusedWorkflowSession.step === 'home'
          ? 'inspection'
          : focusedWorkflowSession.step
    );
  }, [appMode, focusedRoute, focusedWorkflowSession]);
  const pushRecentWork = (entry: Omit<RecentWorkEntry, 'id'> | null) => {
    if (!entry || !entry.unitId) return;
    const nextEntry: RecentWorkEntry = {
      ...entry,
      label: entry.label.trim(),
      detail: entry.detail?.trim() || null,
      id: buildRecentWorkId(entry),
    };
    if (!nextEntry.label) return;
    setRecentWork((current) => [nextEntry, ...current.filter((item) => item.id !== nextEntry.id)].slice(0, RECENT_WORK_LIMIT));
  };

  const openUnitWorkspace = (
    unitId?: string | null,
    context?: Omit<WorkspaceAttentionContext, 'unitId' | 'token'> | null,
    recentLabel?: string | null
  ) => {
    setCurrentView('rooms');
    setSelectedWorkspaceUnitId(unitId || null);
    setSelectedWorkspaceAttentionContext(
      unitId && context
        ? {
            unitId,
            preferredTab: context.preferredTab || null,
            inspectionId: context.inspectionId || null,
            scopeSection: context.scopeSection || null,
            scopeTarget: context.scopeTarget || null,
            reasonLabel: context.reasonLabel || null,
            reasonDetail: context.reasonDetail || null,
            token: Date.now(),
          }
        : null
    );
    if (!unitId) return;
    pushRecentWork({
      surface: 'unit_workspace',
      unitId,
      preferredTab: context?.preferredTab || null,
      inspectionId: context?.inspectionId || null,
      scopeSection: context?.scopeSection || null,
      scopeTarget: context?.scopeTarget || null,
      label: recentLabel || context?.reasonLabel || 'Unit workspace',
      detail: context?.reasonDetail || 'Return to the same unit context.',
      originLabel: context?.reasonLabel || null,
    });
  };

  const openInspection = (
    options?: {
      inspectionId?: string | null;
      scopeSection?: InspectionScopeSection | null;
      originContextLabel?: string | null;
      scopeTarget?: InspectionScopeTarget | null;
      unitId?: string | null;
      recentLabel?: string | null;
      recentDetail?: string | null;
    }
  ) => {
    setCurrentView('inspections');
    setSelectedUnitId(options?.inspectionId ? null : options?.unitId || null);
    setSelectedInspectionId(options?.inspectionId || null);
    setSelectedInspectionScopeSection(options?.scopeSection || null);
    setSelectedInspectionScopeTarget(options?.scopeTarget || null);
    setSelectedInspectionOriginLabel(options?.originContextLabel || null);
    if (!options?.inspectionId || !options?.unitId) return;
    pushRecentWork({
      surface: 'inspection',
      unitId: options.unitId,
      inspectionId: options.inspectionId,
      scopeSection: options.scopeSection || null,
      scopeTarget: options.scopeTarget || null,
      preferredTab: 'inspection',
      label:
        options.recentLabel ||
        (options.scopeTarget
          ? `Focused ${options.scopeTarget.entityType === 'material' ? 'material' : options.scopeTarget.entityType}`
          : options.scopeSection
            ? `${options.scopeSection[0].toUpperCase()}${options.scopeSection.slice(1)} in inspection`
            : 'Inspection detail'),
      detail:
        options.recentDetail ||
        trimRouteOriginLabel(options.originContextLabel) ||
        'Return to the same inspection context.',
      originLabel: options.originContextLabel || null,
    });
  };

  const openProcurement = (
    options?: {
      unitId?: string | null;
      focus?: ProcurementFocus;
      requirementId?: string | null;
      requirementIds?: string[] | null;
      originLabel?: string | null;
      arrivalContext?: FocusedProcurementArrivalContext | null;
      recentLabel?: string | null;
      recentDetail?: string | null;
    }
  ) => {
    setFocusedProcurementUnitId(options?.unitId || null);
    setFocusedProcurementStage(options?.focus || 'all');
    setFocusedProcurementRequirementId(options?.requirementId || null);
    setFocusedProcurementRequirementIds(options?.requirementIds?.filter(Boolean) || []);
    setFocusedProcurementOriginLabel(options?.originLabel || null);
    setFocusedProcurementArrivalContext(options?.arrivalContext || null);
    setCurrentView('procurement');
    if (!options?.unitId || (options.focus || 'all') === 'all' && !options.requirementId && !options.originLabel) return;
    pushRecentWork({
      surface: 'procurement',
      unitId: options.unitId,
      procurementFocus: options.focus || 'all',
      requirementId: options.requirementId || null,
      preferredTab:
        options.focus === 'vendor'
          ? 'vendor'
          : options.focus === 'receiving' || options.focus === 'verification'
            ? 'verification'
            : 'procurement',
      label:
        options.recentLabel ||
        (options.requirementId
          ? `${options.focus === 'verification' ? 'Verification' : options.focus === 'vendor' ? 'Vendor' : 'Procurement'} item`
          : options.focus === 'verification'
            ? 'Pending verification'
            : options.focus === 'receiving'
              ? 'Pending receiving'
              : options.focus === 'vendor'
                ? 'Vendor work'
                : 'Procurement work'),
      detail:
        options.recentDetail ||
        trimRouteOriginLabel(options.originLabel) ||
        'Return to the same procurement queue.',
      originLabel: options.originLabel || null,
    });
  };

  const openRecentWork = (id: string) => {
    const entry = recentWork.find((item) => item.id === id);
    if (!entry) return;

    if (entry.surface === 'inspection') {
      openInspection({
        unitId: entry.unitId,
        inspectionId: entry.inspectionId || null,
        scopeSection: entry.scopeSection || null,
        scopeTarget: entry.scopeTarget || null,
        originContextLabel: entry.originLabel || `Opened from Recent Work • ${entry.label}`,
        recentLabel: entry.label,
        recentDetail: entry.detail || null,
      });
      return;
    }

    if (entry.surface === 'procurement') {
      openProcurement({
        unitId: entry.unitId,
        focus: entry.procurementFocus || 'all',
        requirementId: entry.requirementId || null,
        originLabel: entry.originLabel || `Opened from Recent Work • ${entry.label}`,
        recentLabel: entry.label,
        recentDetail: entry.detail || null,
      });
      return;
    }

    openUnitWorkspace(
      entry.unitId,
      {
        preferredTab: entry.preferredTab || null,
        inspectionId: entry.inspectionId || null,
        scopeSection: entry.scopeSection || null,
        scopeTarget: entry.scopeTarget || null,
        reasonLabel: entry.label,
        reasonDetail: entry.detail || null,
      },
      entry.label
    );
  };

  const handleModeChange = (nextMode: AppMode, options?: { skipFocusedExitConfirm?: boolean }) => {
    const activeFocusedSession = focusedWorkflowSessionRef.current || focusedWorkflowSession;
    const activeFocusedStep = activeFocusedSession?.step || focusedRoute;
    if (
      appMode === 'focused' &&
      nextMode === 'full' &&
      !options?.skipFocusedExitConfirm &&
      Boolean(activeFocusedSession?.inspectionId || activeFocusedSession?.unitId) &&
      !window.confirm('Switch to Full Mode? Your focused inspection context will open in the full workspace.')
    ) {
      return;
    }
    setAppMode(nextMode);
    if (nextMode === 'focused') {
      if (activeFocusedSession?.inspectionId || activeFocusedSession?.unitId) {
        setFocusedRoute(
          activeFocusedSession.step === 'select'
            ? 'inspection'
            : activeFocusedSession.step === 'home'
              ? 'home'
              : activeFocusedSession.step
        );
        return;
      }
      if (currentView === 'procurement') {
        setFocusedRoute('materials');
        return;
      }
      if (selectedInspectionId || currentView === 'inspections') {
        setFocusedRoute('inspection');
        return;
      }
      setFocusedRoute('home');
      return;
    }

    if (activeFocusedStep === 'materials') {
      openProcurement({
        unitId: activeFocusedSession?.unitId || selectedWorkspaceUnitId || selectedUnitId || focusedProcurementUnitId,
        focus: 'procurement',
        requirementId: activeFocusedSession?.procurementRequirementId || null,
        requirementIds: activeFocusedSession?.procurementRequirementId ? [activeFocusedSession.procurementRequirementId] : [],
        originLabel: 'Opened from Focused Mode • Materials review',
      });
      return;
    }
    if (activeFocusedStep === 'inspection' || activeFocusedStep === 'summary') {
      if (activeFocusedSession?.inspectionId || activeFocusedSession?.unitId) {
        openInspection({
          unitId: activeFocusedSession?.unitId || null,
          inspectionId: activeFocusedSession?.inspectionId || null,
          scopeSection: activeFocusedSession?.scopeSection || null,
          scopeTarget: activeFocusedSession?.scopeTarget || null,
          originContextLabel:
            activeFocusedStep === 'summary'
              ? 'Opened from Focused Mode • Inspection summary'
              : 'Opened from Focused Mode • Active inspection',
        });
        return;
      }
      setCurrentView('inspections');
      return;
    }
  };

  const renderFocusedContent = () => {
    if (focusedRoute === 'home') {
      return (
        <FocusedHome
          canStartInspection={AuthPolicyService.canAccessView(permissions, 'inspections')}
          canProcessMaterials={AuthPolicyService.canAccessView(permissions, 'procurement')}
          onStartInspection={() => {
            if (!AuthPolicyService.canAccessView(permissions, 'inspections')) return;
            setFocusedRoute('inspection');
          }}
          onProcessMaterials={() => {
            if (!AuthPolicyService.canAccessView(permissions, 'procurement')) return;
            if (role === 'vendor') {
              setAppMode('full');
              openProcurement({ focus: 'vendor' });
              return;
            }
            setFocusedRoute('materials');
          }}
          onSwitchFullMode={() => handleModeChange('full')}
        />
      );
    }

    return (
      <FocusedInspectionWorkflow
        intent={focusedRoute === 'materials' ? 'materials' : 'inspection'}
        initialUnitId={focusedWorkflowSession?.unitId || selectedWorkspaceUnitId || selectedUnitId || focusedProcurementUnitId}
        initialInspectionId={focusedWorkflowSession?.inspectionId || selectedInspectionId}
        initialStep={focusedWorkflowSession?.step === 'select' ? 'inspection' : focusedWorkflowSession?.step}
        initialRoomId={focusedWorkflowSession?.roomId || null}
        initialItemId={focusedWorkflowSession?.itemId || null}
        initialSubmissionState={focusedWorkflowSession?.submissionState || null}
        onContextChange={(context) => {
          const nextFocusedSession: FocusedWorkflowSession =
            context.step === 'select' && !context.unitId && !context.inspectionId && !context.submissionState
              ? null
              : {
                  intent: context.intent,
                  step: context.step,
                  unitId: context.unitId || null,
                  inspectionId: context.inspectionId || null,
                  roomId: context.roomId || null,
                  itemId: context.itemId || null,
                  scopeSection: context.scopeSection || null,
                  scopeTarget: context.scopeTarget || null,
                  procurementRequirementId: context.procurementRequirementId || null,
                  submissionState: context.submissionState || null,
                };
          setFocusedRoute(context.step === 'select' ? 'inspection' : context.step);
          focusedWorkflowSessionRef.current = nextFocusedSession;
          setFocusedWorkflowSession(nextFocusedSession);
        }}
        onExit={() => {
          focusedWorkflowSessionRef.current = null;
          setFocusedWorkflowSession(null);
          setFocusedRoute('home');
        }}
        onSwitchFullMode={() => handleModeChange('full', { skipFocusedExitConfirm: true })}
        onOpenProcurement={(options) => {
          setFocusedRoute('materials');
          const nextSession = focusedWorkflowSessionRef.current
            ? {
                ...focusedWorkflowSessionRef.current,
                step: 'materials' as const,
                procurementRequirementId:
                  options?.requirementId ||
                  options?.requirementIds?.[0] ||
                  focusedWorkflowSessionRef.current.procurementRequirementId ||
                  null,
                submissionState: focusedWorkflowSessionRef.current.submissionState || null,
              }
            : focusedWorkflowSessionRef.current;
          focusedWorkflowSessionRef.current = nextSession;
          setFocusedWorkflowSession(nextSession);
          setAppMode('full');
          openProcurement(options);
        }}
      />
    );
  };

  // Load data on mount + detect share link
  useEffect(() => {
    const token = getShareTokenFromLocation();
    if (token) {
      setShareToken(token);
    }

    const loadData = async () => {
      const stored = await getStoredData();
      setData(stored);
      setIsAppDataLoaded(true);
    };

    loadData();
  }, []);

  // Create debounced save function
  const debouncedSave = useDebouncedCallback((newData: AppState) => {
    // Best-effort save; storage service handles its own errors/fallbacks.
    void saveData(newData);
  }, 400);

  // Save legacy AppState (rooms/products/templates) on change
  useEffect(() => {
    if (isAppDataLoaded) {
      debouncedSave(data);
    }
  }, [data, isAppDataLoaded, debouncedSave]);

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  // Flush pending saves on window close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      debouncedSave.flush();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [debouncedSave]);

  useEffect(() => {
    if (currentView === 'feedback-management' && role !== 'developer') {
      setCurrentView(AuthPolicyService.getDefaultViewForRole(role || 'manager'));
    }
  }, [currentView, role]);

  useEffect(() => {
    if (!role) return;
    if (!AuthPolicyService.canAccessView(permissions, currentView as AppView)) {
      setCurrentView(AuthPolicyService.getDefaultViewForRole(role));
    }
  }, [currentView, permissions, role]);

  const handleAddProduct = (product: CatalogItem) => {
    setData((prev) => ({
      ...prev,
      products: [...prev.products, product],
    }));
    log('CATALOG_ITEM_CREATED', {
      entityType: 'catalog_item',
      entityId: product.id,
      message: `Added product: ${product.name}`,
    });
  };

  const handleUpdateProduct = (updatedProduct: CatalogItem) => {
    setData((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === updatedProduct.id ? updatedProduct : p)),
    }));
    log('CATALOG_ITEM_UPDATED', {
      entityType: 'catalog_item',
      entityId: updatedProduct.id,
      message: `Updated product: ${updatedProduct.name}`,
    });
  };

  // Repair Kit Handlers
  const handleAddTemplate = (template: RepairTemplate) => {
    setData((prev) => ({
      ...prev,
      repairTemplates: [...prev.repairTemplates, template],
    }));
    log('TEMPLATE_CREATED', {
      entityType: 'template',
      entityId: template.id,
      message: `Created template: ${template.name}`,
    });
  };

  const handleUpdateTemplate = (updatedTemplate: RepairTemplate) => {
    setData((prev) => ({
      ...prev,
      repairTemplates: prev.repairTemplates.map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t)),
    }));
    log('TEMPLATE_UPDATED', {
      entityType: 'template',
      entityId: updatedTemplate.id,
      message: `Updated template: ${updatedTemplate.name}`,
    });
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Delete this repair kit?')) {
      setData((prev) => ({
        ...prev,
        repairTemplates: prev.repairTemplates.filter((t) => t.id !== id),
      }));
      log('TEMPLATE_DELETED', { entityType: 'template', entityId: id, message: 'Deleted template' });
    }
  };

  const renderContent = () => {
    if (appMode === 'focused') {
      return renderFocusedContent();
    }

    if (currentView === 'checklist') {
      return <ChecklistMode rooms={data.rooms} products={data.products} onUpdateProduct={handleUpdateProduct} />;
    }

    if (currentView === 'import-wizard') {
      return (
        <ImportWizard rooms={data.rooms} onAddProduct={handleAddProduct} onBack={() => setCurrentView('products')} />
      );
    }

    if (currentView === 'products') {
      return (
        <ProductManager
          initialCategory={activeCategory}
          onImport={() => setCurrentView('import-wizard')}
        />
      );
    }

    if (currentView === 'repair-kits') {
      return (
        <RepairKitManager
          templates={data.repairTemplates}
          onAddTemplate={handleAddTemplate}
          onUpdateTemplate={handleUpdateTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />
      );
    }

    if (currentView === 'rooms') {
      return (
        <UnitWorkspace
          initialUnitId={selectedWorkspaceUnitId}
          initialAttentionContext={selectedWorkspaceAttentionContext}
          recentWork={recentWork}
          onOpenRecentWork={openRecentWork}
          onOpenPortfolio={() => setCurrentView('unit-management')}
          onOpenInspectionQueue={(unitId) => {
            openInspection({ unitId });
            setSelectedWorkspaceUnitId(unitId);
            setSelectedWorkspaceAttentionContext(null);
          }}
          onOpenInspection={(inspectionId, scopeSection, originContextLabel, unitId, scopeTarget) =>
            openInspection({
              unitId: unitId || null,
              inspectionId,
              scopeSection: scopeSection || null,
              scopeTarget: scopeTarget || null,
              originContextLabel: originContextLabel || 'Opened from Unit Workspace',
            })}
          onOpenProcurement={(options) => openProcurement(options)}
        />
      );
    }

    if (currentView === 'inspections') {
      if (selectedInspectionId) {
        return (
          <ErrorBoundary
            surfaceName="inspection-detail-page"
            screenName="InspectionDetail"
            contextIds={{ inspectionId: selectedInspectionId }}
            resetKeys={[selectedInspectionId]}
            onReturn={() => setSelectedInspectionId(null)}
            returnLabel="Return to Inspection"
          >
            <InspectionDetail
              inspectionId={selectedInspectionId}
              initialScopeSection={selectedInspectionScopeSection}
              initialScopeTarget={selectedInspectionScopeTarget}
              originContextLabel={selectedInspectionOriginLabel}
              onOpenProcurement={(options) => openProcurement(options)}
              onOpenUnitWorkspace={(unitId, context) => openUnitWorkspace(unitId, context)}
              onPersistInspectionContext={(context) => {
                setSelectedInspectionScopeSection(context.scopeSection || null);
                setSelectedInspectionScopeTarget(context.scopeTarget || null);
              }}
              onBack={() => {
                setSelectedInspectionId(null);
                setSelectedInspectionScopeSection(null);
                setSelectedInspectionScopeTarget(null);
                setSelectedInspectionOriginLabel(null);
              }}
            />
          </ErrorBoundary>
        );
      }
      if (selectedUnitId) {
        return (
          <InspectionList
            unitId={selectedUnitId}
            onSelectInspection={setSelectedInspectionId}
            onBack={() => setSelectedUnitId(null)}
          />
        );
      }
      return (
        <InspectionHome
          onSelectUnit={setSelectedUnitId}
          onOpenPortfolio={() => setCurrentView('unit-management')}
          onResumeInspection={(inspectionId) => {
            setSelectedUnitId(null);
            openInspection({ inspectionId, unitId: null });
            setSelectedInspectionScopeTarget(null);
          }}
        />
      );
    }

    if (currentView === 'unit-management') {
      return (
        <UnitManagement
          onOpenUnitWorkspace={(unitId, context) => openUnitWorkspace(unitId, context)}
          onOpenUnitInspections={(unitId) => {
            setSelectedWorkspaceUnitId(unitId);
            openInspection({ unitId });
          }}
          onOpenInspection={(inspectionId, scopeSection, originContextLabel, scopeTarget) =>
            openInspection({
              unitId: selectedWorkspaceUnitId,
              inspectionId,
              scopeSection: scopeSection || null,
              scopeTarget: scopeTarget || null,
              originContextLabel: originContextLabel || 'Opened from Portfolio',
            })}
        />
      );
    }
    
    if (currentView === 'admin') {
      if (!AuthPolicyService.canAccessView(permissions, 'admin')) {
        return (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Admin access required</h2>
            <p className="mt-2 text-sm text-slate-600">This surface is not available for the current local session.</p>
          </div>
        );
      }

      return (
        <AdminRetentionPanel
          onOpenFeedbackManagement={role === 'developer' ? () => setCurrentView('feedback-management') : undefined}
        />
      );
    }

    if (currentView === 'feedback-management') {
      if (role !== 'developer') {
        return <AdminRetentionPanel />;
      }

      return <FeedbackManagement onBack={() => setCurrentView('admin')} />;
    }

    if (currentView === 'templates') {
      if (!AuthPolicyService.canAccessView(permissions, 'templates')) {
        return (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Template access is unavailable</h2>
            <p className="mt-2 text-sm text-slate-600">The current local role cannot manage templates.</p>
          </div>
        );
      }
      return <TemplateManager />;
    }

    if (currentView === 'procurement') {
      return (
        <ProcurementWorkspace
          focusedUnitId={focusedProcurementUnitId}
          initialFocus={focusedProcurementStage}
          focusedRequirementId={focusedProcurementRequirementId}
          focusedRequirementIds={focusedProcurementRequirementIds}
          originContextLabel={focusedProcurementOriginLabel}
          arrivalContext={focusedProcurementArrivalContext}
          onOpenInspectionScope={(inspectionId, scopeSection, originContextLabel, scopeTarget) =>
            openInspection({
              unitId: focusedProcurementUnitId,
              inspectionId,
              scopeSection: scopeSection || null,
              scopeTarget: scopeTarget || null,
              originContextLabel: originContextLabel || 'Opened from Procurement',
            })}
          onClearUnitFocus={() => {
            setFocusedProcurementUnitId(null);
            setFocusedProcurementStage('all');
            setFocusedProcurementRequirementId(null);
            setFocusedProcurementRequirementIds([]);
            setFocusedProcurementOriginLabel(null);
            setFocusedProcurementArrivalContext(null);
          }}
        />
      );
    }

    // Default to rooms/dashboard view logic
    return (
        <Dashboard
          recentWork={recentWork}
          onOpenRecentWork={openRecentWork}
          onOpenPortfolio={() => setCurrentView('unit-management')}
          onOpenInspection={(options) => openInspection(options)}
          onOpenProcurement={(options) => openProcurement(options)}
          onOpenUnitWorkspace={(unitId, context) => openUnitWorkspace(unitId || null, context)}
        />
    );
  };

  // If URL is a share link, show the public viewer regardless of currentView.
  if (shareToken) {
    return <ShareLinkViewer token={shareToken} />;
  }

  if (!isSessionLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-200">
        Loading local session…
      </div>
    );
  }

  if (!session) {
    return <LocalSignInScreen />;
  }

  return (
    <Layout
      activeTab={
        appMode === 'focused'
          ? focusedRoute === 'materials'
            ? 'focused-materials'
            : focusedRoute === 'inspection'
              ? 'focused-inspection'
              : 'focused-home'
          : currentView
      }
      mode={appMode}
      onModeChange={handleModeChange}
      onTabChange={(tab) => {
        setCurrentView(normalizeViewForRole(tab));
        setSelectedWorkspaceUnitId(null);

        // Inspection navigation always returns to the operational launch surface.
        if (tab === 'inspections') {
          setSelectedUnitId(null);
          setSelectedInspectionId(null);
          setSelectedInspectionScopeSection(null);
          setSelectedInspectionOriginLabel(null);
        } else {
          setSelectedUnitId(null);
          setSelectedInspectionId(null);
          setSelectedInspectionScopeSection(null);
          setSelectedInspectionOriginLabel(null);
        }

        if (tab === 'products') {
          setActiveCategory(null); // Reset category filter when manually clicking the tab
        }
      }}
    >
      <ErrorBoundary
        surfaceName="app-view-content"
        screenName="AppContent"
        contextIds={{
          unitId: selectedUnitId || undefined,
          inspectionId: selectedInspectionId || undefined,
        }}
        resetKeys={[currentView, selectedUnitId, selectedInspectionId, selectedWorkspaceUnitId, activeCategory]}
        onReturn={() => {
          setCurrentView('inspections');
          setSelectedWorkspaceUnitId(null);
          setSelectedUnitId(null);
          setSelectedInspectionId(null);
          setSelectedInspectionScopeSection(null);
          setSelectedInspectionOriginLabel(null);
          setActiveCategory(null);
        }}
        returnLabel="Return to Inspection"
      >
        {renderContent()}
      </ErrorBoundary>
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AppContextProvider>
      <SyncEngineProvider>
        <CatalogProvider>
          <ClientCrashCapture screenName="App" />
          <ErrorBoundary surfaceName="app-shell" screenName="AppShell" resetKeys={[window.location.pathname]}>
            <AppContent />
          </ErrorBoundary>
        </CatalogProvider>
      </SyncEngineProvider>
    </AppContextProvider>
  );
};

export default App;

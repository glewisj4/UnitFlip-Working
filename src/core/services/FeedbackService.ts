import { ClientLogEntry, ClientLoggerService } from './ClientLoggerService';

export type FeedbackCategory =
  | 'bug'
  | 'suggestion'
  | 'ux_issue'
  | 'confusing_behavior'
  | 'performance'
  | 'other';

export interface FeedbackContextSnapshot {
  route?: string;
  screen?: string;
  activeTab?: string;
  isOnline?: boolean;
  isSyncing?: boolean;
  orgId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface FeedbackRecord {
  id: string;
  timestamp: string;
  sessionId: string;
  appVersion: string;
  buildId: string;
  category: FeedbackCategory;
  message: string;
  contextIncluded: boolean;
  diagnosticsIncluded: boolean;
  context?: FeedbackContextSnapshot;
  diagnostics?: {
    recentLogs: ClientLogEntry[];
  };
}

interface SaveFeedbackInput {
  category: FeedbackCategory;
  message: string;
  includeContext: boolean;
  includeDiagnostics: boolean;
  context?: FeedbackContextSnapshot;
}

const FEEDBACK_STORAGE_KEY = 'unitflip:feedback:v1';
const MAX_FEEDBACK_RECORDS = 50;
const MAX_DIAGNOSTIC_LOGS = 25;

const createFeedbackId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through.
  }

  return `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const readStoredFeedback = (): FeedbackRecord[] => {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FeedbackRecord[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_FEEDBACK_RECORDS) : [];
  } catch {
    window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
    return [];
  }
};

const writeStoredFeedback = (records: FeedbackRecord[]) => {
  window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(records.slice(-MAX_FEEDBACK_RECORDS)));
};

export const FeedbackService = {
  listFeedback(): FeedbackRecord[] {
    return readStoredFeedback();
  },

  getFeedbackCount(): number {
    return readStoredFeedback().length;
  },

  saveFeedback(input: SaveFeedbackInput): FeedbackRecord {
    const nextRecord: FeedbackRecord = {
      id: createFeedbackId(),
      timestamp: new Date().toISOString(),
      sessionId: ClientLoggerService.getSessionId(),
      appVersion: import.meta.env.VITE_APP_VERSION || '0.0.0',
      buildId: import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_APP_VERSION || 'dev',
      category: input.category,
      message: input.message.trim(),
      contextIncluded: input.includeContext,
      diagnosticsIncluded: input.includeDiagnostics,
      context: input.includeContext ? input.context : undefined,
      diagnostics: input.includeDiagnostics
        ? {
            recentLogs: ClientLoggerService.getRecentEntries().slice(-MAX_DIAGNOSTIC_LOGS),
          }
        : undefined,
    };

    const existing = readStoredFeedback();
    writeStoredFeedback([...existing, nextRecord]);
    return nextRecord;
  },

  exportFeedbackJson(): string {
    return JSON.stringify(readStoredFeedback(), null, 2);
  },

  exportFeedbackRecordsJson(records: FeedbackRecord[]): string {
    return JSON.stringify(records.slice(-MAX_FEEDBACK_RECORDS), null, 2);
  },

  downloadFeedbackRecords(records: FeedbackRecord[], fileName?: string): void {
    const contents = this.exportFeedbackRecordsJson(records);
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || `unitflip-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },

  downloadFeedbackExport(): void {
    this.downloadFeedbackRecords(readStoredFeedback());
  },
};

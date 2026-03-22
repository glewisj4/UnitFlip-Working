import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  FolderSearch,
  MessageSquareWarning,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { ClientLogEntry, ClientLogLevel, ClientLoggerService } from '../core/services/ClientLoggerService';
import {
  DerivedSignal,
  SignalAnalysisService,
  SignalDestination,
  SignalPriority,
} from '../core/services/SignalAnalysisService';
import { FeedbackCategory, FeedbackRecord, FeedbackService } from '../core/services/FeedbackService';

type FeedbackManagementTab = 'feedback' | 'logs' | 'signals';
type FeedbackDateFilter = 'all' | '24h' | '7d' | '30d';

interface FeedbackManagementProps {
  onBack: () => void;
}

const TAB_OPTIONS: Array<{ value: FeedbackManagementTab; label: string }> = [
  { value: 'feedback', label: 'Feedback' },
  { value: 'logs', label: 'Logs' },
  { value: 'signals', label: 'Signals' },
];

const FEEDBACK_CATEGORY_OPTIONS: Array<{ value: FeedbackCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'ux_issue', label: 'UX issue' },
  { value: 'confusing_behavior', label: 'Confusing behavior' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

const LOG_LEVEL_OPTIONS: Array<{ value: ClientLogLevel | 'all'; label: string }> = [
  { value: 'all', label: 'All levels' },
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
];

const DATE_FILTER_OPTIONS: Array<{ value: FeedbackDateFilter; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

const LOG_LIMIT_OPTIONS = [50, 100, 150, 200];

const formatTimestamp = (timestamp: string) => new Date(timestamp).toLocaleString();

const getDateFilterCutoff = (value: FeedbackDateFilter): number | null => {
  const now = Date.now();
  if (value === '24h') return now - 24 * 60 * 60 * 1000;
  if (value === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (value === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  return null;
};

const matchesDateFilter = (timestamp: string, filter: FeedbackDateFilter) => {
  const cutoff = getDateFilterCutoff(filter);
  if (!cutoff) return true;
  return new Date(timestamp).getTime() >= cutoff;
};

const buildFeedbackPreview = (message: string) => (message.length > 120 ? `${message.slice(0, 120)}...` : message);

const buildLogSearchBlob = (entry: ClientLogEntry) =>
  `${entry.message} ${entry.eventType} ${entry.category} ${JSON.stringify(entry.metadata || {})}`.toLowerCase();

const getLevelTone = (level: ClientLogLevel) => {
  if (level === 'error') return 'bg-red-100 text-red-700';
  if (level === 'warn') return 'bg-amber-100 text-amber-800';
  if (level === 'info') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
};

const getPriorityTone = (priority: SignalPriority) => {
  if (priority === 'high') return 'bg-red-100 text-red-700 border-red-200';
  if (priority === 'medium') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const exportJson = (contents: string, fileName: string) => {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const destinationLabel = (destination: SignalDestination) => {
  if (destination === 'feedback') return 'Open feedback';
  if (destination === 'sessions') return 'Open sessions';
  return 'Open logs';
};

const uniqueIds = (values: string[]) => [...new Set(values)];

export const FeedbackManagement: React.FC<FeedbackManagementProps> = ({ onBack }) => {
  const { org, user } = useAppContext();
  const [activeTab, setActiveTab] = useState<FeedbackManagementTab>('feedback');
  const [feedbackRecords, setFeedbackRecords] = useState<FeedbackRecord[]>([]);
  const [logEntries, setLogEntries] = useState<ClientLogEntry[]>([]);
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState<FeedbackCategory | 'all'>('all');
  const [feedbackDateFilter, setFeedbackDateFilter] = useState<FeedbackDateFilter>('all');
  const [logLevelFilter, setLogLevelFilter] = useState<ClientLogLevel | 'all'>('all');
  const [logSearchText, setLogSearchText] = useState('');
  const [logLimit, setLogLimit] = useState(100);
  const [expandedFeedbackIds, setExpandedFeedbackIds] = useState<Set<string>>(new Set());
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [activeSignal, setActiveSignal] = useState<DerivedSignal | null>(null);
  const [sessionFocusIds, setSessionFocusIds] = useState<string[]>([]);
  const hasLoggedOpen = useRef(false);
  const hasLoggedFilterChange = useRef(false);
  const hasLoggedSignalView = useRef(false);

  const logger = useMemo(
    () =>
      ClientLoggerService.withContext({
        category: 'feedback_management',
        route: window.location.pathname || '/',
        screen: 'FeedbackManagement',
        contextIds: {
          orgId: org?.id,
          userId: user?.id,
        },
      }),
    [org?.id, user?.id],
  );

  const loadData = () => {
    setFeedbackRecords(FeedbackService.listFeedback().slice().reverse());
    setLogEntries(ClientLoggerService.getRecentEntries().slice().reverse());
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (hasLoggedOpen.current) return;
    hasLoggedOpen.current = true;
    logger.info('Feedback management opened.', {
      eventType: 'feedback_management.opened',
      metadata: {
        feedbackCount: FeedbackService.getFeedbackCount(),
        logCount: ClientLoggerService.getRecentEntries().length,
      },
    });
  }, [logger]);

  useEffect(() => {
    if (activeTab !== 'signals') {
      hasLoggedSignalView.current = false;
      return;
    }

    if (hasLoggedSignalView.current) return;
    hasLoggedSignalView.current = true;
    logger.info('Signal intelligence view opened.', {
      eventType: 'feedback_management.signal_viewed',
      metadata: {
        feedbackCount: feedbackRecords.length,
        logCount: logEntries.length,
      },
    });
  }, [activeTab, feedbackRecords.length, logEntries.length, logger]);

  const signalAnalysis = useMemo(() => SignalAnalysisService.analyze(feedbackRecords, logEntries), [feedbackRecords, logEntries]);

  const focusedFeedbackIdSet = useMemo(
    () => new Set(activeSignal ? activeSignal.navigationTarget.feedbackIds : []),
    [activeSignal],
  );
  const focusedLogIdSet = useMemo(() => new Set(activeSignal ? activeSignal.navigationTarget.logIds : []), [activeSignal]);
  const focusedSessionIdSet = useMemo(
    () => new Set(sessionFocusIds.length > 0 ? sessionFocusIds : activeSignal?.navigationTarget.sessionIds || []),
    [activeSignal, sessionFocusIds],
  );
  const focusedEventTypeSet = useMemo(
    () => new Set(activeSignal ? activeSignal.navigationTarget.logEventTypes : []),
    [activeSignal],
  );

  const filteredFeedbackRecords = useMemo(() => {
    return feedbackRecords.filter((record) => {
      if (feedbackCategoryFilter !== 'all' && record.category !== feedbackCategoryFilter) return false;
      if (!matchesDateFilter(record.timestamp, feedbackDateFilter)) return false;
      if (activeSignal && focusedFeedbackIdSet.size > 0 && !focusedFeedbackIdSet.has(record.id)) return false;
      return true;
    });
  }, [activeSignal, feedbackCategoryFilter, feedbackDateFilter, feedbackRecords, focusedFeedbackIdSet]);

  const filteredLogEntries = useMemo(() => {
    const normalizedSearch = logSearchText.trim().toLowerCase();

    const filtered = logEntries.filter((entry) => {
      if (logLevelFilter !== 'all' && entry.level !== logLevelFilter) return false;

      if (activeSignal) {
        const matchesSignalId = focusedLogIdSet.size === 0 || focusedLogIdSet.has(entry.id);
        const matchesSignalEvent = focusedEventTypeSet.size === 0 || focusedEventTypeSet.has(entry.eventType);
        const matchesSignalSession = focusedSessionIdSet.size === 0 || focusedSessionIdSet.has(entry.sessionId);
        if (!(matchesSignalId || (matchesSignalEvent && matchesSignalSession))) return false;
      }

      if (!normalizedSearch) return true;
      return buildLogSearchBlob(entry).includes(normalizedSearch);
    });

    return filtered.slice(0, logLimit);
  }, [activeSignal, focusedEventTypeSet, focusedLogIdSet, focusedSessionIdSet, logEntries, logLevelFilter, logLimit, logSearchText]);

  const visibleSessions = useMemo(() => {
    const sourceEntries =
      focusedSessionIdSet.size > 0
        ? logEntries.filter((entry) => focusedSessionIdSet.has(entry.sessionId))
        : filteredLogEntries;

    const grouped = sourceEntries.reduce<Record<string, ClientLogEntry[]>>((accumulator, entry) => {
      if (!accumulator[entry.sessionId]) accumulator[entry.sessionId] = [];
      accumulator[entry.sessionId].push(entry);
      return accumulator;
    }, {});

    return (Object.entries(grouped) as Array<[string, ClientLogEntry[]]>)
      .map(([sessionId, entries]) => ({
        sessionId,
        entries: entries
          .slice()
          .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
          .slice(-12),
      }))
      .sort((left, right) => {
        const leftLast = left.entries[left.entries.length - 1]?.timestamp || '';
        const rightLast = right.entries[right.entries.length - 1]?.timestamp || '';
        return rightLast.localeCompare(leftLast);
      })
      .slice(0, 6);
  }, [filteredLogEntries, focusedSessionIdSet, logEntries]);

  useEffect(() => {
    if (!hasLoggedFilterChange.current) {
      hasLoggedFilterChange.current = true;
      return;
    }

    logger.info('Feedback management filter applied.', {
      eventType: activeSignal ? 'feedback_management.signal_filter_applied' : 'feedback_management.filter_applied',
      metadata: {
        activeTab,
        feedbackCategoryFilter,
        feedbackDateFilter,
        logLevelFilter,
        logLimit,
        hasLogSearchText: logSearchText.trim().length > 0,
        signalId: activeSignal?.id,
        signalTitle: activeSignal?.title,
        signalDestination: activeSignal?.destination,
        focusedSessionCount: focusedSessionIdSet.size,
      },
    });
  }, [
    activeSignal,
    activeTab,
    feedbackCategoryFilter,
    feedbackDateFilter,
    focusedSessionIdSet,
    logLevelFilter,
    logLimit,
    logSearchText,
    logger,
  ]);

  const toggleExpandedFeedback = (id: string) => {
    setExpandedFeedbackIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandedLog = (id: string) => {
    setExpandedLogIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSignalFocus = () => {
    setActiveSignal(null);
    setSessionFocusIds([]);
  };

  const handleExportFeedbackRecord = (record: FeedbackRecord) => {
    FeedbackService.downloadFeedbackRecords([record], `unitflip-feedback-${record.id}.json`);
    logger.info('Feedback management export triggered.', {
      eventType: 'feedback_management.export_triggered',
      metadata: { exportType: 'single_feedback', feedbackId: record.id },
    });
  };

  const handleExportFilteredFeedback = () => {
    FeedbackService.downloadFeedbackRecords(
      filteredFeedbackRecords,
      `unitflip-feedback-filtered-${new Date().toISOString().slice(0, 10)}.json`,
    );
    logger.info('Feedback management export triggered.', {
      eventType: 'feedback_management.export_triggered',
      metadata: {
        exportType: 'filtered_feedback',
        exportCount: filteredFeedbackRecords.length,
        feedbackCategoryFilter,
        feedbackDateFilter,
        signalId: activeSignal?.id,
      },
    });
  };

  const handleExportFilteredLogs = () => {
    exportJson(
      JSON.stringify(filteredLogEntries, null, 2),
      `unitflip-logs-${new Date().toISOString().slice(0, 10)}.json`,
    );
    logger.info('Feedback management export triggered.', {
      eventType: 'feedback_management.export_triggered',
      metadata: {
        exportType: 'filtered_logs',
        exportCount: filteredLogEntries.length,
        logLevelFilter,
        logLimit,
        hasLogSearchText: logSearchText.trim().length > 0,
        signalId: activeSignal?.id,
      },
    });
  };

  const handleSignalNavigation = (signal: DerivedSignal, destinationOverride?: SignalDestination) => {
    const destination = destinationOverride || signal.destination;
    setActiveSignal(signal);
    setSessionFocusIds(destination === 'sessions' ? uniqueIds(signal.navigationTarget.sessionIds) : []);
    setExpandedFeedbackIds(new Set());
    setExpandedLogIds(new Set());

    if (destination === 'feedback') {
      setFeedbackCategoryFilter('all');
      setFeedbackDateFilter('all');
      setActiveTab('feedback');
    } else {
      setLogLevelFilter('all');
      setLogSearchText('');
      setLogLimit(100);
      setActiveTab('logs');
    }

    logger.info('Signal opened.', {
      eventType: 'feedback_management.signal_opened',
      metadata: {
        signalId: signal.id,
        signalTitle: signal.title,
        signalType: signal.kind,
        targetDestination: destination,
      },
    });

    logger.info('Signal navigation triggered.', {
      eventType: 'feedback_management.signal_navigation_triggered',
      metadata: {
        signalId: signal.id,
        signalTitle: signal.title,
        signalType: signal.kind,
        targetDestination: destination,
        affectedSessionCount: signal.sessionCount,
      },
    });
  };

  const renderSignalCard = (signal: DerivedSignal) => (
    <article key={signal.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${getPriorityTone(signal.priority)}`}>
              {signal.priority}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {signal.kind.replace('_', ' ')}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{signal.title}</h3>
          <p className="text-sm text-slate-600">{signal.summary}</p>
          <p className="text-xs text-slate-500">{signal.heuristic}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Count</p>
          <p className="text-lg font-semibold text-slate-900">{signal.count}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{signal.feedbackCount} feedback</span>
        <span>{signal.logCount} logs</span>
        <span>{signal.sessionCount} sessions</span>
        <span>Last seen {formatTimestamp(signal.lastSeen)}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleSignalNavigation(signal)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          {destinationLabel(signal.destination)}
          <ArrowRight size={14} />
        </button>
        {signal.sessionCount > 0 ? (
          <button
            type="button"
            onClick={() => handleSignalNavigation(signal, 'sessions')}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
          >
            View sessions
          </button>
        ) : null}
      </div>
    </article>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Retention &amp; Settings</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Feedback Management</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Developer-only read-only console for saved feedback, recent logs, deterministic issue signals, and session reconstruction.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Back to Retention &amp; Settings
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saved feedback</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{feedbackRecords.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recent logs</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{logEntries.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Top issues</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{signalAnalysis.topIssues.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Likely regressions</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{signalAnalysis.likelyRegressions.length}</p>
          </div>
        </div>
      </section>

      {activeSignal || sessionFocusIds.length > 0 ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                {activeSignal ? 'Signal focus active' : 'Session focus active'}
              </p>
              <p className="mt-1 text-sm font-semibold text-blue-900">
                {activeSignal ? activeSignal.title : `Focused session ${sessionFocusIds[0]}`}
              </p>
              <p className="mt-1 text-sm text-blue-800">
                {activeSignal
                  ? `Showing related ${activeSignal.destination === 'feedback' ? 'feedback' : 'logs'} and ${activeSignal.sessionCount} affected sessions.`
                  : 'Showing the recent timeline for the selected affected session.'}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSignalFocus}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-800"
            >
              <X size={14} />
              Clear signal focus
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setActiveTab(option.value)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === option.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'feedback' ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-sm text-slate-600">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Category</span>
                <select
                  value={feedbackCategoryFilter}
                  onChange={(event) => setFeedbackCategoryFilter(event.target.value as FeedbackCategory | 'all')}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue"
                >
                  {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Date</span>
                <select
                  value={feedbackDateFilter}
                  onChange={(event) => setFeedbackDateFilter(event.target.value as FeedbackDateFilter)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue"
                >
                  {DATE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={handleExportFilteredFeedback}
              disabled={filteredFeedbackRecords.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={14} />
              Export Filtered
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {filteredFeedbackRecords.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No feedback matches the current filters.
              </div>
            ) : (
              filteredFeedbackRecords.map((record) => {
                const isExpanded = expandedFeedbackIds.has(record.id);
                return (
                  <article key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50/60">
                    <button
                      type="button"
                      onClick={() => toggleExpandedFeedback(record.id)}
                      className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                            {record.category.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-slate-500">{formatTimestamp(record.timestamp)}</span>
                          {record.diagnosticsIncluded ? (
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">
                              Diagnostics
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-900">{buildFeedbackPreview(record.message)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleExportFeedbackRecord(record);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                        >
                          <Download size={12} />
                          Export
                        </button>
                        {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{record.message}</p>
                            </div>
                            {record.diagnostics?.recentLogs?.length ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attached logs</p>
                                <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                  {record.diagnostics.recentLogs.map((entry) => (
                                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${getLevelTone(entry.level)}`}>
                                          {entry.level}
                                        </span>
                                        <span className="text-xs text-slate-500">{entry.eventType}</span>
                                        <span className="text-xs text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                                      </div>
                                      <p className="mt-2 text-xs text-slate-700">{entry.message}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context</p>
                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                                {JSON.stringify(record.context || { note: 'No route/context attached.' }, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}
      {activeTab === 'logs' ? (
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm text-slate-600">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Level</span>
                  <select
                    value={logLevelFilter}
                    onChange={(event) => setLogLevelFilter(event.target.value as ClientLogLevel | 'all')}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue"
                  >
                    {LOG_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Limit</span>
                  <select
                    value={logLimit}
                    onChange={(event) => setLogLimit(Number(event.target.value))}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-lowes-blue"
                  >
                    {LOG_LIMIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2 text-sm text-slate-600">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Search</span>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <Search size={14} className="text-slate-400" />
                    <input
                      value={logSearchText}
                      onChange={(event) => setLogSearchText(event.target.value)}
                      placeholder="Search message, event, or metadata"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                </label>
              </div>
              <button
                type="button"
                onClick={handleExportFilteredLogs}
                disabled={filteredLogEntries.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={14} />
                Export Filtered Logs
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {filteredLogEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No logs match the current filters.
                </div>
              ) : (
                filteredLogEntries.map((entry) => {
                  const isExpanded = expandedLogIds.has(entry.id);
                  return (
                    <article key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50/60">
                      <button
                        type="button"
                        onClick={() => toggleExpandedLog(entry.id)}
                        className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${getLevelTone(entry.level)}`}>
                              {entry.level}
                            </span>
                            <span className="text-xs font-medium text-slate-700">{entry.eventType}</span>
                            <span className="text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</span>
                          </div>
                          <p className="mt-2 truncate text-sm text-slate-900">{entry.message}</p>
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                      </button>

                      {isExpanded ? (
                        <div className="border-t border-slate-200 bg-white px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
                            <div className="space-y-2 text-sm text-slate-700">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message</p>
                                <p className="mt-1">{entry.message}</p>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Route</p>
                                  <p className="mt-1 text-sm text-slate-700">{entry.route}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session</p>
                                  <p className="mt-1 break-all text-sm text-slate-700">{entry.sessionId}</p>
                                </div>
                              </div>
                              {entry.contextIds ? (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context ids</p>
                                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                                    {JSON.stringify(entry.contextIds, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metadata</p>
                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                                {JSON.stringify(entry.metadata || { note: 'No metadata attached.' }, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <FolderSearch size={16} className="text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">Session Timeline</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">Recent session-scoped event sequences to reconstruct what happened before a failure.</p>

            <div className="mt-5 space-y-4">
              {visibleSessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No session data available for the current filters.
                </div>
              ) : (
                visibleSessions.map((session) => (
                  <article key={session.sessionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session</p>
                        <p className="break-all text-sm font-medium text-slate-900">{session.sessionId}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {session.entries.length} events
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {session.entries.map((entry) => (
                        <div key={entry.id} className="flex items-start gap-3">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${getLevelTone(entry.level)}`}>
                                {entry.level}
                              </span>
                              <span className="text-xs font-medium text-slate-700">{entry.eventType}</span>
                              <span className="text-xs text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-700">{entry.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}
      {activeTab === 'signals' ? (
        <section className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">Top Issues</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">Cross-surface issues grouped from feedback and logs using deterministic workflow area rules.</p>
              <div className="mt-5 space-y-3">
                {signalAnalysis.topIssues.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No top issues detected in the current local data window.
                  </div>
                ) : (
                  signalAnalysis.topIssues.map(renderSignalCard)
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">Repeated Failures</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">Same failure/error events repeated within the bounded recent log history.</p>
              <div className="mt-5 space-y-3">
                {signalAnalysis.repeatedFailures.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No repeated failure patterns detected.
                  </div>
                ) : (
                  signalAnalysis.repeatedFailures.map(renderSignalCard)
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <MessageSquareWarning size={16} className="text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">Workflow Confusion</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">Repeated UX/confusing feedback themes grouped by deterministic workflow keywords.</p>
              <div className="mt-5 space-y-3">
                {signalAnalysis.workflowConfusion.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No repeated workflow confusion signals detected.
                  </div>
                ) : (
                  signalAnalysis.workflowConfusion.map(renderSignalCard)
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ArrowRight size={16} className="text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">Likely Regressions</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">Recent-half versus older-half comparison across the bounded recent log window.</p>
              <div className="mt-5 space-y-3">
                {signalAnalysis.likelyRegressions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No likely regressions detected by the current deterministic thresholds.
                  </div>
                ) : (
                  signalAnalysis.likelyRegressions.map(renderSignalCard)
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <FolderSearch size={16} className="text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">Affected Sessions</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">Sessions touched by one or more current signals. Use these to reconstruct what happened around a problem.</p>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {signalAnalysis.affectedSessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 lg:col-span-2">
                  No session clusters are currently associated with the derived signals.
                </div>
              ) : (
                signalAnalysis.affectedSessions.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => {
                      setActiveSignal(null);
                      setSessionFocusIds([session.sessionId]);
                      setActiveTab('logs');
                      logger.info('Signal navigation triggered.', {
                        eventType: 'feedback_management.signal_navigation_triggered',
                        metadata: {
                          signalType: 'affected_session',
                          signalId: session.signalIds[0] || 'session-cluster',
                          signalTitle: session.signalTitles[0] || 'Session cluster',
                          targetDestination: 'sessions',
                          sessionId: session.sessionId,
                        },
                      });
                    }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{session.sessionId}</p>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
                        {session.signalIds.length} signals
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">Last seen {formatTimestamp(session.lastSeen)}</p>
                    <p className="mt-2 text-xs text-slate-500">{session.signalTitles.slice(0, 3).join(' • ')}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};

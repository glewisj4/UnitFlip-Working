import { ClientLogEntry } from './ClientLoggerService';
import { FeedbackCategory, FeedbackRecord } from './FeedbackService';

export type SignalPriority = 'high' | 'medium' | 'low';
export type SignalKind = 'top_issue' | 'repeated_failure' | 'workflow_confusion' | 'likely_regression';
export type SignalDestination = 'feedback' | 'logs' | 'sessions';

export interface SignalNavigationTarget {
  destination: SignalDestination;
  feedbackIds: string[];
  logIds: string[];
  sessionIds: string[];
  feedbackCategories: FeedbackCategory[];
  logEventTypes: string[];
  logSearchText?: string;
}

export interface DerivedSignal {
  id: string;
  kind: SignalKind;
  title: string;
  summary: string;
  heuristic: string;
  priority: SignalPriority;
  count: number;
  feedbackCount: number;
  logCount: number;
  sessionCount: number;
  lastSeen: string;
  destination: SignalDestination;
  navigationTarget: SignalNavigationTarget;
}

export interface SignalAffectedSession {
  sessionId: string;
  signalIds: string[];
  signalTitles: string[];
  eventCount: number;
  lastSeen: string;
}

export interface SignalAnalysisResult {
  topIssues: DerivedSignal[];
  repeatedFailures: DerivedSignal[];
  workflowConfusion: DerivedSignal[];
  likelyRegressions: DerivedSignal[];
  affectedSessions: SignalAffectedSession[];
}

interface AggregateBucket {
  id: string;
  area: AreaKey;
  title: string;
  feedbackIds: Set<string>;
  logIds: Set<string>;
  sessionIds: Set<string>;
  feedbackCategories: Set<FeedbackCategory>;
  logEventTypes: Set<string>;
  feedbackCount: number;
  logCount: number;
  lastSeen: string;
  failureCount: number;
}

type AreaKey = 'checklist' | 'media' | 'capture' | 'inspection' | 'performance' | 'sync' | 'feedback' | 'general';

const AREA_LABELS: Record<AreaKey, string> = {
  checklist: 'Checklist workflow',
  media: 'Media workflow',
  capture: 'Capture workflow',
  inspection: 'Inspection workspace',
  performance: 'Performance',
  sync: 'Sync/offline flow',
  feedback: 'Feedback system',
  general: 'General workflow',
};

const AREA_KEYWORDS: Record<AreaKey, string[]> = {
  checklist: ['checklist', 'good', 'repair', 'replace', 'missing', 'draft item', 'save & next'],
  media: ['media', 'photo', 'photos', 'upload', 'attachment', 'attachments', 'camera', 'image', 'remove photo'],
  capture: ['capture', 'captured', 'parser', 'commit', 'finding', 'task', 'feed', 'draft mode'],
  inspection: ['inspection', 'workspace', 'room', 'inspection detail'],
  performance: ['slow', 'lag', 'performance', 'stuck', 'freeze'],
  sync: ['sync', 'offline', 'online', 'network'],
  feedback: ['feedback'],
  general: [],
};

const FEEDBACK_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'before',
  'being',
  'button',
  'click',
  'could',
  'draft',
  'from',
  'have',
  'into',
  'item',
  'just',
  'need',
  'screen',
  'save',
  'that',
  'there',
  'this',
  'when',
  'with',
]);

const parseTimestamp = (value: string) => new Date(value).getTime();

const maxTimestamp = (left?: string, right?: string) => {
  if (!left) return right || new Date(0).toISOString();
  if (!right) return left;
  return parseTimestamp(left) >= parseTimestamp(right) ? left : right;
};

const unique = <T>(values: Iterable<T>) => [...new Set(values)];

const sanitizeToken = (value: string) => value.trim().toLowerCase();

const areaFromText = (value: string): AreaKey => {
  const normalized = sanitizeToken(value);

  if (/(photo|upload|media|attachment|camera|image)/.test(normalized)) return 'media';
  if (/(checklist|good|replace|repair|missing|draft)/.test(normalized)) return 'checklist';
  if (/(capture|finding|task|parser|commit|feed)/.test(normalized)) return 'capture';
  if (/(inspection|workspace|room)/.test(normalized)) return 'inspection';
  if (/(slow|lag|performance|freeze|stuck)/.test(normalized)) return 'performance';
  if (/(sync|offline|online|network)/.test(normalized)) return 'sync';
  if (/feedback/.test(normalized)) return 'feedback';
  return 'general';
};

const tokenizeFeedbackMessage = (message: string) =>
  message
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4 && !FEEDBACK_STOP_WORDS.has(token));

const buildPriority = (params: {
  count: number;
  sessionCount: number;
  failureCount: number;
  hasFeedback: boolean;
  hasLogs: boolean;
  recentBias?: boolean;
}): SignalPriority => {
  if (
    params.failureCount >= 3 ||
    params.count >= 6 ||
    params.sessionCount >= 3 ||
    (params.hasFeedback && params.hasLogs && params.count >= 4) ||
    params.recentBias
  ) {
    return 'high';
  }

  if (params.failureCount >= 1 || params.count >= 3 || params.sessionCount >= 2 || (params.hasFeedback && params.hasLogs)) {
    return 'medium';
  }

  return 'low';
};

const buildSignalId = (kind: SignalKind, key: string) => `${kind}:${key}`;

const byCountThenRecency = <T extends { count: number; lastSeen: string }>(left: T, right: T) =>
  right.count - left.count || parseTimestamp(right.lastSeen) - parseTimestamp(left.lastSeen);

export const SignalAnalysisService = {
  analyze(feedbackRecords: FeedbackRecord[], logEntries: ClientLogEntry[]): SignalAnalysisResult {
    const topIssueBuckets = new Map<string, AggregateBucket>();
    const failureBuckets = new Map<string, AggregateBucket>();
    const confusionBuckets = new Map<string, AggregateBucket>();
    const logSignalMembership = new Map<string, Set<string>>();

    const attachSignalToLogs = (logIds: Iterable<string>, signalId: string) => {
      unique(logIds).forEach((logId) => {
        const existing = logSignalMembership.get(logId) || new Set<string>();
        existing.add(signalId);
        logSignalMembership.set(logId, existing);
      });
    };

    const ensureBucket = (
      store: Map<string, AggregateBucket>,
      id: string,
      area: AreaKey,
      title: string,
    ): AggregateBucket => {
      const existing = store.get(id);
      if (existing) return existing;

      const next: AggregateBucket = {
        id,
        area,
        title,
        feedbackIds: new Set<string>(),
        logIds: new Set<string>(),
        sessionIds: new Set<string>(),
        feedbackCategories: new Set<FeedbackCategory>(),
        logEventTypes: new Set<string>(),
        feedbackCount: 0,
        logCount: 0,
        lastSeen: new Date(0).toISOString(),
        failureCount: 0,
      };
      store.set(id, next);
      return next;
    };

    feedbackRecords.forEach((record) => {
      const area = areaFromText(`${record.category} ${record.message}`);
      const issueBucket = ensureBucket(
        topIssueBuckets,
        area,
        area,
        `${AREA_LABELS[area]} issues`,
      );
      issueBucket.feedbackIds.add(record.id);
      issueBucket.feedbackCategories.add(record.category);
      issueBucket.feedbackCount += 1;
      issueBucket.lastSeen = maxTimestamp(issueBucket.lastSeen, record.timestamp);
      issueBucket.sessionIds.add(record.sessionId);

      if (record.category === 'confusing_behavior' || record.category === 'ux_issue') {
        const tokens = tokenizeFeedbackMessage(record.message).slice(0, 2);
        const tokenKey = tokens.length > 0 ? tokens.join('-') : area;
        const confusionBucket = ensureBucket(
          confusionBuckets,
          `${area}:${tokenKey}`,
          area,
          tokens.length > 0
            ? `${AREA_LABELS[area]} confusion around "${tokens.join(' ')}"`
            : `${AREA_LABELS[area]} confusion`,
        );
        confusionBucket.feedbackIds.add(record.id);
        confusionBucket.feedbackCategories.add(record.category);
        confusionBucket.feedbackCount += 1;
        confusionBucket.lastSeen = maxTimestamp(confusionBucket.lastSeen, record.timestamp);
        confusionBucket.sessionIds.add(record.sessionId);
      }
    });

    logEntries.forEach((entry) => {
      const area = areaFromText(`${entry.eventType} ${entry.message}`);
      const issueBucket = ensureBucket(
        topIssueBuckets,
        area,
        area,
        `${AREA_LABELS[area]} issues`,
      );
      issueBucket.logIds.add(entry.id);
      issueBucket.logEventTypes.add(entry.eventType);
      issueBucket.logCount += 1;
      issueBucket.lastSeen = maxTimestamp(issueBucket.lastSeen, entry.timestamp);
      issueBucket.sessionIds.add(entry.sessionId);

      const looksLikeFailure =
        entry.level === 'error' ||
        entry.eventType.includes('failed') ||
        entry.eventType.includes('error') ||
        entry.eventType.includes('rejection');

      if (looksLikeFailure) {
        issueBucket.failureCount += 1;

        const failureBucket = ensureBucket(
          failureBuckets,
          entry.eventType,
          area,
          entry.eventType.replace(/[._]/g, ' '),
        );
        failureBucket.logIds.add(entry.id);
        failureBucket.logEventTypes.add(entry.eventType);
        failureBucket.logCount += 1;
        failureBucket.lastSeen = maxTimestamp(failureBucket.lastSeen, entry.timestamp);
        failureBucket.sessionIds.add(entry.sessionId);
        failureBucket.failureCount += 1;
      }
    });

    const topIssues = [...topIssueBuckets.values()]
      .filter((bucket) => bucket.feedbackCount + bucket.logCount >= 2)
      .map<DerivedSignal>((bucket) => {
        const count = bucket.feedbackCount + bucket.logCount;
        const priority = buildPriority({
          count,
          sessionCount: bucket.sessionIds.size,
          failureCount: bucket.failureCount,
          hasFeedback: bucket.feedbackCount > 0,
          hasLogs: bucket.logCount > 0,
        });

        return {
          id: buildSignalId('top_issue', bucket.id),
          kind: 'top_issue',
          title: bucket.title,
          summary: `${count} related signals across ${bucket.logCount} logs and ${bucket.feedbackCount} feedback reports.`,
          heuristic: 'Grouped by deterministic workflow area keywords across bounded feedback and recent logs.',
          priority,
          count,
          feedbackCount: bucket.feedbackCount,
          logCount: bucket.logCount,
          sessionCount: bucket.sessionIds.size,
          lastSeen: bucket.lastSeen,
          destination: bucket.logCount >= bucket.feedbackCount ? 'logs' : 'feedback',
          navigationTarget: {
            destination: bucket.logCount >= bucket.feedbackCount ? 'logs' : 'feedback',
            feedbackIds: unique(bucket.feedbackIds),
            logIds: unique(bucket.logIds),
            sessionIds: unique(bucket.sessionIds),
            feedbackCategories: unique(bucket.feedbackCategories),
            logEventTypes: unique(bucket.logEventTypes),
            logSearchText: AREA_KEYWORDS[bucket.area][0],
          },
        };
      })
      .sort(byCountThenRecency)
      .slice(0, 8);

    const repeatedFailures = [...failureBuckets.values()]
      .filter((bucket) => bucket.logCount >= 2)
      .map<DerivedSignal>((bucket) => ({
        id: buildSignalId('repeated_failure', bucket.id),
        kind: 'repeated_failure',
        title: bucket.title,
        summary: `${bucket.logCount} repeated failure logs across ${bucket.sessionIds.size} sessions.`,
        heuristic: 'Same error/failure event name appeared at least twice in the bounded recent log window.',
        priority: buildPriority({
          count: bucket.logCount,
          sessionCount: bucket.sessionIds.size,
          failureCount: bucket.failureCount,
          hasFeedback: false,
          hasLogs: true,
        }),
        count: bucket.logCount,
        feedbackCount: 0,
        logCount: bucket.logCount,
        sessionCount: bucket.sessionIds.size,
        lastSeen: bucket.lastSeen,
        destination: 'logs',
        navigationTarget: {
          destination: 'logs',
          feedbackIds: [],
          logIds: unique(bucket.logIds),
          sessionIds: unique(bucket.sessionIds),
          feedbackCategories: [],
          logEventTypes: unique(bucket.logEventTypes),
          logSearchText: bucket.title,
        },
      }))
      .sort(byCountThenRecency)
      .slice(0, 8);

    const workflowConfusion = [...confusionBuckets.values()]
      .filter((bucket) => bucket.feedbackCount >= 2)
      .map<DerivedSignal>((bucket) => ({
        id: buildSignalId('workflow_confusion', bucket.id),
        kind: 'workflow_confusion',
        title: bucket.title,
        summary: `${bucket.feedbackCount} confusing/UX feedback reports across ${bucket.sessionIds.size} sessions.`,
        heuristic: 'Grouped from feedback categories `ux_issue` and `confusing_behavior` using deterministic message keywords.',
        priority: buildPriority({
          count: bucket.feedbackCount,
          sessionCount: bucket.sessionIds.size,
          failureCount: 0,
          hasFeedback: true,
          hasLogs: bucket.logIds.size > 0,
        }),
        count: bucket.feedbackCount,
        feedbackCount: bucket.feedbackCount,
        logCount: 0,
        sessionCount: bucket.sessionIds.size,
        lastSeen: bucket.lastSeen,
        destination: 'feedback',
        navigationTarget: {
          destination: 'feedback',
          feedbackIds: unique(bucket.feedbackIds),
          logIds: [],
          sessionIds: unique(bucket.sessionIds),
          feedbackCategories: unique(bucket.feedbackCategories),
          logEventTypes: [],
        },
      }))
      .sort(byCountThenRecency)
      .slice(0, 8);

    const likelyRegressions = (() => {
      const sortedLogs = logEntries
        .slice()
        .sort((left, right) => parseTimestamp(left.timestamp) - parseTimestamp(right.timestamp));
      const midpoint = Math.floor(sortedLogs.length / 2);
      const olderLogs = sortedLogs.slice(0, midpoint);
      const recentLogs = sortedLogs.slice(midpoint);

      const olderCounts = olderLogs.reduce<Record<string, { count: number; sessions: Set<string> }>>((acc, entry) => {
        const bucket = acc[entry.eventType] || { count: 0, sessions: new Set<string>() };
        bucket.count += 1;
        bucket.sessions.add(entry.sessionId);
        acc[entry.eventType] = bucket;
        return acc;
      }, {});

      const recentCounts = recentLogs.reduce<Record<string, { count: number; sessions: Set<string>; lastSeen: string; ids: string[] }>>(
        (acc, entry) => {
          const bucket = acc[entry.eventType] || { count: 0, sessions: new Set<string>(), lastSeen: entry.timestamp, ids: [] as string[] };
          bucket.count += 1;
          bucket.sessions.add(entry.sessionId);
          bucket.lastSeen = maxTimestamp(bucket.lastSeen, entry.timestamp);
          bucket.ids.push(entry.id);
          acc[entry.eventType] = bucket;
          return acc;
        },
        {},
      );

      return Object.entries(recentCounts)
        .map(([eventType, recent]) => {
          const older = olderCounts[eventType]?.count || 0;
          const qualifies =
            recent.count >= 2 && ((older === 0 && recent.count >= 3) || (older > 0 && recent.count >= older * 2 && recent.count > older));

          if (!qualifies) return null;

          const relatedFeedbackIds = feedbackRecords
            .filter((record) => areaFromText(`${record.category} ${record.message}`) === areaFromText(eventType))
            .map((record) => record.id);

          return {
            id: buildSignalId('likely_regression', eventType),
            kind: 'likely_regression' as const,
            title: `${eventType.replace(/[._]/g, ' ')} increased recently`,
            summary: `${recent.count} recent events versus ${older} in the older visible window.`,
            heuristic: 'Compared recent half vs older half of the bounded recent log history for the same event name.',
            priority: buildPriority({
              count: recent.count,
              sessionCount: recent.sessions.size,
              failureCount: /failed|error|rejection/.test(eventType) ? recent.count : 0,
              hasFeedback: relatedFeedbackIds.length > 0,
              hasLogs: true,
              recentBias: true,
            }),
            count: recent.count,
            feedbackCount: relatedFeedbackIds.length,
            logCount: recent.count,
            sessionCount: recent.sessions.size,
            lastSeen: recent.lastSeen,
            destination: 'logs' as const,
            navigationTarget: {
              destination: 'logs' as const,
              feedbackIds: relatedFeedbackIds,
              logIds: recent.ids,
              sessionIds: unique(recent.sessions),
              feedbackCategories: [],
              logEventTypes: [eventType],
              logSearchText: eventType,
            },
          };
        })
        .filter((signal) => signal !== null)
        .sort(byCountThenRecency)
        .slice(0, 8);
    })();

    const allSignals = [...topIssues, ...repeatedFailures, ...workflowConfusion, ...likelyRegressions];

    allSignals.forEach((signal) => attachSignalToLogs(signal.navigationTarget.logIds, signal.id));

    const affectedSessions = (() => {
      const sessionIndex = new Map<string, SignalAffectedSession>();

      allSignals.forEach((signal) => {
        signal.navigationTarget.sessionIds.forEach((sessionId) => {
          const existing =
            sessionIndex.get(sessionId) ||
            {
              sessionId,
              signalIds: [],
              signalTitles: [],
              eventCount: 0,
              lastSeen: new Date(0).toISOString(),
            };

          existing.signalIds.push(signal.id);
          existing.signalTitles.push(signal.title);
          existing.lastSeen = maxTimestamp(existing.lastSeen, signal.lastSeen);
          sessionIndex.set(sessionId, existing);
        });
      });

      logEntries.forEach((entry) => {
        const existing = sessionIndex.get(entry.sessionId);
        if (!existing) return;
        existing.eventCount += 1;
        existing.lastSeen = maxTimestamp(existing.lastSeen, entry.timestamp);
      });

      return [...sessionIndex.values()]
        .sort((left, right) => right.signalIds.length - left.signalIds.length || parseTimestamp(right.lastSeen) - parseTimestamp(left.lastSeen))
        .slice(0, 8);
    })();

    return {
      topIssues,
      repeatedFailures,
      workflowConfusion,
      likelyRegressions,
      affectedSessions,
    };
  },
};

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ClientLogContextIds {
  orgId?: string;
  userId?: string;
  inspectionId?: string;
  roomId?: string;
  checklistItemId?: string;
  checklistSectionId?: string;
  [key: string]: string | undefined;
}

export interface ClientLogContext {
  category?: string;
  eventType?: string;
  route?: string;
  screen?: string;
  contextIds?: ClientLogContextIds;
  metadata?: Record<string, unknown>;
}

export interface ClientLogEntry {
  id: string;
  timestamp: string;
  level: ClientLogLevel;
  message: string;
  category: string;
  eventType: string;
  route: string;
  screen: string;
  sessionId: string;
  appVersion: string;
  buildId: string;
  contextIds?: ClientLogContextIds;
  metadata?: Record<string, unknown>;
}

interface ClientLogger {
  debug: (message: string, context?: ClientLogContext) => ClientLogEntry;
  info: (message: string, context?: ClientLogContext) => ClientLogEntry;
  warn: (message: string, context?: ClientLogContext) => ClientLogEntry;
  error: (message: string, context?: ClientLogContext) => ClientLogEntry;
}

const LOG_STORAGE_KEY = 'unitflip:client-logs:v1';
const SESSION_STORAGE_KEY = 'unitflip:client-session:v1';
const MAX_MEMORY_LOGS = 200;
const MAX_PERSISTED_LOGS = 100;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS = 25;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;
const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const REDACTED_KEY_PATTERN = /(password|secret|token|authorization|cookie|session|base64|binary|blob|dataurl|imageData|fileData)/i;

const getSafeRoute = () => {
  try {
    return window.location.pathname || 'unknown';
  } catch {
    return 'unknown';
  }
};

const generateId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to deterministic-enough local fallback.
  }

  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const readStorageValue = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageValue = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Logging should never crash the UI.
  }
};

const removeStorageValue = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // Logging should never crash the UI.
  }
};

const getSessionId = () => {
  try {
    const existing = readStorageValue(window.sessionStorage, SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = generateId();
    writeStorageValue(window.sessionStorage, SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return generateId();
  }
};

const sanitizeValue = (value: unknown, depth = 0, keyName?: string): unknown => {
  if (keyName && REDACTED_KEY_PATTERN.test(keyName)) {
    return REDACTED;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)} ${TRUNCATED}` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? sanitizeValue(value.stack, depth + 1) : undefined,
    };
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      type: value.type || 'application/octet-stream',
      size: value.size,
      redacted: true,
    };
  }

  if (typeof File !== 'undefined' && value instanceof File) {
    return {
      name: value.name,
      type: value.type || 'application/octet-stream',
      size: value.size,
      redacted: true,
    };
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return TRUNCATED;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_METADATA_KEYS);
    return entries.reduce<Record<string, unknown>>((accumulator, [key, entryValue]) => {
      accumulator[key] = sanitizeValue(entryValue, depth + 1, key);
      return accumulator;
    }, {});
  }

  return String(value);
};

const sanitizeMetadata = (metadata?: Record<string, unknown>) => {
  if (!metadata) return undefined;
  return sanitizeValue(metadata) as Record<string, unknown>;
};

const readPersistedLogs = (): ClientLogEntry[] => {
  try {
    const raw = readStorageValue(window.localStorage, LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClientLogEntry[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_PERSISTED_LOGS) : [];
  } catch {
    removeStorageValue(window.localStorage, LOG_STORAGE_KEY);
    return [];
  }
};

export class ClientLoggerService {
  private static sessionId = getSessionId();
  private static recentEntries: ClientLogEntry[] = readPersistedLogs();

  static getSessionId() {
    return this.sessionId;
  }

  static getRecentEntries() {
    return [...this.recentEntries];
  }

  static clearHistory() {
    this.recentEntries = [];
    try {
      removeStorageValue(window.localStorage, LOG_STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }

  static withContext(baseContext: ClientLogContext): ClientLogger {
    return {
      debug: (message, context) => this.debug(message, this.mergeContext(baseContext, context)),
      info: (message, context) => this.info(message, this.mergeContext(baseContext, context)),
      warn: (message, context) => this.warn(message, this.mergeContext(baseContext, context)),
      error: (message, context) => this.error(message, this.mergeContext(baseContext, context)),
    };
  }

  static mergeContext(baseContext?: ClientLogContext, context?: ClientLogContext): ClientLogContext {
    return {
      category: context?.category || baseContext?.category,
      eventType: context?.eventType || baseContext?.eventType,
      route: context?.route || baseContext?.route,
      screen: context?.screen || baseContext?.screen,
      contextIds: {
        ...(baseContext?.contextIds || {}),
        ...(context?.contextIds || {}),
      },
      metadata: {
        ...(baseContext?.metadata || {}),
        ...(context?.metadata || {}),
      },
    };
  }

  static debug(message: string, context?: ClientLogContext) {
    return this.log('debug', message, context);
  }

  static info(message: string, context?: ClientLogContext) {
    return this.log('info', message, context);
  }

  static warn(message: string, context?: ClientLogContext) {
    return this.log('warn', message, context);
  }

  static error(message: string, context?: ClientLogContext) {
    return this.log('error', message, context);
  }

  private static log(level: ClientLogLevel, message: string, context?: ClientLogContext): ClientLogEntry {
    const entry: ClientLogEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      category: context?.category || 'app',
      eventType: context?.eventType || 'app.event',
      route: context?.route || getSafeRoute(),
      screen: context?.screen || context?.route || 'unknown',
      sessionId: this.sessionId,
      appVersion: import.meta.env.VITE_APP_VERSION || '0.0.0',
      buildId: import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_APP_VERSION || 'dev',
      contextIds: context?.contextIds,
      metadata: sanitizeMetadata(context?.metadata),
    };

    try {
      this.recentEntries = [...this.recentEntries, entry].slice(-MAX_MEMORY_LOGS);
      writeStorageValue(window.localStorage, LOG_STORAGE_KEY, JSON.stringify(this.recentEntries.slice(-MAX_PERSISTED_LOGS)));
    } catch {
      // Ignore storage errors.
    }

    const consoleMethod =
      level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'info' ? console.info : console.debug;
    consoleMethod('[ClientLogger]', entry);

    return entry;
  }
}

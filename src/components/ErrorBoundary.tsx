import * as React from 'react';
import { useEffect } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { ClientLoggerService } from '../core/services/ClientLoggerService';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  surfaceName: string;
  screenName?: string;
  contextIds?: Record<string, string | undefined>;
  metadata?: Record<string, unknown>;
  onReturn?: () => void;
  returnLabel?: string;
  retryLabel?: string;
  resetKeys?: Array<string | number | null | undefined>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  retryNonce: number;
  errorId?: string;
  errorMessage?: string;
}

const areResetKeysEqual = (
  previousKeys: ErrorBoundaryProps['resetKeys'] = [],
  nextKeys: ErrorBoundaryProps['resetKeys'] = []
) =>
  previousKeys.length === nextKeys.length &&
  previousKeys.every((entry, index) => Object.is(entry, nextKeys[index]));

const getRoute = () => {
  try {
    return window.location.pathname || '/';
  } catch {
    return '/';
  }
};

const BoundaryDebugCrash: React.FC<{ surfaceName: string }> = ({ surfaceName }) => {
  if (!import.meta.env.DEV) return null;

  const params = new URLSearchParams(window.location.search);
  if (params.get('crashBoundary') === surfaceName) {
    throw new Error(`Boundary test crash triggered for ${surfaceName}`);
  }

  return null;
};

export class ErrorBoundary extends React.Component<any, any> {
  declare props: ErrorBoundaryProps;
  declare state: ErrorBoundaryState;
  declare setState: React.Component<ErrorBoundaryProps, ErrorBoundaryState>['setState'];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryNonce: 0,
    } satisfies ErrorBoundaryState;
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorId = `${this.props.surfaceName}_${Date.now()}`;
    this.setState({ errorId });

    ClientLoggerService.error(
      `Error boundary triggered for ${this.props.surfaceName}.`,
      {
        category: 'ui.error_boundary',
        eventType: 'ui.error_boundary.triggered',
        route: getRoute(),
        screen: this.props.screenName || this.props.surfaceName,
        contextIds: this.props.contextIds,
        metadata: {
          surfaceName: this.props.surfaceName,
          errorId,
          error,
          componentStack: errorInfo.componentStack,
          ...(this.props.metadata || {}),
        },
      }
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && !areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)) {
      this.resetBoundary();
    }
  }

  private resetBoundary = () => {
    this.setState((current) => ({
      hasError: false,
      retryNonce: current.retryNonce + 1,
      errorId: undefined,
      errorMessage: undefined,
    }));
  };

  private handleRetry = () => {
    ClientLoggerService.info(
      `Error boundary retry requested for ${this.props.surfaceName}.`,
      {
        category: 'ui.error_boundary',
        eventType: 'ui.error_boundary.retry_requested',
        route: getRoute(),
        screen: this.props.screenName || this.props.surfaceName,
        contextIds: this.props.contextIds,
        metadata: {
          surfaceName: this.props.surfaceName,
          errorId: this.state.errorId,
        },
      }
    );
    this.resetBoundary();
  };

  private handleReturn = () => {
    ClientLoggerService.info(
      `Error boundary return requested for ${this.props.surfaceName}.`,
      {
        category: 'ui.error_boundary',
        eventType: 'ui.error_boundary.return_requested',
        route: getRoute(),
        screen: this.props.screenName || this.props.surfaceName,
        contextIds: this.props.contextIds,
        metadata: {
          surfaceName: this.props.surfaceName,
          errorId: this.state.errorId,
        },
      }
    );
    this.props.onReturn?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-white p-2 text-amber-700">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-slate-900">This section hit an error.</h3>
              <p className="mt-1 text-sm text-slate-700">
                UnitFlip contained the problem to this part of the screen. Your recent work may still be available after a retry.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  <RefreshCw size={14} />
                  {this.props.retryLabel || 'Retry Section'}
                </button>
                {this.props.onReturn ? (
                  <button
                    type="button"
                    onClick={this.handleReturn}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    <ArrowLeft size={14} />
                    {this.props.returnLabel || 'Go Back'}
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                If retry does not help, refresh the app after finishing any recoverable work.
              </p>
              {import.meta.env.DEV ? (
                <details className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">Debug details</summary>
                  <div className="mt-2 space-y-1">
                    <div>Surface: {this.props.surfaceName}</div>
                    <div>Error ID: {this.state.errorId || 'unknown'}</div>
                    <div>Message: {this.state.errorMessage || 'unknown'}</div>
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    return (
      <React.Fragment key={this.state.retryNonce}>
        <BoundaryDebugCrash surfaceName={this.props.surfaceName} />
        {this.props.children}
      </React.Fragment>
    );
  }
}

export const ClientCrashCapture: React.FC<{ screenName?: string }> = ({ screenName = 'App' }) => {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      ClientLoggerService.error(
        'Unhandled runtime error captured.',
        {
          category: 'ui.crash_capture',
          eventType: 'ui.runtime_error',
          route: getRoute(),
          screen: screenName,
          metadata: {
            message: event.message,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
            error: event.error,
          },
        }
      );
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      ClientLoggerService.error(
        'Unhandled promise rejection captured.',
        {
          category: 'ui.crash_capture',
          eventType: 'ui.unhandled_rejection',
          route: getRoute(),
          screen: screenName,
          metadata: {
            reason: event.reason,
          },
        }
      );
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [screenName]);

  return null;
};

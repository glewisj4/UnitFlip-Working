import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Mic, PauseCircle, RotateCcw, Trash2, Waves } from 'lucide-react';
import { ClientLoggerService } from '../core/services/ClientLoggerService';
import {
  ActiveVoiceCaptureSession,
  VoiceCaptureError,
  VoiceCaptureEnvironment,
  VoiceCaptureResult,
  VoiceCaptureService,
} from '../core/services/VoiceCaptureService';

type VoiceCapturePanelState = 'idle' | 'recording' | 'processing' | 'preview' | 'failed';

interface VoiceCapturePanelProps {
  isOpen: boolean;
  disabled?: boolean;
  logContext?: {
    orgId?: string;
    userId?: string;
    inspectionId?: string;
    roomId?: string;
    roomLabel?: string;
  };
  onClose: () => void;
  onParseAndReview: (payload: { transcript: string; result: VoiceCaptureResult }) => Promise<void> | void;
  onSaveAsNote: (payload: { transcript: string; result: VoiceCaptureResult }) => Promise<void> | void;
}

const formatDuration = (durationMs?: number) => {
  if (!durationMs) return '0:00';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getTranscriptLengthBucket = (transcript: string) => {
  const length = transcript.trim().length;
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

const getCapabilityStatusTone = (supported: boolean) =>
  supported ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800';

const transcriptStateLabels: Record<VoiceCaptureResult['transcriptState'], string> = {
  available: 'Transcript ready',
  partial: 'Transcript may be incomplete',
  empty: 'No words detected',
  unsupported: 'Transcript unavailable',
};

export const VoiceCapturePanel: React.FC<VoiceCapturePanelProps> = ({
  isOpen,
  disabled = false,
  logContext,
  onClose,
  onParseAndReview,
  onSaveAsNote,
}) => {
  const [panelState, setPanelState] = useState<VoiceCapturePanelState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<ActiveVoiceCaptureSession | null>(null);
  const [result, setResult] = useState<VoiceCaptureResult | null>(null);
  const [editableTranscript, setEditableTranscript] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const capabilities = useMemo(() => VoiceCaptureService.getCapabilities(), []);
  const environment = useMemo<VoiceCaptureEnvironment>(() => VoiceCaptureService.getEnvironment(), []);
  const logger = useMemo(
    () =>
      ClientLoggerService.withContext({
        category: 'inspection.voice',
        eventType: 'inspection.voice_capture.event',
        route: window.location.pathname || '/inspection',
        screen: 'VoiceCapturePanel',
        contextIds: {
          orgId: logContext?.orgId,
          userId: logContext?.userId,
          inspectionId: logContext?.inspectionId,
          roomId: logContext?.roomId,
        },
      }),
    [logContext?.inspectionId, logContext?.orgId, logContext?.roomId, logContext?.userId],
  );

  const hasManualTranscriptFallback = Boolean(result && !result.transcriptAvailable && editableTranscript.trim().length > 0);
  const transcriptLooksWeak =
    Boolean(result?.transcriptAvailable) &&
    (result?.transcriptState === 'partial' ||
      editableTranscript.trim().length < 12 ||
      editableTranscript.trim().split(/\s+/).filter(Boolean).length <= 2);
  const hasActiveVoiceState =
    panelState !== 'idle' ||
    Boolean(session) ||
    Boolean(result) ||
    editableTranscript.trim().length > 0 ||
    Boolean(errorMessage);

  useEffect(() => {
    if (!result?.audioBlob) return undefined;

    const nextUrl = URL.createObjectURL(result.audioBlob);
    setAudioUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
      setAudioUrl((current) => (current === nextUrl ? null : current));
    };
  }, [result]);

  useEffect(() => {
    if (!isOpen) {
      setPanelState('idle');
      setErrorMessage(null);
      setResult(null);
      setEditableTranscript('');
      setSession(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    logger.info('Voice capture capabilities detected.', {
      eventType: 'inspection.voice_capture.capabilities_detected',
      metadata: {
        roomLabel: logContext?.roomLabel,
        recordingSupport: capabilities.recordingSupport,
        speechSupport: capabilities.speechSupport,
        mediaRecordingSupported: capabilities.mediaRecordingSupported,
        speechRecognitionSupported: capabilities.speechRecognitionSupported,
        browserFamily: environment.browserFamily,
        browserEngine: environment.engine,
        userAgentSnippet: environment.userAgentSnippet,
      },
    });
  }, [capabilities, environment.browserFamily, environment.engine, environment.userAgentSnippet, isOpen, logContext?.roomLabel, logger]);

  if (!isOpen) return null;

  const handleStartRecording = async () => {
    try {
      setErrorMessage(null);
      setPanelState('recording');
      const nextSession = await VoiceCaptureService.startCapture();
      setResult(null);
      setEditableTranscript('');
      setSession(nextSession);
      logger.info('Voice capture started.', {
        eventType: 'inspection.voice_capture.started',
        metadata: {
          roomLabel: logContext?.roomLabel,
          speechRecognitionSupported: nextSession.capabilities.speechRecognitionSupported,
          mediaRecordingSupported: nextSession.capabilities.mediaRecordingSupported,
          browserFamily: environment.browserFamily,
          browserEngine: environment.engine,
        },
      });
    } catch (error) {
      setPanelState('failed');
      const voiceError = error instanceof VoiceCaptureError ? error : null;
      setErrorMessage(voiceError?.message || (error instanceof Error ? error.message : 'Voice capture could not start.'));
      logger.error('Voice capture failed to start.', {
        eventType: 'inspection.voice_capture.failed',
        metadata: {
          roomLabel: logContext?.roomLabel,
          failureCode: voiceError?.code || 'recording_failed',
          permissionState: voiceError?.permissionState || 'unknown',
          recordingSupport: voiceError?.capabilities.recordingSupport || capabilities.recordingSupport,
          speechSupport: voiceError?.capabilities.speechSupport || capabilities.speechSupport,
          browserFamily: environment.browserFamily,
          browserEngine: environment.engine,
          error,
        },
      });
      if (voiceError?.permissionState === 'denied') {
        logger.warn('Voice capture microphone permission denied.', {
          eventType: 'inspection.voice_capture.permission_denied',
          metadata: {
            roomLabel: logContext?.roomLabel,
            permissionState: voiceError.permissionState,
            browserFamily: environment.browserFamily,
          },
        });
      }
    }
  };

  const handleStopRecording = async () => {
    if (!session) return;
    setPanelState('processing');
    logger.info('Voice capture processing started.', {
      eventType: 'inspection.voice_capture.processing_started',
        metadata: {
          roomLabel: logContext?.roomLabel,
          browserFamily: environment.browserFamily,
          browserEngine: environment.engine,
        },
      });
    try {
      const nextResult = await session.stop();
      setSession(null);
      setResult(nextResult);
      setEditableTranscript(nextResult.transcript);
      setErrorMessage(null);

      logger.info('Voice capture stopped.', {
        eventType: 'inspection.voice_capture.stopped',
        metadata: {
          roomLabel: logContext?.roomLabel,
          durationMs: nextResult.durationMs,
          durationBucket: getDurationBucket(nextResult.durationMs),
          transcriptAvailable: nextResult.transcriptAvailable,
          transcriptState: nextResult.transcriptState,
          browserFamily: environment.browserFamily,
          browserEngine: environment.engine,
          transcriptLengthBucket: getTranscriptLengthBucket(nextResult.transcript),
        },
      });
      logger.info('Voice capture processing completed.', {
        eventType: 'inspection.voice_capture.processing_completed',
        metadata: {
          roomLabel: logContext?.roomLabel,
          durationMs: nextResult.durationMs,
          durationBucket: getDurationBucket(nextResult.durationMs),
          transcriptAvailable: nextResult.transcriptAvailable,
          transcriptState: nextResult.transcriptState,
          recordingSupport: nextResult.capabilities.recordingSupport,
          speechSupport: nextResult.capabilities.speechSupport,
          permissionState: nextResult.permissionState,
          failureCode: nextResult.failureCode,
          audioAttachmentPresent: false,
          browserFamily: environment.browserFamily,
          browserEngine: environment.engine,
        },
      });

      if (nextResult.capabilities.speechSupport === 'unsupported') {
        logger.warn('Voice capture fell back because speech recognition is unsupported.', {
          eventType: 'inspection.voice_capture.unsupported_fallback_used',
          metadata: {
            roomLabel: logContext?.roomLabel,
            speechSupport: nextResult.capabilities.speechSupport,
            recordingSupport: nextResult.capabilities.recordingSupport,
            browserFamily: environment.browserFamily,
          },
        });
      }

      if (nextResult.transcriptState === 'empty') {
        logger.warn('Voice capture returned an empty transcript.', {
          eventType: 'inspection.voice_capture.empty_transcript_fallback_used',
          metadata: {
            roomLabel: logContext?.roomLabel,
            durationMs: nextResult.durationMs,
            durationBucket: getDurationBucket(nextResult.durationMs),
            browserFamily: environment.browserFamily,
          },
        });
      }

      setPanelState('preview');
    } catch (error) {
      setPanelState('failed');
      setErrorMessage(error instanceof Error ? error.message : 'Voice processing failed.');
      logger.error('Voice capture processing failed.', {
        eventType: 'inspection.voice_capture.failed',
        metadata: {
          roomLabel: logContext?.roomLabel,
          browserFamily: environment.browserFamily,
          browserEngine: environment.engine,
          error,
        },
      });
    }
  };

  const handleDiscard = async () => {
    if (session) {
      await session.cancel();
    }
    setSession(null);
    setResult(null);
    setEditableTranscript('');
    setErrorMessage(null);
    setPanelState('idle');
    onClose();
  };

  const handleRetry = async () => {
    logger.info('Voice capture retry triggered.', {
      eventType: 'inspection.voice_capture.retry_triggered',
      metadata: {
        roomLabel: logContext?.roomLabel,
        priorState: panelState,
        transcriptPresent: editableTranscript.trim().length > 0,
        browserFamily: environment.browserFamily,
        browserEngine: environment.engine,
      },
    });
    if (session) {
      await session.cancel();
      setSession(null);
    }
    setResult(null);
    setEditableTranscript('');
    setErrorMessage(null);
    setPanelState('idle');
    await handleStartRecording();
  };

  const handleSubmit = async (mode: 'parse' | 'note') => {
    if (!result || isSubmitting) return;
    const transcript = editableTranscript.trim();
    if (!transcript) return;

    const fallbackMode = !result.transcriptAvailable
      ? mode === 'note'
        ? 'manual_note'
        : 'manual_transcript'
      : transcript !== result.transcript.trim()
        ? 'manual_transcript'
        : 'transcript';

    if (fallbackMode !== 'transcript') {
      logger.info('Voice capture manual transcript fallback used.', {
        eventType: 'inspection.voice_capture.manual_transcript_fallback_used',
        metadata: {
          roomLabel: logContext?.roomLabel,
          fallbackMode,
          transcriptState: result.transcriptState,
          transcriptLengthBucket: getTranscriptLengthBucket(transcript),
          browserFamily: environment.browserFamily,
          browserEngine: environment.engine,
        },
      });
    }

    setIsSubmitting(true);
    try {
      if (mode === 'parse') {
        await onParseAndReview({ transcript, result });
      } else {
        await onSaveAsNote({ transcript, result });
      }
      await handleDiscard();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-slate-700" />
            <h4 className="text-sm font-semibold text-slate-900">Voice Capture</h4>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Record a quick voice note, review the text, then save it or send it to review. Nothing auto-commits.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleDiscard()}
          disabled={disabled || isSubmitting || panelState === 'processing'}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {hasActiveVoiceState ? 'Discard' : 'Close'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className={`rounded-xl border px-3 py-3 text-xs ${getCapabilityStatusTone(capabilities.mediaRecordingSupported)}`}>
          <div className="font-semibold">Audio Recording</div>
          <div className="mt-1">{capabilities.mediaRecordingSupported ? 'Ready' : 'Unavailable'}</div>
        </div>
        <div className={`rounded-xl border px-3 py-3 text-xs ${getCapabilityStatusTone(capabilities.speechRecognitionSupported)}`}>
          <div className="font-semibold">Speech Recognition</div>
          <div className="mt-1">{capabilities.speechRecognitionSupported ? 'Ready' : 'Unavailable'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">Audio Persistence</div>
          <div className="mt-1">Not persisted in this phase</div>
        </div>
      </div>

      {!capabilities.speechRecognitionSupported ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          This browser can record audio, but it cannot turn speech into text here. Record first, then type what you want to save.
        </div>
      ) : null}

      {panelState === 'idle' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleStartRecording()}
            disabled={disabled || !capabilities.browserAudioCaptureSupported}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mic size={14} />
            Start Recording
          </button>
          {!capabilities.browserAudioCaptureSupported ? (
            <span className="text-xs text-amber-700">This browser cannot record locally.</span>
          ) : null}
        </div>
      ) : null}

      {panelState === 'recording' ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <Waves size={16} />
            Recording now
          </div>
          <p className="mt-1 text-xs text-red-700">
            Stop when you are ready to review the transcript or type your own note.
          </p>
          <button
            type="button"
            onClick={() => void handleStopRecording()}
            disabled={disabled}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-red-800"
          >
            <PauseCircle size={14} />
            Stop Recording
          </button>
        </div>
      ) : null}

      {panelState === 'processing' ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Loader2 size={14} className="animate-spin" />
          <span>Finishing the recording...</span>
        </div>
      ) : null}

      {panelState === 'failed' && errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={disabled || isSubmitting || !capabilities.browserAudioCaptureSupported}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {panelState === 'preview' && result ? (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>Duration {formatDuration(result.durationMs)}</span>
            <span>{transcriptStateLabels[result.transcriptState]}</span>
            {result.permissionState === 'granted' ? <span>Mic ready</span> : null}
            {result.failureReason ? <span className="text-amber-700">{result.failureReason}</span> : null}
          </div>

          {result.transcriptState === 'unsupported' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Recording worked, but no transcript is available here. Type your own note or transcript below.
            </div>
          ) : null}

          {result.transcriptState === 'empty' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              We did not catch any words. Type it in, try again, or discard this recording.
            </div>
          ) : null}

          {transcriptLooksWeak ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This transcript may be incomplete. Edit it before parsing, or save it as a note instead.
            </div>
          ) : null}

          {hasManualTranscriptFallback ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Manual entry is ready. Saving will keep this as a voice-origin note without stored audio.
            </div>
          ) : null}

          {audioUrl ? (
            <audio controls src={audioUrl} className="w-full">
              <track kind="captions" />
            </audio>
          ) : null}

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Transcript</span>
            <textarea
              rows={4}
              value={editableTranscript}
              onChange={(event) => setEditableTranscript(event.target.value)}
              disabled={isSubmitting}
              placeholder={
                result.transcriptAvailable
                  ? 'Review or correct the transcript before saving.'
                  : 'Type what you want to save from this recording.'
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-lowes-blue disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit('parse')}
              disabled={isSubmitting || editableTranscript.trim().length === 0}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Working...' : 'Parse & Review'}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('note')}
              disabled={isSubmitting || editableTranscript.trim().length === 0}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Note
            </button>
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={isSubmitting || disabled || !capabilities.browserAudioCaptureSupported}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <RotateCcw size={14} />
                Retry
              </span>
            </button>
            <button
              type="button"
              onClick={() => void handleDiscard()}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <Trash2 size={14} />
                Discard
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

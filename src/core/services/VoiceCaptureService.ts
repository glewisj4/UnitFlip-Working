export type VoiceSupportState = 'supported' | 'unsupported';
export type VoicePermissionState = 'unknown' | 'granted' | 'denied' | 'dismissed_or_interrupted';
export type VoiceTranscriptState = 'available' | 'partial' | 'empty' | 'unsupported';
export type VoiceFailureCode =
  | 'recording_unsupported'
  | 'speech_unsupported'
  | 'permission_denied'
  | 'permission_dismissed_or_interrupted'
  | 'recording_failed'
  | 'speech_failed'
  | 'transcript_empty';

export interface VoiceCaptureCapabilities {
  mediaRecordingSupported: boolean;
  speechRecognitionSupported: boolean;
  browserAudioCaptureSupported: boolean;
  recordingSupport: VoiceSupportState;
  speechSupport: VoiceSupportState;
}

export interface VoiceCaptureEnvironment {
  browserFamily: 'edge' | 'chrome' | 'safari' | 'firefox' | 'unknown';
  engine: 'blink' | 'webkit' | 'gecko' | 'unknown';
  userAgentSnippet?: string;
}

export interface VoiceCaptureResult {
  audioBlob?: Blob;
  transcript: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  capabilities: VoiceCaptureCapabilities;
  transcriptAvailable: boolean;
  transcriptState: VoiceTranscriptState;
  permissionState: VoicePermissionState;
  failureCode?: VoiceFailureCode;
  failureReason?: string;
}

export interface ActiveVoiceCaptureSession {
  capabilities: VoiceCaptureCapabilities;
  startedAt: string;
  stop: () => Promise<VoiceCaptureResult>;
  cancel: () => Promise<void>;
}

export class VoiceCaptureError extends Error {
  code: VoiceFailureCode;
  permissionState: VoicePermissionState;
  capabilities: VoiceCaptureCapabilities;

  constructor(
    code: VoiceFailureCode,
    message: string,
    capabilities: VoiceCaptureCapabilities,
    permissionState: VoicePermissionState = 'unknown',
  ) {
    super(message);
    this.name = 'VoiceCaptureError';
    this.code = code;
    this.permissionState = permissionState;
    this.capabilities = capabilities;
  }
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const getSpeechRecognitionConstructor = () =>
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

const getCapabilities = (): VoiceCaptureCapabilities => {
  const browserAudioCaptureSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const mediaRecordingSupported = browserAudioCaptureSupported && typeof MediaRecorder !== 'undefined';
  const speechRecognitionSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionConstructor());

  return {
    mediaRecordingSupported,
    speechRecognitionSupported,
    browserAudioCaptureSupported,
    recordingSupport: mediaRecordingSupported ? 'supported' : 'unsupported',
    speechSupport: speechRecognitionSupported ? 'supported' : 'unsupported',
  };
};

const getEnvironment = (): VoiceCaptureEnvironment => {
  if (typeof navigator === 'undefined') {
    return {
      browserFamily: 'unknown',
      engine: 'unknown',
    };
  }

  const userAgent = navigator.userAgent || '';
  const normalized = userAgent.toLowerCase();

  let browserFamily: VoiceCaptureEnvironment['browserFamily'] = 'unknown';
  if (normalized.includes('edg/')) {
    browserFamily = 'edge';
  } else if (normalized.includes('chrome/') || normalized.includes('chromium/')) {
    browserFamily = 'chrome';
  } else if (normalized.includes('firefox/')) {
    browserFamily = 'firefox';
  } else if (normalized.includes('safari/') && !normalized.includes('chrome/') && !normalized.includes('chromium/')) {
    browserFamily = 'safari';
  }

  let engine: VoiceCaptureEnvironment['engine'] = 'unknown';
  if (
    normalized.includes('edg/') ||
    normalized.includes('chrome/') ||
    normalized.includes('chromium/')
  ) {
    engine = 'blink';
  } else if (normalized.includes('applewebkit/')) {
    engine = 'webkit';
  } else if (normalized.includes('gecko/') || normalized.includes('firefox/')) {
    engine = 'gecko';
  }

  return {
    browserFamily,
    engine,
    userAgentSnippet: userAgent.slice(0, 160) || undefined,
  };
};

const mapPermissionError = (error: unknown, capabilities: VoiceCaptureCapabilities): VoiceCaptureError => {
  const domException = error instanceof DOMException ? error : null;
  const errorName = domException?.name || (typeof error === 'object' && error && 'name' in error ? String((error as { name?: unknown }).name) : '');

  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
    return new VoiceCaptureError(
      'permission_denied',
      'Microphone access was denied. Allow microphone access and try again.',
      capabilities,
      'denied',
    );
  }

  if (errorName === 'AbortError' || errorName === 'NotReadableError') {
    return new VoiceCaptureError(
      'permission_dismissed_or_interrupted',
      'Microphone access was interrupted before recording could start. Try again.',
      capabilities,
      'dismissed_or_interrupted',
    );
  }

  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return new VoiceCaptureError(
      'recording_failed',
      'No microphone was available for local recording in this browser.',
      capabilities,
      'unknown',
    );
  }

  return new VoiceCaptureError(
    'recording_failed',
    error instanceof Error ? error.message : 'Voice capture could not start.',
    capabilities,
    'unknown',
  );
};

const getTranscriptState = (
  transcript: string,
  capabilities: VoiceCaptureCapabilities,
  recognitionError?: string,
): VoiceTranscriptState => {
  if (!capabilities.speechRecognitionSupported) return 'unsupported';
  if (!transcript.trim()) return 'empty';
  if (recognitionError) return 'partial';
  return 'available';
};

export const VoiceCaptureService = {
  getCapabilities(): VoiceCaptureCapabilities {
    return getCapabilities();
  },

  getEnvironment(): VoiceCaptureEnvironment {
    return getEnvironment();
  },

  async startCapture(): Promise<ActiveVoiceCaptureSession> {
    const capabilities = getCapabilities();
    if (!capabilities.browserAudioCaptureSupported) {
      throw new VoiceCaptureError(
        'recording_unsupported',
        'Local audio capture is not supported in this browser.',
        capabilities,
        'unknown',
      );
    }

    const startedAtDate = new Date();
    const startedAt = startedAtDate.toISOString();
    let permissionState: VoicePermissionState = 'unknown';
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionState = 'granted';
    } catch (error) {
      throw mapPermissionError(error, capabilities);
    }

    const audioTracks = stream.getAudioTracks();
    const chunks: BlobPart[] = [];
    let mediaRecorder: MediaRecorder | null = null;
    let transcript = '';
    let recognitionEnded = !capabilities.speechRecognitionSupported;
    let recorderEnded = !capabilities.mediaRecordingSupported;
    let recognitionError: string | undefined;
    let recorderError: string | undefined;

    if (capabilities.mediaRecordingSupported) {
      try {
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        mediaRecorder.onerror = () => {
          recorderError = 'Audio recording failed.';
        };
        mediaRecorder.onstop = () => {
          recorderEnded = true;
        };
        mediaRecorder.start();
      } catch {
        recorderError = 'Audio recording failed.';
        recorderEnded = true;
      }
    }

    let recognition: SpeechRecognitionLike | null = null;
    if (capabilities.speechRecognitionSupported) {
      const RecognitionConstructor = getSpeechRecognitionConstructor();
      if (RecognitionConstructor) {
        try {
          recognition = new RecognitionConstructor();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.onresult = (event) => {
            let nextTranscript = '';
            for (let index = 0; index < event.results.length; index += 1) {
              const result = event.results[index];
              const alternative = result?.[0];
              if (alternative?.transcript) {
                nextTranscript += alternative.transcript;
              }
            }
            transcript = nextTranscript.trim();
          };
          recognition.onerror = (event) => {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
              permissionState = 'denied';
            }
            recognitionError = event.error || 'Speech recognition failed.';
          };
          recognition.onend = () => {
            recognitionEnded = true;
          };
          recognition.start();
        } catch {
          recognitionError = 'Speech recognition failed.';
          recognitionEnded = true;
        }
      }
    }

    const stopTracks = () => {
      audioTracks.forEach((track) => track.stop());
    };

    const waitForStop = async () => {
      const startedWaitingAt = Date.now();
      while ((!recorderEnded || !recognitionEnded) && Date.now() - startedWaitingAt < 3000) {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    };

    const waitForTranscriptSettle = async () => {
      if (!capabilities.speechRecognitionSupported || transcript.trim().length > 0) return;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    };

    return {
      capabilities,
      startedAt,
      stop: async () => {
        const completedAt = new Date().toISOString();

        if (recognition && !recognitionEnded) {
          try {
            recognition.stop();
          } catch {
            recognitionEnded = true;
          }
        }

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          try {
            mediaRecorder.stop();
          } catch {
            recorderEnded = true;
          }
        }

        await waitForStop();
        await waitForTranscriptSettle();
        stopTracks();

        const durationMs = Math.max(0, new Date(completedAt).getTime() - startedAtDate.getTime());
        const audioBlob = chunks.length > 0 ? new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' }) : undefined;
        const transcriptState = getTranscriptState(transcript, capabilities, recognitionError);

        let failureCode: VoiceFailureCode | undefined;
        if (recorderError) {
          failureCode = 'recording_failed';
        } else if (recognitionError) {
          failureCode = 'speech_failed';
        } else if (transcriptState === 'empty') {
          failureCode = 'transcript_empty';
        } else if (transcriptState === 'unsupported') {
          failureCode = 'speech_unsupported';
        }

        return {
          audioBlob,
          transcript,
          durationMs,
          startedAt,
          completedAt,
          capabilities,
          transcriptAvailable: transcript.trim().length > 0,
          transcriptState,
          permissionState,
          failureCode,
          failureReason: recorderError || recognitionError,
        };
      },
      cancel: async () => {
        if (recognition && !recognitionEnded) {
          try {
            recognition.stop();
          } catch {
            recognitionEnded = true;
          }
        }

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          try {
            mediaRecorder.stop();
          } catch {
            recorderEnded = true;
          }
        }

        await waitForStop();
        await waitForTranscriptSettle();
        stopTracks();
      },
    };
  },
};

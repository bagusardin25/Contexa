import type {
  AnswerStyle,
  ContextDocument,
  RecapInput,
  SessionConfig,
  SessionEvent,
  SessionRecap,
} from "@/types/session";

export interface TransportContext {
  /** Latest document list, read at answer time so new uploads are included. */
  getDocuments: () => ContextDocument[];
  /** The recording to play when the audio source is `file`. */
  getAudioFile: () => File | null;
}

export type PreviewSimulation =
  | "connection_drop"
  | "translation_failure"
  | "answer_failure"
  | "permission_denied"
  | "no_audio_track";

export interface PreviewControls {
  simulate(simulation: PreviewSimulation): void;
}

/**
 * Everything the workspace needs from the voice + intelligence pipeline.
 *
 * `LiveTransport` captures tab/mic audio, streams PCM16 @ 16 kHz to AssemblyAI
 * with a short-lived token from our backend, and receives translations,
 * classifications, and answers from the FastAPI service. `PreviewTransport`
 * scripts the same `SessionEvent`s when no backend is configured.
 */
export interface SessionTransport {
  readonly kind: "preview" | "live";
  /** Only present on the preview transport. */
  readonly preview?: PreviewControls;
  subscribe(listener: (event: SessionEvent) => void): () => void;
  /** Requests capture permission, opens the stream, and starts emitting events. */
  start(config: SessionConfig, context: TransportContext): Promise<void>;
  /** Closes the streaming session. Downstream work on final turns may still finish. */
  stop(): Promise<void>;
  /** Drops all pending downstream work (new session). */
  reset(): void;
  /** Manual "Generate answer" for a finalized turn (FR-012); a `style` redrafts it. */
  requestAnswer(turnId: string, style?: AnswerStyle): void;
  retryTranslation(turnId: string): void;
  /** The end-of-session recap. Rejects with a message that can be shown. */
  recap(input: RecapInput): Promise<SessionRecap>;
}

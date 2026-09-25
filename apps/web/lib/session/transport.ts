import type {
  ContextDocument,
  SessionConfig,
  SessionEvent,
} from "@/types/session";

import { PreviewTransport } from "./preview-transport";

export interface TransportContext {
  /** Latest document list, read at answer time so new uploads are included. */
  getDocuments: () => ContextDocument[];
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
 * The live implementation will capture tab/mic audio, stream PCM16 @ 16 kHz to
 * AssemblyAI with a short-lived token from our backend, and receive
 * translations / classifications / answers from the FastAPI service. It must
 * emit the same `SessionEvent`s the preview emits.
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
  /** Manual "Generate answer" for a finalized turn (FR-012). */
  requestAnswer(turnId: string): void;
  retryTranslation(turnId: string): void;
}

export function createTransport(): SessionTransport {
  // The live AssemblyAI transport ships with the backend. Until then the
  // workspace runs a clearly labelled, scripted preview.
  return new PreviewTransport();
}

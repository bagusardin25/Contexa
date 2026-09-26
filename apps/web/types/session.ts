import type { LanguageCode, SpeakerLanguage } from "@/lib/languages";

/** Lifecycle states from the implementation guide §27. */
export type SessionStatus =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "reconnecting"
  | "stopping"
  | "stopped"
  | "error";

/** `file` plays a local recording through the live pipeline. */
export type AudioSource = "tab" | "microphone" | "file";

export type AnswerStyle = "concise" | "professional" | "technical" | "casual";

export interface SessionConfig {
  title: string;
  speakerLanguage: SpeakerLanguage;
  /** Language the user reads translations and suggested answers in. */
  displayLanguage: LanguageCode;
  /** Language of the ready-to-say answer. "auto" follows the speaker. */
  responseLanguage: LanguageCode | "auto";
  audioSource: AudioSource;
  /** Streaming speaker diarization. */
  speakerLabels: boolean;
  /** How suggested answers sound. */
  answerStyle: AnswerStyle;
}

export type SessionErrorCode =
  | "permission_denied"
  | "no_audio_track"
  | "connection_lost"
  | "unsupported_language"
  | "unknown";

export interface SessionError {
  code: SessionErrorCode;
  message: string;
}

/** Unfinished turn (`end_of_turn = false`). UI only, never processed further. */
export interface PartialTurn {
  id: string;
  speaker: string | null;
  text: string;
  startedAtMs: number;
}

export type TurnType = "statement" | "question" | "action_request" | "other";

export interface TurnClassification {
  type: TurnType;
  /** False for rhetorical questions or questions not aimed at the user. */
  requiresAnswer: boolean;
  confidence: number;
}

export interface TranslationResult {
  sourceLanguage: string;
  targetLanguage: LanguageCode;
  text: string;
  technicalTermsPreserved: string[];
}

export type TranslationState =
  | { status: "pending" }
  | { status: "done"; result: TranslationResult; latencyMs: number }
  | { status: "failed"; message: string }
  | { status: "not_needed" };

/** Finalized turn (`end_of_turn = true`) plus everything derived from it. */
export interface Turn {
  id: string;
  order: number;
  speaker: string | null;
  text: string;
  detectedLanguage: string | null;
  /** Offsets from the moment the session started listening. */
  startedAtMs: number;
  endedAtMs: number;
  translation: TranslationState;
  classification: TurnClassification | null;
  suggestionId: string | null;
}

export interface FinalTurnPayload {
  id: string;
  speaker: string | null;
  text: string;
  detectedLanguage: string | null;
  startedAtMs: number;
  endedAtMs: number;
  needsTranslation: boolean;
}

/** A retrieved document chunk used to ground an answer. */
export interface Evidence {
  chunkId: string;
  documentId: string;
  documentName: string;
  /** Human-readable position, e.g. "p. 4 · Conflict handling". */
  location: string;
  snippet: string;
  /** Retrieval relevance, 0–1. */
  score: number;
  highlights: string[];
}

export interface SuggestedAnswer {
  questionSummary: string;
  answerPreferredLanguage: string;
  answerTargetLanguage: string;
  preferredLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  usedContext: { documentId: string; chunkId: string }[];
  confidenceNote: string;
}

export type SuggestionStage = "retrieving" | "generating" | "ready" | "failed";
export type SuggestionTrigger = "auto" | "manual";

export interface Suggestion {
  id: string;
  turnId: string;
  trigger: SuggestionTrigger;
  style: AnswerStyle;
  stage: SuggestionStage;
  /** `null` until retrieval finishes. */
  evidence: Evidence[] | null;
  answer: SuggestedAnswer | null;
  error: string | null;
  createdAtMs: number;
  latencyMs: number | null;
}

export type DocumentKind = "pdf" | "docx" | "md" | "txt";
export type DocumentStatus =
  | "uploading"
  | "parsing"
  | "indexing"
  | "ready"
  | "failed";

export interface ContextDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  sizeBytes: number;
  status: DocumentStatus;
  /** Upload progress, 0–100. */
  progress: number;
  chunkCount: number | null;
  error: string | null;
  sample: boolean;
  /** Distinctive terms found in the document, sent to AssemblyAI as keyterms. */
  keyterms: string[];
}

/**
 * Normalized events the workspace consumes. The live transport maps
 * AssemblyAI + backend messages onto these; the preview transport scripts them.
 */
export type SessionEvent =
  | { type: "status"; status: SessionStatus; error?: SessionError }
  | { type: "audio_level"; level: number }
  | { type: "turn_partial"; turn: PartialTurn }
  /** A turn ended with no words (noise); its partial is dropped. */
  | { type: "turn_discarded"; turnId: string }
  | { type: "turn_final"; turn: FinalTurnPayload }
  /** The keyterms the live stream is using (keyterms prompting). */
  | { type: "keyterms_applied"; keyterms: string[] }
  | {
      type: "translation_done";
      turnId: string;
      result: TranslationResult;
      latencyMs: number;
    }
  | { type: "translation_failed"; turnId: string; message: string }
  | {
      type: "turn_classified";
      turnId: string;
      classification: TurnClassification;
    }
  | {
      type: "suggestion_started";
      suggestionId: string;
      turnId: string;
      trigger: SuggestionTrigger;
      style: AnswerStyle;
      createdAtMs: number;
    }
  | { type: "suggestion_evidence"; suggestionId: string; evidence: Evidence[] }
  | {
      type: "suggestion_ready";
      suggestionId: string;
      answer: SuggestedAnswer;
      latencyMs: number;
    }
  | { type: "suggestion_failed"; suggestionId: string; message: string };

/** The AI recap written when a session ends (PRD golden path, step 7). */
export interface SessionRecap {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  openQuestions: string[];
}

export type RecapState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; recap: SessionRecap; language: LanguageCode }
  | { status: "failed"; message: string };

/** What the recap is written from: the transcript the browser holds. */
export interface RecapInput {
  title: string;
  language: LanguageCode;
  turns: { speaker: string | null; text: string; type: TurnType | null }[];
}

import { createStore } from "zustand/vanilla";

import { SAMPLE_DOCUMENTS } from "@/lib/documents/sample-documents";
import type { DocumentUpdate, DocumentUploader } from "@/lib/documents/uploader";
import { validateFile } from "@/lib/documents/validate";
import { createId } from "@/lib/utils";
import type {
  ContextDocument,
  PartialTurn,
  SessionConfig,
  SessionError,
  SessionEvent,
  SessionStatus,
  Suggestion,
  Turn,
} from "@/types/session";

import type { PreviewSimulation, SessionTransport } from "./transport";

export interface SessionState {
  config: SessionConfig;
  status: SessionStatus;
  error: SessionError | null;
  /** Wall-clock time the session started listening; `null` while setting up. */
  startedAt: number | null;
  endedAt: number | null;
  turns: Turn[];
  partial: PartialTurn | null;
  suggestions: Record<string, Suggestion>;
  suggestionOrder: string[];
  activeSuggestionId: string | null;
  documents: ContextDocument[];
  audioLevel: number;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface SessionActions {
  updateConfig: (patch: Partial<SessionConfig>) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  newSession: () => void;
  /** Manual "Generate answer". Defaults to the most recent final turn. */
  requestAnswer: (turnId?: string) => void;
  retryTranslation: (turnId: string) => void;
  selectSuggestion: (suggestionId: string) => void;
  addFiles: (files: File[]) => RejectedFile[];
  addSampleDocuments: () => void;
  removeDocument: (documentId: string) => void;
  simulate: (simulation: PreviewSimulation) => void;
}

export type SessionStore = SessionState & SessionActions;
export type SessionStoreApi = ReturnType<typeof createSessionStore>;

export const DEFAULT_CONFIG: SessionConfig = {
  title: "",
  speakerLanguage: "en",
  displayLanguage: "id",
  responseLanguage: "auto",
  audioSource: "tab",
  speakerLabels: true,
};

const EMPTY_SESSION = {
  status: "idle",
  error: null,
  startedAt: null,
  endedAt: null,
  turns: [],
  partial: null,
  suggestions: {},
  suggestionOrder: [],
  activeSuggestionId: null,
  audioLevel: 0,
} satisfies Omit<SessionState, "config" | "documents">;

const UNKNOWN_ERROR: SessionError = {
  code: "unknown",
  message: "Something went wrong with the live session.",
};

const ACTIVE_STATUSES: SessionStatus[] = [
  "requesting_permission",
  "connecting",
  "listening",
  "reconnecting",
];

export function isSessionActive(status: SessionStatus) {
  return ACTIVE_STATUSES.includes(status);
}

function patchTurn(turns: Turn[], turnId: string, patch: Partial<Turn>) {
  return turns.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn));
}

function patchSuggestion(
  suggestions: Record<string, Suggestion>,
  suggestionId: string,
  patch: Partial<Suggestion>,
) {
  const current = suggestions[suggestionId];
  if (!current) return suggestions;
  return { ...suggestions, [suggestionId]: { ...current, ...patch } };
}

function patchDocument(
  documents: ContextDocument[],
  documentId: string,
  patch: DocumentUpdate,
) {
  return documents.map((doc) => (doc.id === documentId ? { ...doc, ...patch } : doc));
}

/** Pure reducer from transport events to session state. */
export function applyEvent(
  state: SessionState,
  event: SessionEvent,
): Partial<SessionState> {
  switch (event.type) {
    case "status": {
      const { status } = event;
      if (status === "stopped" && state.startedAt === null) {
        // Cancelled before listening started: back to setup.
        return { status: "idle", audioLevel: 0, partial: null };
      }
      const patch: Partial<SessionState> = { status };
      if (status === "requesting_permission") patch.error = null;
      if (status === "listening" && state.startedAt === null) patch.startedAt = Date.now();
      if (status === "stopped") patch.endedAt = Date.now();
      if (status === "error") patch.error = event.error ?? UNKNOWN_ERROR;
      if (status !== "listening") patch.audioLevel = 0;
      if (status === "stopped" || status === "error") patch.partial = null;
      return patch;
    }

    case "audio_level":
      return { audioLevel: event.level };

    case "turn_partial":
      return { partial: event.turn };

    case "turn_final": {
      const final = event.turn;
      const turn: Turn = {
        id: final.id,
        order: state.turns.length + 1,
        speaker: final.speaker,
        text: final.text,
        detectedLanguage: final.detectedLanguage,
        startedAtMs: final.startedAtMs,
        endedAtMs: final.endedAtMs,
        translation: final.needsTranslation ? { status: "pending" } : { status: "not_needed" },
        classification: null,
        suggestionId: null,
      };
      return {
        turns: [...state.turns, turn],
        partial: state.partial?.id === final.id ? null : state.partial,
      };
    }

    case "translation_done":
      return {
        turns: patchTurn(state.turns, event.turnId, {
          translation: { status: "done", result: event.result, latencyMs: event.latencyMs },
        }),
      };

    case "translation_failed":
      return {
        turns: patchTurn(state.turns, event.turnId, {
          translation: { status: "failed", message: event.message },
        }),
      };

    case "turn_classified":
      return {
        turns: patchTurn(state.turns, event.turnId, { classification: event.classification }),
      };

    case "suggestion_started": {
      const turn = state.turns.find((item) => item.id === event.turnId);
      if (!turn) return {};
      const suggestions = { ...state.suggestions };
      let order = state.suggestionOrder;
      // A retried answer replaces the failed attempt for the same turn.
      const previous = turn.suggestionId ? suggestions[turn.suggestionId] : undefined;
      if (previous?.stage === "failed") {
        delete suggestions[previous.id];
        order = order.filter((id) => id !== previous.id);
      }
      suggestions[event.suggestionId] = {
        id: event.suggestionId,
        turnId: event.turnId,
        trigger: event.trigger,
        stage: "retrieving",
        evidence: null,
        answer: null,
        error: null,
        createdAtMs: event.createdAtMs,
        latencyMs: null,
      };
      return {
        suggestions,
        suggestionOrder: [...order, event.suggestionId],
        activeSuggestionId: event.suggestionId,
        turns: patchTurn(state.turns, event.turnId, { suggestionId: event.suggestionId }),
      };
    }

    case "suggestion_evidence":
      return {
        suggestions: patchSuggestion(state.suggestions, event.suggestionId, {
          stage: "generating",
          evidence: event.evidence,
        }),
      };

    case "suggestion_ready":
      return {
        suggestions: patchSuggestion(state.suggestions, event.suggestionId, {
          stage: "ready",
          answer: event.answer,
          latencyMs: event.latencyMs,
        }),
      };

    case "suggestion_failed":
      return {
        suggestions: patchSuggestion(state.suggestions, event.suggestionId, {
          stage: "failed",
          error: event.message,
        }),
      };
  }
}

export function createSessionStore({
  transport,
  uploader,
}: {
  transport: SessionTransport;
  uploader: DocumentUploader;
}) {
  const store = createStore<SessionStore>()((set, get) => ({
    config: DEFAULT_CONFIG,
    documents: [],
    ...EMPTY_SESSION,

    updateConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),

    start: async () => {
      const { status, startedAt, config } = get();
      const canStart = status === "idle" || (status === "error" && startedAt === null);
      if (!canStart) return;
      set({ error: null });
      await transport.start(config, { getDocuments: () => get().documents });
    },

    stop: async () => {
      if (isSessionActive(get().status)) await transport.stop();
    },

    newSession: () => {
      transport.reset();
      set({ ...EMPTY_SESSION });
    },

    requestAnswer: (turnId) => {
      const { turns, suggestions } = get();
      const turn = turnId ? turns.find((item) => item.id === turnId) : turns.at(-1);
      if (!turn) return;
      const existing = turn.suggestionId ? suggestions[turn.suggestionId] : undefined;
      if (existing && existing.stage !== "failed") {
        set({ activeSuggestionId: existing.id });
        return;
      }
      transport.requestAnswer(turn.id);
    },

    retryTranslation: (turnId) => {
      set((state) => ({
        turns: patchTurn(state.turns, turnId, { translation: { status: "pending" } }),
      }));
      transport.retryTranslation(turnId);
    },

    selectSuggestion: (suggestionId) => set({ activeSuggestionId: suggestionId }),

    addFiles: (files) => {
      const rejected: RejectedFile[] = [];
      const accepted: { doc: ContextDocument; file: File }[] = [];
      for (const file of files) {
        const known = [...get().documents, ...accepted.map((item) => item.doc)];
        const result = validateFile(file, known);
        if (!result.ok) {
          rejected.push({ name: file.name, reason: result.reason });
          continue;
        }
        accepted.push({
          file,
          doc: {
            id: createId("doc"),
            name: file.name,
            kind: result.kind,
            sizeBytes: file.size,
            status: "uploading",
            progress: 0,
            chunkCount: null,
            error: null,
            sample: false,
          },
        });
      }

      if (accepted.length > 0) {
        set((state) => ({ documents: [...state.documents, ...accepted.map((item) => item.doc)] }));
        for (const { doc, file } of accepted) {
          uploader.upload({ documentId: doc.id, file, kind: doc.kind }, (update) =>
            set((state) => ({ documents: patchDocument(state.documents, doc.id, update) })),
          );
        }
      }
      return rejected;
    },

    addSampleDocuments: () =>
      set((state) => {
        const present = new Set(state.documents.map((doc) => doc.id));
        const missing = SAMPLE_DOCUMENTS.filter((doc) => !present.has(doc.id));
        return { documents: [...state.documents, ...missing] };
      }),

    removeDocument: (documentId) => {
      uploader.cancel(documentId);
      set((state) => ({ documents: state.documents.filter((doc) => doc.id !== documentId) }));
    },

    simulate: (simulation) => {
      if (!transport.preview) return;
      transport.preview.simulate(simulation);
      if (simulation === "permission_denied" || simulation === "no_audio_track") {
        void get().start();
      }
    },
  }));

  transport.subscribe((event) => store.setState((state) => applyEvent(state, event)));
  return store;
}

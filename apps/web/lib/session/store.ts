import { createStore } from "zustand/vanilla";

import { SAMPLE_DOCUMENTS } from "@/lib/documents/sample-documents";
import type { DocumentUpdate, DocumentUploader } from "@/lib/documents/uploader";
import { validateFile } from "@/lib/documents/validate";
import { createId } from "@/lib/utils";
import type {
  AnswerStyle,
  ContextDocument,
  PartialTurn,
  RecapState,
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
  /** Keyterms the live stream sent to AssemblyAI; empty in the preview. */
  streamKeyterms: string[];
  /** The AI recap, written once the session stops. */
  recap: RecapState;
  /** The recording for the `file` audio source; kept across sessions like the config. */
  audioFile: File | null;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface SessionActions {
  updateConfig: (patch: Partial<SessionConfig>) => void;
  setAudioFile: (file: File | null) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  newSession: () => void;
  /** Manual "Generate answer". Defaults to the most recent final turn; a new `style` redrafts. */
  requestAnswer: (turnId?: string, style?: AnswerStyle) => void;
  retryTranslation: (turnId: string) => void;
  /** Writes the recap of a stopped session; runs on its own when the session stops. */
  generateRecap: () => Promise<void>;
  selectSuggestion: (suggestionId: string) => void;
  addFiles: (files: File[], options?: { sample?: boolean }) => RejectedFile[];
  addSampleDocuments: () => void;
  /** Imports a link (web page, PDF, GitHub repository); returns why it can't, or null. */
  addLink: (url: string) => string | null;
  retryDocument: (documentId: string) => void;
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
  answerStyle: "professional",
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
  streamKeyterms: [],
  recap: { status: "idle" },
} satisfies Omit<SessionState, "config" | "documents" | "audioFile">;

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

    case "turn_discarded":
      return state.partial?.id === event.turnId ? { partial: null } : {};

    case "keyterms_applied":
      return { streamKeyterms: event.keyterms };

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
      // A retry, or a redraft in another style, replaces the turn's previous answer.
      const previous = turn.suggestionId ? suggestions[turn.suggestionId] : undefined;
      if (previous) {
        delete suggestions[previous.id];
        order = order.filter((id) => id !== previous.id);
      }
      suggestions[event.suggestionId] = {
        id: event.suggestionId,
        turnId: event.turnId,
        trigger: event.trigger,
        style: event.style,
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
  // Bumped by New session so a late recap can't land in the next conversation.
  let recapRun = 0;

  const store = createStore<SessionStore>()((set, get) => ({
    config: DEFAULT_CONFIG,
    documents: [],
    audioFile: null,
    ...EMPTY_SESSION,

    updateConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),

    setAudioFile: (audioFile) => set({ audioFile }),

    start: async () => {
      const { status, startedAt, config } = get();
      const canStart = status === "idle" || (status === "error" && startedAt === null);
      if (!canStart) return;
      set({ error: null });
      await transport.start(config, {
        getDocuments: () => get().documents,
        getAudioFile: () => get().audioFile,
      });
    },

    stop: async () => {
      if (isSessionActive(get().status)) await transport.stop();
    },

    newSession: () => {
      recapRun += 1;
      transport.reset();
      set({ ...EMPTY_SESSION });
    },

    requestAnswer: (turnId, style) => {
      const { turns, suggestions } = get();
      const turn = turnId ? turns.find((item) => item.id === turnId) : turns.at(-1);
      if (!turn) return;
      const existing = turn.suggestionId ? suggestions[turn.suggestionId] : undefined;
      const restyle = style !== undefined && existing !== undefined && existing.style !== style;
      if (existing && existing.stage !== "failed" && !restyle) {
        set({ activeSuggestionId: existing.id });
        return;
      }
      transport.requestAnswer(turn.id, style);
    },

    retryTranslation: (turnId) => {
      set((state) => ({
        turns: patchTurn(state.turns, turnId, { translation: { status: "pending" } }),
      }));
      transport.retryTranslation(turnId);
    },

    generateRecap: async () => {
      const { status, turns, config, recap } = get();
      const spoken = turns.filter((turn) => turn.text.trim());
      if (status !== "stopped" || spoken.length === 0 || recap.status === "loading") return;
      const run = ++recapRun;
      const language = config.displayLanguage;
      set({ recap: { status: "loading" } });
      try {
        const result = await transport.recap({
          title: config.title.trim(),
          language,
          turns: spoken.map((turn) => ({
            speaker: turn.speaker,
            text: turn.text,
            type: turn.classification?.type ?? null,
          })),
        });
        if (run === recapRun) set({ recap: { status: "ready", recap: result, language } });
      } catch (error) {
        if (run !== recapRun) return;
        const message = error instanceof Error ? error.message : "Couldn't write the recap.";
        set({ recap: { status: "failed", message } });
      }
    },

    selectSuggestion: (suggestionId) => set({ activeSuggestionId: suggestionId }),

    addFiles: (files, options) => {
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
            sample: options?.sample ?? false,
            keyterms: [],
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

    addLink: (url) => {
      const link = url.trim();
      if (!uploader.importLink) return "Importing links needs the Contexa API.";
      if (!link) return "Paste a link first.";
      if (/\s/.test(link)) return "That doesn't look like a web address.";
      if (get().documents.some((doc) => doc.sourceUrl === link)) {
        return "This link is already attached.";
      }
      const doc: ContextDocument = {
        id: createId("doc"),
        name: link.replace(/^https?:\/\//i, "").replace(/\/+$/, ""),
        kind: /^(https?:\/\/)?(www\.)?github\.com\//i.test(link) ? "repo" : "web",
        sizeBytes: 0,
        status: "importing",
        progress: 0,
        chunkCount: null,
        error: null,
        sample: false,
        keyterms: [],
        sourceUrl: link,
      };
      set((state) => ({ documents: [...state.documents, doc] }));
      uploader.importLink({ documentId: doc.id, url: link }, (update) =>
        set((state) => ({ documents: patchDocument(state.documents, doc.id, update) })),
      );
      return null;
    },

    addSampleDocuments: () =>
      set((state) => {
        const present = new Set(state.documents.map((doc) => doc.id));
        const missing = SAMPLE_DOCUMENTS.filter((doc) => !present.has(doc.id));
        return { documents: [...state.documents, ...missing] };
      }),

    retryDocument: (documentId) => uploader.retry?.(documentId),

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

  transport.subscribe((event) => {
    store.setState((state) => applyEvent(state, event));
    if (event.type === "status" && event.status === "stopped") void store.getState().generateRecap();
  });
  return store;
}

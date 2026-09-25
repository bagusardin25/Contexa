import { SAMPLE_CHUNKS } from "@/lib/documents/sample-documents";
import {
  languageName,
  resolveResponseLanguage,
  type LanguageCode,
} from "@/lib/languages";
import type {
  Evidence,
  SessionConfig,
  SessionError,
  SessionEvent,
  SuggestedAnswer,
  SuggestionTrigger,
} from "@/types/session";

import {
  ACKNOWLEDGEMENT_ANSWER,
  ENGLISH_SCRIPT,
  JAPANESE_SCRIPT,
  NO_CONTEXT_ANSWER,
  type Localized,
  type PreviewScript,
  type ScriptedTurn,
} from "./preview-script";
import type {
  PreviewControls,
  PreviewSimulation,
  SessionTransport,
  TransportContext,
} from "./transport";

type Listener = (event: SessionEvent) => void;
type StartFailure = "permission_denied" | "no_audio_track";

const START_ERRORS: Record<StartFailure, SessionError> = {
  permission_denied: {
    code: "permission_denied",
    message:
      "Screen sharing was blocked. Allow Contexa to capture a tab, then try again.",
  },
  no_audio_track: {
    code: "no_audio_track",
    message:
      "The shared tab has no audio track. Share it again and turn on “Share tab audio”.",
  },
};

function jitter(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function placeholder(language: LanguageCode) {
  return `[Preview] ${languageName(language)} text appears here once the backend is connected.`;
}

/**
 * Growing, unformatted snapshots of a sentence, the way streaming partials
 * arrive before the formatted final turn replaces them.
 */
function partialSnapshots(text: string, language: LanguageCode) {
  const snapshots: string[] = [];
  if (language === "ja") {
    const plain = text.replace(/[、。？！]/g, "");
    for (let end = 0; end < plain.length; ) {
      end = Math.min(plain.length, end + 2 + Math.floor(Math.random() * 3));
      snapshots.push(plain.slice(0, end));
    }
    return snapshots;
  }
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:"“”]/g, "")
    .split(/\s+/);
  for (let end = 0; end < words.length; ) {
    end = Math.min(words.length, end + (Math.random() < 0.35 ? 2 : 1));
    snapshots.push(words.slice(0, end).join(" "));
  }
  return snapshots;
}

/**
 * Scripted stand-in for the live pipeline. It emits exactly the events the
 * live transport will emit, with realistic pacing, so the UI can be built and
 * reviewed before AssemblyAI streaming and the FastAPI backend are wired in.
 */
export class PreviewTransport implements SessionTransport {
  readonly kind = "preview" as const;
  readonly preview: PreviewControls = {
    simulate: (simulation) => this.simulate(simulation),
  };

  private listeners = new Set<Listener>();
  /** Bumped on stop/reset: aborts the audio + turn stream. */
  private streamRun = 0;
  /** Bumped on reset: aborts downstream work (translation, answers). */
  private sessionRun = 0;
  private phase: "idle" | "starting" | "streaming" = "idle";
  private config: SessionConfig | null = null;
  private context: TransportContext | null = null;
  private script: PreviewScript = ENGLISH_SCRIPT;
  private turns = new Map<string, ScriptedTurn>();
  private startedAt = 0;
  private sequence = 0;
  private speaking = false;
  private paused = false;
  private levelTimer: number | null = null;
  private nextStartFailure: StartFailure | null = null;
  private failNextTranslation = false;
  private failNextAnswer = false;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(config: SessionConfig, context: TransportContext) {
    const run = ++this.streamRun;
    this.sessionRun += 1;
    this.phase = "starting";
    this.config = config;
    this.context = context;
    this.script = config.speakerLanguage === "ja" ? JAPANESE_SCRIPT : ENGLISH_SCRIPT;
    this.turns.clear();
    this.paused = false;

    this.emit({ type: "status", status: "requesting_permission" });
    if (!(await this.wait(900, run))) return;

    const failure = this.nextStartFailure;
    this.nextStartFailure = null;
    if (failure) {
      this.phase = "idle";
      this.emit({ type: "status", status: "error", error: START_ERRORS[failure] });
      return;
    }

    this.emit({ type: "status", status: "connecting" });
    if (!(await this.wait(1000, run))) return;

    this.phase = "streaming";
    this.startedAt = performance.now();
    this.emit({ type: "status", status: "listening" });
    this.startLevelMeter();
    void this.playScript(run);
  }

  async stop() {
    if (this.phase === "idle") return;
    this.streamRun += 1;
    this.phase = "idle";
    this.speaking = false;
    this.paused = false;
    this.stopLevelMeter();
    this.emit({ type: "status", status: "stopping" });
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    this.emit({ type: "status", status: "stopped" });
  }

  reset() {
    this.streamRun += 1;
    this.sessionRun += 1;
    this.phase = "idle";
    this.speaking = false;
    this.paused = false;
    this.failNextTranslation = false;
    this.failNextAnswer = false;
    this.stopLevelMeter();
    this.turns.clear();
  }

  requestAnswer(turnId: string) {
    void this.answer(turnId, "manual", this.sessionRun);
  }

  retryTranslation(turnId: string) {
    void this.translate(turnId, this.sessionRun);
  }

  private emit(event: SessionEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private elapsed() {
    return Math.round(performance.now() - this.startedAt);
  }

  private wait(ms: number, run: number) {
    return new Promise<boolean>((resolve) =>
      window.setTimeout(() => resolve(run === this.streamRun), ms),
    );
  }

  private waitSession(ms: number, session: number) {
    return new Promise<boolean>((resolve) =>
      window.setTimeout(() => resolve(session === this.sessionRun), ms),
    );
  }

  private async whilePaused(run: number) {
    while (this.paused) {
      if (!(await this.wait(200, run))) return false;
    }
    return run === this.streamRun;
  }

  private async playScript(run: number) {
    if (!(await this.wait(1400, run))) return;
    for (const scripted of this.script.turns) {
      if (!(await this.speak(scripted, run))) return;
      if (!(await this.wait(jitter(1700, 2600), run))) return;
    }
    // Script finished: keep "listening" to silence until the user stops.
  }

  private async speak(scripted: ScriptedTurn, run: number) {
    const config = this.config;
    if (!config || !(await this.whilePaused(run))) return false;

    const id = `turn-${++this.sequence}`;
    const speaker = config.speakerLabels ? scripted.speaker : null;
    const language = this.script.language;
    const startedAtMs = this.elapsed();

    this.speaking = true;
    for (const text of partialSnapshots(scripted.text, language)) {
      if (!(await this.whilePaused(run))) return false;
      this.emit({ type: "turn_partial", turn: { id, speaker, text, startedAtMs } });
      if (!(await this.wait(jitter(120, 200), run))) return false;
    }
    this.speaking = false;

    // End-of-turn detection waits for a short silence before finalizing.
    if (!(await this.wait(380, run))) return false;

    this.turns.set(id, scripted);
    this.emit({
      type: "turn_final",
      turn: {
        id,
        speaker,
        text: scripted.text,
        detectedLanguage: language,
        startedAtMs,
        endedAtMs: this.elapsed(),
        needsTranslation: language !== config.displayLanguage,
      },
    });
    void this.processFinalTurn(id, this.sessionRun);
    return true;
  }

  /** Final turns only: translate, classify, and answer when needed (guide §11). */
  private async processFinalTurn(turnId: string, session: number) {
    void this.translate(turnId, session);
    if (!(await this.waitSession(jitter(380, 560), session))) return;

    const scripted = this.turns.get(turnId);
    if (!scripted) return;
    this.emit({ type: "turn_classified", turnId, classification: scripted.classification });
    if (scripted.classification.requiresAnswer) {
      await this.answer(turnId, "auto", session);
    }
  }

  private async translate(turnId: string, session: number) {
    const config = this.config;
    const scripted = this.turns.get(turnId);
    if (!config || !scripted || this.script.language === config.displayLanguage) return;

    const startedAt = performance.now();
    if (!(await this.waitSession(jitter(650, 1050), session))) return;

    if (this.failNextTranslation) {
      this.failNextTranslation = false;
      this.emit({
        type: "translation_failed",
        turnId,
        message: "The LLM Gateway request timed out.",
      });
      return;
    }

    this.emit({
      type: "translation_done",
      turnId,
      latencyMs: performance.now() - startedAt,
      result: {
        sourceLanguage: this.script.language,
        targetLanguage: config.displayLanguage,
        text:
          scripted.translation[config.displayLanguage] ??
          placeholder(config.displayLanguage),
        technicalTermsPreserved: scripted.terms,
      },
    });
  }

  private async answer(turnId: string, trigger: SuggestionTrigger, session: number) {
    const scripted = this.turns.get(turnId);
    if (!this.config || !scripted) return;

    const suggestionId = `suggestion-${++this.sequence}`;
    const startedAt = performance.now();
    this.emit({
      type: "suggestion_started",
      suggestionId,
      turnId,
      trigger,
      createdAtMs: this.elapsed(),
    });

    // Retrieval over the session's indexed documents.
    if (!(await this.waitSession(jitter(650, 950), session))) return;
    const documents = (this.context?.getDocuments() ?? []).filter(
      (doc) => doc.status === "ready",
    );
    const searchable = new Set(documents.map((doc) => doc.id));
    const evidence: Evidence[] = (scripted.answer?.evidence ?? []).flatMap(
      ({ chunkId, score }) => {
        const chunk = SAMPLE_CHUNKS[chunkId];
        return chunk && searchable.has(chunk.documentId) ? [{ ...chunk, score }] : [];
      },
    );
    this.emit({ type: "suggestion_evidence", suggestionId, evidence });

    // Grounded generation.
    if (!(await this.waitSession(jitter(1300, 1900), session))) return;
    if (this.failNextAnswer) {
      this.failNextAnswer = false;
      this.emit({
        type: "suggestion_failed",
        suggestionId,
        message: "The LLM Gateway didn't respond within 8 seconds.",
      });
      return;
    }

    this.emit({
      type: "suggestion_ready",
      suggestionId,
      latencyMs: performance.now() - startedAt,
      answer: this.composeAnswer(scripted, evidence, documents.length),
    });
  }

  private composeAnswer(
    scripted: ScriptedTurn,
    evidence: Evidence[],
    documentCount: number,
  ): SuggestedAnswer {
    const config = this.config as SessionConfig;
    const preferred = config.displayLanguage;
    const target = resolveResponseLanguage(config.responseLanguage, this.script.language);

    let texts: Localized;
    let note: string;
    if (scripted.answer && evidence.length > 0) {
      texts = scripted.answer.answer;
      note = scripted.answer.confidenceNote;
    } else if (scripted.answer) {
      texts = NO_CONTEXT_ANSWER;
      note =
        documentCount === 0
          ? "No documents are attached to this session, so there is nothing to ground an answer in. Add your project documents in the Context panel."
          : "None of the attached documents cover this question, so the answer avoids making claims. In the preview, only the sample documents are searchable.";
    } else {
      texts = ACKNOWLEDGEMENT_ANSWER;
      note =
        "This turn isn't a question, so Contexa suggests a short acknowledgement instead of a grounded answer.";
    }

    const summary =
      scripted.answer?.questionSummary[preferred] ??
      scripted.translation[preferred] ??
      (this.script.language === preferred ? scripted.text : placeholder(preferred));

    return {
      questionSummary: summary,
      answerPreferredLanguage: texts[preferred] ?? placeholder(preferred),
      answerTargetLanguage: texts[target] ?? placeholder(target),
      preferredLanguage: preferred,
      targetLanguage: target,
      usedContext: evidence.map(({ documentId, chunkId }) => ({ documentId, chunkId })),
      confidenceNote: note,
    };
  }

  private startLevelMeter() {
    this.stopLevelMeter();
    this.levelTimer = window.setInterval(() => {
      const level = this.paused
        ? 0
        : this.speaking
          ? 0.35 + Math.random() * 0.6
          : 0.02 + Math.random() * 0.06;
      this.emit({ type: "audio_level", level });
    }, 90);
  }

  private stopLevelMeter() {
    if (this.levelTimer !== null) window.clearInterval(this.levelTimer);
    this.levelTimer = null;
  }

  private simulate(simulation: PreviewSimulation) {
    switch (simulation) {
      case "permission_denied":
      case "no_audio_track":
        this.nextStartFailure = simulation;
        break;
      case "translation_failure":
        this.failNextTranslation = true;
        break;
      case "answer_failure":
        this.failNextAnswer = true;
        break;
      case "connection_drop":
        void this.dropConnection();
        break;
    }
  }

  private async dropConnection() {
    if (this.phase !== "streaming" || this.paused) return;
    const run = this.streamRun;
    this.paused = true;
    this.emit({ type: "status", status: "reconnecting" });
    if (!(await this.wait(2600, run))) return;
    this.paused = false;
    this.emit({ type: "status", status: "listening" });
  }
}

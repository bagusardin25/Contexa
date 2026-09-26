import { ApiError, api } from "@/lib/api/client";
import type { ApiSessionManager } from "@/lib/api/session";
import { speakerLanguageOption, speechModelFor } from "@/lib/languages";
import type {
  AnswerStyle,
  FinalTurnPayload,
  RecapInput,
  SessionConfig,
  SessionError,
  SessionEvent,
} from "@/types/session";

import {
  CaptureError,
  type FilePlayback,
  type PcmPipeline,
  captureAudio,
  loadAudioFile,
  releaseStream,
  startPcmPipeline,
} from "./audio-capture";
import type { SessionTransport, TransportContext } from "./transport";

type Listener = (event: SessionEvent) => void;

/** A `Turn` message from AssemblyAI's v3 streaming API (fields we use). */
interface AssemblyTurn {
  type: "Turn";
  turn_order: number;
  end_of_turn: boolean;
  transcript?: string;
  words?: { start: number; end: number }[];
  speaker_label?: string | null;
  language_code?: string | null;
}

/** Events from `WS /ws/sessions/{id}`: the SessionEvents the backend produces, plus errors. */
type ServerEvent =
  | Extract<
      SessionEvent,
      {
        type:
          | "translation_done"
          | "translation_failed"
          | "turn_classified"
          | "suggestion_started"
          | "suggestion_evidence"
          | "suggestion_ready"
          | "suggestion_failed";
      }
    >
  | { type: "error"; message: string };

const SERVER_EVENT_TYPES = new Set<string>([
  "translation_done",
  "translation_failed",
  "turn_classified",
  "suggestion_started",
  "suggestion_evidence",
  "suggestion_ready",
  "suggestion_failed",
  "error",
]);

const BEGIN_TIMEOUT_MS = 10_000;
const TERMINATE_TIMEOUT_MS = 3_000;
const MAX_RECONNECTS = 3;
// After a recording ends, a moment of silence lets AssemblyAI close the last turn.
const END_OF_FILE_GRACE_MS = 2_000;
/** Audio kept while the AssemblyAI socket (re)connects, in 50 ms frames. */
const BUFFERED_FRAMES = 20;
const TRANSLATION_TIMEOUT_MS = 30_000;
const ANSWER_TIMEOUT_MS = 60_000;

function describe(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Something went wrong with the live session.";
}

function normalizeSpeaker(label: unknown) {
  if (typeof label !== "string") return null;
  const trimmed = label.trim();
  return trimmed && trimmed.toUpperCase() !== "UNKNOWN" ? trimmed.slice(0, 16) : null;
}

function normalizeLanguage(code: unknown) {
  if (typeof code !== "string" || !code.trim()) return null;
  return code.trim().toLowerCase().split(/[-_]/)[0].slice(0, 8);
}

function closeReason(event: CloseEvent, serverError: string | null) {
  if (serverError) return serverError;
  return event.reason ? `${event.reason} (code ${event.code})` : `code ${event.code}`;
}

/**
 * Relays final turns to the backend and receives translations, classifications,
 * and answers. Reconnects on its own; turns the server hasn't answered for yet are
 * sent again (the backend ignores duplicates).
 */
class BackendChannel {
  private socket: WebSocket | null = null;
  private sessionId: string | null = null;
  private open = false;
  private closed = true;
  private retries = 0;
  private retryTimer: number | null = null;
  private queue: string[] = [];
  private unacknowledged = new Map<string, string>();

  constructor(
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onSessionLost: (sessionId: string) => void,
  ) {}

  /** Pending turns carry over, e.g. into a session recreated after an API restart. */
  connect(sessionId: string) {
    if (this.sessionId === sessionId && !this.closed) return;
    this.disconnect();
    this.sessionId = sessionId;
    this.closed = false;
    this.retries = 0;
    this.connectNow();
  }

  sendTurn(turn: Omit<FinalTurnPayload, "needsTranslation">) {
    const message = JSON.stringify({ type: "turn_final", turn });
    this.unacknowledged.set(turn.id, message);
    if (this.open) this.socket?.send(message);
  }

  send(message: object) {
    const text = JSON.stringify(message);
    if (this.open) this.socket?.send(text);
    else this.queue.push(text);
  }

  /** Any event about a turn means the server has it. */
  acknowledge(turnId: string) {
    this.unacknowledged.delete(turnId);
  }

  close() {
    this.disconnect();
    this.queue = [];
    this.unacknowledged.clear();
  }

  private disconnect() {
    this.closed = true;
    this.open = false;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close(1000);
    this.socket = null;
  }

  private connectNow() {
    const sessionId = this.sessionId;
    if (this.closed || !sessionId) return;
    const socket = new WebSocket(api.socketUrl(sessionId));
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.open = true;
      this.retries = 0;
      for (const message of this.unacknowledged.values()) socket.send(message);
      for (const message of this.queue.splice(0)) socket.send(message);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      try {
        const data: unknown = JSON.parse(event.data);
        const type = (data as { type?: unknown })?.type;
        if (typeof type === "string" && SERVER_EVENT_TYPES.has(type)) {
          this.onEvent(data as ServerEvent);
        }
      } catch {
        // Not JSON: ignore it.
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.open = false;
      if (!this.closed) void this.retry(sessionId);
    };
  }

  private async retry(sessionId: string) {
    // The API rejects sockets for sessions it doesn't know before the handshake
    // completes, so the browser can't see why. Ask: after a restart it's gone.
    try {
      await api.getSession(sessionId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && this.sessionId === sessionId) {
        this.disconnect();
        this.onSessionLost(sessionId);
        return;
      }
    }
    if (this.closed || this.sessionId !== sessionId) return;
    const delay = Math.min(8_000, 500 * 2 ** this.retries);
    this.retries += 1;
    this.retryTimer = window.setTimeout(() => this.connectNow(), delay);
  }
}

/**
 * The live pipeline: tab or microphone audio → AssemblyAI streaming speech-to-text
 * (browser-direct, with a short-lived token from our API) → final turns relayed to
 * the Contexa API → translations, question detection, evidence, and answers back.
 *
 * Partial turns only update the screen; only final turns reach the backend
 * (implementation guide §11). AssemblyAI sessions are billed while open, so every
 * way out (Stop, errors, leaving the page) terminates the stream.
 */
export class LiveTransport implements SessionTransport {
  readonly kind = "live" as const;

  private listeners = new Set<Listener>();
  /** Bumped by stop/reset/failures: aborts async start steps and reconnects. */
  private run = 0;
  private phase: "idle" | "starting" | "streaming" | "stopping" = "idle";
  private config: SessionConfig | null = null;
  private audioContext: AudioContext | null = null;
  private media: MediaStream | null = null;
  /** The recording, when the audio source is a file. */
  private playback: FilePlayback | null = null;
  private pipeline: PcmPipeline | null = null;
  private stt: WebSocket | null = null;
  private sttReady = false;
  private sttError: string | null = null;
  /** Each AssemblyAI connection is a segment; turn_order restarts at 0 in each. */
  private segment = 0;
  private segmentStartedAt = 0;
  private listeningSince = 0;
  private reconnects = 0;
  private buffered: ArrayBuffer[] = [];
  private finalized = new Set<string>();
  /** Final turns as sent, to re-send with manual requests (see `resend`). */
  private sentTurns = new Map<string, Omit<FinalTurnPayload, "needsTranslation">>();
  private keyterms: string[] = [];
  private frameCount = 0;
  private timers = new Map<string, number>();
  private stopWatchingDocuments: (() => void) | null = null;
  private channel: BackendChannel;

  constructor(private readonly session: ApiSessionManager) {
    this.channel = new BackendChannel(
      (event) => this.onServerEvent(event),
      (sessionId) => void this.recoverSession(sessionId),
    );
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(config: SessionConfig, context: TransportContext) {
    if (this.phase !== "idle") return;
    const run = ++this.run;
    this.phase = "starting";
    this.config = config;
    this.segment = 0;
    this.reconnects = 0;
    this.listeningSince = 0;
    this.buffered = [];
    this.finalized.clear();
    this.emit({ type: "status", status: "requesting_permission" });
    let audioContext: AudioContext;
    try {
      // Created while the Start click is still being handled, so the browser lets it run.
      audioContext = new AudioContext();
    } catch {
      this.fail({ code: "unknown", message: "This browser doesn't support live audio (Web Audio)." });
      return;
    }
    this.audioContext = audioContext;

    let media: MediaStream;
    let playback: FilePlayback | null = null;
    try {
      if (config.audioSource === "file") {
        const file = context.getAudioFile();
        if (!file) {
          throw new CaptureError({ code: "unknown", message: "Choose a recording to play first." });
        }
        playback = await loadAudioFile(audioContext, file);
        media = playback.stream;
      } else {
        media = await captureAudio(config.audioSource);
      }
    } catch (error) {
      if (run === this.run) {
        this.fail(error instanceof CaptureError ? error.error : { code: "unknown", message: describe(error) });
      }
      return;
    }
    if (run !== this.run) {
      playback?.release();
      releaseStream(media);
      return;
    }
    this.media = media;
    this.playback = playback;
    playback?.element.addEventListener("ended", () => {
      window.setTimeout(() => {
        if (run === this.run) void this.stop();
      }, END_OF_FILE_GRACE_MS);
    });
    // "Stop sharing" in the browser's bar ends the session like the Stop button.
    media.getAudioTracks()[0]?.addEventListener("ended", () => {
      if (run === this.run) void this.stop();
    });
    this.emit({ type: "status", status: "connecting" });

    try {
      const sessionId = await this.session.prepare(config);
      if (run !== this.run) return;
      this.channel.connect(sessionId);
      const pipeline = await startPcmPipeline(audioContext, media, (pcm, level) =>
        this.onAudio(pcm, level),
      );
      if (run !== this.run) {
        pipeline.close();
        return;
      }
      this.pipeline = pipeline;
      this.watchDocuments(run);
      await this.openStt(run);
    } catch (error) {
      if (run === this.run) this.fail({ code: "unknown", message: describe(error) });
    }
  }

  async stop() {
    if (this.phase === "idle" || this.phase === "stopping") return;
    this.run += 1;
    this.phase = "stopping";
    this.emit({ type: "status", status: "stopping" });
    await this.releaseCapture();
    this.phase = "idle";
    this.emit({ type: "status", status: "stopped" });
  }

  reset() {
    this.run += 1;
    this.phase = "idle";
    void this.releaseCapture();
    this.channel.close();
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.finalized.clear();
    this.sentTurns.clear();
    this.session.reset();
  }

  requestAnswer(turnId: string, style?: AnswerStyle) {
    this.resend(turnId);
    this.channel.send({ type: "request_answer", turnId, ...(style ? { style } : {}) });
  }

  recap(input: RecapInput) {
    return api.recap(input);
  }

  retryTranslation(turnId: string) {
    this.resend(turnId);
    this.channel.send({ type: "retry_translation", turnId });
    this.watch(`translation:${turnId}`, TRANSLATION_TIMEOUT_MS, () =>
      this.emit({
        type: "translation_failed",
        turnId,
        message: "No translation arrived from the Contexa API.",
      }),
    );
  }

  private emit(event: SessionEvent) {
    for (const listener of this.listeners) listener(event);
  }

  /**
   * An API restart (e.g. `--reload` while developing) starts a new server session that
   * doesn't know earlier turns. Sending the turn again first is harmless (the server
   * ignores turns it has) and lets a manual request on an old turn still work.
   */
  private resend(turnId: string) {
    const turn = this.sentTurns.get(turnId);
    if (turn) this.channel.send({ type: "turn_final", turn });
  }

  private fail(error: SessionError) {
    this.run += 1;
    this.phase = "idle";
    void this.releaseCapture();
    this.emit({ type: "status", status: "error", error });
  }

  /** Stops the audio first, then ends the AssemblyAI session cleanly. */
  private async releaseCapture() {
    const stt = this.stt;
    this.stt = null;
    this.sttReady = false;
    this.buffered = [];
    this.stopWatchingDocuments?.();
    this.stopWatchingDocuments = null;
    this.pipeline?.close();
    this.pipeline = null;
    this.playback?.release();
    this.playback = null;
    releaseStream(this.media);
    this.media = null;
    const context = this.audioContext;
    this.audioContext = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    if (stt) await terminate(stt);
  }

  private async openStt(run: number) {
    const sessionId = await this.session.ensure();
    const token = await api.streamToken(sessionId);
    if (run !== this.run) return;
    this.keyterms = token.keyterms;
    this.emit({ type: "keyterms_applied", keyterms: token.keyterms });

    const segment = ++this.segment;
    const socket = new WebSocket(token.websocketUrl);
    socket.binaryType = "arraybuffer";
    this.stt = socket;
    this.sttReady = false;
    this.sttError = null;
    let begun = false;
    const beginTimer = window.setTimeout(() => {
      if (!begun && this.stt === socket) {
        this.sttError = "AssemblyAI didn't start the session in time.";
        socket.close();
      }
    }, BEGIN_TIMEOUT_MS);

    socket.onmessage = (event) => {
      if (this.stt !== socket || typeof event.data !== "string") return;
      let message: { type?: string; error?: unknown };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "Begin") {
        begun = true;
        window.clearTimeout(beginTimer);
        this.onBegin(socket);
      } else if (message.type === "Turn") {
        this.onTurn(segment, message as AssemblyTurn);
      } else if (typeof message.error === "string") {
        this.sttError = message.error;
      }
    };
    socket.onclose = (event) => {
      window.clearTimeout(beginTimer);
      if (this.stt === socket) void this.onSttClosed(run, event, begun);
    };
  }

  private onBegin(socket: WebSocket) {
    this.reconnects = 0;
    this.sttReady = true;
    this.segmentStartedAt = performance.now();
    if (!this.listeningSince) this.listeningSince = this.segmentStartedAt;
    this.phase = "streaming";
    this.emit({ type: "status", status: "listening" });
    for (const frame of this.buffered.splice(0)) socket.send(frame);
    this.resumePlayback();
  }

  /** A recording plays only while AssemblyAI is listening, so none of it is lost. */
  private resumePlayback() {
    const element = this.playback?.element;
    if (!element || !element.paused || element.ended) return;
    element.play().catch(() =>
      this.fail({
        code: "unknown",
        message: "The browser wouldn't play the recording. Press Start again.",
      }),
    );
  }

  private async onSttClosed(run: number, event: CloseEvent, begun: boolean) {
    this.stt = null;
    this.sttReady = false;
    if (run !== this.run || this.phase === "stopping" || this.phase === "idle") return;
    const reason = closeReason(event, this.sttError);

    if (!begun && !this.listeningSince) {
      // It never started: a key, credit, or parameter problem that a retry won't fix.
      const hint =
        event.code === 1006 && !this.sttError
          ? " Check the server's AssemblyAI API key and account balance."
          : "";
      this.fail({
        code: "unknown",
        message: `AssemblyAI didn't start the stream (${reason}).${hint}`,
      });
      return;
    }
    this.playback?.element.pause(); // resumes on the next Begin
    while (this.reconnects < MAX_RECONNECTS) {
      this.reconnects += 1;
      this.phase = "starting";
      this.emit({ type: "status", status: "reconnecting" });
      await new Promise((resolve) => window.setTimeout(resolve, 1000 * this.reconnects));
      if (run !== this.run) return;
      try {
        await this.openStt(run);
        return; // Begin switches back to "listening"; a new close comes back here.
      } catch {
        if (run !== this.run) return;
      }
    }
    this.fail({
      code: "connection_lost",
      message: `The connection to AssemblyAI dropped and couldn't be restored (${reason}). The transcript so far is kept.`,
    });
  }

  private onAudio(pcm: ArrayBuffer, level: number) {
    if (this.phase === "streaming" && ++this.frameCount % 2 === 0) {
      this.emit({ type: "audio_level", level });
    }
    const socket = this.stt;
    if (socket && this.sttReady && socket.readyState === WebSocket.OPEN) {
      socket.send(pcm);
      return;
    }
    this.buffered.push(pcm);
    if (this.buffered.length > BUFFERED_FRAMES) this.buffered.shift();
  }

  private onTurn(segment: number, turn: AssemblyTurn) {
    const config = this.config;
    if (!config || segment !== this.segment) return;
    const id = `s${segment}-t${turn.turn_order}`;
    if (this.finalized.has(id)) return;

    const text = (turn.transcript ?? "").trim();
    const speaker = config.speakerLabels ? normalizeSpeaker(turn.speaker_label) : null;
    const words = Array.isArray(turn.words) ? turn.words : [];
    // AssemblyAI times words from the start of this connection's audio.
    const offset = this.segmentStartedAt - this.listeningSince;
    const now = performance.now() - this.listeningSince;
    const startedAtMs = Math.max(0, Math.round(words.length ? offset + words[0].start : now));

    if (!turn.end_of_turn) {
      if (text) this.emit({ type: "turn_partial", turn: { id, speaker, text, startedAtMs } });
      return;
    }

    this.finalized.add(id);
    if (!text) {
      this.emit({ type: "turn_discarded", turnId: id });
      return;
    }
    const endedAtMs = Math.max(
      startedAtMs,
      Math.round(words.length ? offset + words[words.length - 1].end : now),
    );
    const detectedLanguage =
      normalizeLanguage(turn.language_code) ?? speakerLanguageOption(config.speakerLanguage).expected;
    const final = { id, speaker, text, detectedLanguage, startedAtMs, endedAtMs };
    // Same rule as the backend: translate unless the turn is already in the display language.
    const needsTranslation = detectedLanguage !== config.displayLanguage;
    this.emit({ type: "turn_final", turn: { ...final, needsTranslation } });
    this.sentTurns.set(id, final);
    this.channel.sendTurn(final);
    if (needsTranslation) {
      this.watch(`translation:${id}`, TRANSLATION_TIMEOUT_MS, () =>
        this.emit({
          type: "translation_failed",
          turnId: id,
          message: "No translation arrived from the Contexa API.",
        }),
      );
    }
  }

  private onServerEvent(event: ServerEvent) {
    switch (event.type) {
      case "error":
        console.warn(`[contexa] ${event.message}`);
        return;
      case "translation_done":
      case "translation_failed":
        this.unwatch(`translation:${event.turnId}`);
        this.channel.acknowledge(event.turnId);
        break;
      case "turn_classified":
        this.channel.acknowledge(event.turnId);
        break;
      case "suggestion_started":
        this.channel.acknowledge(event.turnId);
        this.watch(`answer:${event.suggestionId}`, ANSWER_TIMEOUT_MS, () =>
          this.emit({
            type: "suggestion_failed",
            suggestionId: event.suggestionId,
            message: "No answer arrived from the Contexa API.",
          }),
        );
        break;
      case "suggestion_ready":
      case "suggestion_failed":
        this.unwatch(`answer:${event.suggestionId}`);
        break;
    }
    this.emit(event);
  }

  /**
   * Keyterms follow the documents: an upload or removal during a live session is
   * sent to AssemblyAI mid-stream with UpdateConfiguration, no reconnect needed.
   */
  private watchDocuments(run: number) {
    this.stopWatchingDocuments?.();
    this.stopWatchingDocuments = null;
    if (!this.config || speechModelFor(this.config.speakerLanguage) !== "universal-3-5-pro") return;
    this.stopWatchingDocuments = this.session.onDocumentsChanged(() => {
      void this.refreshKeyterms(run);
    });
  }

  private async refreshKeyterms(run: number) {
    const sessionId = this.session.sessionId;
    if (!sessionId) return;
    let keyterms: string[];
    try {
      keyterms = (await api.getSession(sessionId)).keyterms;
    } catch {
      return;
    }
    if (run !== this.run || keyterms.join("\n") === this.keyterms.join("\n")) return;
    this.keyterms = keyterms;
    this.emit({ type: "keyterms_applied", keyterms });
    const socket = this.stt;
    if (socket && this.sttReady && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "UpdateConfiguration", keyterms_prompt: keyterms }));
    }
    // Otherwise the next connection's URL carries them.
  }

  /** The API forgot our session (restart): continue in a new one. */
  private async recoverSession(staleId: string) {
    try {
      this.channel.connect(await this.session.recreate(staleId));
    } catch (error) {
      console.warn(`[contexa] ${describe(error)}`);
    }
  }

  private watch(key: string, ms: number, onTimeout: () => void) {
    this.unwatch(key);
    this.timers.set(
      key,
      window.setTimeout(() => {
        this.timers.delete(key);
        onTimeout();
      }, ms),
    );
  }

  private unwatch(key: string) {
    const timer = this.timers.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    this.timers.delete(key);
  }
}

/** Ends an AssemblyAI session: Terminate, then wait briefly for the server to close. */
function terminate(socket: WebSocket) {
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.close();
    return Promise.resolve();
  }
  if (socket.readyState !== WebSocket.OPEN) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      socket.close(1000);
      resolve();
    }, TERMINATE_TIMEOUT_MS);
    socket.addEventListener(
      "close",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    try {
      socket.send(JSON.stringify({ type: "Terminate" }));
    } catch {
      window.clearTimeout(timer);
      socket.close();
      resolve();
    }
  });
}

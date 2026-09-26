import type { SpeechModel } from "@/lib/languages";
import type { DocumentKind, SessionConfig } from "@/types/session";

/**
 * Base URL of the Contexa API (FastAPI), e.g. `http://localhost:8000`.
 * When it isn't set, /session runs the scripted preview instead.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") || null;

/** A failed API call, with a message that can be shown to the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiSessionConfig = Pick<
  SessionConfig,
  "title" | "speakerLanguage" | "displayLanguage" | "responseLanguage" | "speakerLabels"
>;

export interface ApiDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  sizeBytes: number;
  status: "ready" | "failed";
  chunkCount: number | null;
  error: string | null;
  keyterms: string[];
}

export interface ApiSession {
  id: string;
  config: ApiSessionConfig;
  speechModel: SpeechModel;
  documents: ApiDocument[];
  turnCount: number;
  keyterms: string[];
}

export interface ApiHealth {
  status: "ok";
  assemblyaiConfigured: boolean;
  /** Grounded answers. */
  llmModel: string;
  /** Translation + question detection on every turn. */
  llmAnalysisModel: string;
}

export interface StreamToken {
  token: string;
  expiresInSeconds: number;
  maxSessionDurationSeconds: number;
  speechModel: SpeechModel;
  sampleRate: number;
  encoding: string;
  /** Ready-to-open AssemblyAI URL, including the short-lived token. */
  websocketUrl: string;
  keyterms: string[];
}

export function toApiConfig(config: SessionConfig): ApiSessionConfig {
  const { title, speakerLanguage, displayLanguage, responseLanguage, speakerLabels } = config;
  return { title, speakerLanguage, displayLanguage, responseLanguage, speakerLabels };
}

function baseUrl() {
  if (!API_URL) throw new ApiError("NEXT_PUBLIC_API_URL isn't set.", 0);
  return API_URL;
}

export function unreachableMessage() {
  return `Couldn't reach the Contexa API at ${API_URL}. Check that it's running and try again.`;
}

/** FastAPI puts the reason in `detail`: a string, or a list of validation errors. */
export function errorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const { detail } = body as { detail: unknown };
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg;
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, init);
  } catch {
    throw new ApiError(unreachableMessage(), 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(
      errorDetail(body) ?? `The Contexa API returned HTTP ${response.status}.`,
      response.status,
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

const session = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;

export const api = {
  health: () => request<ApiHealth>("/health", { cache: "no-store" }),
  createSession: (config: Partial<ApiSessionConfig> = {}) =>
    request<ApiSession>("/api/sessions", json("POST", config)),
  getSession: (id: string) => request<ApiSession>(session(id)),
  updateSession: (id: string, config: Partial<ApiSessionConfig>) =>
    request<ApiSession>(session(id), json("PATCH", config)),
  resetSession: (id: string) => request<ApiSession>(`${session(id)}/reset`, { method: "POST" }),
  streamToken: (id: string) =>
    request<StreamToken>(`${session(id)}/stream-token`, { method: "POST" }),
  deleteDocument: (id: string, documentId: string) =>
    request<void>(`${session(id)}/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    }),
  documentsUrl: (id: string) => `${baseUrl()}${session(id)}/documents`,
  /** `WS /ws/sessions/{id}`: final turns in, translations and answers out. */
  socketUrl: (id: string) => `${baseUrl().replace(/^http/, "ws")}/ws/sessions/${encodeURIComponent(id)}`,
};

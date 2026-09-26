import { request } from "@/lib/api/client";
import type { LanguageCode, SpeakerLanguage } from "@/lib/languages";
import type { AnswerStyle, SessionRecap, TurnType } from "@/types/session";

import { historyHeaders } from "./identity";

/** A finished session as the API stores it (`PUT /api/meetings/{id}`). */
export interface MeetingTurn {
  id: string;
  speaker: string | null;
  text: string;
  translation: string | null;
  type: TurnType | null;
  requiresAnswer: boolean;
  /** Offset from the start of the session. */
  startedAtMs: number;
}

export interface MeetingAnswer {
  turnId: string;
  questionSummary: string;
  answerPreferredLanguage: string;
  answerTargetLanguage: string;
  style: AnswerStyle | null;
  /** The passages the answer relied on, e.g. "notewave-architecture.md · Conflict handling". */
  sources: string[];
}

export interface MeetingIn {
  title: string;
  startedAt: string;
  endedAt: string;
  speakerLanguage: SpeakerLanguage;
  displayLanguage: LanguageCode;
  turns: MeetingTurn[];
  answers: MeetingAnswer[];
  recap: SessionRecap | null;
}

export interface MeetingSummary {
  id: string;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  turnCount: number;
  questionCount: number;
  summary: string | null;
  speakerLanguage: string;
  displayLanguage: string;
}

export interface MeetingDetail extends MeetingSummary {
  data: MeetingIn;
}

export interface SearchHit {
  meetingId: string;
  title: string;
  startedAt: string | null;
  kind: "turn" | "answer" | "recap";
  speaker: string | null;
  text: string;
  atMs: number | null;
  turnId: string | null;
  score: number;
}

export interface SearchResults {
  /** Matched by meaning (embeddings) as well as by words. */
  semantic: boolean;
  hits: SearchHit[];
}

/** 503: the API has no DATABASE_URL, so there is no history to save to or read. */
export const HISTORY_OFF_STATUS = 503;

const meeting = (id: string) => `/api/meetings/${encodeURIComponent(id)}`;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers } = await historyHeaders();
  return request<T>(path, { ...init, cache: "no-store", headers: { ...headers, ...init.headers } });
}

export const historyApi = {
  save: (id: string, body: MeetingIn) =>
    call<{ id: string; passages: number; embedded: boolean }>(meeting(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  list: () => call<{ meetings: MeetingSummary[] }>("/api/meetings"),
  get: (id: string) => call<MeetingDetail>(meeting(id)),
  remove: (id: string) => call<void>(meeting(id), { method: "DELETE" }),
  search: (query: string, signal?: AbortSignal) =>
    call<SearchResults>(`/api/meetings/search?q=${encodeURIComponent(query)}`, { signal }),
};

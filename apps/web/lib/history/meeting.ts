import type { SessionState } from "@/lib/session/store";

import type { MeetingAnswer, MeetingIn } from "./client";

// The API's limits (apps/api/app/models/history.py).
const MAX_TURNS = 2000;
const MAX_ANSWERS = 500;

function clip(text: string, limit: number) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Ids the history accepts: `^[A-Za-z0-9_-]{8,64}$`. */
export function newMeetingId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The finished session as the history stores it, or null when nothing was said. */
export function meetingFromSession(state: SessionState): MeetingIn | null {
  const { config, turns, suggestions, startedAt, endedAt, recap } = state;
  const spoken = turns.filter((turn) => turn.text.trim()).slice(-MAX_TURNS);
  if (spoken.length === 0 || startedAt === null) return null;

  const answers: MeetingAnswer[] = [];
  for (const turn of spoken) {
    const suggestion = turn.suggestionId ? suggestions[turn.suggestionId] : undefined;
    const answer = suggestion?.answer;
    if (!suggestion || suggestion.stage !== "ready" || !answer) continue;
    const used = new Set(answer.usedContext.map((ref) => ref.chunkId));
    const sources = (suggestion.evidence ?? [])
      .filter((item) => used.has(item.chunkId))
      .map((item) => (item.location ? `${item.documentName} · ${item.location}` : item.documentName));
    answers.push({
      turnId: turn.id,
      questionSummary: clip(answer.questionSummary, 1000),
      answerPreferredLanguage: clip(answer.answerPreferredLanguage, 4000),
      answerTargetLanguage: clip(answer.answerTargetLanguage, 4000),
      style: suggestion.style,
      sources: [...new Set(sources)].slice(0, 10),
    });
  }

  return {
    title: clip(config.title.trim(), 120),
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt ?? Date.now()).toISOString(),
    speakerLanguage: config.speakerLanguage,
    displayLanguage: config.displayLanguage,
    turns: spoken.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      text: clip(turn.text.trim(), 4000),
      translation:
        turn.translation.status === "done" ? clip(turn.translation.result.text, 8000) : null,
      type: turn.classification?.type ?? null,
      requiresAnswer: turn.classification?.requiresAnswer ?? false,
      startedAtMs: Math.max(0, Math.round(turn.startedAtMs)),
    })),
    answers: answers.slice(0, MAX_ANSWERS),
    recap: recap.status === "ready" ? recap.recap : null,
  };
}

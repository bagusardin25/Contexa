import { formatClock, formatLatency } from "@/lib/format";
import type { MeetingDetail } from "@/lib/history/client";
import { languageName, speakerLanguageOption } from "@/lib/languages";
import type { SessionState } from "@/lib/session/store";
import type { SessionRecap } from "@/types/session";

function recapLines({ summary, keyPoints, actionItems, openQuestions }: SessionRecap) {
  const lines = ["## Recap", "", summary, ""];
  for (const [heading, items] of [
    ["Key points", keyPoints],
    ["Action items", actionItems],
    ["Open questions", openQuestions],
  ] as const) {
    if (items.length === 0) continue;
    lines.push(`### ${heading}`, "", ...items.map((item) => `- ${item}`), "");
  }
  return lines;
}

/** Markdown transcript with translations and suggested answers. */
export function transcriptToMarkdown(state: SessionState) {
  const { config, turns, suggestions, startedAt, endedAt } = state;
  const lines: string[] = [];
  const title = config.title.trim() || "Contexa session";

  lines.push(`# ${title}`, "");
  if (startedAt) lines.push(`- Date: ${new Date(startedAt).toLocaleString()}`);
  if (startedAt && endedAt) lines.push(`- Duration: ${formatClock(endedAt - startedAt)}`);
  lines.push(
    `- Speaker language: ${speakerLanguageOption(config.speakerLanguage).label}`,
    `- Read in: ${languageName(config.displayLanguage)}`,
    "",
  );

  if (state.recap.status === "ready") lines.push(...recapLines(state.recap.recap));

  lines.push("## Transcript", "");

  for (const turn of turns) {
    const speaker = turn.speaker ? `Speaker ${turn.speaker}` : "Speaker";
    lines.push(`**[${formatClock(turn.startedAtMs)}] ${speaker}:** ${turn.text}`);
    if (turn.translation.status === "done") {
      lines.push(`> ${turn.translation.result.text}`);
    }
    lines.push("");

    const suggestion = turn.suggestionId ? suggestions[turn.suggestionId] : undefined;
    const answer = suggestion?.answer;
    if (suggestion && answer) {
      lines.push(
        `### Suggested answer (${formatLatency(suggestion.latencyMs ?? 0)})`,
        "",
        `- **${languageName(answer.preferredLanguage)}:** ${answer.answerPreferredLanguage}`,
        `- **Ready to say (${languageName(answer.targetLanguage)}):** ${answer.answerTargetLanguage}`,
      );
      for (const item of suggestion.evidence ?? []) {
        lines.push(`- Evidence: ${item.documentName} — ${item.location}`);
      }
      lines.push(`- Note: ${answer.confidenceNote}`, "");
    }
  }

  return lines.join("\n");
}

/** The same format for a meeting saved to the history. */
export function meetingToMarkdown(meeting: MeetingDetail) {
  const { data } = meeting;
  const lines: string[] = [];
  lines.push(`# ${data.title.trim() || "Contexa session"}`, "");
  const started = Date.parse(data.startedAt);
  const ended = Date.parse(data.endedAt);
  if (!Number.isNaN(started)) lines.push(`- Date: ${new Date(started).toLocaleString()}`);
  if (!Number.isNaN(started) && !Number.isNaN(ended)) {
    lines.push(`- Duration: ${formatClock(ended - started)}`);
  }
  lines.push(
    `- Speaker language: ${speakerLanguageOption(data.speakerLanguage).label}`,
    `- Read in: ${languageName(data.displayLanguage)}`,
    "",
  );
  if (data.recap) lines.push(...recapLines(data.recap));
  lines.push("## Transcript", "");

  const answers = new Map(data.answers.map((answer) => [answer.turnId, answer]));
  for (const turn of data.turns) {
    const speaker = turn.speaker ? `Speaker ${turn.speaker}` : "Speaker";
    lines.push(`**[${formatClock(turn.startedAtMs)}] ${speaker}:** ${turn.text}`);
    if (turn.translation) lines.push(`> ${turn.translation}`);
    lines.push("");
    const answer = answers.get(turn.id);
    if (answer) {
      lines.push(
        "### Suggested answer",
        "",
        `- **${languageName(data.displayLanguage)}:** ${answer.answerPreferredLanguage}`,
        `- **Ready to say:** ${answer.answerTargetLanguage}`,
        ...answer.sources.map((source) => `- Evidence: ${source}`),
        "",
      );
    }
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

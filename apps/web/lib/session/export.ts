import { formatClock, formatLatency } from "@/lib/format";
import { languageName, speakerLanguageOption } from "@/lib/languages";
import type { SessionState } from "@/lib/session/store";

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
    "## Transcript",
    "",
  );

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

export function downloadTextFile(filename: string, content: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

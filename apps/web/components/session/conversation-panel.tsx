"use client";

import {
  ArrowDownIcon,
  CaptionsIcon,
  CircleCheckIcon,
  DownloadIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { formatClock, formatLatency, pluralize } from "@/lib/format";
import { downloadTextFile, transcriptToMarkdown } from "@/lib/session/export";
import type { AudioSource, SessionStatus } from "@/types/session";

import { AudioBars, PanelHeader } from "./primitives";
import { useIsPreview, useSession, useSessionStoreApi } from "./session-store-provider";
import { PartialTurnItem, TurnItem } from "./turn-item";

export function ConversationPanel({
  onShowSuggestion,
}: {
  onShowSuggestion: (suggestionId: string) => void;
}) {
  const turns = useSession((state) => state.turns);
  const partial = useSession((state) => state.partial);
  const status = useSession((state) => state.status);
  const suggestions = useSession((state) => state.suggestions);
  const activeSuggestionId = useSession((state) => state.activeSuggestionId);
  const audioSource = useSession((state) => state.config.audioSource);
  const requestAnswer = useSession((state) => state.requestAnswer);
  const retryTranslation = useSession((state) => state.retryTranslation);
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom();

  const questionCount = turns.filter((turn) => turn.classification?.requiresAnswer).length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={CaptionsIcon}
        title="Live conversation"
        meta={
          turns.length > 0
            ? `${pluralize(turns.length, "turn")} · ${pluralize(questionCount, "question")}`
            : undefined
        }
        actions={status === "stopped" && turns.length > 0 ? <ExportButton size="xs" variant="ghost" /> : null}
      />
      <ConnectionBanner />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={contentRef} className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-4">
          {turns.length === 0 && !partial ? (
            <ConversationEmptyState status={status} audioSource={audioSource} />
          ) : null}

          <div role="log" aria-label="Transcript" className="space-y-1">
            {turns.map((turn) => (
              <TurnItem
                key={turn.id}
                turn={turn}
                suggestion={turn.suggestionId ? suggestions[turn.suggestionId] : undefined}
                isActive={turn.suggestionId !== null && turn.suggestionId === activeSuggestionId}
                onGenerateAnswer={requestAnswer}
                onRetryTranslation={retryTranslation}
                onShowSuggestion={onShowSuggestion}
              />
            ))}
          </div>

          {partial ? <PartialTurnItem partial={partial} /> : null}

          {status === "listening" && !partial && turns.length > 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <AudioBars className="h-3 text-live" />
              Listening…
            </div>
          ) : null}

          {status === "stopped" ? <SessionSummary /> : null}
        </div>
      </div>

      {!isAtBottom ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md"
        >
          <ArrowDownIcon />
          Jump to latest
        </Button>
      ) : null}
    </div>
  );
}

function ConnectionBanner() {
  const status = useSession((state) => state.status);
  const error = useSession((state) => state.error);
  const isPreview = useIsPreview();

  if (status === "reconnecting") {
    return (
      <div role="status" className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
        <WifiOffIcon className="size-3.5 shrink-0" aria-hidden />
        <span>
          {isPreview ? "Connection dropped" : "Connection to AssemblyAI dropped"}. Reconnecting — the
          transcript so far is safe.
        </span>
      </div>
    );
  }
  if (status === "error" && error) {
    return (
      <div role="alert" className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
        <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
        <span>{error.message}</span>
      </div>
    );
  }
  return null;
}

function ConversationEmptyState({
  status,
  audioSource,
}: {
  status: SessionStatus;
  audioSource: AudioSource;
}) {
  if (status === "stopped") {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">
        No speech was captured in this session.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-live/10 text-live">
        <AudioBars className="h-5" />
      </div>
      <p className="font-medium">
        Listening to your{" "}
        {audioSource === "tab" ? "shared tab" : audioSource === "file" ? "recording" : "microphone"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Transcripts appear here as people speak. Every finished turn is translated and checked for
        questions aimed at you.
      </p>
    </div>
  );
}

function ExportButton({
  size = "sm",
  variant = "outline",
}: {
  size?: "xs" | "sm";
  variant?: "ghost" | "outline";
}) {
  const store = useSessionStoreApi();

  const exportTranscript = () => {
    const state = store.getState();
    const stamp = new Date(state.startedAt ?? Date.now())
      .toISOString()
      .slice(0, 16)
      .replace(/[:T]/g, "-");
    downloadTextFile(`contexa-transcript-${stamp}.md`, transcriptToMarkdown(state));
  };

  return (
    <Button size={size} variant={variant} onClick={exportTranscript}>
      <DownloadIcon />
      Export .md
    </Button>
  );
}

function SessionSummary() {
  const startedAt = useSession((state) => state.startedAt);
  const endedAt = useSession((state) => state.endedAt);
  const turns = useSession((state) => state.turns);
  const suggestions = useSession((state) => state.suggestions);
  const newSession = useSession((state) => state.newSession);

  const questions = turns.filter((turn) => turn.classification?.requiresAnswer).length;
  const latencies = Object.values(suggestions)
    .filter((suggestion) => suggestion.stage === "ready" && suggestion.latencyMs !== null)
    .map((suggestion) => suggestion.latencyMs as number);
  const averageLatency =
    latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null;

  const stats = [
    { label: "Duration", value: startedAt && endedAt ? formatClock(endedAt - startedAt) : "—" },
    { label: "Turns", value: String(turns.length) },
    { label: "Questions", value: String(questions) },
    { label: "Avg. time to answer", value: averageLatency ? formatLatency(averageLatency) : "—" },
  ];

  return (
    <section className="mx-1 mt-6 animate-in rounded-2xl border bg-card p-5 shadow-sm fade-in-0 sm:mx-3">
      <div className="flex flex-wrap items-center gap-2">
        <CircleCheckIcon className="size-4 text-success" aria-hidden />
        <h3 className="font-semibold">Session ended</h3>
        <span className="text-sm text-muted-foreground">
          The stream is closed. Only the transcript is kept, never the audio.
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-muted/50 px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {turns.length > 0 ? <RecapCard /> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {turns.length > 0 ? <ExportButton /> : null}
        <Button size="sm" onClick={newSession}>
          <PlusIcon />
          New session
        </Button>
      </div>
    </section>
  );
}

function RecapCard() {
  const recap = useSession((state) => state.recap);
  const generateRecap = useSession((state) => state.generateRecap);

  return (
    <section
      aria-label="Recap"
      aria-busy={recap.status === "loading"}
      className="mt-5 rounded-xl border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="size-4 text-primary" aria-hidden />
        <h4 className="text-sm font-semibold">Recap</h4>
        <Badge variant="ai" className="px-1.5 py-0 text-[10px]">
          AI-generated
        </Badge>
      </div>

      {recap.status === "loading" ? (
        <div className="mt-3 space-y-2">
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
            Writing the recap…
          </p>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : recap.status === "failed" ? (
        <div role="alert" className="mt-3 flex flex-wrap items-start gap-3 text-sm">
          <p className="min-w-0 flex-1 text-muted-foreground">
            Couldn&apos;t write the recap. {recap.message}
          </p>
          <Button size="xs" variant="outline" onClick={() => void generateRecap()}>
            <RotateCwIcon />
            Retry recap
          </Button>
        </div>
      ) : recap.status === "ready" ? (
        <div lang={recap.language} className="mt-3 space-y-4 text-sm">
          <p className="leading-relaxed">{recap.recap.summary}</p>
          <RecapList title="Key points" items={recap.recap.keyPoints} />
          <RecapList title="Action items" items={recap.recap.actionItems} />
          <RecapList title="Open questions" items={recap.recap.openQuestions} />
        </div>
      ) : (
        <Button size="xs" variant="outline" className="mt-3" onClick={() => void generateRecap()}>
          <SparklesIcon />
          Write a recap
        </Button>
      )}
    </section>
  );
}

function RecapList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <ul className="list-disc space-y-1 pl-5 leading-relaxed marker:text-muted-foreground">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

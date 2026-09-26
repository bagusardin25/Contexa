"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckIcon,
  CircleCheckIcon,
  CircleIcon,
  CircleXIcon,
  CopyIcon,
  FileSearchIcon,
  InfoIcon,
  LoaderCircleIcon,
  MessageCircleQuestionMarkIcon,
  MessageSquareQuoteIcon,
  RotateCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopy } from "@/hooks/use-copy";
import { formatClock, formatLatency, formatPercent, pluralize } from "@/lib/format";
import { languageName, resolveResponseLanguage } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type { Evidence, Suggestion, SuggestionStage, Turn } from "@/types/session";

import { HighlightedText, LanguageTag, PanelHeader, speakerName } from "./primitives";
import { useIsPreview, useSession } from "./session-store-provider";

export function CopilotPanel() {
  const suggestions = useSession((state) => state.suggestions);
  const order = useSession((state) => state.suggestionOrder);
  const activeId = useSession((state) => state.activeSuggestionId);
  const turns = useSession((state) => state.turns);
  const inSetup = useSession((state) => state.startedAt === null);
  const selectSuggestion = useSession((state) => state.selectSuggestion);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A newly selected suggestion should always be read from the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeId]);

  const active = activeId ? suggestions[activeId] : undefined;
  const activeTurn = active ? turns.find((turn) => turn.id === active.turnId) : undefined;
  const earlier = order
    .filter((id) => id !== activeId)
    .map((id) => suggestions[id])
    .filter((suggestion): suggestion is Suggestion => Boolean(suggestion))
    .reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={SparklesIcon}
        title="Response copilot"
        actions={
          <Badge variant="ai">
            <SparklesIcon />
            AI-generated
          </Badge>
        }
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {active && activeTurn ? (
          <SuggestionCard key={active.id} suggestion={active} turn={activeTurn} />
        ) : (
          <CopilotEmptyState inSetup={inSetup} />
        )}

        {earlier.length > 0 ? (
          <section className="mt-6 border-t pt-4">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Earlier suggestions
            </h3>
            <ul className="space-y-1">
              {earlier.map((suggestion) => {
                const turn = turns.find((item) => item.id === suggestion.turnId);
                return (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => selectSuggestion(suggestion.id)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <StageIcon stage={suggestion.stage} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2">
                          {suggestion.answer?.questionSummary ?? turn?.text}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {speakerName(turn?.speaker ?? null)} · {formatClock(turn?.startedAtMs ?? 0)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function CopilotEmptyState({ inSetup }: { inSetup: boolean }) {
  const steps = [
    { title: "A speaker asks you something", body: "Contexa spots questions in finished turns and ignores rhetorical ones." },
    { title: "Your documents are searched", body: "Relevant passages are retrieved from the files you attached." },
    { title: "You get an answer to say", body: "A grounded answer in your language, plus a ready-to-say version in theirs." },
  ];

  return (
    <div className="flex flex-col items-center px-2 py-8 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <SparklesIcon className="size-5" />
      </div>
      <p className="font-medium">{inSetup ? "Answers appear here during the session" : "Listening for questions…"}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {inSetup
          ? "Here's what happens when someone asks you a question:"
          : "Nothing to answer yet. You can also pick any turn and press Generate answer."}
      </p>
      {inSetup ? (
        <ol className="mt-6 w-full space-y-3 text-left">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-xl border bg-card p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">{step.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function SuggestionCard({ suggestion, turn }: { suggestion: Suggestion; turn: Turn }) {
  const displayLanguage = useSession((state) => state.config.displayLanguage);
  const responseLanguage = useSession((state) => state.config.responseLanguage);
  const requestAnswer = useSession((state) => state.requestAnswer);
  const isPreview = useIsPreview();
  const { answer, evidence, stage } = suggestion;

  const preferredLanguage = answer?.preferredLanguage ?? displayLanguage;
  const targetLanguage =
    answer?.targetLanguage ?? resolveResponseLanguage(responseLanguage, turn.detectedLanguage);
  const questionSummary =
    answer?.questionSummary ??
    (turn.translation.status === "done" ? turn.translation.result.text : null);

  return (
    <article aria-live="polite" className="animate-in space-y-4 fade-in-0 slide-in-from-right-2">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {suggestion.trigger === "auto" ? (
            <Badge variant="question">
              <MessageCircleQuestionMarkIcon />
              Question detected
            </Badge>
          ) : (
            <Badge variant="secondary">Manual request</Badge>
          )}
          <span>
            {speakerName(turn.speaker)} · <span className="font-mono tabular-nums">{formatClock(turn.startedAtMs)}</span>
          </span>
          {turn.classification ? (
            <span className="ml-auto tabular-nums">{formatPercent(turn.classification.confidence)} confidence</span>
          ) : null}
        </div>
        <blockquote lang={turn.detectedLanguage ?? undefined} className="line-clamp-3 border-l-2 pl-3 text-sm text-muted-foreground">
          {turn.text}
        </blockquote>
        {questionSummary ? (
          <p lang={preferredLanguage} className="text-[15px] leading-snug font-medium">
            {questionSummary}
          </p>
        ) : null}
      </header>

      <PipelineSteps suggestion={suggestion} />

      {stage === "failed" ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <TriangleAlertIcon className="size-4" aria-hidden />
            Couldn&apos;t generate an answer
          </p>
          <p className="mt-1 text-muted-foreground">
            {suggestion.error} The live transcript keeps running.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => requestAnswer(turn.id)}>
            <RotateCwIcon />
            Try again
          </Button>
        </div>
      ) : (
        <>
          <AnswerSection
            title="Suggested answer"
            language={preferredLanguage}
            loading={!answer}
          >
            {answer ? (
              <p lang={preferredLanguage} className="text-sm leading-relaxed">
                {answer.answerPreferredLanguage}
              </p>
            ) : null}
          </AnswerSection>

          <ReadyToSay text={answer?.answerTargetLanguage ?? null} language={targetLanguage} />

          <EvidenceList evidence={evidence} />

          {answer ? (
            <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {answer.confidenceNote}
            </p>
          ) : null}
        </>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        AI-generated suggestion. Check it before you say it.
        {isPreview ? " Preview: scripted answer." : null}
      </p>
    </article>
  );
}

function PipelineSteps({ suggestion }: { suggestion: Suggestion }) {
  const { stage, evidence, trigger, latencyMs } = suggestion;
  type StepState = "done" | "active" | "pending" | "failed";

  const steps: { key: string; label: string; state: StepState }[] = [
    {
      key: "detect",
      label: trigger === "manual" ? "Manual request" : "Question detected",
      state: "done",
    },
    {
      key: "retrieve",
      label:
        evidence === null
          ? "Searching documents…"
          : evidence.length > 0
            ? `${pluralize(evidence.length, "passage")} retrieved`
            : "No matching passages",
      state: evidence === null ? "active" : "done",
    },
    {
      key: "draft",
      label:
        stage === "ready"
          ? `Answer in ${formatLatency(latencyMs ?? 0)}`
          : stage === "failed"
            ? "Generation failed"
            : "Drafting answer…",
      state:
        stage === "ready" ? "done" : stage === "failed" ? "failed" : stage === "generating" ? "active" : "pending",
    },
  ];

  const icons: Record<StepState, ReactNode> = {
    done: <CircleCheckIcon className="size-3.5 shrink-0 text-success" aria-hidden />,
    active: <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />,
    pending: <CircleIcon className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />,
    failed: <CircleXIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />,
  };

  return (
    <ol
      aria-label="Answer pipeline"
      className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-xs"
    >
      {steps.map((step) => (
        <li key={step.key} className="flex items-start gap-1.5 bg-card px-2.5 py-2">
          <span className="mt-px">{icons[step.state]}</span>
          <span className={cn("leading-snug", step.state === "pending" ? "text-muted-foreground" : "text-foreground/90")}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function AnswerSection({
  title,
  language,
  loading,
  children,
}: {
  title: string;
  language: string;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        <LanguageTag code={language} />
        <span className="sr-only">in {languageName(language)}</span>
      </h3>
      {loading ? <SkeletonLines /> : children}
    </section>
  );
}

function ReadyToSay({ text, language }: { text: string | null; language: string }) {
  const { copied, copy } = useCopy();

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
      <div className="mb-2 flex items-center gap-2">
        <MessageSquareQuoteIcon className="size-4 text-primary" aria-hidden />
        <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">Ready to say</h3>
        <LanguageTag code={language} className="border-primary/30 text-primary" />
        <Button
          size="xs"
          variant={copied ? "secondary" : "default"}
          className="ml-auto"
          disabled={!text}
          onClick={() => {
            if (text) void copy(text);
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {text ? (
        <p lang={language} className="text-base leading-relaxed font-medium">
          {text}
        </p>
      ) : (
        <SkeletonLines />
      )}
    </section>
  );
}

function EvidenceList({ evidence }: { evidence: Evidence[] | null }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <FileSearchIcon className="size-3.5" aria-hidden />
        Evidence{evidence ? ` (${evidence.length})` : ""}
      </h3>
      {evidence === null ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : evidence.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
          No passage in your documents matches this question, so the answer doesn&apos;t cite
          anything.
        </p>
      ) : (
        <ol className="space-y-2">
          {evidence.map((item, index) => (
            <EvidenceItem key={item.chunkId} item={item} index={index + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

function EvidenceItem({ item, index }: { item: Evidence; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const long = item.snippet.length > 160;

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[11px] font-semibold text-primary">
          {index}
        </span>
        <span className="min-w-0 truncate">
          <span className="font-medium">{item.documentName}</span>
          <span className="text-muted-foreground"> · {item.location}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums" title="Retrieval relevance">
          <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-success" style={{ width: formatPercent(item.score) }} />
          </span>
          {formatPercent(item.score)}
        </span>
      </div>
      <p className={cn("mt-2 text-xs leading-relaxed text-muted-foreground", !expanded && long && "line-clamp-3")}>
        <HighlightedText
          text={item.snippet}
          terms={item.highlights}
          markClassName="rounded-sm bg-question/25 px-0.5 text-foreground"
        />
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show full passage"}
        </button>
      ) : null}
    </li>
  );
}

function StageIcon({ stage, className }: { stage: SuggestionStage; className?: string }) {
  if (stage === "ready") return <CircleCheckIcon className={cn("size-4 shrink-0 text-success", className)} aria-label="Ready" />;
  if (stage === "failed") return <CircleXIcon className={cn("size-4 shrink-0 text-destructive", className)} aria-label="Failed" />;
  return <LoaderCircleIcon className={cn("size-4 shrink-0 animate-spin text-primary", className)} aria-label="In progress" />;
}

function SkeletonLines() {
  return (
    <div className="space-y-2 py-0.5" role="status" aria-label="Loading">
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-3/5" />
    </div>
  );
}

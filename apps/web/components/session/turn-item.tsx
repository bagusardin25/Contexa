"use client";

import { memo } from "react";
import {
  ArrowRightIcon,
  HandIcon,
  LoaderCircleIcon,
  MessageCircleQuestionMarkIcon,
  RotateCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatClock, formatLatency, formatPercent } from "@/lib/format";
import { languageShort } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type { PartialTurn, Suggestion, Turn, TurnClassification } from "@/types/session";

import {
  AudioBars,
  HighlightedText,
  LanguageTag,
  SpeakerAvatar,
  speakerName,
} from "./primitives";

interface TurnItemProps {
  turn: Turn;
  suggestion: Suggestion | undefined;
  isActive: boolean;
  onGenerateAnswer: (turnId: string) => void;
  onRetryTranslation: (turnId: string) => void;
  onShowSuggestion: (suggestionId: string) => void;
}

export const TurnItem = memo(function TurnItem({
  turn,
  suggestion,
  isActive,
  onGenerateAnswer,
  onRetryTranslation,
  onShowSuggestion,
}: TurnItemProps) {
  const needsAnswer = turn.classification?.requiresAnswer ?? false;

  return (
    <article
      aria-label={`${speakerName(turn.speaker)} at ${formatClock(turn.startedAtMs)}`}
      className={cn(
        "group relative flex animate-in gap-3 rounded-xl px-3 py-3 transition-colors duration-300 fade-in-0 slide-in-from-bottom-1",
        needsAnswer && "bg-question/[0.07] ring-1 ring-question/25",
        isActive && "ring-2 ring-primary/40",
      )}
    >
      <SpeakerAvatar speaker={turn.speaker} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{speakerName(turn.speaker)}</span>
          <span aria-hidden>·</span>
          <time className="font-mono tabular-nums">{formatClock(turn.startedAtMs)}</time>
          <LanguageTag code={turn.detectedLanguage} />
          <ClassificationBadge classification={turn.classification} className="ml-auto" />
        </div>

        <p lang={turn.detectedLanguage ?? undefined} className="mt-1 text-[15px] leading-relaxed">
          {turn.text}
        </p>

        <TranslationBlock turn={turn} onRetry={onRetryTranslation} />

        <div className="mt-1.5 flex min-h-7 items-center">
          {suggestion ? (
            <SuggestionChip
              suggestion={suggestion}
              isActive={isActive}
              onClick={() => onShowSuggestion(suggestion.id)}
            />
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onGenerateAnswer(turn.id)}
              className="-ml-2 text-muted-foreground transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
            >
              <SparklesIcon />
              Generate answer
            </Button>
          )}
        </div>
      </div>
    </article>
  );
});

function ClassificationBadge({
  classification,
  className,
}: {
  classification: TurnClassification | null;
  className?: string;
}) {
  if (!classification) return null;
  const { type, requiresAnswer, confidence } = classification;

  if (type === "question" && requiresAnswer) {
    return (
      <Badge variant="question" className={className}>
        <MessageCircleQuestionMarkIcon />
        Question · {formatPercent(confidence)}
      </Badge>
    );
  }
  if (type === "question") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0} className={cn("cursor-help", className)}>
            Rhetorical
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Detected as a question that doesn&apos;t need your answer.</TooltipContent>
      </Tooltip>
    );
  }
  if (type === "action_request") {
    return (
      <Badge variant="ai" className={className}>
        <HandIcon />
        Action request
      </Badge>
    );
  }
  return null;
}

function TranslationBlock({
  turn,
  onRetry,
}: {
  turn: Turn;
  onRetry: (turnId: string) => void;
}) {
  const { translation } = turn;
  if (translation.status === "not_needed") return null;

  return (
    <div className="mt-2 border-l-2 border-translation/50 pl-3">
      {translation.status === "pending" ? (
        <div className="space-y-1.5 py-1" role="status" aria-label="Translating">
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ) : null}

      {translation.status === "done" ? (
        <>
          <p lang={translation.result.targetLanguage} className="text-[15px] leading-relaxed text-foreground/80">
            <span className="mr-2 align-[1px] font-mono text-[10px] font-semibold text-translation">
              {languageShort(translation.result.targetLanguage)}
            </span>
            <HighlightedText
              text={translation.result.text}
              terms={translation.result.technicalTermsPreserved}
              markTitle="Technical term kept in its original form"
              markClassName="bg-transparent text-inherit underline decoration-translation/60 decoration-dotted underline-offset-4"
            />
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80 tabular-nums">
            translated in {formatLatency(translation.latencyMs)}
          </p>
        </>
      ) : null}

      {translation.status === "failed" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 py-0.5 text-sm">
          <span className="text-destructive">Translation failed. {translation.message}</span>
          <Button variant="outline" size="xs" onClick={() => onRetry(turn.id)}>
            <RotateCwIcon />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SuggestionChip({
  suggestion,
  isActive,
  onClick,
}: {
  suggestion: Suggestion;
  isActive: boolean;
  onClick: () => void;
}) {
  if (suggestion.stage === "failed") {
    return (
      <Button variant="ghost" size="xs" onClick={onClick} className="-ml-2 text-destructive">
        <TriangleAlertIcon />
        Answer failed · view
      </Button>
    );
  }
  if (suggestion.stage !== "ready") {
    return (
      <Button variant="ghost" size="xs" onClick={onClick} className="-ml-2 text-primary">
        <LoaderCircleIcon className="animate-spin" />
        {suggestion.stage === "retrieving" ? "Searching your documents…" : "Drafting answer…"}
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="xs" onClick={onClick} className="-ml-2 text-primary">
      <SparklesIcon />
      {isActive ? "Showing in copilot" : "View suggested answer"}
      {isActive ? null : <ArrowRightIcon />}
    </Button>
  );
}

export function PartialTurnItem({ partial }: { partial: PartialTurn }) {
  return (
    <div className="flex gap-3 px-3 py-3" aria-hidden="true">
      <SpeakerAvatar speaker={partial.speaker} className="ring-2 ring-live/40" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{speakerName(partial.speaker)}</span>
          <span>·</span>
          <time className="font-mono tabular-nums">{formatClock(partial.startedAtMs)}</time>
          <span className="inline-flex items-center gap-1.5 text-live">
            <AudioBars className="h-3" />
            speaking
          </span>
        </div>
        <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
          {partial.text}
          <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-caret-blink bg-primary" />
        </p>
      </div>
    </div>
  );
}

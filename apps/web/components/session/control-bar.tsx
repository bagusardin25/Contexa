"use client";

import {
  AppWindowIcon,
  CheckIcon,
  CopyIcon,
  LoaderCircleIcon,
  MicIcon,
  PlusIcon,
  SparklesIcon,
  SquareIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopy } from "@/hooks/use-copy";
import { SPEECH_MODELS, speechModelFor } from "@/lib/languages";
import { isSessionActive } from "@/lib/session/store";
import { cn } from "@/lib/utils";

import { useSession } from "./session-store-provider";

export function ControlBar() {
  const status = useSession((state) => state.status);
  const hasTurns = useSession((state) => state.turns.length > 0);
  const readyToSay = useSession((state) => {
    const active = state.activeSuggestionId ? state.suggestions[state.activeSuggestionId] : undefined;
    return active?.answer?.answerTargetLanguage ?? null;
  });
  const stop = useSession((state) => state.stop);
  const newSession = useSession((state) => state.newSession);
  const requestAnswer = useSession((state) => state.requestAnswer);
  const { copied, copy } = useCopy();

  const running = isSessionActive(status) || status === "stopping";

  return (
    <footer className="flex h-16 shrink-0 items-center gap-2 border-t bg-background/90 px-3 backdrop-blur sm:gap-3 sm:px-4">
      {running ? (
        <Button
          variant="live"
          onClick={() => void stop()}
          disabled={status === "stopping"}
          aria-label="Stop session"
        >
          {status === "stopping" ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <SquareIcon className="fill-current" />
          )}
          <span>
            Stop<span className="hidden sm:inline"> session</span>
          </span>
        </Button>
      ) : (
        <Button variant="outline" onClick={newSession}>
          <PlusIcon />
          New session
        </Button>
      )}

      <AudioReadout className="hidden md:flex" />

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              disabled={!hasTurns}
              onClick={() => requestAnswer()}
              aria-label="Generate answer for the latest turn"
            >
              <SparklesIcon />
              <span className="hidden sm:inline">Generate answer</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Draft an answer for the latest turn, even if it wasn&apos;t detected as a question.</TooltipContent>
        </Tooltip>
        <Button
          disabled={!readyToSay}
          onClick={() => {
            if (readyToSay) void copy(readyToSay, "Ready-to-say answer copied");
          }}
          aria-label="Copy ready-to-say answer"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span className="hidden sm:inline">Copy ready-to-say</span>
        </Button>
      </div>
    </footer>
  );
}

function AudioReadout({ className }: { className?: string }) {
  const audioSource = useSession((state) => state.config.audioSource);
  const speakerLanguage = useSession((state) => state.config.speakerLanguage);
  const model = SPEECH_MODELS[speechModelFor(speakerLanguage)];

  return (
    <div className={cn("items-center gap-3 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground", className)}>
      <AudioLevelMeter />
      <span className="flex items-center gap-1.5">
        {audioSource === "tab" ? <AppWindowIcon className="size-3.5" aria-hidden /> : <MicIcon className="size-3.5" aria-hidden />}
        {audioSource === "tab" ? "Tab audio" : "Microphone"}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span className="hidden lg:inline">{model.shortName}</span>
    </div>
  );
}

const BAR_WEIGHTS = [0.55, 0.85, 1, 0.75, 0.5];

function AudioLevelMeter() {
  const level = useSession((state) => state.audioLevel);
  const live = useSession((state) => state.status === "listening");

  return (
    <span
      role="meter"
      aria-label="Input level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      className="flex h-4 items-center gap-[3px]"
    >
      {BAR_WEIGHTS.map((weight, index) => (
        <span
          key={index}
          className={cn(
            "w-[3px] rounded-full transition-[height] duration-100",
            live ? "bg-live" : "bg-muted-foreground/40",
          )}
          style={{ height: `${Math.round(Math.min(100, Math.max(18, level * weight * 100 + 12)))}%` }}
        />
      ))}
    </span>
  );
}

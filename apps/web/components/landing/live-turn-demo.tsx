"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronRightIcon,
  CircleCheckIcon,
  MessageCircleQuestionMarkIcon,
  MessageSquareQuoteIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
} from "lucide-react";

import {
  AudioBars,
  HighlightedText,
  LanguageTag,
  SpeakerAvatar,
} from "@/components/session/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DEMO_SOURCES, DEMO_TURNS, type DemoLanguage } from "./demo-content";

type Status = "waiting" | "playing" | "paused" | "done";

const LANGUAGE_OPTIONS: { code: DemoLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
];

/** Start offset for one step of the timeline; globals.css reads it as --at. */
function at(seconds: number, extra?: Record<string, string>): CSSProperties {
  return { "--at": `${seconds.toFixed(2)}s`, ...extra } as CSSProperties;
}

/** When each stage starts, in seconds from the first frame. */
function timeline(chunkCount: number, chunkGap: number) {
  const firstChunk = 0.4;
  const final = firstChunk + chunkCount * chunkGap + 0.25;
  const translation = final + 0.35;
  const question = translation + 0.55;
  const copilot = question + 0.45;
  const retrieved = copilot + 0.7;
  const answer = retrieved + 0.8;
  return { firstChunk, final, translation, question, copilot, retrieved, answer };
}

/**
 * Hero demo: one turn travels from streaming speech to a ready-to-say answer.
 * The markup is the finished state; the CSS timeline in globals.css plays it
 * back only when reduced motion isn't requested.
 */
export function LiveTurnDemo() {
  const [language, setLanguage] = useState<DemoLanguage>("en");
  const [run, setRun] = useState(0);
  const [status, setStatus] = useState<Status>("playing");
  const figureRef = useRef<HTMLElement>(null);
  const autoStart = useRef(true);

  // On phones the demo sits below the fold: hold it until it scrolls into view.
  useEffect(() => {
    const node = figureRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    let waiting = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!autoStart.current) {
          observer.disconnect();
        } else if (entry.isIntersecting) {
          observer.disconnect();
          if (waiting) {
            setRun((value) => value + 1);
            setStatus("playing");
          }
        } else if (!waiting) {
          waiting = true;
          setStatus("waiting");
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const restart = () => {
    autoStart.current = false;
    setRun((value) => value + 1);
    setStatus("playing");
  };

  const togglePlayback = () => {
    if (status === "done" || status === "waiting") restart();
    else {
      autoStart.current = false;
      setStatus(status === "playing" ? "paused" : "playing");
    }
  };

  const chooseLanguage = (next: DemoLanguage) => {
    if (next === language) return;
    setLanguage(next);
    restart();
  };

  const turn = DEMO_TURNS[language];
  const t = timeline(turn.chunks.length, turn.chunkGap);
  const lastChunk = turn.chunks.length - 1;
  const quote = language === "ja" ? ["「", "」"] : ["“", "”"];
  const playback =
    status === "done"
      ? { icon: RotateCcwIcon, label: "Replay" }
      : status === "playing"
        ? { icon: PauseIcon, label: "Pause" }
        : { icon: PlayIcon, label: "Play" };

  const steps = [
    { label: "Question detected", at: t.copilot + 0.15 },
    { label: "2 passages retrieved", at: t.retrieved },
    { label: "Answer ready · 2.7 s", at: t.answer - 0.1 },
  ];

  return (
    <figure ref={figureRef} className="min-w-0">
      <div
        className="live-demo overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/[0.06]"
        data-paused={status === "paused" || status === "waiting" ? "" : undefined}
        onAnimationEnd={(event) => {
          if ((event.target as HTMLElement).hasAttribute("data-last")) setStatus("done");
        }}
      >
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-rose-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-2 truncate text-xs text-muted-foreground">Demo day Q&amp;A</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[11px] font-medium tracking-wider text-live-foreground">
            <span className="size-1.5 rounded-full bg-live" aria-hidden />
            LIVE <span className="font-mono tracking-normal">12:48</span>
          </span>
        </div>

        <div key={`${language}-${run}`} className="space-y-4 p-4 sm:p-5">
          <div className="relative flex gap-3 rounded-xl p-3">
            <span
              data-reveal
              style={at(t.question)}
              aria-hidden
              className="absolute inset-0 rounded-xl bg-question/[0.07] ring-1 ring-question/25"
            />
            <span className="relative h-fit">
              <SpeakerAvatar speaker="B" />
              <span
                data-hide
                style={at(t.final)}
                aria-hidden
                className="absolute inset-0 rounded-full ring-2 ring-live/40 motion-reduce:hidden"
              />
            </span>
            <div className="relative min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Speaker B</span>
                <span aria-hidden>·</span>
                <span className="font-mono">12:41</span>
                <LanguageTag code={turn.language} />
                <span className="ml-auto grid justify-items-end *:[grid-area:1/1]">
                  <span
                    data-hide
                    style={at(t.final)}
                    aria-hidden
                    className="inline-flex items-center gap-1.5 self-center text-live-foreground motion-reduce:hidden"
                  >
                    <AudioBars className="h-3" />
                    speaking
                  </span>
                  <Badge data-reveal style={at(t.question)} variant="question">
                    <MessageCircleQuestionMarkIcon />
                    Question · {turn.confidence}
                  </Badge>
                </span>
              </div>

              <p lang={turn.language} className="mt-1 text-sm leading-relaxed">
                <span className="sr-only">{turn.chunks.join(turn.joiner)}</span>
                <span aria-hidden data-final style={at(t.final)}>
                  {turn.chunks.map((chunk, index) => {
                    const start = t.firstChunk + index * turn.chunkGap;
                    const caret = index === lastChunk ? t.final - start : turn.chunkGap;
                    return (
                      <Fragment key={index}>
                        {index > 0 ? turn.joiner : null}
                        <span
                          data-word
                          className={turn.joiner ? undefined : "whitespace-nowrap"}
                          style={at(start, { "--for": `${caret.toFixed(2)}s` })}
                        >
                          {chunk}
                        </span>
                      </Fragment>
                    );
                  })}
                </span>
              </p>

              <p
                data-reveal
                style={at(t.translation)}
                lang="id"
                className="mt-2 border-l-2 border-translation/50 pl-3 text-sm leading-relaxed text-foreground/80"
              >
                <span className="mr-2 font-mono text-[10px] font-semibold text-translation-foreground">ID</span>
                <HighlightedText
                  text={turn.translation}
                  terms={[turn.preservedTerm]}
                  markTitle="Technical term kept in its original form"
                  markClassName="bg-transparent text-inherit underline decoration-translation/60 decoration-dotted underline-offset-4"
                />
              </p>
            </div>
          </div>

          <div className="relative rounded-xl border p-3 sm:p-4">
            {/* Same empty state as the session's copilot panel, until a question lands. */}
            <div
              data-hide
              style={at(t.copilot)}
              aria-hidden
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center motion-reduce:hidden"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <SparklesIcon className="size-4" />
              </span>
              <span className="text-sm font-medium text-muted-foreground">Listening for questions…</span>
            </div>
            <div data-reveal style={at(t.copilot)} className="flex items-center gap-2 text-xs">
              <SparklesIcon className="size-3.5 text-primary" aria-hidden />
              <span className="font-semibold">Response copilot</span>
              <Badge variant="ai" className="ml-auto">
                AI-generated
              </Badge>
            </div>
            <ol
              aria-label="Progress"
              className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground"
            >
              {steps.map((step, index) => (
                <li key={step.label} data-reveal style={at(step.at)} className="flex items-center gap-1.5">
                  {index > 0 ? <ChevronRightIcon className="size-3 opacity-60" aria-hidden /> : null}
                  <CircleCheckIcon className="size-3.5 text-success" aria-hidden />
                  {step.label}
                </li>
              ))}
            </ol>
            <ul
              data-reveal
              style={at(t.retrieved + 0.1)}
              aria-label="Sources"
              className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"
            >
              {DEMO_SOURCES.map((source, index) => (
                <li
                  key={source.name}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1"
                >
                  <span className="font-mono font-semibold text-primary">{index + 1}</span>
                  {source.name} · {source.location}
                </li>
              ))}
            </ul>
            <div
              data-reveal
              data-last
              style={at(t.answer)}
              className="mt-3 rounded-lg border border-primary/25 bg-primary/[0.06] p-3"
            >
              <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-primary uppercase">
                <MessageSquareQuoteIcon className="size-3.5" aria-hidden />
                Ready to say
                <LanguageTag code={turn.language} className="border-primary/30 text-primary" />
              </p>
              <p lang={turn.language} className="mt-1.5 text-sm leading-relaxed font-medium">
                {quote[0]}
                {turn.readyToSay}
                {quote[1]}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline" aria-hidden>
              Speaker language
            </span>
            <div role="group" aria-label="Speaker language" className="inline-flex rounded-lg border bg-background/70 p-0.5">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  lang={option.code}
                  aria-pressed={language === option.code}
                  onClick={() => chooseLanguage(option.code)}
                  className={cn(
                    "h-8 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    language === option.code && "bg-card text-foreground shadow-xs ring-1 ring-border",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlayback}
            className="text-muted-foreground motion-reduce:hidden"
          >
            <playback.icon />
            {playback.label}
            <span className="sr-only"> demo</span>
          </Button>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground text-pretty">
        Scripted example. In a live session, the same steps run on your own tab or mic audio.
      </figcaption>
    </figure>
  );
}

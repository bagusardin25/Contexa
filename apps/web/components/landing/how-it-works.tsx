import type { ReactNode } from "react";
import {
  AppWindowIcon,
  AudioLinesIcon,
  InfoIcon,
  LanguagesIcon,
  MessageCircleQuestionMarkIcon,
  MessageSquareQuoteIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";

import { HighlightedText } from "@/components/session/primitives";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { DEMO_ANSWER, DEMO_PARTIAL, DEMO_SOURCES, DEMO_TURNS } from "./demo-content";
import { SectionIntro, Tag } from "./primitives";

const TURN = DEMO_TURNS.en;

function Artifact({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border bg-card p-4 shadow-xs">{children}</div>;
}

function ArtifactFooter({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 border-t pt-3 font-mono text-[11px] text-muted-foreground">{children}</p>
  );
}

function ListenArtifact() {
  return (
    <Artifact>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <AppWindowIcon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Demo day Q&amp;A</p>
          <p className="text-xs text-muted-foreground">Shared tab · audio on</p>
        </div>
        <span aria-hidden className="flex h-5 items-end gap-[3px] text-live">
          {[40, 75, 100, 60, 85, 45].map((height, index) => (
            <span key={index} className="w-[3px] rounded-full bg-current" style={{ height: `${height}%` }} />
          ))}
        </span>
      </div>
      <ArtifactFooter>PCM16 · 16 kHz → AssemblyAI streaming</ArtifactFooter>
    </Artifact>
  );
}

function UnderstandArtifact() {
  return (
    <Artifact>
      <dl className="space-y-3 text-sm leading-relaxed">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-3">
          <dt>
            <Tag className="text-muted-foreground">partial</Tag>
          </dt>
          <dd className="text-muted-foreground">{DEMO_PARTIAL}…</dd>
        </div>
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-3">
          <dt>
            <Tag className="border-success/50 bg-success/10 text-foreground">final</Tag>
          </dt>
          <dd>{TURN.chunks.join(TURN.joiner)}</dd>
        </div>
      </dl>
      <ArtifactFooter>end_of_turn: true · speaker B</ArtifactFooter>
    </Artifact>
  );
}

function InterpretArtifact() {
  return (
    <Artifact>
      <p lang="id" className="border-l-2 border-translation/50 pl-3 text-sm leading-relaxed">
        <span className="mr-2 font-mono text-[10px] font-semibold text-translation-foreground">ID</span>
        <HighlightedText
          text={TURN.translation}
          terms={[TURN.preservedTerm]}
          markTitle="Technical term kept in its original form"
          markClassName="bg-transparent text-inherit underline decoration-translation/60 decoration-dotted underline-offset-4"
        />
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3">
        <Badge variant="question">
          <MessageCircleQuestionMarkIcon />
          Question · {TURN.confidence}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Kept as spoken: <span className="font-medium text-foreground/80">{TURN.preservedTerm}</span>
        </span>
      </div>
    </Artifact>
  );
}

function AssistArtifact() {
  return (
    <Artifact>
      <ul aria-label="Sources" className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
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
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border p-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Suggested answer
            <Tag>ID</Tag>
          </p>
          <p lang="id" className="mt-1.5 text-sm leading-relaxed">
            {DEMO_ANSWER.id}
          </p>
        </div>
        <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-primary uppercase">
            <MessageSquareQuoteIcon className="size-3.5" aria-hidden />
            Ready to say
            <Tag className="border-primary/30 text-primary">EN</Tag>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed font-medium">“{DEMO_ANSWER.en}”</p>
        </div>
      </div>
    </Artifact>
  );
}

const STEPS: {
  icon: LucideIcon;
  title: string;
  body: string;
  tech: string;
  node: string;
  note?: string;
  artifact: ReactNode;
}[] = [
  {
    icon: AppWindowIcon,
    title: "Listen",
    body: "Share the tab playing your webinar, or use your microphone. Capture only starts when you press Start.",
    tech: "Browser tab audio",
    node: "border-live/30 bg-live/10 text-live",
    artifact: <ListenArtifact />,
  },
  {
    icon: AudioLinesIcon,
    title: "Understand",
    body: "AssemblyAI Universal-3.5 Pro Realtime streams the transcript as people speak, with end-of-turn detection and speaker labels.",
    tech: "AssemblyAI Streaming STT",
    node: "bg-card text-foreground",
    note: "Partial transcripts only update the screen. Translation, question detection, and retrieval run on finished turns, which keeps latency and cost low.",
    artifact: <UnderstandArtifact />,
  },
  {
    icon: LanguagesIcon,
    title: "Interpret",
    body: "Each finished turn is translated into your language, keeping terms like pull request, WebSocket, or Supabase intact, and checked for a question aimed at you.",
    tech: "Fast LLM · structured output",
    node: "border-translation/35 bg-translation/10 text-translation",
    artifact: <InterpretArtifact />,
  },
  {
    icon: SparklesIcon,
    title: "Assist",
    body: "When a question needs your answer, Contexa retrieves passages from your documents and drafts a reply in both languages.",
    tech: "Retrieval + grounded answers",
    node: "border-primary/30 bg-primary/10 text-primary",
    artifact: <AssistArtifact />,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-14">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionIntro
          eyebrow="How it works"
          title="Follow one question from live audio to a ready-to-say answer"
          body="Contexa runs its own orchestration on top of AssemblyAI, so every step (translation, question detection, retrieval, and the answer) stays visible and under your control."
        />
        <ol className="mt-12">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="group relative grid gap-4 pb-12 pl-14 last:pb-0 sm:pl-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12"
            >
              <span aria-hidden className="absolute top-12 bottom-2 left-5 w-px bg-border group-last:hidden" />
              <span
                aria-hidden
                className={cn(
                  "absolute top-0 left-0 flex size-10 items-center justify-center rounded-full border",
                  step.node,
                )}
              >
                <step.icon className="size-4" />
              </span>
              <div className="lg:pt-1">
                <p className="font-mono text-xs text-muted-foreground">
                  0{index + 1} · {step.tech}
                </p>
                <h3 className="mt-1.5 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 max-w-md leading-relaxed text-muted-foreground text-pretty">
                  {step.body}
                </p>
                {step.note ? (
                  <p className="mt-4 flex max-w-md gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                    {step.note}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">{step.artifact}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

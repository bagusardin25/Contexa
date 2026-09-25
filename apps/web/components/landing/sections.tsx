import Link from "next/link";
import {
  AppWindowIcon,
  ArrowRightIcon,
  AudioLinesIcon,
  EarIcon,
  FileSearchIcon,
  HandIcon,
  LanguagesIcon,
  MessageSquareQuoteIcon,
  ShieldCheckIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ProductPreview } from "./product-preview";

function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      <p className="mt-3 text-muted-foreground text-pretty">{body}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_50%_-10%,color-mix(in_oklab,var(--primary)_20%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)] [background-size:48px_48px] opacity-60"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
        <div>
          <Badge variant="ai" className="mb-5">
            <AudioLinesIcon />
            Real-time speech by AssemblyAI
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.35rem] lg:leading-[1.05]">
            Translation tells you what was said.{" "}
            <span className="bg-linear-to-r from-indigo-500 via-violet-500 to-cyan-500 bg-clip-text text-transparent">
              Contexa helps you participate.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
            A live copilot for webinars and meetings in another language. It transcribes speech as
            it happens, translates every turn, and when someone asks you a question, drafts a
            grounded answer from your own documents, ready to say in their language.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/session">
                Start a session
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t pt-6 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Listens to</dt>
              <dd className="mt-1 font-medium">Tab or mic audio</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Understands</dt>
              <dd className="mt-1 font-medium">English, Japanese, 99+ more</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Answers in</dt>
              <dd className="mt-1 font-medium">Your language and theirs</dd>
            </div>
          </dl>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

const GAPS = [
  {
    icon: EarIcon,
    title: "Comprehension gap",
    body: "Fast, accented speech in another language is hard to follow while it is happening.",
  },
  {
    icon: FileSearchIcon,
    title: "Context gap",
    body: "Generic translators don't know your project, your terminology, or the documents you brought.",
  },
  {
    icon: MessageSquareQuoteIcon,
    title: "Response gap",
    body: "Even when you know the answer, phrasing it in their language takes time a live Q&A doesn't give you.",
  },
];

export function Problem() {
  return (
    <section id="problem" className="scroll-mt-14 border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionIntro
          eyebrow="The problem"
          title="You understand the topic. The language gets in the way."
          body="Students, junior developers, and hackathon teams often know the answer but can't follow or respond fast enough when the session is in English or Japanese."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {GAPS.map((gap) => (
            <FeatureCard key={gap.title} {...gap} />
          ))}
        </div>
      </div>
    </section>
  );
}

const LAYERS = [
  {
    icon: AppWindowIcon,
    title: "Listen",
    body: "Share the tab playing your webinar, or use your microphone. Capture only starts when you press Start.",
    tech: "Browser tab audio",
  },
  {
    icon: AudioLinesIcon,
    title: "Understand",
    body: "AssemblyAI Universal-3.5 Pro Realtime streams the transcript as people speak, with end-of-turn detection and speaker labels.",
    tech: "AssemblyAI Streaming STT",
  },
  {
    icon: LanguagesIcon,
    title: "Interpret",
    body: "Each finished turn is translated into your language, keeping terms like pull request, WebSocket, or Supabase intact.",
    tech: "AssemblyAI LLM Gateway",
  },
  {
    icon: SparklesIcon,
    title: "Assist",
    body: "When a question is aimed at you, Contexa retrieves passages from your documents and drafts an answer in both languages.",
    tech: "Retrieval + grounded answers",
  },
];

const PIPELINE = [
  "Tab audio",
  "AssemblyAI streaming STT",
  "Final turn",
  "Translate",
  "Detect question",
  "Retrieve context",
  "Suggested answer",
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-14">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionIntro
          eyebrow="How it works"
          title="From live audio to a grounded answer in seconds"
          body="Contexa runs its own orchestration on top of AssemblyAI, so every step (translation, question detection, retrieval, and the answer) stays visible and under your control."
        />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LAYERS.map((layer, index) => (
            <li key={layer.title} className="relative rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <layer.icon className="size-5" aria-hidden />
                </span>
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{layer.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{layer.body}</p>
              <p className="mt-4 inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {layer.tech}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-2xl border bg-muted/30 p-5">
          <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Pipeline">
            {PIPELINE.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                {index > 0 ? <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden /> : null}
                <span className="rounded-full border bg-card px-2.5 py-1 font-medium">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            Partial transcripts only update the screen. Translation, question detection, and
            retrieval run on finished turns, which keeps latency and cost low.
          </p>
        </div>
      </div>
    </section>
  );
}

const PRINCIPLES = [
  {
    icon: HandIcon,
    title: "You stay in control",
    body: "Contexa suggests; you decide what to say. It never speaks or joins a meeting on your behalf.",
  },
  {
    icon: FileSearchIcon,
    title: "Evidence you can inspect",
    body: "Every answer lists the passages it came from, and says so plainly when your documents don't cover a question.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Private by default",
    body: "API keys stay on the server, audio is never stored, and nothing is captured until you press Start.",
  },
];

export function Principles() {
  return (
    <section id="principles" className="scroll-mt-14 border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionIntro
          eyebrow="Principles"
          title="A copilot, not an impersonator"
          body="Contexa helps you understand and respond. You remain responsible for what is said."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <FeatureCard key={principle.title} {...principle} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="relative isolate overflow-hidden rounded-3xl border bg-card px-6 py-12 text-center sm:px-12">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_80%_at_50%_120%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]"
        />
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          Walk into your next webinar with a copilot
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Attach your project docs, share the tab, and let Contexa handle the language while you
          handle the ideas.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/session">
            Start a session
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    </section>
  );
}

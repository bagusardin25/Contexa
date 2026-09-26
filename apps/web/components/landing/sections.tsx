import Link from "next/link";
import {
  AppWindowIcon,
  ArrowRightIcon,
  AudioLinesIcon,
  EarIcon,
  FileSearchIcon,
  FileTextIcon,
  HandIcon,
  LanguagesIcon,
  MessageSquareQuoteIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { LiveTurnDemo } from "./live-turn-demo";
import { SectionIntro, Tag } from "./primitives";

/** Facts from lib/languages.ts and lib/documents/validate.ts. */
const FACTS: { term: string; tags: { short: string; name?: string }[]; more?: string }[] = [
  {
    term: "Hears",
    tags: [
      { short: "EN", name: "English" },
      { short: "JA", name: "Japanese" },
      { short: "ID", name: "Indonesian" },
    ],
    more: "and more",
  },
  {
    term: "Translates into",
    tags: [
      { short: "ID", name: "Indonesian" },
      { short: "EN", name: "English" },
      { short: "JA", name: "Japanese" },
    ],
  },
  {
    term: "Grounded in",
    tags: [{ short: "PDF" }, { short: "DOCX" }, { short: "MD", name: "Markdown" }, { short: "TXT" }],
  },
];

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
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
        <div>
          <Badge variant="ai" className="mb-5">
            <AudioLinesIcon />
            Real-time speech by AssemblyAI
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.35rem] lg:leading-[1.05]">
            Translation tells you what was said.{" "}
            <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400">
              Contexa helps you participate.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground text-pretty sm:text-lg">
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
          <dl className="mt-10 grid max-w-xl gap-3 border-t pt-6 sm:grid-cols-3 sm:gap-6">
            {FACTS.map((fact) => (
              <div key={fact.term} className="flex items-center justify-between gap-4 sm:block">
                <dt className="text-xs text-muted-foreground">{fact.term}</dt>
                <dd className="flex flex-wrap items-center justify-end gap-1 sm:mt-2 sm:justify-start">
                  {fact.tags.map((tag) => (
                    <Tag key={tag.short}>
                      {tag.name ? (
                        <>
                          <span aria-hidden>{tag.short}</span>
                          <span className="sr-only">{tag.name}</span>
                        </>
                      ) : (
                        tag.short
                      )}
                    </Tag>
                  ))}
                  {fact.more ? (
                    <span className="ml-0.5 text-xs text-muted-foreground">{fact.more}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <LiveTurnDemo />
      </div>
    </section>
  );
}

const GAPS = [
  {
    icon: EarIcon,
    title: "Comprehension gap",
    body: "Fast, accented speech in another language is hard to follow while it is happening.",
    fix: "Every finished turn is transcribed and translated into your language as the session runs.",
  },
  {
    icon: FileSearchIcon,
    title: "Context gap",
    body: "Generic translators don't know your project, your terminology, or the documents you brought.",
    fix: "Answers come from the documents you attach, with the passages they used.",
  },
  {
    icon: MessageSquareQuoteIcon,
    title: "Response gap",
    body: "Even when you know the answer, phrasing it in their language takes time a live Q&A doesn't give you.",
    fix: "You get a ready-to-say reply in the speaker's language, next to your own.",
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
        <ol className="mt-12 grid divide-y border-y md:grid-cols-3 md:divide-x md:divide-y-0">
          {GAPS.map((gap, index) => (
            <li key={gap.title} className="flex flex-col py-8 md:px-6 md:first:pl-0 md:last:pr-0 lg:px-8">
              <div className="flex items-center gap-3 text-muted-foreground">
                <gap.icon className="size-5" aria-hidden />
                <span className="font-mono text-xs">0{index + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{gap.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{gap.body}</p>
              <div className="mt-auto pt-6">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <ArrowRightIcon className="size-3.5" aria-hidden />
                  With Contexa
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">{gap.fix}</p>
              </div>
            </li>
          ))}
        </ol>
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
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16 lg:py-20">
        <SectionIntro
          eyebrow="Principles"
          title="A copilot, not an impersonator"
          body="Contexa helps you understand and respond. You remain responsible for what is said."
        />
        <ul className="divide-y border-y">
          {PRINCIPLES.map((principle) => (
            <li key={principle.title} className="flex gap-4 py-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-background text-primary">
                <principle.icon className="size-4" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold">{principle.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{principle.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** What a first session needs, from the setup screen and upload rules. */
const CHECKLIST = [
  {
    icon: AppWindowIcon,
    title: "A tab with audio, or your microphone",
    body: "Webinars, YouTube, and web meetings. Tab audio works in Chrome and Edge.",
  },
  {
    icon: FileTextIcon,
    title: "Your documents, if you have them",
    body: "PDF, DOCX, Markdown, or TXT, up to 10 MB each and 10 per session.",
  },
  {
    icon: LanguagesIcon,
    title: "The language you read best",
    body: "Follow along in Bahasa Indonesia, English, or 日本語. Answers default to the speaker's language.",
  },
];

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="grid overflow-hidden rounded-3xl border bg-card md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="relative isolate flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_70%_at_0%_100%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
          />
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Walk into your next webinar with a copilot
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground text-pretty">
            Attach your project docs, share the tab, and let Contexa handle the language while you
            handle the ideas.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/session">
                Start a session
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-t bg-muted/30 px-6 py-8 sm:px-10 sm:py-10 md:border-t-0 md:border-l">
          <h3 className="text-sm font-semibold">What you need</h3>
          <ul className="mt-5 space-y-5">
            {CHECKLIST.map((item) => (
              <li key={item.title} className="flex gap-3">
                <item.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

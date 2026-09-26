import { MessageCircleQuestionMarkIcon, MessageSquareQuoteIcon } from "lucide-react";

import { DEMO_TURNS } from "@/components/landing/demo-content";
import { HighlightedText, LanguageTag, SpeakerAvatar } from "@/components/session/primitives";
import { Badge } from "@/components/ui/badge";

const TURN = DEMO_TURNS.en;

/** Product context beside the auth forms (large screens only). Static on purpose: nothing moves while people type. */
export function AuthPanel() {
  return (
    <aside className="relative isolate hidden overflow-hidden border-l bg-muted/30 lg:flex lg:items-center lg:justify-center lg:p-12 xl:p-16">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_60%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_0%,black,transparent)] [background-size:48px_48px] opacity-60"
      />
      <figure className="w-full max-w-md">
        <p className="text-3xl font-semibold tracking-tight text-balance">
          Translation tells you what was said.{" "}
          <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400">
            Contexa helps you participate.
          </span>
        </p>

        <div className="mt-10 space-y-3 rounded-2xl border bg-card p-4 shadow-xl shadow-primary/[0.06]">
          <div className="flex gap-3 rounded-xl bg-question/[0.07] p-3 ring-1 ring-question/25">
            <SpeakerAvatar speaker="B" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Speaker B</span>
                <LanguageTag code={TURN.language} />
                <Badge variant="question" className="ml-auto">
                  <MessageCircleQuestionMarkIcon />
                  Question · {TURN.confidence}
                </Badge>
              </div>
              <p className="mt-1 text-sm leading-relaxed">{TURN.chunks.join(TURN.joiner)}</p>
              <p lang="id" className="mt-2 border-l-2 border-translation/50 pl-3 text-sm leading-relaxed text-foreground/80">
                <span className="mr-2 font-mono text-[10px] font-semibold text-translation-foreground">ID</span>
                <HighlightedText
                  text={TURN.translation}
                  terms={[TURN.preservedTerm]}
                  markTitle="Technical term kept in its original form"
                  markClassName="bg-transparent text-inherit underline decoration-translation/60 decoration-dotted underline-offset-4"
                />
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-primary uppercase">
              <MessageSquareQuoteIcon className="size-3.5" aria-hidden />
              Ready to say
              <LanguageTag code={TURN.language} className="border-primary/30 text-primary" />
            </p>
            <p className="mt-1.5 text-sm leading-relaxed font-medium">“{TURN.readyToSay}”</p>
          </div>
        </div>
        <figcaption className="mt-3 text-xs text-muted-foreground">
          Scripted example from a demo day Q&amp;A.
        </figcaption>
      </figure>
    </aside>
  );
}

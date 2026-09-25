import {
  ChevronRightIcon,
  CircleCheckIcon,
  MessageCircleQuestionMarkIcon,
  MessageSquareQuoteIcon,
  SparklesIcon,
} from "lucide-react";

import { LanguageTag, SpeakerAvatar } from "@/components/session/primitives";
import { Badge } from "@/components/ui/badge";

const PIPELINE = ["Question detected", "2 passages retrieved", "Answer ready · 2.7 s"];

/** Static illustration of the workspace for the landing page hero. */
export function ProductPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-linear-to-br from-indigo-500/20 via-violet-500/10 to-cyan-400/20 blur-2xl"
      />
      <figure
        aria-label="Illustration of a live Contexa session"
        className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-indigo-500/5"
      >
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-rose-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-2 truncate text-xs text-muted-foreground">Demo day Q&amp;A</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[11px] font-medium tracking-wider text-live">
            <span className="size-1.5 rounded-full bg-live" aria-hidden />
            LIVE <span className="font-mono tracking-normal">12:48</span>
          </span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex gap-3 rounded-xl bg-question/[0.07] p-3 ring-1 ring-question/25">
            <SpeakerAvatar speaker="B" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Speaker B</span>
                <span aria-hidden>·</span>
                <span className="font-mono">12:41</span>
                <LanguageTag code="en" />
                <Badge variant="question" className="ml-auto">
                  <MessageCircleQuestionMarkIcon />
                  Question · 96%
                </Badge>
              </div>
              <p className="mt-1 text-sm leading-relaxed">
                How does your application handle concurrent updates when two people edit the same
                note?
              </p>
              <p className="mt-2 border-l-2 border-translation/50 pl-3 text-sm leading-relaxed text-foreground/80">
                <span className="mr-2 font-mono text-[10px] font-semibold text-translation">ID</span>
                Bagaimana aplikasi Anda menangani{" "}
                <span className="underline decoration-translation/60 decoration-dotted underline-offset-4">
                  concurrent updates
                </span>{" "}
                ketika dua orang mengedit catatan yang sama?
              </p>
            </div>
          </div>

          <div className="rounded-xl border p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs">
              <SparklesIcon className="size-3.5 text-primary" aria-hidden />
              <span className="font-semibold">Response copilot</span>
              <Badge variant="ai" className="ml-auto">
                AI-generated
              </Badge>
            </div>
            <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
              {PIPELINE.map((step, index) => (
                <li key={step} className="flex items-center gap-1.5">
                  {index > 0 ? <ChevronRightIcon className="size-3 opacity-60" aria-hidden /> : null}
                  <CircleCheckIcon className="size-3.5 text-success" aria-hidden />
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-3 rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-primary uppercase">
                <MessageSquareQuoteIcon className="size-3.5" aria-hidden />
                Ready to say
                <LanguageTag code="en" className="border-primary/30 text-primary" />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed font-medium">
                “We use optimistic locking. Every note has a version column, so if someone else
                saved first, the write is rejected and the client re-applies the edit on the latest
                state.”
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
                <span className="font-mono font-semibold text-primary">1</span>
                architecture.pdf · p. 4
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
                <span className="font-mono font-semibold text-primary">2</span>
                README.md · Realtime sync
              </span>
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
}

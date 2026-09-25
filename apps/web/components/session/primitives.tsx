import { Fragment, type ReactNode } from "react";
import { UserRoundIcon, type LucideIcon } from "lucide-react";

import { languageName, languageShort } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type { DocumentKind } from "@/types/session";

const SPEAKER_STYLES = [
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
];

export function speakerName(speaker: string | null) {
  return speaker ? `Speaker ${speaker}` : "Speaker";
}

export function SpeakerAvatar({
  speaker,
  className,
}: {
  speaker: string | null;
  className?: string;
}) {
  const index = speaker ? speaker.toUpperCase().charCodeAt(0) - 65 : -1;
  const style =
    index >= 0
      ? SPEAKER_STYLES[index % SPEAKER_STYLES.length]
      : "bg-muted text-muted-foreground";

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        style,
        className,
      )}
    >
      {speaker ? speaker.slice(0, 2).toUpperCase() : <UserRoundIcon className="size-4" />}
    </span>
  );
}

export function LanguageTag({
  code,
  className,
}: {
  code: string | null;
  className?: string;
}) {
  return (
    <abbr
      title={languageName(code)}
      className={cn(
        "rounded border px-1 py-px font-mono text-[10px] font-medium tracking-wide text-muted-foreground no-underline",
        className,
      )}
    >
      {languageShort(code)}
    </abbr>
  );
}

export function PanelHeader({
  icon: Icon,
  title,
  meta,
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b px-4", className)}>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <h2 className="text-sm font-semibold whitespace-nowrap">{title}</h2>
      {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

/** Small animated equalizer used for "someone is speaking" / "listening". */
export function AudioBars({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-3.5 items-end gap-[2px]", className)}>
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="h-full w-[3px] origin-bottom rounded-full bg-current motion-safe:animate-equalize"
          style={{ animationDelay: `${bar * 0.18}s` }}
        />
      ))}
    </span>
  );
}

const KIND_STYLES: Record<DocumentKind, string> = {
  pdf: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  docx: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  md: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  txt: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

export function FileKindIcon({ kind, className }: { kind: DocumentKind; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-bold uppercase",
        KIND_STYLES[kind],
        className,
      )}
    >
      {kind}
    </span>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps every occurrence of `terms` (case-insensitive) in a <mark>. */
export function HighlightedText({
  text,
  terms,
  markClassName,
  markTitle,
}: {
  text: string;
  terms: string[];
  markClassName: string;
  markTitle?: string;
}) {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (cleaned.length === 0) return <>{text}</>;

  const lowered = new Set(cleaned.map((term) => term.toLowerCase()));
  const pattern = new RegExp(
    `(${[...cleaned].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`,
    "gi",
  );

  return (
    <>
      {text
        .split(pattern)
        .filter(Boolean)
        .map((part, index) =>
          lowered.has(part.toLowerCase()) ? (
            <mark key={index} className={markClassName} title={markTitle}>
              {part}
            </mark>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          ),
        )}
    </>
  );
}

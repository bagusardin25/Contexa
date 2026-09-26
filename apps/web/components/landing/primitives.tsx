import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      <p className="mt-3 text-muted-foreground text-pretty">{body}</p>
    </div>
  );
}

/** Mono metadata chip: language codes, file types, pipeline fields. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px font-mono text-[11px] font-medium tracking-wide text-foreground/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

"use client";

import { LoaderCircleIcon } from "lucide-react";

import { useNow } from "@/hooks/use-now";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/types/session";

import { useSession } from "./session-store-provider";

type Tone = "idle" | "busy" | "live" | "warning" | "error" | "ended";

const STATUS_COPY: Record<SessionStatus, { label: string; tone: Tone }> = {
  idle: { label: "Ready", tone: "idle" },
  requesting_permission: { label: "Waiting for permission", tone: "busy" },
  connecting: { label: "Connecting", tone: "busy" },
  listening: { label: "Live", tone: "live" },
  reconnecting: { label: "Reconnecting", tone: "warning" },
  stopping: { label: "Stopping", tone: "busy" },
  stopped: { label: "Ended", tone: "ended" },
  error: { label: "Error", tone: "error" },
};

const TONE_STYLES: Record<Tone, string> = {
  idle: "text-muted-foreground",
  busy: "border-primary/25 bg-primary/10 text-primary",
  live: "border-live/30 bg-live/10 text-live",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  ended: "text-muted-foreground",
};

function LiveDot() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full rounded-full bg-live opacity-75 motion-safe:animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-live" />
    </span>
  );
}

export function StatusPill({ className }: { className?: string }) {
  const status = useSession((state) => state.status);
  const startedAt = useSession((state) => state.startedAt);
  const endedAt = useSession((state) => state.endedAt);
  const ticking = status === "listening" || status === "reconnecting";
  const now = useNow(1000, ticking);

  const { label, tone } = STATUS_COPY[status];
  const showClock = startedAt !== null && (tone === "live" || tone === "warning" || tone === "ended");
  const elapsed = startedAt === null ? 0 : (endedAt ?? now ?? startedAt) - startedAt;

  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-2.5 text-xs font-medium",
        TONE_STYLES[tone],
        className,
      )}
    >
      {tone === "live" ? (
        <LiveDot />
      ) : tone === "busy" ? (
        <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <span className="size-2 rounded-full bg-current opacity-60" aria-hidden />
      )}
      <span role="status" className={cn(tone === "live" && "tracking-wider uppercase")}>
        {label}
      </span>
      {showClock ? (
        <span aria-hidden className="font-mono tabular-nums opacity-80">
          {formatClock(elapsed)}
        </span>
      ) : null}
    </span>
  );
}

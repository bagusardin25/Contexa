"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  CircleCheckIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  TriangleAlertIcon,
  UnplugIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { API_URL, type ApiHealth, api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Health =
  | { state: "checking" }
  | { state: "ready"; health: ApiHealth }
  | { state: "unreachable" };

/**
 * Live mode only: whether the Contexa API is up and has its AssemblyAI key, checked
 * before the user presses Start so setup problems show up front.
 */
export function ApiStatus() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; health: Health } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .health()
      .then((health) => ({ state: "ready", health }) as const)
      .catch(() => ({ state: "unreachable" }) as const)
      .then((health) => {
        if (active) setResult({ attempt, health });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const health: Health = result?.attempt === attempt ? result.health : { state: "checking" };
  const retry = (
    <Button variant="outline" size="xs" onClick={() => setAttempt((value) => value + 1)}>
      <RotateCwIcon />
      Check again
    </Button>
  );

  if (health.state === "checking") {
    return (
      <Notice tone="muted" icon={<LoaderCircleIcon className="animate-spin" />}>
        Checking the Contexa API…
      </Notice>
    );
  }
  if (health.state === "unreachable") {
    return (
      <Notice tone="error" icon={<UnplugIcon />} title="Can't reach the Contexa API" action={retry}>
        Nothing answered at <code className="font-mono text-[12px]">{API_URL}</code>. Start the API
        (in <code className="font-mono text-[12px]">apps/api</code>:{" "}
        <code className="font-mono text-[12px]">uv run uvicorn app.main:app --port 8000</code>) and
        check that its <code className="font-mono text-[12px]">CORS_ORIGINS</code> includes this
        page&apos;s origin.
      </Notice>
    );
  }
  if (!health.health.assemblyaiConfigured) {
    return (
      <Notice
        tone="warning"
        icon={<TriangleAlertIcon />}
        title="The API has no AssemblyAI key"
        action={retry}
      >
        Set <code className="font-mono text-[12px]">ASSEMBLYAI_API_KEY</code> in{" "}
        <code className="font-mono text-[12px]">apps/api/.env</code> and restart the API.
        Documents can still be attached; streaming and answers need the key.
      </Notice>
    );
  }
  return (
    <Notice tone="success" icon={<CircleCheckIcon />}>
      Connected to the Contexa API · AssemblyAI key set · turns on{" "}
      <code className="font-mono text-[12px]">{health.health.llmAnalysisModel}</code>, answers on{" "}
      <code className="font-mono text-[12px]">{health.health.llmModel}</code>
    </Notice>
  );
}

const TONES = {
  muted: "border-border bg-muted/40 text-muted-foreground",
  success: "border-success/30 bg-success/5 text-muted-foreground [&_svg]:text-success",
  warning: "border-warning/30 bg-warning/10 [&_svg]:text-warning",
  error: "border-destructive/30 bg-destructive/5 [&_svg]:text-destructive",
} as const;

function Notice({
  tone,
  icon,
  title,
  action,
  children,
}: {
  tone: keyof typeof TONES;
  icon: ReactNode;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cn("mb-4 flex gap-3 rounded-xl border p-3 text-sm [&_svg]:size-4", TONES[tone])}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        <p className={cn(title && "text-muted-foreground")}>{children}</p>
      </div>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </div>
  );
}

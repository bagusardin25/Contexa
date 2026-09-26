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
import { API_URL, type ApiHealth, LLM_PROVIDER_LABELS, api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Health =
  | { state: "checking" }
  | { state: "ready"; health: ApiHealth }
  | { state: "unreachable" };

/**
 * Live mode only: whether the Contexa API is up, has its AssemblyAI key, and has an LLM
 * for translations and answers, checked before the user presses Start so setup problems
 * show up front.
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
        Nothing answered at <Code>{API_URL}</Code>. Start the API (in <Code>apps/api</Code>:{" "}
        <Code>uv run uvicorn app.main:app --port 8000</Code>) and check that its{" "}
        <Code>CORS_ORIGINS</Code> includes this page&apos;s origin.
      </Notice>
    );
  }
  const { assemblyaiConfigured, llmConfigured, llmProblem, llmProvider } = health.health;
  const { llmModel, llmAnalysisModel } = health.health;
  if (!assemblyaiConfigured) {
    return (
      <Notice
        tone="warning"
        icon={<TriangleAlertIcon />}
        title="The API has no AssemblyAI key"
        action={retry}
      >
        Set <Code>ASSEMBLYAI_API_KEY</Code> in <Code>apps/api/.env</Code> and restart the API.
        Live transcription needs it; documents can still be attached.
        {!llmConfigured && llmProvider !== "assemblyai"
          ? ` Translations and answers: ${llmProblem}`
          : null}
      </Notice>
    );
  }
  if (!llmConfigured) {
    return (
      <Notice
        tone="warning"
        icon={<TriangleAlertIcon />}
        title="Translations and answers aren't set up"
        action={retry}
      >
        {llmProblem} Set <Code>LLM_PROVIDER</Code>, <Code>LLM_API_KEY</Code>, and{" "}
        <Code>LLM_MODEL</Code> in <Code>apps/api/.env</Code> (see{" "}
        <Code>.env.example</Code>) and restart the API. The live transcript works without them.
      </Notice>
    );
  }
  return (
    <Notice tone="success" icon={<CircleCheckIcon />}>
      Connected to the Contexa API · speech on AssemblyAI ·{" "}
      {llmAnalysisModel === llmModel ? (
        <>
          translations and answers on <Code>{llmModel}</Code>
        </>
      ) : (
        <>
          translations on <Code>{llmAnalysisModel}</Code>, answers on <Code>{llmModel}</Code>
        </>
      )}{" "}
      via {LLM_PROVIDER_LABELS[llmProvider] ?? llmProvider}
    </Notice>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[12px]">{children}</code>;
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

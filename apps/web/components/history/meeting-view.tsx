"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  CaptionsIcon,
  DatabaseIcon,
  DownloadIcon,
  FileTextIcon,
  LoaderCircleIcon,
  MessageCircleQuestionMarkIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { SpeakerAvatar, speakerName } from "@/components/session/primitives";
import { RecapView } from "@/components/session/recap-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClock, pluralize } from "@/lib/format";
import { type MeetingAnswer, type MeetingDetail, type MeetingTurn, historyApi } from "@/lib/history/client";
import { languageName, speakerLanguageOption } from "@/lib/languages";
import { downloadTextFile, meetingToMarkdown } from "@/lib/session/export";
import { cn } from "@/lib/utils";

import { type Loaded, Notice, failure, formatDate, meetingDuration } from "./history-view";

/** One saved session: its recap, then the transcript with answers under their questions. */
export function MeetingView({ id, turnId }: { id: string; turnId: string | null }) {
  const [result, setResult] = useState<Loaded<MeetingDetail> | null>(null);

  useEffect(() => {
    let active = true;
    historyApi.get(id).then(
      (value) => {
        if (active) setResult({ status: "ready", value });
      },
      (error: unknown) => {
        if (active) setResult(failure(error));
      },
    );
    return () => {
      active = false;
    };
  }, [id]);

  // Opened from a search hit: bring that turn into view once the transcript is there.
  const loaded = result?.status === "ready";
  useEffect(() => {
    if (!loaded || !turnId) return;
    document.getElementById(`turn-${turnId}`)?.scrollIntoView({ block: "center" });
  }, [loaded, turnId]);

  const back = (
    <Link
      href="/history"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" aria-hidden />
      All sessions
    </Link>
  );

  if (!result || result.status === "loading") {
    return (
      <div className="space-y-6" role="status" aria-label="Loading the session">
        {back}
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (result.status === "off") {
    return (
      <div className="space-y-6">
        {back}
        <Notice icon={<DatabaseIcon />} title="History isn't set up on this server">
          Set <code className="font-mono text-[12px]">DATABASE_URL</code> on the Contexa API to
          save and open sessions.
        </Notice>
      </div>
    );
  }
  if (result.status === "failed") {
    return (
      <div className="space-y-6">
        {back}
        <Notice
          tone="error"
          icon={<TriangleAlertIcon />}
          title={result.code === 404 ? "This session isn't in your history" : "Couldn't open this session"}
        >
          {result.code === 404
            ? "It may have been deleted, or saved from another browser or account."
            : result.message}
        </Notice>
      </div>
    );
  }
  return <MeetingBody meeting={result.value} back={back} turnId={turnId} />;
}

function MeetingBody({
  meeting,
  back,
  turnId,
}: {
  meeting: MeetingDetail;
  back: ReactNode;
  turnId: string | null;
}) {
  const { data } = meeting;
  const duration = meetingDuration(meeting);
  const answers = new Map(data.answers.map((answer) => [answer.turnId, answer]));

  const exportMarkdown = () => {
    const stamp = (meeting.startedAt ?? new Date().toISOString()).slice(0, 16).replace(/[:T]/g, "-");
    downloadTextFile(`contexa-transcript-${stamp}.md`, meetingToMarkdown(meeting));
  };

  return (
    <article className="space-y-8" aria-label={meeting.title || "Untitled session"}>
      <div className="space-y-4">
        {back}
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{meeting.title || "Untitled session"}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{formatDate(meeting.startedAt)}</span>
              {duration ? <span className="font-mono tabular-nums">{duration}</span> : null}
              <span className="inline-flex items-center gap-1">
                <CaptionsIcon className="size-3.5" aria-hidden />
                {pluralize(meeting.turnCount, "turn")}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircleQuestionMarkIcon className="size-3.5" aria-hidden />
                {pluralize(meeting.questionCount, "question")}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Speakers: {speakerLanguageOption(data.speakerLanguage).label} · Read in:{" "}
              {languageName(data.displayLanguage)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportMarkdown}>
              <DownloadIcon />
              Export .md
            </Button>
            <DeleteButton id={meeting.id} />
          </div>
        </div>
      </div>

      {data.recap ? (
        <section aria-label="Recap" className="rounded-xl border bg-muted/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Recap</h2>
            <Badge variant="ai" className="px-1.5 py-0 text-[10px]">
              AI-generated
            </Badge>
          </div>
          <RecapView recap={data.recap} language={data.displayLanguage} />
        </section>
      ) : null}

      <section aria-labelledby="transcript-heading" className="space-y-3">
        <h2 id="transcript-heading" className="flex items-center gap-2 text-sm font-semibold">
          <CaptionsIcon className="size-4 text-muted-foreground" aria-hidden />
          Transcript
        </h2>
        <div role="log" aria-label="Transcript" className="space-y-1">
          {data.turns.map((turn) => (
            <SavedTurn
              key={turn.id}
              turn={turn}
              answer={answers.get(turn.id)}
              highlighted={turn.id === turnId}
            />
          ))}
        </div>
      </section>
    </article>
  );
}

function SavedTurn({
  turn,
  answer,
  highlighted,
}: {
  turn: MeetingTurn;
  answer: MeetingAnswer | undefined;
  highlighted: boolean;
}) {
  const question = turn.requiresAnswer || turn.type === "question";
  return (
    <div
      id={`turn-${turn.id}`}
      className={cn(
        "flex scroll-mt-20 gap-3 rounded-xl px-3 py-3",
        question && "bg-question/[0.07] ring-1 ring-question/25",
        highlighted && "ring-2 ring-primary/50",
      )}
    >
      <SpeakerAvatar speaker={turn.speaker} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{speakerName(turn.speaker)}</span>
          <span aria-hidden>·</span>
          <time className="font-mono tabular-nums">{formatClock(turn.startedAtMs)}</time>
          {question ? (
            <Badge variant="question" className="ml-auto">
              <MessageCircleQuestionMarkIcon />
              Question
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-[15px] leading-relaxed">{turn.text}</p>
        {turn.translation ? (
          <p className="mt-2 border-l-2 border-translation/50 pl-3 text-[15px] leading-relaxed text-foreground/80">
            {turn.translation}
          </p>
        ) : null}
        {answer ? <SavedAnswer answer={answer} /> : null}
      </div>
    </div>
  );
}

function SavedAnswer({ answer }: { answer: MeetingAnswer }) {
  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-card p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <SparklesIcon className="size-3.5" aria-hidden />
        Suggested answer
      </p>
      <p className="leading-relaxed font-medium">{answer.answerTargetLanguage}</p>
      {answer.answerPreferredLanguage && answer.answerPreferredLanguage !== answer.answerTargetLanguage ? (
        <p className="leading-relaxed text-muted-foreground">{answer.answerPreferredLanguage}</p>
      ) : null}
      {answer.sources.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {answer.sources.map((source) => (
            <li key={source} className="flex items-center gap-1.5">
              <FileTextIcon className="size-3" aria-hidden />
              {source}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirming" | "deleting">("idle");

  const remove = async () => {
    setState("deleting");
    try {
      await historyApi.remove(id);
      toast.success("Session deleted");
      router.push("/history");
    } catch (error) {
      setState("confirming");
      toast.error("Couldn't delete the session", { description: (error as Error).message });
    }
  };

  if (state === "idle") {
    return (
      <Button size="sm" variant="outline" onClick={() => setState("confirming")}>
        <Trash2Icon />
        Delete
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Confirm delete" className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Delete for good?</span>
      <Button size="sm" variant="destructive" disabled={state === "deleting"} onClick={() => void remove()}>
        {state === "deleting" ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
        Delete session
      </Button>
      <Button size="sm" variant="ghost" disabled={state === "deleting"} onClick={() => setState("idle")}>
        Cancel
      </Button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  CaptionsIcon,
  DatabaseIcon,
  HistoryIcon,
  LoaderCircleIcon,
  MessageCircleQuestionMarkIcon,
  PlusIcon,
  RotateCwIcon,
  SearchIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { UserMenu } from "@/components/auth/user-menu";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL, ApiError } from "@/lib/api/client";
import { formatClock, pluralize } from "@/lib/format";
import {
  HISTORY_OFF_STATUS,
  type MeetingSummary,
  type SearchHit,
  type SearchResults,
  historyApi,
} from "@/lib/history/client";
import { historyHeaders } from "@/lib/history/identity";
import { cn } from "@/lib/utils";

import { MeetingView } from "./meeting-view";

/** `/history`: saved sessions, search across them, and one session in full (`?id=`). */
export function HistoryView() {
  const params = useSearchParams();
  const id = params.get("id");
  const turnId = params.get("turn");

  return (
    <div className="flex min-h-dvh flex-col">
      <HistoryHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {!API_URL ? (
          <Notice icon={<DatabaseIcon />} title="History needs the Contexa API">
            This build has no <code className="font-mono text-[12px]">NEXT_PUBLIC_API_URL</code>, so
            sessions run as a scripted preview and nothing is saved.
          </Notice>
        ) : id ? (
          <MeetingView key={id} id={id} turnId={turnId} />
        ) : (
          <MeetingBrowser />
        )}
      </main>
    </div>
  );
}

function HistoryHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur sm:px-4">
      <Link
        href="/"
        aria-label="Contexa home"
        className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Logo wordmarkClassName="hidden sm:inline" />
      </Link>
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
      <Link href="/history" className="flex items-center gap-1.5 text-sm font-medium">
        <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
        History
      </Link>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/session">
            <PlusIcon />
            <span className="hidden sm:inline">New session</span>
          </Link>
        </Button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

export function formatDate(iso: string | null) {
  if (!iso) return "Unknown date";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function meetingDuration(meeting: { startedAt: string | null; endedAt: string | null }) {
  if (!meeting.startedAt || !meeting.endedAt) return null;
  return formatClock(Date.parse(meeting.endedAt) - Date.parse(meeting.startedAt));
}

export type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "off" }
  | { status: "failed"; message: string; code: number };

export function failure<T>(error: unknown): Loaded<T> {
  if (error instanceof ApiError && error.status === HISTORY_OFF_STATUS) return { status: "off" };
  return {
    status: "failed",
    message: error instanceof Error ? error.message : "Something went wrong.",
    code: error instanceof ApiError ? error.status : 0,
  };
}

function MeetingBrowser() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    list: Loaded<{ meetings: MeetingSummary[]; signedIn: boolean }>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([historyApi.list(), historyHeaders()]).then(
      ([{ meetings }, { signedIn }]) => {
        if (active) setResult({ attempt, list: { status: "ready", value: { meetings, signedIn } } });
      },
      (error: unknown) => {
        if (active) setResult({ attempt, list: failure(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const list = result?.attempt === attempt ? result.list : { status: "loading" as const };
  const retry = () => setAttempt((value) => value + 1);

  if (list.status === "off") {
    return (
      <Notice icon={<DatabaseIcon />} title="History isn't set up on this server">
        The Contexa API saves finished sessions to Postgres. Set{" "}
        <code className="font-mono text-[12px]">DATABASE_URL</code> on the API (a Supabase
        connection string works) and restart it. Live sessions work without it.
      </Notice>
    );
  }
  if (list.status === "failed") {
    return (
      <Notice
        tone="error"
        icon={<TriangleAlertIcon />}
        title="Couldn't load your history"
        action={
          <Button size="xs" variant="outline" onClick={retry}>
            <RotateCwIcon />
            Try again
          </Button>
        }
      >
        {list.message}
      </Notice>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          {list.status === "ready" && list.value.signedIn
            ? "Sessions saved to your account."
            : "Sessions saved in this browser. Sign in to keep them with your account."}{" "}
          Transcripts, translations, answers, and recaps; never the audio.
        </p>
      </div>
      <HistorySearch />
      <section aria-labelledby="saved-sessions" className="space-y-3">
        <h2 id="saved-sessions" className="text-sm font-semibold">
          Saved sessions
          {list.status === "ready" ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {list.value.meetings.length}
            </span>
          ) : null}
        </h2>
        {list.status === "loading" ? (
          <div className="space-y-3" role="status" aria-label="Loading sessions">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : list.value.meetings.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">No saved sessions yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              When a live session ends, its transcript, answers, and recap are saved here
              automatically.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/session">
                <PlusIcon />
                Start a session
              </Link>
            </Button>
          </div>
        ) : (
          <ul aria-label="Saved sessions" className="space-y-3">
            {list.value.meetings.map((meeting) => (
              <li key={meeting.id}>
                <MeetingCard meeting={meeting} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: MeetingSummary }) {
  const duration = meetingDuration(meeting);
  return (
    <Link
      href={`/history?id=${encodeURIComponent(meeting.id)}`}
      className="block rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/40 hover:bg-primary/[0.02] focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-medium">{meeting.title || "Untitled session"}</p>
        <p className="text-xs text-muted-foreground">{formatDate(meeting.startedAt)}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {duration ? <span className="font-mono tabular-nums">{duration}</span> : null}
        <span className="inline-flex items-center gap-1">
          <CaptionsIcon className="size-3.5" aria-hidden />
          {pluralize(meeting.turnCount, "turn")}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircleQuestionMarkIcon className="size-3.5" aria-hidden />
          {pluralize(meeting.questionCount, "question")}
        </span>
        <span className="font-mono uppercase">
          {meeting.speakerLanguage} → {meeting.displayLanguage}
        </span>
      </div>
      {meeting.summary ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/80">
          {meeting.summary}
        </p>
      ) : null}
    </Link>
  );
}

const KIND_LABELS: Record<SearchHit["kind"], string> = {
  turn: "Transcript",
  answer: "Suggested answer",
  recap: "Recap",
};

type SearchState =
  | { status: "idle" }
  | { status: "searching"; query: string }
  | { status: "done"; query: string; results: SearchResults }
  | { status: "failed"; query: string; message: string };

function HistorySearch() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    setSearch({ status: "searching", query: text });
    try {
      const results = await historyApi.search(text);
      setSearch({ status: "done", query: text, results });
    } catch (error) {
      setSearch({ status: "failed", query: text, message: (error as Error).message });
    }
  };

  return (
    <section aria-label="Search history" className="space-y-3">
      <form role="search" onSubmit={(event) => void submit(event)} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            maxLength={300}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search every session, by meaning"
            aria-label="Search every session, by meaning"
            className="h-10 pl-9"
          />
        </div>
        <Button type="submit" className="h-10" disabled={!query.trim() || search.status === "searching"}>
          {search.status === "searching" ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}
          Search
        </Button>
      </form>

      {search.status === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t search. {search.message}
        </p>
      ) : null}

      {search.status === "done" ? (
        <div className="space-y-2" aria-label="Search results" role="region">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {search.results.hits.length === 0
              ? `Nothing matched “${search.query}”.`
              : `${pluralize(search.results.hits.length, "match", "matches")} for “${search.query}”`}
            <Badge variant={search.results.semantic ? "ai" : "outline"} className="px-1.5 py-0 text-[10px]">
              {search.results.semantic ? (
                <>
                  <SparklesIcon />
                  By meaning and words
                </>
              ) : (
                "By words only"
              )}
            </Badge>
          </p>
          {search.results.hits.length > 0 ? (
            <ul className="divide-y rounded-xl border bg-card">
              {search.results.hits.map((hit) => (
                <li key={`${hit.meetingId}-${hit.kind}-${hit.turnId ?? ""}-${hit.text.slice(0, 24)}`}>
                  <SearchHitLink hit={hit} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SearchHitLink({ hit }: { hit: SearchHit }) {
  const href = `/history?id=${encodeURIComponent(hit.meetingId)}${
    hit.turnId ? `&turn=${encodeURIComponent(hit.turnId)}` : ""
  }`;
  return (
    <Link
      href={href}
      className="block px-4 py-3 outline-none first:rounded-t-xl last:rounded-b-xl hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{hit.title || "Untitled session"}</span>
        <span aria-hidden>·</span>
        <span>{formatDate(hit.startedAt)}</span>
        <span aria-hidden>·</span>
        <span>{KIND_LABELS[hit.kind]}</span>
        {hit.kind === "turn" && hit.atMs !== null ? (
          <span className="font-mono tabular-nums">{formatClock(hit.atMs)}</span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-3 text-sm leading-relaxed whitespace-pre-line">
        {hit.speaker ? <span className="font-medium">Speaker {hit.speaker}: </span> : null}
        {hit.text}
      </p>
    </Link>
  );
}

const NOTICE_TONES = {
  muted: "border-border bg-muted/40 [&_svg]:text-muted-foreground",
  error: "border-destructive/30 bg-destructive/5 [&_svg]:text-destructive",
} as const;

export function Notice({
  icon,
  title,
  action,
  tone = "muted",
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  tone?: keyof typeof NOTICE_TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-4 text-sm [&_svg]:size-4", NOTICE_TONES[tone])}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </div>
  );
}

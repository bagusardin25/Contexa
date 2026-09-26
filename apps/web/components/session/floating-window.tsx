"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import {
  CheckIcon,
  CopyIcon,
  LoaderCircleIcon,
  MessageSquareQuoteIcon,
  PictureInPicture2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";
import { formatClock } from "@/lib/format";
import { languageShort } from "@/lib/languages";
import type { Suggestion, Turn } from "@/types/session";

import { ListenButton } from "./copilot-panel";
import { speakerName } from "./primitives";
import { useSession } from "./session-store-provider";
import { StatusPill } from "./status-pill";

/** Document Picture-in-Picture (Chrome and Edge on desktop): an always-on-top window. */
interface PictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

function pictureInPicture(): PictureInPictureApi | undefined {
  return (window as unknown as { documentPictureInPicture?: PictureInPictureApi })
    .documentPictureInPicture;
}

const subscribeNever = () => () => {};
const RECENT_TURNS = 3;

/** Every stylesheet of the app, so the floating window looks the same. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      target.head.appendChild(style);
    } catch {
      // A cross-origin sheet can't be read: link to it instead.
      if (!sheet.href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
}

/** Mirrors the app's theme (the `dark` class) onto the floating window until stopped. */
function mirrorTheme(target: Document) {
  const sync = () => {
    target.documentElement.className = document.documentElement.className;
    target.documentElement.style.colorScheme = document.documentElement.style.colorScheme;
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  return () => observer.disconnect();
}

function prepareWindow(target: Window) {
  copyStyles(target.document);
  target.document.title = "Contexa";
  target.document.body.className = "bg-background text-foreground antialiased";
}

/**
 * "Pop out": the live transcript's last turns and the ready-to-say answer in a small window
 * that stays on top of the meeting, so the participant doesn't have to switch tabs.
 * It renders through a portal, so it reads the same session store as the workspace.
 */
export function PopOutButton({ live }: { live: boolean }) {
  const supported = useSyncExternalStore(subscribeNever, () => pictureInPicture() !== undefined, () => false);
  const [floating, setFloating] = useState<Window | null>(null);
  const floatingRef = useRef<Window | null>(null);

  useEffect(() => {
    if (!floating) return;
    const stopMirroring = mirrorTheme(floating.document);
    const closed = () => {
      floatingRef.current = null;
      setFloating(null);
    };
    floating.addEventListener("pagehide", closed);
    return () => {
      stopMirroring();
      floating.removeEventListener("pagehide", closed);
    };
  }, [floating]);

  // The window goes with the workspace (New session, leaving the page).
  useEffect(() => () => floatingRef.current?.close(), []);

  if (!supported || (!live && !floating)) return null;

  const toggle = async () => {
    if (floating) {
      floating.close();
      return;
    }
    const api = pictureInPicture();
    if (!api) return;
    try {
      const opened = await api.requestWindow({ width: 380, height: 520 });
      prepareWindow(opened);
      floatingRef.current = opened;
      setFloating(opened);
    } catch (error) {
      toast.error("Couldn't open the floating window", { description: (error as Error).message });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        aria-pressed={floating !== null}
        onClick={() => void toggle()}
        title="Keep the latest turns and the ready-to-say answer on top of your meeting"
      >
        <PictureInPicture2Icon />
        <span className="hidden sm:inline">{floating ? "Close pop-out" : "Pop out"}</span>
        <span className="sr-only sm:hidden">{floating ? "Close pop-out" : "Pop out"}</span>
      </Button>
      {floating ? createPortal(<FloatingView target={floating} />, floating.document.body) : null}
    </>
  );
}

function FloatingView({ target }: { target: Window }) {
  const turns = useSession(useShallow((state) => state.turns.slice(-RECENT_TURNS)));
  const partial = useSession((state) => state.partial);
  const suggestion = useSession((state) =>
    state.activeSuggestionId ? state.suggestions[state.activeSuggestionId] : undefined,
  );

  return (
    <div className="flex h-dvh flex-col" aria-label="Floating copilot" role="region">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <LogoMark className="size-6 rounded-md" />
        <span className="text-sm font-semibold">Contexa</span>
        <StatusPill className="ml-auto h-6" />
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" role="log" aria-label="Latest turns">
        {turns.length === 0 && !partial ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Listening…</p>
        ) : null}
        {turns.map((turn) => (
          <FloatingTurn key={turn.id} turn={turn} />
        ))}
        {partial ? (
          <p className="px-1 text-sm text-muted-foreground italic">
            {speakerName(partial.speaker)}: {partial.text}
          </p>
        ) : null}
      </div>
      <FloatingAnswer suggestion={suggestion} target={target} />
    </div>
  );
}

function FloatingTurn({ turn }: { turn: Turn }) {
  const question = turn.classification?.requiresAnswer ?? false;
  return (
    <article
      className={
        question
          ? "rounded-lg bg-question/[0.08] px-2.5 py-2 ring-1 ring-question/25"
          : "rounded-lg px-2.5 py-2"
      }
    >
      <p className="text-[11px] text-muted-foreground">
        {speakerName(turn.speaker)} · <span className="font-mono tabular-nums">{formatClock(turn.startedAtMs)}</span>
      </p>
      <p className="mt-0.5 text-sm leading-snug">{turn.text}</p>
      {turn.translation.status === "done" ? (
        <p
          lang={turn.translation.result.targetLanguage}
          className="mt-1 border-l-2 border-translation/50 pl-2 text-sm leading-snug text-foreground/80"
        >
          {turn.translation.result.text}
        </p>
      ) : null}
    </article>
  );
}

function FloatingAnswer({ suggestion, target }: { suggestion: Suggestion | undefined; target: Window }) {
  const { copied, copy } = useCopy(1600, target);
  const answer = suggestion?.stage === "ready" ? suggestion.answer : null;
  const text = answer?.answerTargetLanguage ?? null;
  const language = answer?.targetLanguage ?? "en";

  return (
    <section
      aria-label="Ready to say"
      className="shrink-0 border-t border-primary/25 bg-primary/[0.06] p-3"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <MessageSquareQuoteIcon className="size-3.5 text-primary" aria-hidden />
        <h2 className="text-[11px] font-semibold tracking-wide text-primary uppercase">
          Ready to say{answer ? ` · ${languageShort(language)}` : ""}
        </h2>
        <span className="ml-auto" />
        {answer ? (
          <>
            <ListenButton text={text} language={language} />
            <Button
              size="xs"
              variant={copied ? "secondary" : "default"}
              onClick={() => {
                if (text) void copy(text);
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </>
        ) : null}
      </div>
      {answer ? (
        <p lang={language} className="max-h-40 overflow-y-auto text-[15px] leading-relaxed font-medium">
          {text}
        </p>
      ) : suggestion?.stage === "failed" ? (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Couldn&apos;t draft an answer. {suggestion.error}
        </p>
      ) : suggestion ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
          Drafting an answer…
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          When someone asks you a question, the answer to say appears here.
        </p>
      )}
    </section>
  );
}

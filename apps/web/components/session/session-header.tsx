"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  AudioLinesIcon,
  ChevronDownIcon,
  FlaskConicalIcon,
  LanguagesIcon,
  ShieldAlertIcon,
  SparklesIcon,
  VolumeXIcon,
  WifiOffIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LANGUAGES,
  SPEECH_MODELS,
  languageName,
  speakerLanguageOption,
} from "@/lib/languages";
import { cn } from "@/lib/utils";

import { useIsPreview, useSession } from "./session-store-provider";
import { StatusPill } from "./status-pill";

export function SessionHeader() {
  const title = useSession((state) => state.config.title);
  const isPreview = useIsPreview();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur sm:px-4">
      <Link
        href="/"
        aria-label="Contexa home"
        className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Logo wordmarkClassName="hidden sm:inline" />
      </Link>
      <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-5 sm:block" />
      <p className="hidden max-w-56 min-w-0 truncate text-sm text-muted-foreground sm:block">
        {title.trim() || "Untitled session"}
      </p>
      <StatusPill />
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <SessionRoute className="hidden md:inline-flex" />
        {isPreview ? <PreviewMenu /> : null}
        <ThemeToggle />
      </div>
    </header>
  );
}

function SessionRoute({ className }: { className?: string }) {
  const config = useSession((state) => state.config);
  const speaker = speakerLanguageOption(config.speakerLanguage);
  const model = SPEECH_MODELS[speaker.model];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 items-center gap-2 rounded-full border bg-card px-3 text-xs text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className,
          )}
        >
          <AudioLinesIcon className="size-3.5 text-primary" aria-hidden />
          <span className="hidden lg:inline">{model.shortName}</span>
          <span className="hidden h-3 w-px bg-border lg:block" aria-hidden />
          <span className="font-mono">{speaker.expected ? LANGUAGES[speaker.expected].short : "AUTO"}</span>
          <ArrowRightIcon className="size-3" aria-label="translated to" />
          <span className="font-mono">{LANGUAGES[config.displayLanguage].short}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="space-y-1 text-left">
        <p className="font-medium">AssemblyAI {model.name}</p>
        <p className="font-mono opacity-80">speech_model={speaker.model}</p>
        <p>
          Speakers: {speaker.label} · Read in: {languageName(config.displayLanguage)} · Answer in:{" "}
          {config.responseLanguage === "auto"
            ? "the speaker's language"
            : languageName(config.responseLanguage)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function PreviewMenu() {
  const status = useSession((state) => state.status);
  const startedAt = useSession((state) => state.startedAt);
  const simulate = useSession((state) => state.simulate);
  const canFailStart = startedAt === null && (status === "idle" || status === "error");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full border-dashed text-xs">
          <FlaskConicalIcon className="size-3.5 text-primary" />
          Preview
          <ChevronDownIcon className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-76">
        <DropdownMenuLabel className="font-normal leading-relaxed">
          <span className="mb-0.5 block font-medium text-foreground">UI preview mode</span>
          The backend isn&apos;t connected yet, so sessions replay a scripted Q&amp;A. Use these to
          check how the UI handles failures.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={status !== "listening"} onSelect={() => simulate("connection_drop")}>
          <WifiOffIcon />
          Drop the AssemblyAI connection
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            simulate("translation_failure");
            toast("The next translation will fail.");
          }}
        >
          <LanguagesIcon />
          Fail the next translation
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            simulate("answer_failure");
            toast("The next suggested answer will fail.");
          }}
        >
          <SparklesIcon />
          Fail the next answer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canFailStart} onSelect={() => simulate("permission_denied")}>
          <ShieldAlertIcon />
          Start with permission denied
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canFailStart} onSelect={() => simulate("no_audio_track")}>
          <VolumeXIcon />
          Start with no tab audio
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

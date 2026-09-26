"use client";

import { useId, useRef, type ReactNode } from "react";
import {
  AppWindowIcon,
  AudioLinesIcon,
  FileAudioIcon,
  FlaskConicalIcon,
  LanguagesIcon,
  LibraryIcon,
  LoaderCircleIcon,
  MicIcon,
  RadioIcon,
  SparklesIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ANSWER_STYLES, ANSWER_STYLE_ORDER } from "@/lib/answer-styles";
import { formatBytes, pluralize } from "@/lib/format";
import {
  DISPLAY_LANGUAGES,
  LANGUAGES,
  SPEAKER_LANGUAGES,
  SPEECH_MODELS,
  speakerLanguageOption,
  type LanguageCode,
  type SpeakerLanguage,
} from "@/lib/languages";
import { LIVE_AVAILABLE, openLive } from "@/lib/session/mode";
import type { AnswerStyle, AudioSource, SessionError, SessionErrorCode } from "@/types/session";

import { ApiStatus } from "./api-status";
import { useIsPreview, useSession } from "./session-store-provider";

const ERROR_TITLES: Record<SessionErrorCode, string> = {
  permission_denied: "Permission denied",
  no_audio_track: "No audio in the shared tab",
  connection_lost: "Connection lost",
  unsupported_language: "Language not supported",
  unknown: "Couldn't start the session",
};

export function SetupPanel({ onOpenContext }: { onOpenContext: () => void }) {
  const config = useSession((state) => state.config);
  const status = useSession((state) => state.status);
  const error = useSession((state) => state.error);
  const updateConfig = useSession((state) => state.updateConfig);
  const start = useSession((state) => state.start);
  const stop = useSession((state) => state.stop);
  const audioFile = useSession((state) => state.audioFile);
  const isPreview = useIsPreview();
  const titleId = useId();
  const speakerLabelsId = useId();

  const starting =
    status === "requesting_permission" || status === "connecting" || status === "stopping";
  const speaker = speakerLanguageOption(config.speakerLanguage);
  const model = SPEECH_MODELS[speaker.model];

  // The preview replays its script, so it doesn't need the recording.
  const needsFile = config.audioSource === "file" && !audioFile && !isPreview;
  const startLabel =
    status === "requesting_permission"
      ? config.audioSource === "file"
        ? "Loading the recording…"
        : "Requesting audio access…"
      : status === "connecting"
        ? isPreview
          ? "Connecting…"
          : "Connecting to AssemblyAI…"
        : status === "stopping"
          ? "Cancelling…"
          : status === "error"
            ? "Try again"
            : "Start listening";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6">
          <Badge variant="ai" className="mb-3">
            <RadioIcon />
            New live session
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Set up your conversation copilot
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Choose the languages, attach the documents you might need to cite, and pick the audio
            Contexa should listen to.
          </p>
        </header>

        {isPreview ? <PreviewNotice /> : <ApiStatus />}

        <div className="space-y-7 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="space-y-2">
            <Label htmlFor={titleId}>
              Session name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={titleId}
              value={config.title}
              maxLength={80}
              placeholder="e.g. Demo day Q&A with the judges"
              onChange={(event) => updateConfig({ title: event.target.value })}
            />
          </div>

          <section className="space-y-3">
            <SectionTitle icon={LanguagesIcon}>Languages</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Speakers talk in">
                <Select
                  value={config.speakerLanguage}
                  onValueChange={(value) => updateConfig({ speakerLanguage: value as SpeakerLanguage })}
                >
                  <SelectTrigger className="w-full" aria-label="Speakers talk in">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEAKER_LANGUAGES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Read in">
                <Select
                  value={config.displayLanguage}
                  onValueChange={(value) => updateConfig({ displayLanguage: value as LanguageCode })}
                >
                  <SelectTrigger className="w-full" aria-label="Read in">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPLAY_LANGUAGES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {LANGUAGES[code].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Answer in">
                <Select
                  value={config.responseLanguage}
                  onValueChange={(value) =>
                    updateConfig({ responseLanguage: value as LanguageCode | "auto" })
                  }
                >
                  <SelectTrigger className="w-full" aria-label="Answer in">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Speaker&apos;s language</SelectItem>
                    {DISPLAY_LANGUAGES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {LANGUAGES[code].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-3 text-sm ring-1 ring-primary/15">
              <AudioLinesIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="space-y-1">
                <p>
                  <span className="font-medium">AssemblyAI {model.name}</span>{" "}
                  <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
                    speech_model={speaker.model}
                  </code>
                </p>
                <p className="text-muted-foreground">
                  {model.description} Speech is transcribed as spoken, then translated into{" "}
                  {LANGUAGES[config.displayLanguage].name}.
                </p>
                <KeytermSummary supported={speaker.model === "universal-3-5-pro"} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle icon={SparklesIcon}>Suggested answers</SectionTitle>
            <RadioGroup
              value={config.answerStyle}
              onValueChange={(value) => updateConfig({ answerStyle: value as AnswerStyle })}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              aria-label="Answer style"
            >
              {ANSWER_STYLE_ORDER.map((style) => (
                <StyleOption key={style} value={style} label={ANSWER_STYLES[style].label} />
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {ANSWER_STYLES[config.answerStyle].description} You can redraft any answer in another
              style from the copilot.
            </p>
          </section>

          <section className="space-y-3">
            <SectionTitle icon={AudioLinesIcon}>Audio source</SectionTitle>
            <RadioGroup
              value={config.audioSource}
              onValueChange={(value) => updateConfig({ audioSource: value as AudioSource })}
              className="grid gap-3 sm:grid-cols-3"
              aria-label="Audio source"
            >
              <SourceOption
                value="tab"
                icon={AppWindowIcon}
                title="Browser tab"
                description="Webinars, YouTube, and web meetings, in Chrome and Edge."
                recommended
              />
              <SourceOption
                value="microphone"
                icon={MicIcon}
                title="Microphone"
                description="In-person conversations, or when tab audio isn't available."
              />
              <SourceOption
                value="file"
                icon={FileAudioIcon}
                title="Audio file"
                description="Play a recording through the live pipeline, e.g. a past webinar."
              />
            </RadioGroup>
            {config.audioSource === "file" ? <RecordingPicker /> : null}
            <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
              <div className="space-y-1">
                <Label htmlFor={speakerLabelsId}>Label speakers</Label>
                <p className="text-xs text-muted-foreground">
                  Streaming diarization tags each turn with who said it.
                </p>
              </div>
              <Switch
                id={speakerLabelsId}
                checked={config.speakerLabels}
                onCheckedChange={(checked) => updateConfig({ speakerLabels: checked })}
              />
            </div>
          </section>

          <ContextSummary onOpenContext={onOpenContext} />

          {status === "error" && error ? <StartError error={error} /> : null}

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
            <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
              {config.audioSource === "tab"
                ? "Your browser will ask which tab to share. Pick the one with the webinar and turn on “Share tab audio”."
                : config.audioSource === "file"
                  ? isPreview
                    ? "The preview replays its scripted conversation instead of a recording."
                    : "The recording plays here in real time while it's transcribed. The session stops when it ends."
                  : "Your browser will ask for microphone access."}
            </p>
            <div className="flex gap-2">
              {starting ? (
                <Button variant="ghost" size="lg" onClick={() => void stop()} disabled={status === "stopping"}>
                  Cancel
                </Button>
              ) : null}
              <Button
                size="lg"
                className="flex-1 sm:min-w-48"
                disabled={starting || needsFile}
                onClick={() => void start()}
              >
                {starting ? <LoaderCircleIcon className="animate-spin" /> : <RadioIcon />}
                {startLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SourceOption({
  value,
  icon: Icon,
  title,
  description,
  recommended = false,
}: {
  value: AudioSource;
  icon: LucideIcon;
  title: string;
  description: string;
  recommended?: boolean;
}) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      className="cursor-pointer items-start gap-3 rounded-xl border p-4 leading-normal font-normal transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5"
    >
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <span className="space-y-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
          {recommended ? (
            <Badge variant="ai" className="px-1.5 py-0 text-[10px]">
              Recommended
            </Badge>
          ) : null}
        </span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </Label>
  );
}

function StyleOption({ value, label }: { value: AnswerStyle; label: string }) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      className="cursor-pointer gap-2 rounded-lg border px-3 py-2 font-normal transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:font-medium"
    >
      <RadioGroupItem value={value} id={id} />
      {label}
    </Label>
  );
}

function RecordingPicker() {
  const audioFile = useSession((state) => state.audioFile);
  const setAudioFile = useSession((state) => state.setAudioFile);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3">
      <FileAudioIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {audioFile ? (
          <>
            <p className="truncate font-medium">{audioFile.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(audioFile.size)}</p>
          </>
        ) : (
          <p className="text-muted-foreground">MP3, WAV, M4A, WebM, or an MP4 video with sound.</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.webm,.mp4"
        aria-label="Recording to play"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setAudioFile(file);
          event.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        {audioFile ? "Change" : "Choose a recording"}
      </Button>
    </div>
  );
}

function ContextSummary({ onOpenContext }: { onOpenContext: () => void }) {
  const ready = useSession((state) => state.documents.filter((doc) => doc.status === "ready").length);
  const processing = useSession(
    (state) =>
      state.documents.filter((doc) => doc.status !== "ready" && doc.status !== "failed").length,
  );
  const chunks = useSession((state) =>
    state.documents.reduce(
      (sum, doc) => sum + (doc.status === "ready" ? (doc.chunkCount ?? 0) : 0),
      0,
    ),
  );
  const empty = ready === 0 && processing === 0;

  return (
    <div
      className={
        empty
          ? "flex items-start gap-3 rounded-xl border border-dashed p-4"
          : "flex items-start gap-3 rounded-xl border bg-muted/40 p-4"
      }
    >
      <LibraryIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        {empty ? (
          <>
            <p className="font-medium">No context documents yet</p>
            <p className="text-muted-foreground">
              Answers can only cite what you attach. A README, proposal, or architecture doc works
              well.<span className="hidden xl:inline"> Add them in the Context panel.</span>
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">
              {pluralize(ready, "document")} ready · {pluralize(chunks, "chunk")} indexed
            </p>
            {processing > 0 ? (
              <p className="text-muted-foreground">{processing} still processing…</p>
            ) : (
              <p className="text-muted-foreground">
                Contexa will search these when someone asks you a question.
              </p>
            )}
          </>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onOpenContext} className="xl:hidden">
        {empty ? "Add documents" : "Manage"}
      </Button>
    </div>
  );
}

/** AssemblyAI caps keyterms prompting at 100 terms per session. */
const MAX_KEYTERMS = 100;

function KeytermSummary({ supported }: { supported: boolean }) {
  const count = useSession((state) => {
    const terms = new Set<string>();
    for (const doc of state.documents) {
      if (doc.status !== "ready") continue;
      for (const term of doc.keyterms) terms.add(term.toLowerCase());
    }
    return Math.min(MAX_KEYTERMS, terms.size);
  });
  if (count === 0) return null;

  return (
    <p className="text-muted-foreground">
      <code className="mr-1.5 rounded bg-background/70 px-1 py-0.5 font-mono text-[11px]">
        keyterms_prompt
      </code>
      {supported
        ? `${pluralize(count, "term")} from your documents help AssemblyAI spell your project's names.`
        : "Keyterms from your documents apply to Universal-3.5 Pro sessions only."}
    </p>
  );
}

function StartError({ error }: { error: SessionError }) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium text-destructive">{ERROR_TITLES[error.code]}</p>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}

function PreviewNotice() {
  return (
    <div className="mb-4 flex gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm">
      <FlaskConicalIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">
          {LIVE_AVAILABLE ? "Scripted preview" : "UI preview: no API is connected"}
        </p>
        <p className="text-muted-foreground">
          Starting a session replays a scripted English or Japanese Q&amp;A with realistic timing so
          every screen can be reviewed. Load the sample documents first to see grounded answers.{" "}
          {LIVE_AVAILABLE ? (
            "Nothing is sent to AssemblyAI or the LLM."
          ) : (
            <>
              Set <code className="font-mono text-[12px]">NEXT_PUBLIC_API_URL</code> to run the
              live AssemblyAI pipeline instead.
            </>
          )}
        </p>
      </div>
      {LIVE_AVAILABLE ? (
        <Button variant="outline" size="xs" className="shrink-0 self-start" onClick={openLive}>
          <RadioIcon />
          Go live
        </Button>
      ) : null}
    </div>
  );
}

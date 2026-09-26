"use client";

import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  AudioLinesIcon,
  ExternalLinkIcon,
  FileUpIcon,
  LibraryIcon,
  LinkIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { fetchSampleFiles } from "@/lib/documents/sample-files";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/validate";
import { formatBytes, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContextDocument } from "@/types/session";

import { FileKindIcon, PanelHeader } from "./primitives";
import { useIsPreview, useSession } from "./session-store-provider";

export function ContextPanel() {
  const documents = useSession((state) => state.documents);
  const addFiles = useSession((state) => state.addFiles);
  const addSampleDocuments = useSession((state) => state.addSampleDocuments);
  const retryDocument = useSession((state) => state.retryDocument);
  const removeDocument = useSession((state) => state.removeDocument);
  const citedIds = useSession(
    useShallow((state) => {
      const active = state.activeSuggestionId ? state.suggestions[state.activeSuggestionId] : undefined;
      return [...new Set((active?.evidence ?? []).map((item) => item.documentId))];
    }),
  );
  const isPreview = useIsPreview();
  const hasSamples = documents.some((doc) => doc.sample);
  const semantic = documents.some((doc) => doc.embedded);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const handleFiles = (files: File[], options?: { sample?: boolean }) => {
    for (const rejected of addFiles(files, options)) {
      toast.error(`Couldn't add ${rejected.name}`, { description: rejected.reason });
    }
  };

  // The preview adds scripted metadata; live sessions upload real sample files.
  const loadSamples = async () => {
    if (isPreview) {
      addSampleDocuments();
      return;
    }
    setLoadingSamples(true);
    try {
      handleFiles(await fetchSampleFiles(), { sample: true });
    } catch (error) {
      toast.error("Couldn't load the sample documents", { description: (error as Error).message });
    } finally {
      setLoadingSamples(false);
    }
  };

  const samplesButton = (label: string, props: { variant: "ghost" | "outline"; size: "xs" | "sm"; className?: string }) => (
    <Button {...props} disabled={loadingSamples} onClick={() => void loadSamples()}>
      {loadingSamples ? <LoaderCircleIcon className="animate-spin" /> : <SparklesIcon />}
      {label}
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={LibraryIcon}
        title="Context"
        meta={documents.length > 0 ? pluralize(documents.length, "document") : undefined}
        actions={
          !hasSamples && documents.length > 0
            ? samplesButton("Samples", { variant: "ghost", size: "xs" })
            : null
        }
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <DocumentDropzone onFiles={handleFiles} />
        <LinkImport disabled={isPreview} />

        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center">
            <p className="text-sm font-medium">No documents yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Attach a README, proposal, or architecture doc so answers can cite your own material.
            </p>
            {samplesButton("Load sample project docs", { variant: "outline", size: "sm", className: "mt-3" })}
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Attached documents">
            {documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                doc={doc}
                cited={citedIds.includes(doc.id)}
                onRetry={isPreview ? undefined : () => retryDocument(doc.id)}
                onRemove={() => removeDocument(doc.id)}
              />
            ))}
          </ul>
        )}

        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p className="flex gap-2">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Documents are split into chunks and searched by keyword
            {semantic ? " and by meaning" : ""}, only within this session. Answers show the
            passages they use.
          </p>
          <p className="flex gap-2">
            <AudioLinesIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Names and technical terms from your documents are sent to AssemblyAI as keyterms, so
            the transcript spells them right (Universal-3.5 Pro sessions).
          </p>
          {isPreview ? (
            <p className="pl-5.5 text-muted-foreground/80">
              Preview: files are checked in your browser; parsing and indexing are simulated
              because no API is connected.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LinkImport({ disabled }: { disabled: boolean }) {
  const addLink = useSession((state) => state.addLink);
  const [link, setLink] = useState("");

  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const problem = addLink(link);
        if (problem) toast.error("Couldn't add the link", { description: problem });
        else setLink("");
      }}
    >
      <div className="flex gap-2">
        <Input
          type="text"
          inputMode="url"
          value={link}
          disabled={disabled}
          onChange={(event) => setLink(event.target.value)}
          placeholder="Paste a link to a page, PDF, or GitHub repo"
          aria-label="Document link"
          className="h-8 min-w-0 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={disabled || !link.trim()}>
          <LinkIcon />
          Add
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {disabled
          ? "Links are fetched by the Contexa API, so they work in live sessions."
          : "A GitHub repository brings its README and docs."}
      </p>
    </form>
  );
}

function DocumentDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors outline-none hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:ring-[3px] focus-visible:ring-ring/50",
          dragging && "border-primary bg-primary/[0.06]",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileUpIcon className="size-5" aria-hidden />
        </span>
        <span className="text-sm font-medium">
          Drop files or <span className="text-primary">browse</span>
        </span>
        <span className="text-xs text-muted-foreground">PDF, DOCX, Markdown, TXT · up to 10 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </>
  );
}

const VISIBLE_KEYTERMS = 5;

/** The document's keyterms, which AssemblyAI uses to spell the project's names right. */
function KeytermList({ keyterms }: { keyterms: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? keyterms : keyterms.slice(0, VISIBLE_KEYTERMS);
  const hidden = keyterms.length - shown.length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Keyterms sent to AssemblyAI">
      <span
        className="mr-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title="Sent to AssemblyAI as keyterms, so these names are transcribed correctly"
      >
        <AudioLinesIcon className="size-3" aria-hidden />
        Keyterms
      </span>
      {shown.map((term) => (
        <span key={term} className="rounded border bg-muted/50 px-1.5 py-px font-mono text-[10px] text-foreground/80">
          {term}
        </span>
      ))}
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? "Show fewer" : `+${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

function statusLabel(doc: ContextDocument) {
  switch (doc.status) {
    case "importing":
      return doc.kind === "repo" ? "Downloading the repository…" : "Fetching the page…";
    case "uploading":
      return `Uploading · ${doc.progress}%`;
    case "parsing":
      return "Extracting text…";
    case "indexing":
      return "Chunking & indexing…";
    case "ready":
      return `Ready · ${pluralize(doc.chunkCount ?? 0, "chunk")}`;
    case "failed":
      return "Couldn't process this file";
  }
}

function DocumentItem({
  doc,
  cited,
  onRetry,
  onRemove,
}: {
  doc: ContextDocument;
  cited: boolean;
  /** Live uploads only: send a failed document again. */
  onRetry?: () => void;
  onRemove: () => void;
}) {
  const processing =
    doc.status === "importing" ||
    doc.status === "uploading" ||
    doc.status === "parsing" ||
    doc.status === "indexing";

  return (
    <li
      className={cn(
        "group animate-in rounded-xl border bg-card p-3 transition-colors fade-in-0",
        cited && "border-success/40 ring-1 ring-success/20",
        doc.status === "failed" && "border-destructive/30",
      )}
    >
      <div className="flex items-start gap-3">
        <FileKindIcon kind={doc.kind} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={doc.name}>
            {doc.name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <p
              className={cn(
                "text-xs text-muted-foreground",
                doc.status === "ready" && "text-success",
                doc.status === "failed" && "text-destructive",
              )}
            >
              {doc.sizeBytes > 0 ? `${formatBytes(doc.sizeBytes)} · ` : ""}
              {statusLabel(doc)}
            </p>
            {doc.sample ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                Sample
              </Badge>
            ) : null}
            {cited ? (
              <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                Cited
              </Badge>
            ) : null}
          </div>
          {doc.sourceUrl ? (
            <a
              href={/^https?:\/\//i.test(doc.sourceUrl) ? doc.sourceUrl : `https://${doc.sourceUrl}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <span className="truncate">{doc.sourceUrl.replace(/^https?:\/\//i, "")}</span>
              <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          {processing ? (
            <Progress value={doc.status === "uploading" ? doc.progress : null} className="mt-2" />
          ) : null}
          {doc.error ? <p className="mt-1 text-xs text-muted-foreground">{doc.error}</p> : null}
          {doc.status === "failed" && onRetry ? (
            <Button variant="outline" size="xs" className="mt-2" onClick={onRetry}>
              <RotateCwIcon />
              Retry
            </Button>
          ) : null}
          {doc.status === "ready" && doc.keyterms.length > 0 ? (
            <KeytermList keyterms={doc.keyterms} />
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={`Remove ${doc.name}`}
          className="text-muted-foreground transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
        >
          <XIcon />
        </Button>
      </div>
    </li>
  );
}

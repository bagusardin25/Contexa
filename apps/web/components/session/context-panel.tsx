"use client";

import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  FileUpIcon,
  LibraryIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  const removeDocument = useSession((state) => state.removeDocument);
  const citedIds = useSession(
    useShallow((state) => {
      const active = state.activeSuggestionId ? state.suggestions[state.activeSuggestionId] : undefined;
      return [...new Set((active?.evidence ?? []).map((item) => item.documentId))];
    }),
  );
  const isPreview = useIsPreview();
  const hasSamples = documents.some((doc) => doc.sample);

  const handleFiles = (files: File[]) => {
    for (const rejected of addFiles(files)) {
      toast.error(`Couldn't add ${rejected.name}`, { description: rejected.reason });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={LibraryIcon}
        title="Context"
        meta={documents.length > 0 ? pluralize(documents.length, "document") : undefined}
        actions={
          isPreview && !hasSamples && documents.length > 0 ? (
            <Button variant="ghost" size="xs" onClick={addSampleDocuments}>
              <SparklesIcon />
              Samples
            </Button>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <DocumentDropzone onFiles={handleFiles} />

        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center">
            <p className="text-sm font-medium">No documents yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Attach a README, proposal, or architecture doc so answers can cite your own material.
            </p>
            {isPreview ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={addSampleDocuments}>
                <SparklesIcon />
                Load sample project docs
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Attached documents">
            {documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                doc={doc}
                cited={citedIds.includes(doc.id)}
                onRemove={() => removeDocument(doc.id)}
              />
            ))}
          </ul>
        )}

        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p className="flex gap-2">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Documents are split into chunks and searched only within this session. Answers show
            the passages they use.
          </p>
          {isPreview ? (
            <p className="pl-5.5 text-muted-foreground/80">
              Preview: files are checked in your browser; parsing and indexing are simulated until
              the backend is connected.
            </p>
          ) : null}
        </div>
      </div>
    </div>
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

function statusLabel(doc: ContextDocument) {
  switch (doc.status) {
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
  onRemove,
}: {
  doc: ContextDocument;
  cited: boolean;
  onRemove: () => void;
}) {
  const processing = doc.status === "uploading" || doc.status === "parsing" || doc.status === "indexing";

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
              {formatBytes(doc.sizeBytes)} · {statusLabel(doc)}
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
          {processing ? (
            <Progress value={doc.status === "uploading" ? doc.progress : null} className="mt-2" />
          ) : null}
          {doc.error ? <p className="mt-1 text-xs text-muted-foreground">{doc.error}</p> : null}
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

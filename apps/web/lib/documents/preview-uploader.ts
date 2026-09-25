import type { DocumentKind } from "@/types/session";

import type { DocumentUpdate, DocumentUploader, UploadRequest } from "./uploader";
import { checkFileSignature } from "./validate";

/** Rough chunk estimate so the preview shows plausible numbers. */
function estimateChunks(sizeBytes: number, kind: DocumentKind) {
  const bytesPerChunk = kind === "pdf" ? 60_000 : kind === "docx" ? 20_000 : 1_500;
  return Math.min(250, Math.max(1, Math.round(sizeBytes / bytesPerChunk)));
}

export class PreviewUploader implements DocumentUploader {
  private cancelled = new Set<string>();

  upload({ documentId, file, kind }: UploadRequest, onUpdate: (update: DocumentUpdate) => void) {
    const sleep = (ms: number) =>
      new Promise<boolean>((resolve) =>
        window.setTimeout(() => resolve(!this.cancelled.has(documentId)), ms),
      );

    const run = async () => {
      for (const progress of [16, 38, 61, 84, 100]) {
        if (!(await sleep(170))) return;
        onUpdate({ progress });
      }

      onUpdate({ status: "parsing" });
      const [problem, alive] = await Promise.all([
        checkFileSignature(file, kind).catch(() => "The file couldn't be read."),
        sleep(750),
      ]);
      if (!alive) return;
      if (problem) {
        onUpdate({ status: "failed", error: problem });
        return;
      }

      onUpdate({ status: "indexing" });
      if (!(await sleep(850))) return;
      onUpdate({ status: "ready", chunkCount: estimateChunks(file.size, kind) });
    };

    void run().finally(() => this.cancelled.delete(documentId));
  }

  cancel(documentId: string) {
    this.cancelled.add(documentId);
  }
}

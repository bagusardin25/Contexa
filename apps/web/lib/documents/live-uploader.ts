import { type ApiDocument, api, errorDetail, unreachableMessage } from "@/lib/api/client";
import type { ApiSessionManager } from "@/lib/api/session";

import type { DocumentUpdate, DocumentUploader, UploadRequest } from "./uploader";

interface Upload {
  request: UploadRequest;
  onUpdate: (update: DocumentUpdate) => void;
  /** Bumped per attempt, so a superseded request can't overwrite a newer one. */
  attempt: number;
  xhr: XMLHttpRequest | null;
  /** Session that holds the document once the server accepted it. */
  storedIn: string | null;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Posts documents to `POST /api/sessions/{id}/documents`, where they're parsed,
 * chunked, indexed, and mined for keyterms. The browser's document id is sent
 * along, so evidence from the backend points at the same document in the UI.
 */
export class LiveUploader implements DocumentUploader {
  private uploads = new Map<string, Upload>();

  constructor(private readonly session: ApiSessionManager) {
    // The server lost our session (restart or expiry): upload everything again.
    session.onRecreated(() => {
      for (const documentId of this.uploads.keys()) void this.send(documentId);
    });
  }

  upload(request: UploadRequest, onUpdate: (update: DocumentUpdate) => void) {
    this.uploads.set(request.documentId, {
      request,
      onUpdate,
      attempt: 0,
      xhr: null,
      storedIn: null,
    });
    void this.send(request.documentId);
  }

  retry(documentId: string) {
    const upload = this.uploads.get(documentId);
    if (!upload) return;
    const storedIn = upload.storedIn;
    if (!storedIn) {
      void this.send(documentId);
      return;
    }
    // The server keeps a failed document under its id: remove it before sending again.
    upload.storedIn = null;
    void api
      .deleteDocument(storedIn, documentId)
      .catch(() => undefined)
      .finally(() => void this.send(documentId));
  }

  cancel(documentId: string) {
    const upload = this.uploads.get(documentId);
    if (!upload) return;
    this.uploads.delete(documentId);
    upload.xhr?.abort();
    if (upload.storedIn) {
      void api
        .deleteDocument(upload.storedIn, documentId)
        .catch(() => undefined)
        .finally(() => this.session.notifyDocumentsChanged());
    }
  }

  private async send(documentId: string) {
    const upload = this.uploads.get(documentId);
    if (!upload) return;
    const attempt = ++upload.attempt;
    const current = () => this.uploads.get(documentId) === upload && upload.attempt === attempt;
    const { request, onUpdate } = upload;
    upload.xhr?.abort();
    upload.xhr = null;
    upload.storedIn = null;
    onUpdate({ status: "uploading", progress: 0, error: null, chunkCount: null, keyterms: [] });

    let sessionId: string;
    try {
      sessionId = await this.session.ensure();
    } catch (error) {
      if (current()) onUpdate({ status: "failed", error: (error as Error).message });
      return;
    }
    if (!current()) return;

    const form = new FormData();
    form.append("file", request.file, request.file.name);
    form.append("documentId", documentId);

    const xhr = new XMLHttpRequest();
    upload.xhr = xhr;
    xhr.upload.onprogress = (event) => {
      if (current() && event.lengthComputable) {
        onUpdate({ progress: Math.round((event.loaded / event.total) * 100) });
      }
    };
    // Bytes are sent; the server now extracts text, chunks, and indexes.
    xhr.upload.onload = () => {
      if (current()) onUpdate({ progress: 100, status: "parsing" });
    };
    xhr.onload = () => {
      if (!current()) return;
      upload.xhr = null;
      if (xhr.status === 404) {
        // Unknown session: recreating it re-uploads every document, this one included.
        void this.session.recreate(sessionId).catch((error: unknown) => {
          if (current()) onUpdate({ status: "failed", error: (error as Error).message });
        });
        return;
      }
      const body = parse(xhr.responseText);
      if (xhr.status !== 201 || !body) {
        onUpdate({
          status: "failed",
          error: errorDetail(body) ?? `The upload failed (HTTP ${xhr.status}).`,
        });
        return;
      }
      const stored = body as ApiDocument;
      upload.storedIn = sessionId;
      onUpdate({
        status: stored.status,
        progress: 100,
        chunkCount: stored.chunkCount,
        error: stored.error,
        keyterms: stored.keyterms ?? [],
      });
      this.session.notifyDocumentsChanged();
    };
    xhr.onerror = () => {
      if (!current()) return;
      upload.xhr = null;
      onUpdate({ status: "failed", error: unreachableMessage() });
    };
    xhr.open("POST", api.documentsUrl(sessionId));
    xhr.send(form);
  }
}

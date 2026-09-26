import type { ContextDocument, DocumentKind } from "@/types/session";

export interface UploadRequest {
  documentId: string;
  file: File;
  kind: DocumentKind;
}

export type DocumentUpdate = Partial<
  Pick<ContextDocument, "status" | "progress" | "chunkCount" | "error" | "keyterms">
>;

/**
 * Sends a document through upload → parse → chunk → index. The live uploader
 * posts it to the FastAPI backend; the preview uploader checks it in the
 * browser and simulates the rest.
 */
export interface DocumentUploader {
  upload(request: UploadRequest, onUpdate: (update: DocumentUpdate) => void): void;
  /** Stops an upload in progress, or removes an uploaded document. */
  cancel(documentId: string): void;
  /** Sends a failed document again (live uploads only). */
  retry?(documentId: string): void;
}

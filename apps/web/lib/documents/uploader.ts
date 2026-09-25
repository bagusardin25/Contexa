import type { ContextDocument, DocumentKind } from "@/types/session";

import { PreviewUploader } from "./preview-uploader";

export interface UploadRequest {
  documentId: string;
  file: File;
  kind: DocumentKind;
}

export type DocumentUpdate = Partial<
  Pick<ContextDocument, "status" | "progress" | "chunkCount" | "error">
>;

/** Sends a document through upload → parse → chunk → index. */
export interface DocumentUploader {
  upload(request: UploadRequest, onUpdate: (update: DocumentUpdate) => void): void;
  cancel(documentId: string): void;
}

/**
 * Until the FastAPI `documents/` + `rag/` modules exist, files are validated in
 * the browser and the parse/index steps are simulated.
 */
export function createUploader(): DocumentUploader {
  return new PreviewUploader();
}

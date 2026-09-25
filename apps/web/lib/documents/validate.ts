import type { ContextDocument, DocumentKind } from "@/types/session";

export const ACCEPTED_EXTENSIONS: Record<string, DocumentKind> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".md": "md",
  ".markdown": "md",
  ".txt": "txt",
};

export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED_EXTENSIONS).join(",");
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS = 10;

export type FileValidation =
  | { ok: true; kind: DocumentKind }
  | { ok: false; reason: string };

/**
 * Client-side pre-check for faster feedback. The backend repeats every check
 * and never trusts the browser-provided MIME type.
 */
export function validateFile(
  file: File,
  existing: ContextDocument[],
): FileValidation {
  const dot = file.name.lastIndexOf(".");
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  const kind = ACCEPTED_EXTENSIONS[extension];

  if (!kind) return { ok: false, reason: "Only PDF, DOCX, Markdown, and TXT files are supported." };
  if (file.size === 0) return { ok: false, reason: "The file is empty." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: "Files must be 10 MB or smaller." };
  if (existing.length >= MAX_DOCUMENTS) {
    return { ok: false, reason: `A session can hold up to ${MAX_DOCUMENTS} documents.` };
  }
  if (existing.some((doc) => doc.name === file.name && doc.sizeBytes === file.size)) {
    return { ok: false, reason: "This file is already attached." };
  }
  return { ok: true, kind };
}

const SIGNATURES: Partial<Record<DocumentKind, { bytes: number[]; label: string }>> = {
  pdf: { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], label: "PDF" }, // "%PDF-"
  docx: { bytes: [0x50, 0x4b, 0x03, 0x04], label: "DOCX document" }, // ZIP container
};

/** Returns a problem description when the file content doesn't match its extension. */
export async function checkFileSignature(
  file: File,
  kind: DocumentKind,
): Promise<string | null> {
  const signature = SIGNATURES[kind];
  if (!signature) return null;
  const header = new Uint8Array(
    await file.slice(0, signature.bytes.length).arrayBuffer(),
  );
  const matches = signature.bytes.every((byte, index) => header[index] === byte);
  return matches ? null : `This file doesn't look like a valid ${signature.label}.`;
}

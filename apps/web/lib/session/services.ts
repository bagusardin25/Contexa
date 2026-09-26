import { API_URL } from "@/lib/api/client";
import { ApiSessionManager } from "@/lib/api/session";
import { LiveUploader } from "@/lib/documents/live-uploader";
import { PreviewUploader } from "@/lib/documents/preview-uploader";
import type { DocumentUploader } from "@/lib/documents/uploader";

import { LiveTransport } from "./live-transport";
import { PreviewTransport } from "./preview-transport";
import type { SessionTransport } from "./transport";

/**
 * With `NEXT_PUBLIC_API_URL` set, the workspace runs the live pipeline against the
 * Contexa API; the transport and uploader share one backend session. Without it,
 * it runs the clearly labelled, scripted preview.
 */
export function createSessionServices(): {
  transport: SessionTransport;
  uploader: DocumentUploader;
} {
  if (API_URL) {
    const session = new ApiSessionManager();
    return { transport: new LiveTransport(session), uploader: new LiveUploader(session) };
  }
  return { transport: new PreviewTransport(), uploader: new PreviewUploader() };
}

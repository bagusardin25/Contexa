import { ApiSessionManager } from "@/lib/api/session";
import { LiveUploader } from "@/lib/documents/live-uploader";
import { PreviewUploader } from "@/lib/documents/preview-uploader";
import type { DocumentUploader } from "@/lib/documents/uploader";

import { LiveTransport } from "./live-transport";
import type { SessionMode } from "./mode";
import { PreviewTransport } from "./preview-transport";
import type { SessionTransport } from "./transport";

/**
 * Live mode runs the pipeline against the Contexa API (`NEXT_PUBLIC_API_URL`); the
 * transport and uploader share one backend session. Preview mode runs the clearly
 * labelled, scripted preview.
 */
export function createSessionServices(mode: SessionMode): {
  transport: SessionTransport;
  uploader: DocumentUploader;
} {
  if (mode === "live") {
    const session = new ApiSessionManager();
    return { transport: new LiveTransport(session), uploader: new LiveUploader(session) };
  }
  return { transport: new PreviewTransport(), uploader: new PreviewUploader() };
}

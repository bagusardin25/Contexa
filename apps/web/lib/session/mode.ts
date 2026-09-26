import { useSyncExternalStore } from "react";

import { API_URL } from "@/lib/api/client";

/** `live` runs against the Contexa API; `preview` replays the scripted session. */
export type SessionMode = "live" | "preview";

/** `/session?preview` opens the scripted preview even when an API is configured. */
const PREVIEW_PARAM = "preview";

/** Whether this build can run the live pipeline at all. */
export const LIVE_AVAILABLE = API_URL !== null;

const BUILD_MODE: SessionMode = LIVE_AVAILABLE ? "live" : "preview";

function readMode(): SessionMode {
  if (!LIVE_AVAILABLE) return "preview";
  return new URLSearchParams(window.location.search).has(PREVIEW_PARAM) ? "preview" : "live";
}

// The mode only changes with a full navigation (see openPreview / openLive).
const subscribe = () => () => {};

/**
 * The server render and hydration use the build's mode; the URL decides right after,
 * so a `?preview` link never causes a hydration mismatch.
 */
export function useSessionMode(): SessionMode {
  return useSyncExternalStore(subscribe, readMode, () => BUILD_MODE);
}

// Full page loads on purpose: each mode builds its own services and store, so switching
// starts from a clean workspace (and closes any live stream on the way out).

export function openPreview() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/session?${PREVIEW_PARAM}`);
}

export function openLive() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/session");
}

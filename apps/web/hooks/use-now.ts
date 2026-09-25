"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Current timestamp (rounded down to `intervalMs`) that re-renders every
 * `intervalMs` while `enabled`. Returns `null` during server rendering and
 * hydration, so callers must handle a missing value.
 */
export function useNow(intervalMs: number, enabled = true) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled) return () => {};
      const id = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs, enabled],
  );

  const getSnapshot = useCallback(
    () => (enabled ? Math.floor(Date.now() / intervalMs) * intervalMs : null),
    [intervalMs, enabled],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Copies text to the clipboard and exposes a short-lived `copied` flag. `target` is the
 * window the click happens in: a floating (picture-in-picture) window has the focus, and
 * the clipboard only accepts writes from the focused document.
 */
export function useCopy(resetAfterMs = 1600, target?: Window | null) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, successMessage?: string) => {
      try {
        await (target ?? window).navigator.clipboard.writeText(text);
      } catch {
        toast.error("Couldn't copy — your browser blocked clipboard access.");
        return false;
      }
      setCopied(true);
      if (successMessage) toast.success(successMessage);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), resetAfterMs);
      return true;
    },
    [resetAfterMs, target],
  );

  return { copied, copy };
}

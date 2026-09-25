"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Copies text to the clipboard and exposes a short-lived `copied` flag. */
export function useCopy(resetAfterMs = 1600) {
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
        await navigator.clipboard.writeText(text);
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
    [resetAfterMs],
  );

  return { copied, copy };
}

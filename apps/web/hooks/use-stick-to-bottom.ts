"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 72;

/**
 * Keeps a scroll container pinned to the bottom while new content streams in,
 * unless the user has scrolled up to read something.
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    const onScroll = () => {
      const distance =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stuck.current = distance < THRESHOLD_PX;
      setIsAtBottom(stuck.current);
    };

    const observer = new ResizeObserver(() => {
      if (stuck.current) scroller.scrollTop = scroller.scrollHeight;
    });

    scroller.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(content);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    stuck.current = true;
    setIsAtBottom(true);
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, []);

  return { scrollRef, contentRef, isAtBottom, scrollToBottom };
}

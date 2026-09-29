"use client";

import { useRef } from "react";
import { MenuIcon } from "lucide-react";

/** The header's links below 960px: a disclosure that closes on Escape or when a link is picked. */
export function MobileNavigation() {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  return (
    <details
      ref={details}
      className="mobile-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          details.current.open = false;
          summary.current?.focus();
        }
      }}
    >
      <summary ref={summary} aria-label="Navigation menu">
        <MenuIcon aria-hidden />
      </summary>
      <nav
        aria-label="Mobile navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a") && details.current) {
            details.current.open = false;
          }
        }}
      >
        <a href="#problem">Why Contexa</a>
        <a href="#how-it-works">How it works</a>
        <a href="#principles">Our principles</a>
        <a href="#faq">Common questions</a>
        <a href="/history">Session history</a>
      </nav>
    </details>
  );
}

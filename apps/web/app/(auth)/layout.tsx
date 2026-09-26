import type { ReactNode } from "react";
import Link from "next/link";

import { AuthPanel } from "@/components/auth/auth-panel";
import { LINK_CLASS } from "@/components/auth/styles";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col px-4 py-4 sm:px-8 sm:py-5">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Contexa home"
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Logo />
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="text-center text-xs text-muted-foreground text-pretty">
          An account is optional.{" "}
          <Link href="/session" className={LINK_CLASS}>
            Open a session without one
          </Link>
        </footer>
      </div>
      <AuthPanel />
    </div>
  );
}

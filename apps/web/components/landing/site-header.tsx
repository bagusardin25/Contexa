import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Contexa home" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <a href="#problem" className="transition-colors hover:text-foreground">Problem</a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#principles" className="transition-colors hover:text-foreground">Principles</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/session">
              Launch app
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6">
        <Logo wordmarkClassName="text-foreground" />
        <p className="sm:ml-4">Built for the AssemblyAI Voice Agent Hackathon on lablab.ai.</p>
        <p className="sm:ml-auto">Speech powered by AssemblyAI.</p>
      </div>
    </footer>
  );
}

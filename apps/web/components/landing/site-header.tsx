import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { UserMenu } from "@/components/auth/user-menu";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#principles", label: "Principles" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:gap-6">
        <Link href="/" aria-label="Contexa home" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {/* The wordmark gives way on the narrowest phones so the header actions still fit. */}
          <Logo wordmarkClassName="max-[359px]:hidden" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-1.5 transition-colors outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
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

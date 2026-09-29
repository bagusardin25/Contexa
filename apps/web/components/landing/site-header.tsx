import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { UserMenu } from "@/components/auth/user-menu";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

import { MobileNavigation } from "./mobile-navigation";

export function SiteHeader() {
  return (
    <header className="landing-header">
      <div className="landing-container header-inner">
        <Link href="/" aria-label="Contexa home" className="header-logo">
          {/* The wordmark gives way on the narrowest phones so the header actions still fit. */}
          <Logo wordmarkClassName="max-[359px]:hidden" />
        </Link>
        <nav aria-label="Main" className="desktop-nav">
          <a href="#problem">Why Contexa</a>
          <a href="#how-it-works">How it works</a>
          <a href="#principles">Our principles</a>
        </nav>
        <div className="header-actions">
          <Button asChild size="sm" variant="ghost" className="header-history">
            <Link href="/history">History</Link>
          </Button>
          <ThemeToggle />
          <UserMenu />
          <Button asChild size="sm" className="header-launch">
            <Link href="/session">
              Launch app <ArrowRightIcon />
            </Link>
          </Button>
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="footer-main">
          <div>
            <Link href="/" aria-label="Contexa home">
              <Logo />
            </Link>
            <p>A little context. A world of conversation.</p>
          </div>
          <nav aria-label="Footer">
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
            <Link href="/session">Open app</Link>
          </nav>
        </div>
        <div className="footer-credit">
          <p>Built for the AssemblyAI Voice Agent Hackathon on lablab.ai.</p>
          <p>Speech powered by AssemblyAI.</p>
        </div>
      </div>
    </footer>
  );
}

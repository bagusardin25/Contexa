import { HowItWorks } from "@/components/landing/how-it-works";
import { FinalCta, Hero, Principles, Problem } from "@/components/landing/sections";
import { SiteFooter, SiteHeader } from "@/components/landing/site-header";

export default function HomePage() {
  return (
    <div className="landing flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background text-sm font-medium shadow-md ring-1 ring-border focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <Problem />
        <HowItWorks />
        <Principles />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

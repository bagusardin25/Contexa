import { FinalCta, Hero, HowItWorks, Principles, Problem } from "@/components/landing/sections";
import { SiteFooter, SiteHeader } from "@/components/landing/site-header";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
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

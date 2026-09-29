import type { Metadata, Viewport } from "next";
// Self-hosted Geist (next/font/local): dev and builds never wait on Google Fonts, whose
// failed downloads break Turbopack with "Can't resolve '@vercel/turbopack-next/internal/font/…'".
// Sets --font-geist-sans and --font-geist-mono, as globals.css expects.
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Contexa: real-time multilingual conversation copilot",
    template: "%s · Contexa",
  },
  description:
    "Contexa transcribes live speech with AssemblyAI, translates every turn into your language, and suggests grounded answers from your own documents, ready to say in the speaker's language.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        {/* Offset keeps toasts clear of the session control bar. */}
        <Toaster position="bottom-center" offset={84} mobileOffset={84} />
      </body>
    </html>
  );
}

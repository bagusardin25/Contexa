/**
 * Inline text links in the auth pages. Lives outside the "use client" modules so
 * Server Components can import it as a plain string. The vertical padding grows
 * the tap target to 24px+ without moving the surrounding text.
 */
export const LINK_CLASS =
  "rounded-sm py-1 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50";

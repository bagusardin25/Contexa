import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-linear-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-sm shadow-indigo-500/30",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[62%] text-white" fill="currentColor">
        <rect x="2.5" y="9" width="3" height="6" rx="1.5" />
        <rect x="8" y="4.5" width="3" height="15" rx="1.5" />
        <rect x="13.5" y="7.5" width="3" height="9" rx="1.5" opacity="0.9" />
        <circle cx="20.5" cy="12" r="1.6" opacity="0.75" />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  wordmarkClassName,
}: {
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className={cn("text-[15px] font-semibold tracking-tight", wordmarkClassName)}>
        Contexa
      </span>
    </span>
  );
}

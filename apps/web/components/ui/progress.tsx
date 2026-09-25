import * as React from "react";

import { cn } from "@/lib/utils";

/** Progress bar. Pass `value={null}` for an indeterminate bar. */
function Progress({
  value,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { value: number | null }) {
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      {value === null ? (
        <div className="absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-primary" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      )}
    </div>
  );
}

export { Progress };

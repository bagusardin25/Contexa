"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircleIcon, MailIcon } from "lucide-react";

import { resendConfirmation } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Supabase accepts one confirmation email per address per minute by default. */
const COOLDOWN_SECONDS = 60;

export function ResendConfirmation({ email, next }: { email: string; next: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const blocked = pending || cooldown > 0;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={blocked || undefined}
        onClick={() => {
          if (blocked) return;
          startTransition(async () => {
            const outcome = await resendConfirmation(email, next);
            setResult(outcome);
            if (outcome.ok) setCooldown(COOLDOWN_SECONDS);
          });
        }}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        {pending ? <LoaderCircleIcon className="motion-safe:animate-spin" aria-hidden /> : <MailIcon aria-hidden />}
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
      </Button>
      <p role="status" className={cn("text-sm", result?.ok === false ? "text-destructive" : "text-muted-foreground")}>
        {result?.message}
      </p>
    </div>
  );
}

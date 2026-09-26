"use client";

import { useId, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";

export function AuthHeading({
  title,
  description,
  headingRef,
}: {
  title: string;
  description?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="space-y-1.5">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        {title}
      </h1>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      ) : null}
    </div>
  );
}

type TextFieldProps = ComponentProps<"input"> & {
  label: string;
  error?: string;
  hint?: string;
  /** Inside the input, at its end. */
  trailing?: ReactNode;
};

export function TextField({ label, error, hint, trailing, id, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("h-11 sm:h-10", trailing && "pr-11", className)}
          {...props}
        />
        {trailing ? <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div> : null}
      </div>
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField(props: Omit<TextFieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      spellCheck={false}
      trailing={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Show password"
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          className="text-muted-foreground"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      }
    />
  );
}

const ALERT_TONES = {
  error: { icon: CircleAlertIcon, box: "border-destructive/30 bg-destructive/[0.06]", iconClass: "text-destructive" },
  warning: { icon: TriangleAlertIcon, box: "border-warning/40 bg-warning/10", iconClass: "text-question-foreground" },
  success: { icon: CircleCheckIcon, box: "border-success/30 bg-success/[0.06]", iconClass: "text-success" },
};

export function FormAlert({
  tone = "error",
  title,
  children,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children?: ReactNode;
}) {
  const { icon: Icon, box, iconClass } = ALERT_TONES[tone];

  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", box)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden />
      <div className="min-w-0 space-y-2 leading-relaxed">
        {title ? <p className="font-medium">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      aria-disabled={pending || undefined}
      className="h-11 w-full aria-disabled:cursor-progress sm:h-10"
    >
      {pending ? <LoaderCircleIcon className="motion-safe:animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" aria-hidden />
      or
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export function NotConfiguredNotice() {
  return (
    <FormAlert tone="warning" title="Sign-in isn't set up yet">
      <p className="text-muted-foreground">
        Add <code className="font-mono text-xs text-foreground">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono text-xs text-foreground">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
        <code className="font-mono text-xs text-foreground">apps/web/.env.local</code>, then restart the dev
        server. The session workspace works without an account.
      </p>
    </FormAlert>
  );
}

/** Moves focus to the first field (in form order) that has an error. */
export function focusFirstInvalid(form: HTMLFormElement, errors: FieldErrors) {
  for (const element of Array.from(form.elements)) {
    const name = element.getAttribute("name");
    if (name && name in errors && element instanceof HTMLElement) {
      element.focus();
      return;
    }
  }
}

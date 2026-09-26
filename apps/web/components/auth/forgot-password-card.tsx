"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { MailCheckIcon } from "lucide-react";

import { requestPasswordReset } from "@/app/(auth)/actions";
import { IDLE_STATE } from "@/lib/auth/form-state";
import { validateEmailOnly, type FieldErrors } from "@/lib/auth/validation";

import { AuthHeading, FormAlert, NotConfiguredNotice, SubmitButton, TextField, focusFirstInvalid } from "./fields";
import { LINK_CLASS } from "./styles";

export function ForgotPasswordCard({ configured }: { configured: boolean }) {
  const [attempt, setAttempt] = useState(0);
  return <ForgotPasswordFlow key={attempt} configured={configured} onRestart={() => setAttempt((count) => count + 1)} />;
}

function ForgotPasswordFlow({ configured, onRestart }: { configured: boolean; onRestart: () => void }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, IDLE_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const errors = clientErrors ?? state.fieldErrors ?? {};
  const sent = state.status === "success";

  useEffect(() => {
    if (sent) headingRef.current?.focus();
    else if (state.fieldErrors && formRef.current) focusFirstInvalid(formRef.current, state.fieldErrors);
  }, [state, sent]);

  if (sent) {
    return (
      <div className="space-y-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MailCheckIcon className="size-5" aria-hidden />
        </span>
        <AuthHeading
          headingRef={headingRef}
          title="Check your email"
          description={
            <>
              If an account exists for{" "}
              <strong className="font-medium text-foreground">{state.values?.email}</strong>, we sent a link to
              choose a new password. Open it in this browser.
            </>
          }
        />
        <div className="space-y-2 border-t pt-5 text-sm text-muted-foreground">
          <p>
            Didn&apos;t get it? Check your spam folder, or{" "}
            <button type="button" onClick={onRestart} className={LINK_CLASS}>
              try another address
            </button>
            .
          </p>
          <p>
            <Link href="/login" className={LINK_CLASS}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) return event.preventDefault();
    const found = validateEmailOnly({ email: String(new FormData(event.currentTarget).get("email") ?? "").trim() });
    setClientErrors(found);
    if (found) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, found);
    }
  }

  return (
    <div className="space-y-6">
      <AuthHeading
        title="Reset your password"
        description="Enter the email you signed up with and we'll send you a link to choose a new password."
      />
      {configured ? null : <NotConfiguredNotice />}
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate>
        <fieldset disabled={!configured} className="space-y-4">
          {state.status === "error" && state.message ? <FormAlert>{state.message}</FormAlert> : null}
          <TextField
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.values?.email}
            error={errors.email}
          />
          <SubmitButton pending={pending} pendingLabel="Sending link…">
            Send reset link
          </SubmitButton>
        </fieldset>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className={LINK_CLASS}>
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

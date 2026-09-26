"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRightIcon, CircleCheckIcon } from "lucide-react";

import { updatePassword } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { IDLE_STATE } from "@/lib/auth/form-state";
import { DEFAULT_NEXT } from "@/lib/auth/redirect";
import { PASSWORD_MIN, validateNewPassword, type FieldErrors } from "@/lib/auth/validation";

import { AuthHeading, FormAlert, PasswordField, SubmitButton, focusFirstInvalid } from "./fields";
import { LINK_CLASS } from "./styles";

export function ResetPasswordCard({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(updatePassword, IDLE_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const errors = clientErrors ?? state.fieldErrors ?? {};
  const done = state.status === "success";

  useEffect(() => {
    if (done) headingRef.current?.focus();
    else if (state.fieldErrors && formRef.current) focusFirstInvalid(formRef.current, state.fieldErrors);
  }, [state, done]);

  if (done) {
    return (
      <div className="space-y-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success/10 text-success">
          <CircleCheckIcon className="size-5" aria-hidden />
        </span>
        <AuthHeading
          headingRef={headingRef}
          title="Password updated"
          description="You're signed in. Use your new password the next time you sign in with email."
        />
        <Button asChild size="lg" className="h-11 w-full sm:h-10">
          <Link href={DEFAULT_NEXT}>
            Continue to Contexa
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) return event.preventDefault();
    const data = new FormData(event.currentTarget);
    const found = validateNewPassword({
      password: String(data.get("password") ?? ""),
      confirm: String(data.get("confirm") ?? ""),
    });
    setClientErrors(found);
    if (found) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, found);
    }
  }

  return (
    <div className="space-y-6">
      <AuthHeading
        title="Choose a new password"
        description={
          <>
            For <strong className="font-medium text-foreground">{email}</strong>.
          </>
        }
      />
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate className="space-y-4">
        {state.status === "error" && state.message ? (
          <FormAlert>
            <p>{state.message}</p>
            {state.code === "session_expired" ? (
              <Link href="/forgot-password" className={LINK_CLASS}>
                Request a new link
              </Link>
            ) : null}
          </FormAlert>
        ) : null}
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={errors.password}
        />
        <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" error={errors.confirm} />
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Update password
        </SubmitButton>
      </form>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { signInWithPassword } from "@/app/(auth)/actions";
import { IDLE_STATE } from "@/lib/auth/form-state";
import { withNext } from "@/lib/auth/redirect";
import { validateSignIn, type FieldErrors } from "@/lib/auth/validation";

import {
  AuthDivider,
  AuthHeading,
  FormAlert,
  NotConfiguredNotice,
  PasswordField,
  SubmitButton,
  TextField,
  focusFirstInvalid,
} from "./fields";
import { GoogleButton } from "./google-button";
import { ResendConfirmation } from "./resend-confirmation";
import { LINK_CLASS } from "./styles";

export function LoginCard({ next, notice, configured }: { next: string; notice?: string; configured: boolean }) {
  const [state, formAction, pending] = useActionState(signInWithPassword, IDLE_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const [noticeVisible, setNoticeVisible] = useState(Boolean(notice));
  const formRef = useRef<HTMLFormElement>(null);

  const errors = clientErrors ?? state.fieldErrors ?? {};

  useEffect(() => {
    if (state.fieldErrors && formRef.current) focusFirstInvalid(formRef.current, state.fieldErrors);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) return event.preventDefault();
    setNoticeVisible(false);
    const data = new FormData(event.currentTarget);
    const found = validateSignIn({
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    });
    setClientErrors(found);
    if (found) {
      event.preventDefault();
      focusFirstInvalid(event.currentTarget, found);
    }
  }

  return (
    <div className="space-y-6">
      <AuthHeading title="Sign in to Contexa" description="Use your Google account, or the email and password you signed up with." />
      {configured ? null : <NotConfiguredNotice />}
      {noticeVisible && notice ? <FormAlert>{notice}</FormAlert> : null}

      <GoogleButton next={next} disabled={!configured} />
      <AuthDivider />

      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate>
        <fieldset disabled={!configured} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          {state.status === "error" && state.message ? (
            <FormAlert>
              <p>{state.message}</p>
              {state.code === "email_not_confirmed" && state.values?.email ? (
                <ResendConfirmation email={state.values.email} next={next} />
              ) : null}
            </FormAlert>
          ) : null}
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
          <PasswordField name="password" label="Password" autoComplete="current-password" error={errors.password} />
          {/* After the field, so Tab goes straight from email to password. */}
          <div className="-mt-2 flex justify-end">
            <Link href="/forgot-password" className={`text-sm ${LINK_CLASS}`}>
              Forgot password?
            </Link>
          </div>
          <SubmitButton pending={pending} pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </fieldset>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New to Contexa?{" "}
        <Link href={withNext("/register", next)} className={LINK_CLASS}>
          Create an account
        </Link>
      </p>
    </div>
  );
}

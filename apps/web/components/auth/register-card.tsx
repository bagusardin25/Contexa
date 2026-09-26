"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { MailCheckIcon } from "lucide-react";

import { signUpWithPassword } from "@/app/(auth)/actions";
import { IDLE_STATE } from "@/lib/auth/form-state";
import { withNext } from "@/lib/auth/redirect";
import { PASSWORD_MIN, validateSignUp, type FieldErrors } from "@/lib/auth/validation";

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

interface RegisterProps {
  next: string;
  configured: boolean;
}

export function RegisterCard(props: RegisterProps) {
  // Remounting resets the form action's state when someone wants to use another address.
  const [attempt, setAttempt] = useState(0);
  return <RegisterFlow key={attempt} {...props} onRestart={() => setAttempt((count) => count + 1)} />;
}

function RegisterFlow({ next, configured, onRestart }: RegisterProps & { onRestart: () => void }) {
  const [state, formAction, pending] = useActionState(signUpWithPassword, IDLE_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = clientErrors ?? state.fieldErrors ?? {};

  useEffect(() => {
    if (state.fieldErrors && formRef.current) focusFirstInvalid(formRef.current, state.fieldErrors);
  }, [state]);

  if (state.status === "success") {
    return <CheckEmail email={state.values?.email ?? ""} next={next} onRestart={onRestart} />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) return event.preventDefault();
    const data = new FormData(event.currentTarget);
    const found = validateSignUp({
      name: String(data.get("name") ?? "").trim(),
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
      <AuthHeading title="Create your account" description="Sign up with Google in one step, or use your email and a password." />
      {configured ? null : <NotConfiguredNotice />}

      <GoogleButton next={next} disabled={!configured} />
      <AuthDivider />

      <form ref={formRef} action={formAction} onSubmit={handleSubmit} noValidate>
        <fieldset disabled={!configured} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          {state.status === "error" && state.message ? (
            <FormAlert>
              <p>{state.message}</p>
              {state.code === "user_already_exists" || state.code === "email_exists" ? (
                <Link href={withNext("/login", next)} className={LINK_CLASS}>
                  Go to sign in
                </Link>
              ) : null}
            </FormAlert>
          ) : null}
          <TextField
            name="name"
            label="Name"
            autoComplete="name"
            defaultValue={state.values?.name}
            error={errors.name}
          />
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
          <PasswordField
            name="password"
            label="Password"
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} characters.`}
            error={errors.password}
          />
          <SubmitButton pending={pending} pendingLabel="Creating account…">
            Create account
          </SubmitButton>
        </fieldset>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className={LINK_CLASS}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

function CheckEmail({ email, next, onRestart }: { email: string; next: string; onRestart: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
            We sent a confirmation link to <strong className="font-medium text-foreground">{email}</strong>.
            Open it in this browser to finish creating your account.
          </>
        }
      />
      <ResendConfirmation email={email} next={next} />
      <div className="space-y-2 border-t pt-5 text-sm text-muted-foreground">
        <p>
          Wrong address?{" "}
          <button type="button" onClick={onRestart} className={LINK_CLASS}>
            Use a different email
          </button>
        </p>
        <p>
          Already confirmed?{" "}
          <Link href={withNext("/login", next)} className={LINK_CLASS}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authErrorCode, authErrorMessage } from "@/lib/auth/errors";
import type { AuthFormState } from "@/lib/auth/form-state";
import { safeNext } from "@/lib/auth/redirect";
import {
  field,
  validateEmailOnly,
  validateNewPassword,
  validateSignIn,
  validateSignUp,
} from "@/lib/auth/validation";
import { isAuthConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const NOT_CONFIGURED: AuthFormState = {
  status: "error",
  code: "not_configured",
  message: authErrorMessage("not_configured"),
};

/** Public origin for auth email links and OAuth redirects. Supabase only accepts allow-listed URLs. */
async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function callbackUrl(next: string) {
  return `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
}

function failure(error: { code?: string; name?: string; status?: number }, values?: AuthFormState["values"]) {
  const code = authErrorCode(error);
  return { status: "error", code, message: authErrorMessage(code), values } satisfies AuthFormState;
}

export async function signInWithPassword(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured) return NOT_CONFIGURED;
  const email = field(formData, "email");
  const password = field(formData, "password", { trim: false });
  const values = { email };
  const fieldErrors = validateSignIn({ email, password });
  if (fieldErrors) return { status: "error", fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return failure(error, values);
  redirect(safeNext(formData.get("next")));
}

export async function signUpWithPassword(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured) return NOT_CONFIGURED;
  const name = field(formData, "name");
  const email = field(formData, "email");
  const password = field(formData, "password", { trim: false });
  const next = safeNext(formData.get("next"));
  const values = { name, email };
  const fieldErrors = validateSignUp({ name, email, password });
  if (fieldErrors) return { status: "error", fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: await callbackUrl(next) },
  });
  if (error) {
    const code = authErrorCode(error);
    if (code === "weak_password") {
      return { status: "error", code, fieldErrors: { password: authErrorMessage(code) }, values };
    }
    return failure(error, values);
  }
  // With email confirmation turned off, Supabase signs the person in right away.
  if (data.session) redirect(next);
  // Otherwise it emailed a link. An address that already has an account gets the
  // same reply, so this response never reveals who is registered.
  return { status: "success", values: { email } };
}

export async function resendConfirmation(email: string, next: string): Promise<{ ok: boolean; message: string }> {
  if (!isAuthConfigured) return { ok: false, message: authErrorMessage("not_configured") };
  if (validateEmailOnly({ email })) return { ok: false, message: authErrorMessage("email_address_invalid") };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: await callbackUrl(safeNext(next)) },
  });
  if (error) return { ok: false, message: authErrorMessage(authErrorCode(error)) };
  return { ok: true, message: `We sent a new link to ${email}.` };
}

export async function requestPasswordReset(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured) return NOT_CONFIGURED;
  const email = field(formData, "email");
  const values = { email };
  const fieldErrors = validateEmailOnly({ email });
  if (fieldErrors) return { status: "error", fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callbackUrl("/reset-password"),
  });
  // Unknown addresses succeed too, so the reply never confirms an account exists.
  if (error) return failure(error, values);
  return { status: "success", values };
}

export async function updatePassword(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured) return NOT_CONFIGURED;
  const password = field(formData, "password", { trim: false });
  const confirm = field(formData, "confirm", { trim: false });
  const fieldErrors = validateNewPassword({ password, confirm });
  if (fieldErrors) return { status: "error", fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", code: "session_expired", message: authErrorMessage("otp_expired") };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const code = authErrorCode(error);
    if (code === "weak_password" || code === "same_password") {
      return { status: "error", code, fieldErrors: { password: authErrorMessage(code) } };
    }
    return failure(error);
  }
  return { status: "success" };
}

export async function signInWithGoogle(
  _previous: { message?: string },
  formData: FormData,
): Promise<{ message?: string }> {
  if (!isAuthConfigured) return { message: authErrorMessage("not_configured") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(safeNext(formData.get("next"))) },
  });
  if (error || !data.url) return { message: authErrorMessage(error ? authErrorCode(error) : "oauth_failed") };
  redirect(data.url);
}

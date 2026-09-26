import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { authErrorCode } from "@/lib/auth/errors";
import { DEFAULT_NEXT, safeNext } from "@/lib/auth/redirect";
import { isAuthConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Supabase sends people back: Google OAuth and PKCE email links arrive
 * with `?code=`, custom email templates with `?token_hash=&type=`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));

  const go = (destination: string | URL) => {
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const fail = (code: string) => {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", code);
    if (next !== DEFAULT_NEXT) url.searchParams.set("next", next);
    return go(url);
  };

  if (!isAuthConfigured) return fail("not_configured");

  // Provider errors, e.g. someone cancelled on Google's consent screen.
  const providerError = params.get("error_code") || params.get("error");
  if (providerError) return fail(providerError);

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let result;
  if (code) result = await supabase.auth.exchangeCodeForSession(code);
  else if (tokenHash && type) result = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  else return fail("link_invalid");

  if (result.error) return fail(authErrorCode(result.error));
  return go(type === "recovery" ? "/reset-password" : next);
}

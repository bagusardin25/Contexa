import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/redirect";

import { SUPABASE_KEY, SUPABASE_URL, isAuthConfigured } from "./config";

/** Pages that make no sense once someone is signed in. */
const GUEST_ONLY = new Set(["/login", "/register"]);

/**
 * Refreshes an expired session before a page reads it on the server (Server
 * Components can't write cookies), and sends signed-in visitors past the
 * sign-in pages.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isAuthConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Cache-Control and friends: a response carrying auth cookies must never be cached.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Keep this call directly after createServerClient: it is what refreshes the session.
  const { data } = await supabase.auth.getClaims();

  if (data?.claims && GUEST_ONLY.has(request.nextUrl.pathname)) {
    const destination = new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url);
    const redirect = NextResponse.redirect(destination);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  return response;
}

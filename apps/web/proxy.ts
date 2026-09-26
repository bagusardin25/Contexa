import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only the pages that read the session on the server. Everything else,
  // including the static landing page, skips the proxy entirely.
  matcher: ["/login", "/register", "/reset-password"],
};

/**
 * Supabase Auth settings. Both values are public (they ship to the browser);
 * Supabase enforces access, not secrecy of these values. Without them the app
 * still runs: sign-in is hidden and the auth pages explain what to configure.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isAuthConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

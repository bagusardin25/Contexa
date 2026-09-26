import { createClient } from "@/lib/supabase/client";
import { isAuthConfigured } from "@/lib/supabase/config";

const STORAGE_KEY = "contexa-device-key";
const DEVICE_KEY = /^[A-Za-z0-9_-]{32,128}$/;

let memoryKey: string | null = null;

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A random key that identifies this browser to the history API when nobody is signed in.
 * The API stores only its hash. Without storage (private windows, blocked site data) it
 * lasts as long as the page.
 */
export function deviceKey() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && DEVICE_KEY.test(stored)) return stored;
    const fresh = randomKey();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    memoryKey ??= randomKey();
    return memoryKey;
  }
}

/** The signed-in user's access token, if Supabase is configured and someone is signed in. */
async function accessToken(): Promise<string | null> {
  if (!isAuthConfigured) return null;
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Who owns saved meetings: the signed-in account when there is one, else this device.
 * Both are sent; the API uses the account when it can check it with Supabase.
 */
export async function historyHeaders(): Promise<{ headers: Record<string, string>; signedIn: boolean }> {
  const headers: Record<string, string> = { "X-Contexa-Device": deviceKey() };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers, signedIn: token !== null };
}

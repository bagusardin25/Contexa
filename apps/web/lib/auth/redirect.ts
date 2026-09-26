/** Where people land after signing in when no destination was requested. */
export const DEFAULT_NEXT = "/session";

/**
 * Returns `value` only when it is a same-origin path, so `?next=` can never
 * send someone to another site (`//evil.example`, `/\evil.example`, `https://…`).
 */
export function safeNext(value: unknown, fallback = DEFAULT_NEXT): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  try {
    const url = new URL(value, "http://contexa.local");
    return url.origin === "http://contexa.local" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** A page's search param can arrive repeated; auth pages only read the first value. */
export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Adds `?next=` to an auth page link unless it is the default destination. */
export function withNext(path: string, next: string) {
  return next === DEFAULT_NEXT ? path : `${path}?next=${encodeURIComponent(next)}`;
}

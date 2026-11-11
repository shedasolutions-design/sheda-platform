/**
 * Reads a query parameter on the client without useSearchParams.
 *
 * useSearchParams makes a page opt out of prerendering up to the nearest
 * Suspense boundary. For values only needed inside event handlers and
 * effects, reading window.location directly avoids that cost.
 */
export function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Where to go after signing in. Only same-site paths are honoured, so a
 * crafted ?next=https://evil.example cannot turn login into an open redirect.
 */
export function safeNextPath(fallback: string): string {
  const next = getQueryParam("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

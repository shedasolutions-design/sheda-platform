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

/**
 * A route written for the mobile app (expo-router) as a web path:
 * "/(tabs)/history" -> "/history", "/wallet-setup/index" -> "/wallet-setup".
 * Notifications and stored links still carry the mobile form.
 */
export function toWebPath(route: string, params?: Record<string, unknown>): string {
  let path = route.replace(/\/\([^/)]+\)/g, "").replace(/\/index$/, "") || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  // Dynamic segments: "/details/[id]" with { id: 5 } -> "/details/5".
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v == null) continue;
    if (path.includes(`[${k}]`)) path = path.replace(`[${k}]`, encodeURIComponent(String(v)));
    else rest[k] = String(v);
  }
  const q = new URLSearchParams(rest).toString();
  return q ? `${path}?${q}` : path;
}

/**
 * A global `router` with expo-router's call shape, backed by Next's router.
 *
 * Screen logic carried over from the mobile app calls
 *   router.push("/(tabs)/history")
 *   router.push({ pathname: "/details/[id]", params: { id: 5 } })
 * from event handlers. This forwards those to the Next.js app router (so
 * navigation stays client-side and keeps wallet and session state), after
 * translating mobile route names into web paths with toWebPath.
 *
 * RouterBridge (components/RouterBridge.tsx) registers the live router once,
 * near the root of the tree.
 */
import { toWebPath } from "./navigation";

type Href = string | { pathname: string; params?: Record<string, unknown> };

interface NextRouterLike {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
}

let current: NextRouterLike | null = null;

export function registerRouter(r: NextRouterLike) {
  current = r;
}

const resolve = (href: Href) =>
  typeof href === "string" ? toWebPath(href) : toWebPath(href.pathname, href.params);

export const router = {
  push(href: Href) {
    const to = resolve(href);
    if (current) current.push(to);
    else window.location.assign(to);
  },
  replace(href: Href) {
    const to = resolve(href);
    if (current) current.replace(to);
    else window.location.replace(to);
  },
  back() {
    if (current) current.back();
    else window.history.back();
  },
  canGoBack() {
    return typeof window !== "undefined" && window.history.length > 1;
  },
};

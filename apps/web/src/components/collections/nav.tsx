"use client";

/**
 * expo-router's Stack.Screen / useLocalSearchParams / useFocusEffect for the
 * Collections screens. Stack.Screen's title is shown by the collections
 * layout's header; params come from the dynamic route segment plus the
 * query string.
 */
import { useEffect, useSyncExternalStore, type EffectCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
export { router } from "@/lib/router";

let title = "";
const listeners = new Set<() => void>();
const setTitle = (t: string) => {
  if (t === title) return;
  title = t;
  listeners.forEach((l) => l());
};

export function useStackTitle() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => title,
    () => ""
  );
}

function StackScreen({ options }: { options?: { title?: string } }) {
  const t = options?.title ?? "";
  useEffect(() => {
    setTitle(t);
    if (t) document.title = `${t} · Sheda Collections`;
  }, [t]);
  return null;
}

export const Stack = { Screen: StackScreen };

export function useLocalSearchParams<T extends Record<string, string>>(): Partial<T> {
  const params = useParams() as Record<string, string | string[]>;
  const search = useSearchParams();
  const out: Record<string, string> = {};
  search?.forEach((v, k) => {
    out[k] = v;
  });
  for (const [k, v] of Object.entries(params ?? {})) out[k] = decodeURIComponent(Array.isArray(v) ? v.join("/") : v);
  return out as Partial<T>;
}

/** Runs when the screen is shown; the web has no stack to come back to. */
export function useFocusEffect(effect: EffectCallback) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, [effect]);
}

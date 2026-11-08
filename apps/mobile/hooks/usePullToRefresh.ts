import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/**
 * Pull-to-refresh that works on WEB, plus refresh-on-return.
 *
 * WHY THIS EXISTS:
 * react-native-web's RefreshControl is a stub. Its implementation destructures
 * `onRefresh` (along with `refreshing`, `tintColor`, and the rest) out of its
 * props and renders a bare <View> — the callback is accepted and then silently
 * discarded. Every RefreshControl in this app is therefore dead on web, and the
 * only way to see new data was to reload the whole app.
 *
 * Native is unaffected: RefreshControl is real there, so the gesture half of
 * this hook stays off and the existing component keeps doing its job.
 *
 * ── Two ways to refresh ──
 *  1. The pull gesture, reimplemented on web from touch events.
 *  2. Returning to the tab. Deals move while someone is elsewhere — in a
 *     wallet, a chat, or another tab entirely — and coming back to a stale
 *     screen is what made people restart the app. This half runs on every
 *     platform and is arguably the more useful of the two, because it needs no
 *     gesture to be discovered.
 */

/** How far to drag before it counts as a deliberate pull. */
const PULL_THRESHOLD_PX = 70;

/** Ignore a refresh fired within this window of the last one. */
const MIN_INTERVAL_MS = 2000;

interface Options {
  /** Disables the focus/visibility half. The gesture is unaffected. */
  refreshOnFocus?: boolean;
}

export function usePullToRefresh(
  onRefresh: () => Promise<unknown> | unknown,
  options: Options = {}
) {
  const { refreshOnFocus = true } = options;

  const [refreshing, setRefreshing] = useState(false);
  /** 0..1 — how far through the pull the user is, for an indicator. */
  const [pullProgress, setPullProgress] = useState(0);

  // Refs so the DOM listeners below never close over a stale callback or a
  // stale "already refreshing" flag.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(false);
  const lastRunRef = useRef(0);
  const scrollTopRef = useRef(0);
  const pullStartRef = useRef<number | null>(null);

  const run = useCallback(async () => {
    // Guards a double-fire from, say, a gesture landing as the tab regains
    // focus. Refreshing twice is harmless but wasteful, and on a rate-limited
    // RPC it is not free.
    if (refreshingRef.current) return;
    if (Date.now() - lastRunRef.current < MIN_INTERVAL_MS) return;

    refreshingRef.current = true;
    lastRunRef.current = Date.now();
    setRefreshing(true);
    try {
      await onRefreshRef.current();
    } catch (error) {
      // The caller owns error reporting; a refresh that fails must not take
      // the screen down with it.
      console.warn("usePullToRefresh: refresh failed:", error);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPullProgress(0);
    }
  }, []);

  /**
   * Optional. The gesture reads scroll position from the DOM, so wiring this
   * is not required — it only sharpens the fallback when the DOM cannot
   * identify a scrollable ancestor.
   */
  const onScroll = useCallback((event: any) => {
    scrollTopRef.current = event?.nativeEvent?.contentOffset?.y ?? 0;
  }, []);

  // ── The gesture, web only ──────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof document === "undefined") return;

    /**
     * Is the thing under the finger scrolled to its top?
     *
     * Read from the DOM rather than from an onScroll prop so a screen only has
     * to call this hook — there is no ScrollView to find and wire up, and no
     * way to wire it up wrongly. Falls back to the RN offset when the DOM
     * cannot answer.
     */
    const atTop = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== document.body) {
        const overflowY = window.getComputedStyle(node).overflowY;
        const scrollable =
          (overflowY === "auto" || overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight;
        if (scrollable) return node.scrollTop <= 0;
        node = node.parentElement;
      }
      const doc = document.scrollingElement;
      if (doc && doc.scrollHeight > doc.clientHeight) return doc.scrollTop <= 0;
      return scrollTopRef.current <= 0;
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Only arm a pull when the list is genuinely at the top; otherwise this
      // would hijack ordinary upward scrolling.
      pullStartRef.current = atTop(e.target)
        ? e.touches[0]?.clientY ?? null
        : null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (pullStartRef.current == null || refreshingRef.current) return;
      const delta = (e.touches[0]?.clientY ?? 0) - pullStartRef.current;
      if (delta <= 0) {
        setPullProgress(0);
        return;
      }
      setPullProgress(Math.min(1, delta / PULL_THRESHOLD_PX));
    };

    const handleTouchEnd = () => {
      const start = pullStartRef.current;
      pullStartRef.current = null;
      if (start == null) return;

      setPullProgress((progress) => {
        if (progress >= 1) run();
        return 0;
      });
    };

    // Passive: this never calls preventDefault, so it must not tell the
    // browser otherwise — doing so would cost scroll performance for nothing.
    const opts = { passive: true } as AddEventListenerOptions;
    document.addEventListener("touchstart", handleTouchStart, opts);
    document.addEventListener("touchmove", handleTouchMove, opts);
    document.addEventListener("touchend", handleTouchEnd, opts);
    document.addEventListener("touchcancel", handleTouchEnd, opts);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [run]);

  // ── Refresh on returning to the screen ─────────────────────────────────
  useEffect(() => {
    if (!refreshOnFocus) return;
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshOnFocus, run]);

  return {
    /** True while a refresh is running — drives the indicator. */
    refreshing,
    /** 0..1 pull progress, for a custom indicator on web. */
    pullProgress,
    /** Spread onto the ScrollView: `onScroll={onScroll} scrollEventThrottle={16}` */
    onScroll,
    /** Trigger a refresh directly, e.g. from a button. */
    refresh: run,
  };
}

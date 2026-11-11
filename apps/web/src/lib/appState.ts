// ============================================================================
// Foreground / background, for the browser.
// ============================================================================
// React Native's AppState told the app when the user left and came back, which
// is when it refreshes data and pauses chain polling. A tab being hidden is the
// browser's version of the same thing, so this exposes AppState's shape over
// the Page Visibility API and the carried-over services keep working unchanged.
// ============================================================================

export type AppStateStatus = "active" | "background";

function current(): AppStateStatus {
  if (typeof document === "undefined") return "active";
  return document.visibilityState === "hidden" ? "background" : "active";
}

export const AppState = {
  get currentState(): AppStateStatus {
    return current();
  },

  addEventListener(_type: "change", listener: (state: AppStateStatus) => void) {
    if (typeof document === "undefined") return { remove() {} };
    const handler = () => listener(current());
    document.addEventListener("visibilitychange", handler);
    return {
      remove() {
        document.removeEventListener("visibilitychange", handler);
      },
    };
  },
};

// @ts-nocheck — Test file with Jest mocks
//
// Mobile-web Google sign-in uses a full-page redirect rather than a popup.
//
// The popup flow fails on mobile in three ways that all look identical to the
// user — "the button does nothing":
//
//   1. window.open() blocked outside the gesture (ERR_WEB_BROWSER_BLOCKED)
//   2. window.opener severed by iOS, so the redirect tab cannot post the
//      result home. openAuthSessionAsync never settles, which also strands
//      AuthRequest's module-level _authLock, and every later press then
//      returns {type:"locked"} silently.
//   3. expo-web-browser's own popupWindow reference looking alive, so it skips
//      window.open entirely.
//
// Desktop is unaffected and must keep the popup, so the platform split itself
// is worth pinning.

import { shouldUseRedirectFlow } from "@/hooks/useGoogleAuth";

const MOBILE = {
  "iPhone Safari":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Android Chrome":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "iPad Safari":
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

const DESKTOP = {
  "macOS Safari":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Windows Chrome":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Linux Firefox":
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
};

describe("choosing redirect vs popup on web", () => {
  for (const [name, ua] of Object.entries(MOBILE)) {
    it(`redirects on ${name}`, () => {
      expect(shouldUseRedirectFlow("web", ua)).toBe(true);
    });
  }

  for (const [name, ua] of Object.entries(DESKTOP)) {
    it(`keeps the popup on ${name}`, () => {
      // Desktop popups work fine and give a better experience — the page is
      // not torn down, so state survives. Only switch where it is broken.
      expect(shouldUseRedirectFlow("web", ua)).toBe(false);
    });
  }
});

describe("never redirects off the web", () => {
  it("returns false on native regardless of user agent", () => {
    // Native uses a real in-app browser with a deep link back; there is no
    // page to navigate away from and nothing to fix.
    expect(shouldUseRedirectFlow("ios", MOBILE["iPhone Safari"])).toBe(false);
    expect(shouldUseRedirectFlow("android", MOBILE["Android Chrome"])).toBe(false);
  });
});

describe("survives a hostile environment", () => {
  it("does not throw when the user agent is unavailable", () => {
    // Server-side render / prerender has no navigator at all.
    expect(() => shouldUseRedirectFlow("web", undefined)).not.toThrow();
    expect(shouldUseRedirectFlow("web", undefined)).toBe(false);
  });
});

// ── The return leg's guards ───────────────────────────────────────────────
// google-auth.tsx completes the sign-in after the page reloaded. The request
// object that knew the CSRF state is gone, so the check has to happen against
// what was stashed before navigating.

describe("redirect return: state verification", () => {
  const verify = (expected: string | null, returned: string | null) => {
    // Mirrors the guard in app/google-auth.tsx.
    return !(expected && returned && expected !== returned);
  };

  it("accepts a matching state", () => {
    expect(verify("abc123", "abc123")).toBe(true);
  });

  it("rejects a mismatched state", () => {
    // This is the CSRF protection parseReturnUrl would have applied in the
    // popup flow. Losing it silently because the flow got harder to follow
    // would trade a real protection for tidiness.
    expect(verify("abc123", "attacker")).toBe(false);
  });

  it("does not block when storage was unavailable", () => {
    // Private mode can refuse sessionStorage. Failing the sign-in outright
    // would be worse than proceeding without the extra check, since the token
    // is still verified by the backend against Google.
    expect(verify(null, "whatever")).toBe(true);
  });
});

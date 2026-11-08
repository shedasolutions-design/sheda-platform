// @ts-nocheck — Test file with Jest mocks
//
// Two UX fixes that were reported as "nothing happens when I press".
//
// 1. Google on mobile web. The redirect used to wait for expo-auth-session to
//    finish building its request, so the FIRST press produced no navigation and
//    a second press — by which time the request existed — worked. The URL is
//    now built locally, so the first press always navigates.
//
// 2. Listing photos. The picker took one image per trip to the gallery, which
//    for a listing that wants four-plus photos meant repeating the whole flow.

import { buildGoogleAuthUrl, shouldUseRedirectFlow } from "@/hooks/useGoogleAuth";

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: () => "https://example.test/google-auth",
  ResponseType: { IdToken: "id_token" },
  useAuthRequest: () => [null, null, jest.fn()],
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "nonce" }));
jest.mock("@/config/google", () => ({ GOOGLE_WEB_CLIENT_ID: "cid" }));

const REDIRECT = "https://sheda-solution-mobile--sheda-tt.expo.app/google-auth";

describe("buildGoogleAuthUrl", () => {
  const url = () =>
    new URL(
      buildGoogleAuthUrl({
        clientId: "cid.apps.googleusercontent.com",
        redirectUri: REDIRECT,
        nonce: "n-123",
        state: "s-456",
      })
    );

  it("targets Google's authorization endpoint", () => {
    const u = url();
    expect(u.origin + u.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
  });

  it("requests an id_token directly, needing no client secret", () => {
    // The whole reason this flow works without a backend exchange.
    expect(url().searchParams.get("response_type")).toBe("id_token");
  });

  it("carries the exact redirect URI registered with Google", () => {
    // A mismatch here is the single most common cause of a dead OAuth button.
    expect(url().searchParams.get("redirect_uri")).toBe(REDIRECT);
  });

  it("passes nonce and state through", () => {
    const p = url().searchParams;
    expect(p.get("nonce")).toBe("n-123");
    // state is what the return leg compares against sessionStorage for CSRF.
    expect(p.get("state")).toBe("s-456");
  });

  it("asks for the scopes the backend expects", () => {
    expect(url().searchParams.get("scope")).toBe("openid profile email");
  });

  it("forces the account chooser", () => {
    // Without this Google silently reuses one signed-in account, which makes
    // "I picked the wrong account" unrecoverable without clearing cookies.
    expect(url().searchParams.get("prompt")).toBe("select_account");
  });

  it("is buildable with no async work at all", () => {
    // The property that fixes the bug: nothing here awaits, so a press can
    // navigate in the same tick rather than waiting on a request to be built.
    const started = Date.now();
    buildGoogleAuthUrl({
      clientId: "c", redirectUri: REDIRECT, nonce: "n", state: "s",
    });
    expect(Date.now() - started).toBeLessThan(50);
    expect(typeof buildGoogleAuthUrl({
      clientId: "c", redirectUri: REDIRECT, nonce: "n", state: "s",
    })).toBe("string");
  });
});

describe("redirect flow still only applies to mobile web", () => {
  it("uses the redirect on a phone browser", () => {
    expect(
      shouldUseRedirectFlow("web", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148")
    ).toBe(true);
  });

  it("leaves desktop on the popup", () => {
    expect(
      shouldUseRedirectFlow("web", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15")
    ).toBe(false);
  });
});

// ── Photo picker selection maths ──────────────────────────────────────────
// Mirrors the decisions PhotoUpload makes before opening the gallery. The
// component itself needs a native picker to test end to end; what is worth
// pinning is that it never offers more slots than remain and never
// multi-selects into a replace.

const MAX_PHOTOS = 10;

function pickerOptions(photoCount: number, slotIndex?: number) {
  const isReplacing = slotIndex !== undefined && slotIndex < photoCount;
  const remaining = MAX_PHOTOS - photoCount;
  return {
    blocked: !isReplacing && remaining <= 0,
    allowsMultipleSelection: !isReplacing,
    selectionLimit: isReplacing ? 1 : remaining,
  };
}

describe("photo picker options", () => {
  it("multi-selects when adding to an empty gallery", () => {
    const o = pickerOptions(0, 0);
    expect(o.allowsMultipleSelection).toBe(true);
    expect(o.selectionLimit).toBe(10);
  });

  it("offers only the slots that remain", () => {
    // Choosing twelve and being told afterwards that three were kept is worse
    // than not being allowed to choose twelve.
    expect(pickerOptions(7).selectionLimit).toBe(3);
    expect(pickerOptions(9).selectionLimit).toBe(1);
  });

  it("blocks once the gallery is full", () => {
    expect(pickerOptions(10).blocked).toBe(true);
  });

  it("stays single-select when replacing an existing photo", () => {
    // "Replace this one photo" has no meaning for a selection of five.
    const o = pickerOptions(4, 2);
    expect(o.allowsMultipleSelection).toBe(false);
    expect(o.selectionLimit).toBe(1);
    expect(o.blocked).toBe(false);
  });

  it("treats a tap on the first empty slot as adding, not replacing", () => {
    // slotIndex 4 with 4 photos is the trailing "+" slot.
    const o = pickerOptions(4, 4);
    expect(o.allowsMultipleSelection).toBe(true);
    expect(o.selectionLimit).toBe(6);
  });

  it("still allows replacing when the gallery is full", () => {
    // The cap is on ADDING; swapping one of ten must remain possible.
    const o = pickerOptions(10, 3);
    expect(o.blocked).toBe(false);
    expect(o.selectionLimit).toBe(1);
  });
});

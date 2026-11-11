import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { GOOGLE_WEB_CLIENT_ID } from "@/config/google";

/**
 * Keys used to carry the sign-in across a full-page redirect.
 *
 * sessionStorage, not localStorage: this is per-tab and dies with it, so an
 * abandoned attempt cannot be picked up later in an unrelated tab.
 */
export const GOOGLE_REDIRECT_PENDING = "sheda.googleAuth.pending";
export const GOOGLE_REDIRECT_STATE = "sheda.googleAuth.state";

/**
 * Mobile browsers get a full-page redirect instead of a popup.
 *
 * The popup flow is structurally unreliable there, in three ways that all
 * present as "the button does nothing":
 *
 *   1. Mobile Safari and Chrome block window.open() unless it happens inside
 *      the user gesture. expo-auth-session awaits makeAuthUrlAsync() first
 *      whenever the URL was not preloaded, which loses the gesture and gets
 *      the popup blocked (ERR_WEB_BROWSER_BLOCKED).
 *   2. Even when the tab opens, iOS frequently severs window.opener, so the
 *      redirect tab cannot postMessage the result home. openAuthSessionAsync's
 *      promise then never settles — the spinner runs forever AND
 *      AuthRequest's module-level _authLock stays held, so every later press
 *      returns {type:"locked"} and silently does nothing.
 *   3. expo-web-browser keeps its own module-level popupWindow reference and
 *      skips window.open entirely while it looks alive, which is a second
 *      silent no-op.
 *
 * A same-tab redirect has none of those failure modes: no popup to block, no
 * opener to sever, no lock to strand. The cost is that the app unloads, so the
 * result is picked up on return by app/google-auth.tsx.
 */
// Written as a pure function of its two inputs so it can be tested against
// real user-agent strings without mocking react-native — mocking that module
// drags in css-interop, which reads Appearance/AppState/Dimensions at import
// time and turns the test into whack-a-mole.
export function shouldUseRedirectFlow(
  platformOS: string = Platform.OS,
  userAgent: string | undefined = typeof navigator !== "undefined"
    ? navigator.userAgent
    : undefined
): boolean {
  if (platformOS !== "web") return false;
  if (!userAgent) return false;
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(userAgent);
}

/**
 * Builds Google's authorization URL directly.
 *
 * WHY NOT USE expo-auth-session's REQUEST FOR THIS:
 * useAuthRequest builds its URL in an effect, so for the first moments after a
 * screen mounts there is no URL to navigate to. The redirect path used to wait
 * for it, which is why the first press appeared to do nothing and a second
 * press — by which time the request had finished — worked. Waiting was better
 * than the original behaviour of dropping the press outright, but it is still
 * a press that produces no navigation.
 *
 * For an implicit id_token flow the URL is a handful of query parameters with
 * no secret and no server round trip, so there is nothing to wait for. Building
 * it here makes the FIRST press navigate, every time, with no readiness
 * question anywhere in the path.
 *
 * The parameters mirror exactly what useAuthRequest would produce for the
 * config below, so Google sees an identical request either way.
 */
export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  nonce: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "id_token",
    scope: "openid profile email",
    nonce: params.nonce,
    state: params.state,
    // Without this Google silently reuses a single signed-in account, which
    // makes "wrong account" unrecoverable without clearing cookies.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

// Google's stable OIDC endpoints (avoids an extra discovery-document fetch
// via useAutoDiscovery — these don't change).
const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
  userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
};

/** How long to wait for useAuthRequest to finish building before giving up. */
const READY_TIMEOUT_MS = 10000;

/**
 * "Sign in with Google" for creating/logging into a Sheda backend account
 * (see POST /api/v1/auth/social-login). Requests an `id_token` directly —
 * expo-auth-session's ResponseType.IdToken exists specifically for this
 * Google flow — so the app never needs a client secret or a code-exchange
 * step; the returned id_token is exactly what the backend verifies.
 *
 * ── On readiness, and why callers should ignore it ────────────────────────
 * useAuthRequest builds its request in an effect, so `request` is null for the
 * first moments after mount. Callers used to surface that as a disabled,
 * spinning button and drop any tap that landed during the window, which read
 * as "the Google button doesn't work": it looked busy before you touched it,
 * ignored the tap, and never said why.
 *
 * signInWithGoogle() now owns that problem. If the request is not ready yet it
 * WAITS for it rather than failing, so a tap is never lost. `isReady` is still
 * exported for diagnostics, but binding it to `disabled` is what caused the
 * bug — don't.
 */
export function useGoogleAuth() {
  // Fixed path so the redirect URI is stable and independent of which
  // screen (login vs signup) triggers the sign-in — this exact value is
  // what needs to be registered as an Authorized redirect URI in Google
  // Cloud Console for the Web application OAuth client.
  const redirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ path: "google-auth" }),
    []
  );

  // Generated once per mount (sync, so it can't change extraParams across
  // renders and re-trigger the request's internal effect on every render —
  // useAuthRequest re-fetches the auth URL whenever JSON.stringify(extraParams)
  // changes).
  const [nonce] = useState(() => Crypto.randomUUID());

  // Generated once per mount, synchronously, so the redirect path has a state
  // value the instant the screen exists — no await, no readiness dependency.
  const [redirectState] = useState(() => Crypto.randomUUID());

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_WEB_CLIENT_ID,
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      scopes: ["openid", "profile", "email"],
      usePKCE: false,
      extraParams: { nonce },
    },
    GOOGLE_DISCOVERY
  );

  const isReady = !!request;

  // Anyone waiting for the request to finish building. Resolved by the effect
  // below the moment it does.
  const waiters = useRef<(() => void)[]>([]);
  const isReadyRef = useRef(isReady);
  const promptRef = useRef(promptAsync);
  const requestRef = useRef(request);
  requestRef.current = request;

  // Kept current so a waiter that resumes later calls TODAY's promptAsync,
  // not the stale closure it was created under.
  promptRef.current = promptAsync;

  useEffect(() => {
    isReadyRef.current = isReady;
    if (isReady && waiters.current.length) {
      const pending = waiters.current;
      waiters.current = [];
      pending.forEach((resolve) => resolve());
    }
  }, [isReady]);

  useEffect(() => {
    // A screen unmounting mid-wait must not leave promises hanging forever.
    return () => {
      waiters.current = [];
    };
  }, []);

  const waitForReady = useCallback((): Promise<void> => {
    if (isReadyRef.current) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w !== onReady);
        reject(
          new Error(
            "Google Sign-In is taking longer than usual to start. Check your connection and try again."
          )
        );
      }, READY_TIMEOUT_MS);

      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      waiters.current.push(onReady);
    });
  }, []);

  /** Prompts Google sign-in and resolves the id_token, or throws. */
  const signInWithGoogle = useCallback(
    async (): Promise<string> => {
      if (!GOOGLE_WEB_CLIENT_ID) {
        // Previously unreachable: callers returned early on !isReady, and
        // without a client ID the request never becomes ready — so the button
        // sat disabled forever and this explanation never ran.
        throw new Error(
          "Google Sign-In isn't configured yet (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)."
        );
      }

      // ── Mobile web: navigate NOW, on this press ────────────────────────
      // Deliberately ahead of any readiness check. Everything needed is
      // computed locally, so this branch never waits and the first press
      // always moves.
      if (shouldUseRedirectFlow()) {
        const state = redirectState;
        try {
          // The CSRF check parseReturnUrl would have done in the popup flow —
          // the request object that knew the state does not survive the
          // reload, so it is stashed for app/google-auth.tsx to compare on
          // return.
          window.sessionStorage.setItem(GOOGLE_REDIRECT_STATE, state);
          window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING, "1");
        } catch {
          // Private mode with storage disabled — the redirect still works, the
          // return leg just cannot verify state and will say so.
        }

        window.location.assign(
          buildGoogleAuthUrl({
            clientId: GOOGLE_WEB_CLIENT_ID,
            redirectUri,
            nonce,
            state,
          })
        );
        // The page is being torn down; nothing after this runs. A
        // never-settling promise keeps the caller's spinner up during the
        // navigation rather than flashing a false failure.
        return new Promise<string>(() => {});
      }

      // Native and desktop web keep the popup, where it works and preserves
      // page state. Only here does readiness matter, and only here do we wait.
      if (!isReadyRef.current) {
        await waitForReady();
      }
      const result = await promptRef.current();
      if (result.type !== "success") {
        if (result.type === "cancel" || result.type === "dismiss") {
          throw new Error("Sign-in was cancelled.");
        }
        throw new Error(
          (result as any).error?.message || "Google sign-in failed."
        );
      }
      const idToken = result.params?.id_token;
      if (!idToken) {
        throw new Error("Google didn't return an id_token.");
      }
      return idToken;
    },
    [waitForReady]
  );

  return { signInWithGoogle, isReady, redirectUri };
}

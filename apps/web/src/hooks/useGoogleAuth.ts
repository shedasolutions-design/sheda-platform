import { useCallback, useState } from "react";
import * as Crypto from "@/lib/crypto";
import { GOOGLE_WEB_CLIENT_ID } from "@/config/google";

/**
 * Keys used to carry the sign-in across a full-page redirect.
 *
 * sessionStorage, not localStorage: this is per-tab and dies with it, so an
 * abandoned attempt cannot be picked up later in an unrelated tab.
 */
export const GOOGLE_REDIRECT_PENDING = "sheda.googleAuth.pending";
export const GOOGLE_REDIRECT_STATE = "sheda.googleAuth.state";

/** The path Google returns to. Registered in Google Cloud Console as-is. */
export const GOOGLE_REDIRECT_PATH = "/google-auth";

/**
 * Builds Google's authorization URL for an implicit id_token flow.
 *
 * There is no secret and no server round trip, so the URL is ready the instant
 * the button is pressed. That is what makes the first press always navigate.
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

/**
 * "Sign in with Google", for creating or logging into a Sheda account
 * (POST /api/v1/auth/social-login).
 *
 * The web app always uses a same-tab redirect. The mobile app also had a popup
 * path for desktop browsers, and the popup was the source of every "the
 * button does nothing" bug: blocked window.open, severed window.opener, a
 * stranded auth lock. A redirect has none of those failure modes. The result
 * is picked up on return by app/google-auth/page.tsx.
 */
export function useGoogleAuth() {
  const [nonce] = useState(() =>
    typeof window !== "undefined" ? Crypto.randomUUID() : ""
  );
  const [state] = useState(() =>
    typeof window !== "undefined" ? Crypto.randomUUID() : ""
  );

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}${GOOGLE_REDIRECT_PATH}`
      : GOOGLE_REDIRECT_PATH;

  const signInWithGoogle = useCallback(async (): Promise<string> => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      throw new Error(
        "Google Sign-In isn't configured yet (missing NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID)."
      );
    }
    try {
      window.sessionStorage.setItem(GOOGLE_REDIRECT_STATE, state);
      window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING, "1");
    } catch {
      // Storage disabled (private mode). The redirect still works; the return
      // leg just cannot verify state and will say so.
    }
    window.location.assign(
      buildGoogleAuthUrl({ clientId: GOOGLE_WEB_CLIENT_ID, redirectUri, nonce, state })
    );
    // The page is being torn down. A never-settling promise keeps the caller's
    // spinner up during navigation instead of flashing a false failure.
    return new Promise<string>(() => {});
  }, [nonce, state, redirectUri]);

  return { signInWithGoogle, isReady: true, redirectUri };
}

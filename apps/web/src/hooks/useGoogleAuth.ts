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

  const signInWithGoogle = useCallback(
    async (): Promise<string> => {
      if (!GOOGLE_WEB_CLIENT_ID) {
        throw new Error(
          "Google Sign-In isn't configured yet (missing NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID)."
        );
      }
      try {
        window.sessionStorage.setItem(GOOGLE_REDIRECT_STATE, state);
        window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING, "1");
      } catch {
        // Storage disabled (private mode). The redirect still works; the
        // return leg just cannot verify state and will say so.
      }
      window.location.assign(
        buildGoogleAuthUrl({ clientId: GOOGLE_WEB_CLIENT_ID, redirectUri, nonce, state })
      );
      // The page is being torn down. A never-settling promise keeps the
      // caller's spinner up during navigation instead of flashing a false
      // failure.
      return new Promise<string>(() => {});
    },
    [nonce, state, redirectUri]
  );

  /**
   * Google sign-in without leaving the page, for flows that must keep their
   * state: connecting cloud backup while a fresh recovery phrase is on screen.
   *
   * window.open runs synchronously inside the click, so browsers treat it as
   * user-initiated and do not block it. The return page sees it has an opener
   * and posts the URL fragment back instead of signing in; the state check
   * happens here, in the tab that generated it.
   */
  const signInWithGooglePopup = useCallback((): Promise<string> => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      return Promise.reject(
        new Error("Google Sign-In isn't configured yet (missing NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID).")
      );
    }
    const popupState = Crypto.randomUUID();
    const url = buildGoogleAuthUrl({
      clientId: GOOGLE_WEB_CLIENT_ID,
      redirectUri,
      nonce,
      state: popupState,
    });
    const popup = window.open(url, "sheda-google", "width=480,height=640");
    if (!popup) {
      return Promise.reject(
        new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again.")
      );
    }

    return new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearInterval(closedTimer);
      };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== GOOGLE_POPUP_MESSAGE) return;
        cleanup();
        const params = new URLSearchParams(String(event.data.hash ?? "").replace(/^#/, ""));
        const oauthError = params.get("error");
        if (oauthError) {
          return reject(
            new Error(
              oauthError === "access_denied"
                ? "Sign-in was cancelled."
                : `Google returned an error: ${oauthError}`
            )
          );
        }
        if (params.get("state") !== popupState) {
          return reject(new Error("Sign-in could not be verified. Please try again."));
        }
        const idToken = params.get("id_token");
        if (!idToken) return reject(new Error("Google didn't return an id_token."));
        resolve(idToken);
      };
      // A closed window with no message means the user gave up. The popup
      // posts and then closes itself, so give a just-sent message a moment to
      // arrive before deciding nothing came.
      const closedTimer = setInterval(() => {
        if (!popup.closed) return;
        clearInterval(closedTimer);
        setTimeout(() => {
          cleanup();
          reject(new Error("Sign-in was cancelled."));
        }, 800);
      }, 500);
      window.addEventListener("message", onMessage);
    });
  }, [nonce, redirectUri]);

  return { signInWithGoogle, signInWithGooglePopup, isReady: true, redirectUri };
}

/** postMessage type the return page uses to hand a popup result back. */
export const GOOGLE_POPUP_MESSAGE = "sheda-google-auth";

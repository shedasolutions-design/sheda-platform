"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import {
  GOOGLE_POPUP_MESSAGE,
  GOOGLE_REDIRECT_PENDING,
  GOOGLE_REDIRECT_STATE,
} from "@/hooks/useGoogleAuth";

/**
 * Where Google sends the browser back to (registered as an Authorized
 * redirect URI). Reads the id_token from the URL fragment, checks the state
 * value stashed before leaving, and completes the sign-in.
 */
export default function GoogleAuthReturnPage() {
  const router = useRouter();
  const { socialLogin } = useApi();
  const { hasLocalWallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Whether this sign-in created the account. Google is both sign-up and
  // sign-in; only a genuinely new account may auto-provision a wallet.
  const [isNewUser, setIsNewUser] = useState(false);
  // Strict mode runs effects twice; the token is single-use.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // Popup flow (cloud backup): hand the result to the tab that opened us,
    // which checks the state itself, and close. Nothing is signed in here.
    let opener: Window | null = null;
    try {
      opener = window.opener && window.opener.location.origin === window.location.origin
        ? window.opener
        : null;
    } catch {
      opener = null; // cross-origin opener: not ours
    }
    if (opener) {
      opener.postMessage(
        { type: GOOGLE_POPUP_MESSAGE, hash: window.location.hash },
        window.location.origin
      );
      window.close();
      return;
    }

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const idToken = params.get("id_token");
    const returnedState = params.get("state");
    const oauthError = params.get("error");

    let expectedState: string | null = null;
    try {
      expectedState = sessionStorage.getItem(GOOGLE_REDIRECT_STATE);
    } catch {
      /* storage blocked */
    }
    const clearMarkers = () => {
      try {
        sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING);
        sessionStorage.removeItem(GOOGLE_REDIRECT_STATE);
      } catch {
        /* nothing to clear */
      }
    };
    // The token must not stay in the address bar or in history.
    window.history.replaceState(null, "", window.location.pathname);

    (async () => {
      if (oauthError) {
        clearMarkers();
        return setError(
          oauthError === "access_denied" ? "Sign-in was cancelled." : `Google returned an error: ${oauthError}`
        );
      }
      if (!idToken) {
        clearMarkers();
        return setError("Google didn't return a sign-in token. Please try again.");
      }
      // CSRF check: the state must be the one this tab sent.
      if (!expectedState || expectedState !== returnedState) {
        clearMarkers();
        return setError("Sign-in could not be verified. Please try again from the login screen.");
      }
      try {
        const result = await socialLogin({ token: idToken, provider: "google" });
        clearMarkers();
        // The backend says whether this request created the account; only a
        // brand-new account gets a wallet.
        setIsNewUser(result?.isNewUser === true);
        setDone(true);
      } catch (err) {
        clearMarkers();
        setError(err instanceof Error ? err.message : "Could not complete sign-in. Please try again.");
      }
    })();
  }, [socialLogin]);

  useEffect(() => {
    if (!done) return;
    // A brand-new sign-up is provisioned automatically; returning users keep
    // the old behaviour (home if a wallet is already here, setup if not).
    if (isNewUser && !hasLocalWallet) {
      router.replace("/wallet-setup/provision");
      return;
    }
    router.replace(hasLocalWallet ? "/home" : "/wallet-setup");
  }, [done, isNewUser, hasLocalWallet, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center">
        <h1 className="mb-2 text-base font-semibold">Sign-in didn&apos;t complete</h1>
        <p className="mb-6 max-w-sm text-sm text-secondaryText">{error}</p>
        <Button onClick={() => router.replace("/login")}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
      <Spinner size={36} />
      <p className="text-sm text-secondaryText">Completing sign-in…</p>
    </div>
  );
}

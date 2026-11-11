import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import InterRegular from "@/components/Text/InterRegular";
import InterSemiBold from "@/components/Text/InterSemiBold";
import Button from "@/components/common/Button";
import { useApi } from "@/contexts/ApiContext";
import {
  GOOGLE_REDIRECT_PENDING,
  GOOGLE_REDIRECT_STATE,
} from "@/hooks/useGoogleAuth";

/**
 * Google Sign-In redirect target (registered as the Authorized redirect URI in
 * Google Cloud Console — see hooks/useGoogleAuth.ts's fixed `path`).
 *
 * This route serves TWO different flows:
 *
 *  1. POPUP (desktop web). promptAsync opened a separate window; Google lands
 *     here inside it. maybeCompleteAuthSession() posts the result back to the
 *     opener and closes this window. The original promise resolves there and
 *     this screen is never really seen.
 *
 *  2. REDIRECT (mobile web). The app navigated away in the same tab, so there
 *     is no opener and no promise still waiting — the whole JS context was
 *     torn down. Google returns here with the token in the URL fragment, and
 *     this screen is the only thing left that can finish the job. It reads the
 *     fragment, verifies `state`, and completes the sign-in itself.
 *
 * Flow 2 exists because the popup approach is structurally unreliable on
 * mobile: blocked window.open, severed window.opener, and a stranded auth lock
 * that silently swallows every later press. See shouldUseRedirectFlow().
 */
export default function GoogleAuthRedirect() {
  const { socialLogin } = useApi();
  const [error, setError] = useState<string | null>(null);
  // Strict mode double-invokes effects; the token is single-use, so a second
  // exchange would fail and overwrite a perfectly good success with an error.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // Native has no redirect leg at all — this route is web-only.
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const idToken = params.get("id_token");
    const returnedState = params.get("state");
    const oauthError = params.get("error");

    let pending = false;
    let expectedState: string | null = null;
    try {
      pending =
        window.sessionStorage.getItem(GOOGLE_REDIRECT_PENDING) === "1";
      expectedState = window.sessionStorage.getItem(GOOGLE_REDIRECT_STATE);
    } catch {
      // Storage blocked (private mode). Handled below.
    }

    // Not our redirect flow — this is the popup case. Hand off unchanged.
    if (!pending) {
      WebBrowser.maybeCompleteAuthSession();
      return;
    }

    const clearMarkers = () => {
      try {
        window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING);
        window.sessionStorage.removeItem(GOOGLE_REDIRECT_STATE);
      } catch {
        /* nothing to clear */
      }
    };

    const finish = async () => {
      if (oauthError) {
        clearMarkers();
        setError(
          oauthError === "access_denied"
            ? "Sign-in was cancelled."
            : `Google returned an error: ${oauthError}`
        );
        return;
      }

      if (!idToken) {
        clearMarkers();
        setError("Google didn't return a sign-in token. Please try again.");
        return;
      }

      // The CSRF check parseReturnUrl would have done in the popup flow. It
      // has to happen here instead because the request object that knew the
      // state was destroyed when the page navigated away.
      if (expectedState && returnedState && expectedState !== returnedState) {
        clearMarkers();
        setError(
          "Sign-in could not be verified. Please try again from the login screen."
        );
        return;
      }

      try {
        const result = await socialLogin({ token: idToken, provider: "google" });
        clearMarkers();
        // The backend says whether this request created the account. Only a
        // brand-new account gets a wallet; a returning user must never be
        // handed a second one. Returning users keep the old behaviour and go
        // straight home.
        const autoProvision = result?.isNewUser === true;
        // Replace, not push: the URL still carries the token in its fragment
        // and must not be reachable with Back.
        router.replace(
          autoProvision ? "/wallet-setup/provision" : "/(tabs)/home"
        );
      } catch (err) {
        clearMarkers();
        setError(
          err instanceof Error
            ? err.message
            : "Could not complete sign-in. Please try again."
        );
      }
    };

    finish();
  }, [socialLogin]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <InterSemiBold className="text-base mb-2 text-center">
          Sign-in didn't complete
        </InterSemiBold>
        <InterRegular className="text-secondaryText text-sm text-center mb-6">
          {error}
        </InterRegular>
        <Button
          className="rounded-xl"
          onPress={() => router.replace("/(auth)/login")}
        >
          <InterSemiBold className="text-white">
            Back to sign in
          </InterSemiBold>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#C1272D" />
      <InterRegular className="text-secondaryText text-sm mt-4">
        Completing sign-in…
      </InterRegular>
    </View>
  );
}

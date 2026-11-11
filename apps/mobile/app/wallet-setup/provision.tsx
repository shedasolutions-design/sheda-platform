import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import type {
  CreateWalletResult,
  WalletCreationStep,
} from "@/services/nearWallet";

/**
 * Straight-through wallet provisioning after a new sign-up.
 *
 * Sign-up used to end on /wallet-setup, which asked a brand-new user to
 * choose between Create, Import and Skip. That is a decision they have no
 * basis to make, and the product already promises a wallet is created for
 * them. This screen performs the same creation the Create button did, then
 * sends the user to Home.
 *
 * It is a route because the work outlives the sign-up page: the profile
 * chooser can close as soon as the user answers it, and creation must not be
 * torn down halfway. Manual setup stays available as the failure fallback.
 */

const STEP_LABELS: Record<WalletCreationStep, string> = {
  generating_keys: "Generating your secure keys...",
  creating_account: "Creating your account on-chain...",
  funding_wallet: "Funding your wallet...",
  setting_up: "Setting up your account...",
  airdropping_tokens: "Airdropping free tokens...",
  complete: "All done!",
  error: "Something went wrong",
};

const STEP_ORDER: WalletCreationStep[] = [
  "generating_keys",
  "creating_account",
  "setting_up",
  "funding_wallet",
  "airdropping_tokens",
  "complete",
];

/**
 * One in-flight creation per email, shared across mounts.
 *
 * Effects run twice in development and the profile chooser can remount this
 * route. Two concurrent createWallet() calls would both pass the "no wallet
 * stored yet" check and provision two accounts for the same person. A ref
 * alone is not enough because a remount replaces it.
 */
const inFlight = new Map<string, Promise<CreateWalletResult>>();

export default function ProvisionWallet() {
  const { user } = useApi();
  const { createWallet, hasStoredWallet, creationStep, currentNetwork } =
    useWallet();
  const userEmail = user?.email;

  const [phase, setPhase] = useState<"checking" | "creating" | "error">(
    "checking"
  );
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const provision = useCallback(async () => {
    if (!userEmail) return;

    setError(null);
    setPhase("checking");

    try {
      if (await hasStoredWallet(userEmail)) {
        router.replace("/(tabs)/home");
        return;
      }

      setPhase("creating");

      let work = inFlight.get(userEmail);
      if (!work) {
        work = createWallet(userEmail);
        inFlight.set(userEmail, work);
        work
          .catch(() => {})
          .finally(() => inFlight.delete(userEmail));
      }

      await work;
      router.replace("/(tabs)/home");
    } catch (err: any) {
      const message = err?.message || String(err);
      if (/already exists/i.test(message)) {
        router.replace("/(tabs)/home");
        return;
      }
      setError(message);
      setPhase("error");
    }
  }, [userEmail, hasStoredWallet, createWallet]);

  useEffect(() => {
    if (started.current || !userEmail) return;
    started.current = true;
    provision();
  }, [provision, userEmail]);

  const currentIndex = creationStep ? STEP_ORDER.indexOf(creationStep) : -1;
  const visibleSteps = STEP_ORDER.filter((s) =>
    currentNetwork === "mainnet"
      ? s !== "funding_wallet" && s !== "airdropping_tokens"
      : s !== "setting_up"
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        {phase !== "error" ? (
          <>
            <ActivityIndicator size="large" color="#C1272D" />
            <InterSemiBold className="mt-5 text-xl text-center">
              Setting up your wallet
            </InterSemiBold>
            <InterRegular className="mt-2 text-center text-secondaryText text-sm">
              We&apos;re creating your NEAR wallet and linking it to your Sheda
              account. This only happens once.
            </InterRegular>

            <View className="mt-8 w-full rounded-2xl border border-slate-200 bg-slate-50 p-5">
              {visibleSteps.map((step, i) => {
                const stepIndex = STEP_ORDER.indexOf(step);
                const done = currentIndex > stepIndex;
                const current = step === creationStep;
                return (
                  <View
                    key={step}
                    className={`flex-row items-center ${i > 0 ? "mt-3" : ""}`}
                  >
                    <View
                      className={`mr-3 h-6 w-6 items-center justify-center rounded-full ${
                        done
                          ? "bg-green-500"
                          : current
                            ? "bg-primary"
                            : "bg-slate-200"
                      }`}
                    >
                      {current && !done ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <InterSemiBold className="text-[10px] text-white">
                          {done ? "✓" : String(i + 1)}
                        </InterSemiBold>
                      )}
                    </View>
                    <InterRegular
                      className={`text-sm ${
                        done
                          ? "text-green-600"
                          : current
                            ? "font-semibold text-primaryText"
                            : "text-slate-400"
                      }`}
                    >
                      {STEP_LABELS[step]}
                    </InterRegular>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <InterSemiBold className="text-xl text-center">
              We couldn&apos;t create your wallet
            </InterSemiBold>
            <InterRegular className="mt-2 text-center text-secondaryText text-sm">
              {error}
            </InterRegular>

            <View className="mt-8 w-full gap-3">
              <Button isFull onPress={provision}>
                <InterSemiBold className="text-white">Try again</InterSemiBold>
              </Button>
              <Button
                isFull
                color="transparent"
                style={{ borderWidth: 1, borderColor: "#E5E7EB" }}
                onPress={() => router.replace("/wallet-setup")}
              >
                <InterSemiBold>Set up a wallet manually</InterSemiBold>
              </Button>
              <Button
                isFull
                color="transparent"
                onPress={() => router.replace("/(tabs)/home")}
              >
                <InterRegular className="text-secondaryText">
                  Continue without a wallet
                </InterRegular>
              </Button>
            </View>
          </>
        )}

        {phase !== "error" && (
          <InterRegular className="mt-6 text-center text-xs text-secondaryText">
            You can back up your wallet to your Google account later from
            Settings.
          </InterRegular>
        )}
      </View>
    </SafeAreaView>
  );
}

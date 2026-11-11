"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import type { CreateWalletResult, WalletCreationStep } from "@/services/nearWallet";

/**
 * Straight-through wallet provisioning after a new sign-up.
 *
 * The sign-up flow used to end on /wallet-setup, which asked the new user to
 * choose between Create, Import and Skip. For someone who had just created an
 * account that is three decisions they have no basis to answer; the product
 * already promises a wallet is created for them. This page does that: it runs
 * the same creation the Create button did, then lands on Home.
 *
 * It stays a route (rather than running inside the sign-up page) because the
 * work outlives that page: the profile chooser can navigate away as soon as
 * the user answers it, and creation must not be torn down halfway.
 *
 * Manual setup is still reachable, and is the fallback if creation fails.
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
 * React's strict mode mounts effects twice, and the profile chooser can cause
 * a navigation that remounts this page. Two concurrent createWallet() calls
 * would both pass the "no wallet stored yet" check and provision two accounts
 * for the same person. A ref alone is not enough because a remount replaces it.
 */
const inFlight = new Map<string, Promise<CreateWalletResult>>();

export default function ProvisionWalletPage() {
  const router = useRouter();
  const { user } = useApi();
  const { createWallet, hasStoredWallet, creationStep, currentNetwork } = useWallet();
  const userEmail = user?.email;

  const [phase, setPhase] = useState<"checking" | "creating" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const provision = useCallback(async () => {
    if (!userEmail) return;

    setError(null);
    setPhase("checking");

    try {
      // A user who already has a wallet here (e.g. re-running this route by
      // URL) must not be given a second one.
      if (await hasStoredWallet(userEmail)) {
        router.replace("/home");
        return;
      }

      setPhase("creating");

      let work = inFlight.get(userEmail);
      if (!work) {
        work = createWallet(userEmail);
        inFlight.set(userEmail, work);
        // Keep a rejection from becoming an unhandled one for the second
        // caller that shares this promise.
        work.catch(() => { }).finally(() => inFlight.delete(userEmail));
      }

      await work;
      router.replace("/home");
    } catch (err: any) {
      const message = err?.message || String(err);
      // createWallet refuses when a wallet already exists. That is the
      // desired end state, not a failure.
      if (/already exists/i.test(message)) {
        router.replace("/home");
        return;
      }
      setError(message);
      setPhase("error");
    }
  }, [userEmail, hasStoredWallet, createWallet, router]);

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
    <>
      <div className="flex flex-col items-center text-center">
        <Spinner size={40} />
        <h1 className="mt-5 text-xl font-bold">Setting up your wallet</h1>
        <p className="mt-2 max-w-sm text-sm text-secondaryText">
          We&apos;re creating your NEAR wallet and linking it to your Sheda account. This only
          happens once.
        </p>
      </div>

      {phase !== "error" ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5" aria-live="polite">
          <ol className="flex flex-col gap-3">
            {visibleSteps.map((step, i) => {
              const stepIndex = STEP_ORDER.indexOf(step);
              const done = currentIndex > stepIndex;
              const current = step === creationStep;
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      done
                        ? "bg-green-500 text-white"
                        : current
                          ? "bg-primary text-white"
                          : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {done ? (
                      <Check size={14} />
                    ) : current ? (
                      <Spinner size={14} className="text-white" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={
                      done ? "text-green-600" : current ? "font-semibold" : "text-slate-400"
                    }
                  >
                    {STEP_LABELS[step]}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-900">We couldn&apos;t create your wallet</h2>
          <p className="mt-1 break-words text-sm text-red-800">{error}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button full onClick={provision}>
              Try again
            </Button>
            <Link
              href="/wallet-setup"
              className="text-center text-sm font-medium text-primary hover:underline"
            >
              Set up a wallet manually
            </Link>
            <Link
              href="/home"
              className="text-center text-sm text-secondaryText underline hover:text-primaryText"
            >
              Continue without a wallet
            </Link>
          </div>
        </div>
      )}

      {phase !== "error" && (
        <p className="mt-6 text-center text-xs text-secondaryText">
          You can back up your wallet to your Google account later from Settings.
        </p>
      )}
    </>
  );
}

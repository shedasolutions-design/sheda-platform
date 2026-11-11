"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Eye, ShieldAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import BackLink from "@/components/ui/BackLink";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import BackupPrompt from "@/components/BackupPrompt";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { FUNDING_ACCOUNTS } from "@/config/walletConfig";
import { buildWalletError, classifyWalletError } from "@/constants/walletErrors";
import type { WalletCreationStep } from "@/services/nearWallet";
import { copyText } from "@/lib/clipboard";

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
  "funding_wallet",
  "airdropping_tokens",
  "complete",
];

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message: string;
  onAction?: () => void;
  actionLabel?: string;
  supportCode?: string;
}

const HIDDEN: Feedback = { visible: false, type: "info", title: "", message: "" };

export default function CreateWalletPage() {
  const router = useRouter();
  const {
    createWallet,
    hasStoredWallet,
    saveWalletState,
    creationStep,
    currentNetwork,
    getPreviewAccountId,
    isCloudBackupAvailable,
    markPhraseSaved,
  } = useWallet();
  const { user } = useApi();
  const userEmail = user?.email;

  const [seedPhrase, setSeedPhrase] = useState("");
  const [createdAccountId, setCreatedAccountId] = useState("");
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  // An implicit account is a valid address that is dormant until its first
  // deposit. The page must not imply otherwise.
  const [needsFunding, setNeedsFunding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [copied, setCopied] = useState<"address" | "seed" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(HIDDEN);
  const close = () => setFeedback((f) => ({ ...f, visible: false }));

  const previewAccountId = useMemo(
    () => (userEmail ? getPreviewAccountId(userEmail) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userEmail, currentNetwork]
  );

  const mainnetPreview = useMemo(() => {
    if (!userEmail?.includes("@")) return null;
    const prefix = userEmail
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/^[-_]+|[-_]+$/g, "");
    return prefix ? `${prefix}.shedauser.near` : null;
  }, [userEmail]);

  // Offer import instead if this account already has a wallet here.
  useEffect(() => {
    (async () => {
      try {
        if (await hasStoredWallet(userEmail ?? undefined)) {
          setFeedback({
            visible: true,
            type: "warning",
            title: "Wallet Already Exists",
            message:
              "You already have a wallet linked to this account. Would you like to import it instead?",
            actionLabel: "Import Wallet",
            onAction: () => {
              close();
              router.push("/wallet-setup/import-wallet");
            },
          });
        }
      } catch (error) {
        console.error("Failed to check existing wallet:", error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  const handleCreateWallet = async () => {
    try {
      setIsLoading(true);
      setFeedback(HIDDEN);
      const result = await createWallet(userEmail ?? undefined);
      setSeedPhrase(result.seedPhrase);
      setCreatedAccountId(result.accountId);
      setIsWalletCreated(true);
      setNeedsFunding(result.needsFunding);

      if (result.needsFunding) {
        setFeedback({
          visible: true,
          type: "warning",
          title: "Wallet created, needs funding to activate",
          message: `${result.fallbackReason ?? ""} Your wallet address and recovery phrase are ready, but the account only becomes active on the blockchain once it receives its first deposit. Send any amount of NEAR to ${result.accountId} to activate it.`.trim(),
          actionLabel: "Got it",
          onAction: close,
        });
      }

      await saveWalletState(result.accountId, result.seedPhrase, userEmail ?? undefined);

      if (result.airdropFailed) {
        const err = buildWalletError("ERR_AIRDROP_FAILED");
        setFeedback({
          visible: true,
          type: "warning",
          title: err.title,
          message: err.message,
          supportCode: err.code,
          actionLabel: "OK",
          onAction: close,
        });
      }
    } catch (error: any) {
      console.error("Failed to create wallet:", error);
      const code = classifyWalletError(error?.message || String(error));
      const walletError = buildWalletError(code, {
        alternative: previewAccountId
          ? previewAccountId.replace(
              previewAccountId.split(".")[0],
              `${previewAccountId.split(".")[0]}2`
            )
          : `username2${FUNDING_ACCOUNTS[currentNetwork].walletSuffix}`,
      });
      setFeedback({
        visible: true,
        type: "error",
        title: walletError.title,
        message: walletError.message,
        supportCode: walletError.code,
        actionLabel: "OK",
        onAction: close,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copy = async (what: "address" | "seed") => {
    const ok = await copyText(what === "seed" ? seedPhrase : createdAccountId);
    if (ok) {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } else {
      setFeedback({
        visible: true,
        type: "error",
        title: "Couldn't copy",
        message: "Your browser blocked clipboard access. Select the text and copy it manually.",
        actionLabel: "OK",
        onAction: close,
      });
    }
  };

  const handleBackup = () => {
    if (!isCloudBackupAvailable) {
      setFeedback({
        visible: true,
        type: "info",
        title: "Backup not available",
        message:
          "Cloud backup isn't configured for this build. Save your seed phrase somewhere safe instead.",
        actionLabel: "OK",
        onAction: close,
      });
      return;
    }
    setShowBackupPrompt(true);
  };

  const visibleSteps = STEP_ORDER.filter((s) =>
    currentNetwork === "mainnet" ? s !== "funding_wallet" && s !== "airdropping_tokens" : s !== "setting_up"
  );
  const currentIndex = creationStep ? STEP_ORDER.indexOf(creationStep) : -1;

  return (
    <>
      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={
          feedback.supportCode
            ? `${feedback.message}\n\nSupport code: ${feedback.supportCode}`
            : feedback.message
        }
        onAction={feedback.onAction}
        actionLabel={feedback.actionLabel}
        onClose={close}
      />
      <FeedbackModal
        isVisible={showSkipWarning}
        type="warning"
        title="Skip Backup?"
        message={
          "If you lose access to this browser, you won't be able to recover your wallet without a backup.\n\nAre you sure you want to skip?"
        }
        actionLabel="Skip Anyway"
        onAction={() => {
          setShowSkipWarning(false);
          router.push("/wallet-setup/created-successfully");
        }}
        onClose={() => setShowSkipWarning(false)}
      />

      <div className="flex items-center gap-2">
        <BackLink fallback="/wallet-setup" />
        <h1 className="text-lg font-semibold">Create Wallet</h1>
      </div>

      {!isWalletCreated ? (
        <div className="mt-6">
          {previewAccountId && (
            <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-5">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">
                Your new wallet will be
              </p>
              <p className="text-xs text-gray-500">Testnet</p>
              <p className="break-all font-semibold text-green-800">{previewAccountId}</p>
              {mainnetPreview && (
                <>
                  <p className="mt-2 text-xs text-gray-500">Mainnet</p>
                  <p className="break-all font-semibold text-gray-700">{mainnetPreview}</p>
                </>
              )}
              <p className="mt-3 text-xs text-gray-500">Derived from: {userEmail}</p>
            </div>
          )}

          <div className="mb-5 rounded-xl bg-blue-50 p-4">
            <p className="mb-1 font-semibold text-blue-900">What you&apos;ll get</p>
            <ul className="list-inside list-disc text-sm leading-6 text-blue-800">
              <li>A named NEAR account (e.g. yourname.shedauser.testnet)</li>
              <li>A 12-word recovery phrase to back up your wallet</li>
              <li>
                {currentNetwork === "testnet"
                  ? "Free test tokens to explore the platform"
                  : "Gas-free transactions: we cover your fees"}
              </li>
            </ul>
          </div>

          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5" aria-live="polite">
              <p className="mb-4 font-semibold">Setting up your wallet...</p>
              <ol className="flex flex-col gap-3">
                {visibleSteps.map((step, i) => {
                  const stepIndex = STEP_ORDER.indexOf(step);
                  const done = currentIndex > stepIndex;
                  const current = step === creationStep;
                  return (
                    <li key={step} className="flex items-center gap-3 text-sm">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          done ? "bg-green-500 text-white" : current ? "bg-primary text-white" : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {done ? <Check size={14} /> : current ? <Spinner size={14} className="text-white" /> : i + 1}
                      </span>
                      <span className={done ? "text-green-600" : current ? "font-semibold" : "text-slate-400"}>
                        {STEP_LABELS[step]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Button full onClick={handleCreateWallet}>
                Create my wallet
              </Button>
              <Link href="/wallet-setup/import-wallet" className="text-center text-sm font-medium text-primary hover:underline">
                Already have a wallet? Import instead
              </Link>
              <Link href="/home" className="mt-2 text-center text-sm text-gray-400 underline">
                Skip for now
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <h2 className="mb-4 text-center text-xl font-bold">Wallet Created</h2>

          <button
            type="button"
            onClick={() => copy("address")}
            className="mb-4 w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left hover:bg-blue-100"
          >
            <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Your wallet address</p>
            <p className="break-all font-semibold text-blue-900">{createdAccountId}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-blue-700">
              {copied === "address" ? <Check size={12} /> : <Copy size={12} />}
              {copied === "address" ? "Copied" : "Click to copy"}
            </p>
          </button>

          <div className="mb-5 rounded-xl bg-green-50 p-4">
            {needsFunding ? (
              <p className="text-sm text-green-900">
                Not active yet. Send any amount of NEAR to this address to activate it.
              </p>
            ) : (
              <>
                <p className="font-semibold text-green-900">
                  {currentNetwork === "testnet" ? "1 NEAR" : "0.1 NEAR"}
                </p>
                <p className="text-sm text-green-800">Initial balance for transactions</p>
              </>
            )}
          </div>

          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">Back up your wallet</p>
            <p className="mb-3 mt-1 text-xs leading-5 text-amber-800">
              Encrypt your wallet and save it to your Google account, so you can recover it on any
              device. This is the safest way to protect your funds.
            </p>
            <Button onClick={handleBackup} className="bg-amber-600 hover:bg-amber-700">
              Back up with Google
            </Button>
          </div>

          <div className="mb-6">
            <p className="font-semibold">Recovery Phrase</p>
            <p className="mb-3 mt-1 text-xs leading-5 text-gray-500">
              Write down these 12 words in order and keep them safe. Anyone with this phrase can
              access your wallet.
            </p>
            {showSeedPhrase ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-red-700">
                  <ShieldAlert size={14} /> Never share this with anyone
                </p>
                <ol className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm sm:grid-cols-3">
                  {seedPhrase.split(" ").map((w, i) => (
                    <li key={i}>
                      <span className="mr-1 text-gray-400">{i + 1}.</span>
                      {w}
                    </li>
                  ))}
                </ol>
                <Button variant="outline" className="mt-4" onClick={() => copy("seed")}>
                  {copied === "seed" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "seed" ? "Copied" : "Copy seed phrase"}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSeedPhrase(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 p-4 text-sm font-medium hover:bg-slate-200"
              >
                <Eye size={16} /> Click to reveal seed phrase
              </button>
            )}
          </div>

          <Button
            full
            onClick={async () => {
              // Saving a phrase you never looked at isn't saving it.
              if (!showSeedPhrase) return setShowSeedPhrase(true);
              await markPhraseSaved(createdAccountId).catch(() => {});
              router.push("/wallet-setup/created-successfully");
            }}
          >
            {showSeedPhrase ? "I've Saved My Recovery Phrase" : "Show My Recovery Phrase"}
          </Button>
          <button
            type="button"
            onClick={() => setShowSkipWarning(true)}
            className="mx-auto mt-4 block text-sm text-gray-400 underline"
          >
            Skip backup for now
          </button>
        </div>
      )}

      {/* Offered after the phrase is on screen, not auto-opened over it. */}
      <BackupPrompt
        visible={showBackupPrompt}
        mode="backup"
        accountId={createdAccountId}
        onClose={() => setShowBackupPrompt(false)}
        onDone={() => router.push("/wallet-setup/created-successfully")}
      />
    </>
  );
}

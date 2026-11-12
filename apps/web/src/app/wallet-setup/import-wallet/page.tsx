"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import BackLink from "@/components/ui/BackLink";
import { inputClass } from "@/components/ui/TextField";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import BackupPrompt from "@/components/BackupPrompt";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { FUNDING_ACCOUNTS } from "@/config/walletConfig";
import { buildWalletError, classifyWalletError } from "@/constants/walletErrors";

type ImportMethod = "seedPhrase" | "privateKey";

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message: string;
  onAction?: () => void;
  actionLabel?: string;
  supportCode?: string;
}

export default function ImportWalletPage() {
  const router = useRouter();
  const [method, setMethod] = useState<ImportMethod>("seedPhrase");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [importedAccountId, setImportedAccountId] = useState("");
  const { importWallet, importWalletByPrivateKey, isCloudBackupAvailable, currentNetwork, getPreviewAccountId, markPhraseSaved } =
    useWallet();
  const { user } = useApi();
  const userEmail = user?.email;
  const [feedback, setFeedback] = useState<Feedback>({ visible: false, type: "info", title: "", message: "" });
  const close = () => setFeedback((f) => ({ ...f, visible: false }));
  const fail = (title: string, message: string) =>
    setFeedback({ visible: true, type: "error", title, message, actionLabel: "OK", onAction: close });

  // The wallet the account actually has on record. Guessing it from the
  // email ("demo.ngozi" -> demongozi.shedauser.testnet) refused anyone whose
  // wallet got a different name (taken name, numbered retry, or an address
  // wallet from the funding fallback): they could never import their own.
  const recordedAccountId = user?.near_account_id?.trim() || null;
  const expectedAccountId = useMemo(
    () => recordedAccountId ?? (userEmail ? getPreviewAccountId(userEmail) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordedAccountId, userEmail, currentNetwork]
  );
  const examplePlaceholder = `yourusername${FUNDING_ACCOUNTS[currentNetwork].walletSuffix}`;

  const handleImport = async () => {
    // Client-side checks first: instant, no network.
    if (method === "seedPhrase") {
      const trimmed = seedPhrase.trim();
      if (!trimmed) {
        return fail("Missing Seed Phrase", "Please enter your 12 or 24 word seed phrase to import your wallet.");
      }
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length !== 12 && words.length !== 24) {
        return fail(
          "Invalid Seed Phrase",
          `Your seed phrase has ${words.length} word${words.length !== 1 ? "s" : ""}. It should be exactly 12 or 24 words separated by spaces.`
        );
      }
      const invalid = words.filter((w) => !/^[a-z]+$/.test(w));
      if (invalid.length > 0) {
        return fail(
          "Invalid Seed Phrase",
          `Seed phrase words should only contain lowercase letters. Please check: "${invalid
            .slice(0, 3)
            .join('", "')}"${invalid.length > 3 ? ` and ${invalid.length - 3} more` : ""}.`
        );
      }
    } else {
      const trimmed = privateKey.trim();
      if (!trimmed) {
        return fail("Missing Private Key", "Please enter your private key (ed25519:...) to import your wallet.");
      }
      if (!trimmed.startsWith("ed25519:") || trimmed.length < 40) {
        return fail(
          "Invalid Private Key Format",
          'Your private key should start with "ed25519:" followed by a long base58-encoded string. Please double-check what you pasted.'
        );
      }
    }

    // Only the wallet tied to this Sheda account can be imported.
    const target = accountId.trim() || undefined;
    if (target && expectedAccountId && target !== expectedAccountId) {
      setFeedback({
        visible: true,
        type: "warning",
        title: "Account Mismatch",
        message: `You can only import the wallet tied to your Sheda account: ${expectedAccountId}. The account ID you entered doesn't match.`,
        actionLabel: "Use Correct Address",
        onAction: () => {
          setAccountId(expectedAccountId);
          close();
        },
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback({
        visible: true,
        type: "loading",
        title: "Importing Wallet",
        message:
          method === "seedPhrase"
            ? "Verifying your seed phrase and connecting to the blockchain..."
            : "Verifying your private key and connecting to the blockchain...",
      });
      const wallet =
        method === "seedPhrase"
          ? await importWallet(seedPhrase.trim(), target)
          : await importWalletByPrivateKey(privateKey.trim(), target);
      // They just typed their phrase or key, so they already hold a copy:
      // no "back up your wallet" reminder for this one.
      await markPhraseSaved(wallet.accountId).catch(() => {});

      setFeedback({
        visible: true,
        type: "success",
        title: "Wallet Imported",
        message: `Your wallet ${wallet.accountId} has been imported successfully.`,
        actionLabel: "Continue",
        onAction: () => {
          close();
          // Offer backup at the moment the key is known to be here.
          if (isCloudBackupAvailable) {
            setImportedAccountId(wallet.accountId);
            setShowBackupPrompt(true);
          } else {
            router.push("/wallet-setup/created-successfully");
          }
        },
      });
    } catch (err: any) {
      const code = classifyWalletError(err?.message || String(err));
      const walletError = buildWalletError(code, { expected: expectedAccountId || examplePlaceholder });
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
      setIsSubmitting(false);
    }
  };

  const isLoading = isSubmitting || feedback.type === "loading";

  return (
    <>
      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={
          feedback.supportCode ? `${feedback.message}\n\nSupport code: ${feedback.supportCode}` : feedback.message
        }
        onAction={feedback.onAction}
        actionLabel={feedback.actionLabel}
        onClose={close}
      />

      <div className="flex items-center gap-2">
        <BackLink fallback="/wallet-setup" />
        <h1 className="text-lg font-semibold">Import Wallet</h1>
      </div>

      <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
        Import the wallet originally created for your Sheda account.
        {expectedAccountId ? ` Your expected wallet address is ${expectedAccountId}.` : ""}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-cardBackground p-1" role="tablist">
        {(["seedPhrase", "privateKey"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => setMethod(m)}
            className={`rounded-lg py-2 text-sm font-semibold ${
              method === m ? "bg-primary text-white" : "text-gray-500 hover:text-primaryText"
            }`}
          >
            {m === "seedPhrase" ? "Seed Phrase" : "Private Key"}
          </button>
        ))}
      </div>

      <form
        className="mt-6 flex flex-col gap-5"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          handleImport();
        }}
      >
        {method === "seedPhrase" ? (
          <div>
            <label htmlFor="seed" className="mb-1 block text-sm">
              Seed Phrase
            </label>
            <textarea
              id="seed"
              rows={4}
              placeholder="Enter your 12-word seed phrase separated by spaces..."
              value={seedPhrase}
              onChange={(e) => setSeedPhrase(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="pk" className="mb-1 block text-sm">
              Private Key
            </label>
            <textarea
              id="pk"
              rows={3}
              placeholder="Enter your private key (ed25519:...)"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
            <p className="mt-1 text-xs text-secondaryText">
              Your private key starts with &quot;ed25519:&quot; followed by a long string
            </p>
          </div>
        )}

        <div>
          <label htmlFor="account" className="mb-1 block text-sm">
            Account ID
          </label>
          <input
            id="account"
            placeholder={expectedAccountId || examplePlaceholder}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-secondaryText">
            {expectedAccountId
              ? `Leave empty to use ${expectedAccountId}`
              : `Enter your account ID (e.g., ${examplePlaceholder})`}
          </p>
        </div>

        <Button type="submit" full disabled={isLoading}>
          {isLoading ? "Importing..." : "Import Wallet"}
        </Button>
      </form>

      <BackupPrompt
        visible={showBackupPrompt}
        mode="backup"
        accountId={importedAccountId}
        onClose={() => {
          setShowBackupPrompt(false);
          router.push("/wallet-setup/created-successfully");
        }}
        onDone={() => router.push("/wallet-setup/created-successfully")}
      />
    </>
  );
}

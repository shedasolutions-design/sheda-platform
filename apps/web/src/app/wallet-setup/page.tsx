"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import BackupPrompt from "@/components/BackupPrompt";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import nearWalletService from "@/services/nearWallet";
import { getQueryParam } from "@/lib/navigation";

/**
 * Wallet setup for a browser that has no wallet yet.
 *
 * Two different people land here, and they need opposite things:
 *
 *   - Someone whose account has no wallet yet: create one.
 *   - Someone whose account already has a wallet (on another device, or
 *     before storage was cleared): restore THAT wallet. Their deals, bids and
 *     funds belong to it. Creating another one here used to be the first
 *     button, so returning people made a second and third wallet, each backed
 *     up to Google, and their deals seemed to vanish.
 *
 * Which one is decided by the chain: the wallet on the profile exists there.
 */
export default function WalletSetupPage() {
  const router = useRouter();
  const { user } = useApi();
  const { loading, readiness, hasLocalWallet, localWalletMetadata, isCloudBackupAvailable } = useWallet();
  const [showRestore, setShowRestore] = useState(false);
  const [showCreateWarning, setShowCreateWarning] = useState(false);
  // null while checking.
  const [returning, setReturning] = useState<boolean | null>(null);

  const profileWallet = user?.near_account_id || "";

  useEffect(() => {
    if (!user) return;
    let alive = true;
    if (!profileWallet) {
      Promise.resolve().then(() => alive && setReturning(false));
    } else {
      nearWalletService
        .accountExists(profileWallet)
        .then((exists) => alive && setReturning(exists))
        // Can't tell (network): assume it exists. Offering "create" to someone
        // who already has a wallet is the mistake this page exists to prevent.
        .catch(() => alive && setReturning(true));
    }
    return () => {
      alive = false;
    };
  }, [user, profileWallet]);

  // Arriving from Google sign-in (already connected to the backups): open
  // the restore straight away, once.
  const [autoOpened, setAutoOpened] = useState(false);
  if (!autoOpened && returning && !hasLocalWallet && isCloudBackupAvailable && getQueryParam("restore") === "1") {
    setAutoOpened(true);
    setShowRestore(true);
  }

  const restoreDialog = (
    <BackupPrompt
      visible={showRestore}
      mode="restore"
      preferredAccountId={profileWallet || undefined}
      onClose={() => setShowRestore(false)}
      onDone={() => router.replace("/home")}
    />
  );

  const localWalletCard =
    hasLocalWallet && localWalletMetadata?.accountId ? (
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 size={20} className="shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">Wallet found in this browser</p>
          <p className="truncate text-sm text-emerald-800">{localWalletMetadata.accountId}</p>
        </div>
        {loading && readiness !== "ready" && <Spinner size={18} className="text-emerald-700" />}
      </div>
    ) : null;

  const hero = (
    <div
      className="-mx-5 -mt-6 mb-6 h-56 bg-cover bg-center md:mx-0 md:mt-0 md:rounded-2xl"
      style={{ backgroundImage: "url(/images/hero.png)" }}
      role="img"
      aria-label=""
    />
  );

  if (returning === null) {
    return (
      <>
        {hero}
        <div className="mt-10 flex flex-col items-center gap-3 text-secondaryText">
          <Spinner size={28} />
          <p className="text-sm">Checking your account…</p>
        </div>
      </>
    );
  }

  if (returning) {
    return (
      <>
        {hero}
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-secondaryText">
          Your Sheda account already has a wallet. Restore it on this device to see your deals and funds.
        </p>
        <p className="mt-3 break-all rounded-xl bg-cardBackground px-4 py-3 text-sm font-medium text-primaryText">
          {profileWallet}
        </p>

        {localWalletCard}

        <div className="mt-8 flex flex-col gap-3">
          {isCloudBackupAvailable && (
            <Button full onClick={() => setShowRestore(true)}>
              Restore from Google backup
            </Button>
          )}
          <ButtonLink href="/wallet-setup/import-wallet" variant={isCloudBackupAvailable ? "outline" : "primary"} full>
            Use my recovery phrase
          </ButtonLink>
          <Link
            href="/home"
            replace
            className="mt-2 text-center text-sm text-secondaryText underline hover:text-primaryText"
          >
            Skip for now
          </Link>
        </div>

        <div className="mt-10 border-t border-borderColor pt-5">
          {!showCreateWarning ? (
            <button
              type="button"
              onClick={() => setShowCreateWarning(true)}
              className="text-sm text-secondaryText underline hover:text-primaryText"
            >
              Lost access to your wallet?
            </button>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertTriangle size={16} className="shrink-0" /> Only if you&apos;ve lost both your recovery phrase and your backup
              </p>
              <p className="mt-1 text-amber-800">
                A new wallet starts empty. Your existing deals, bids and funds stay in{" "}
                <span className="break-all font-medium">{profileWallet}</span> and won&apos;t move to the new one.
              </p>
              <div className="mt-3">
                <ButtonLink href="/wallet-setup/create-wallet" variant="outline" full>
                  I understand, create a new wallet
                </ButtonLink>
              </div>
            </div>
          )}
        </div>

        {restoreDialog}
      </>
    );
  }

  return (
    <>
      {hero}
      <h1 className="text-2xl font-bold">Set up your wallet</h1>
      <p className="mt-2 text-secondaryText">
        Create a secure NEAR blockchain wallet linked to your Sheda account to manage assets and
        transactions.
      </p>

      {/* Read from local storage with no network involved, so it shows at once. */}
      {localWalletCard}

      {/* Navigation only: never disabled while the wallet service warms up. */}
      <div className="mt-8 flex flex-col gap-3">
        <ButtonLink href="/wallet-setup/create-wallet" full>
          Create new wallet
        </ButtonLink>
        <ButtonLink href="/wallet-setup/import-wallet" variant="outline" full>
          Import existing wallet
        </ButtonLink>
        {isCloudBackupAvailable && (
          <Button variant="outline" full onClick={() => setShowRestore(true)}>
            Restore from Google backup
          </Button>
        )}
        <Link
          href="/home"
          replace
          className="mt-2 text-center text-sm text-secondaryText underline hover:text-primaryText"
        >
          Skip for now
        </Link>
      </div>

      {restoreDialog}
    </>
  );
}

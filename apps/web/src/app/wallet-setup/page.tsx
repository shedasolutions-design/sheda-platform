"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import BackupPrompt from "@/components/BackupPrompt";
import { useWallet } from "@/contexts/WalletContext";

export default function WalletSetupPage() {
  const router = useRouter();
  const { loading, readiness, hasLocalWallet, localWalletMetadata, isCloudBackupAvailable } =
    useWallet();
  const [showRestore, setShowRestore] = useState(false);

  return (
    <>
      <div
        className="-mx-5 -mt-6 mb-6 h-56 bg-cover bg-center md:mx-0 md:mt-0 md:rounded-2xl"
        style={{ backgroundImage: "url(/images/hero.png)" }}
        role="img"
        aria-label=""
      />
      <h1 className="text-2xl font-bold">Set up your wallet</h1>
      <p className="mt-2 text-secondaryText">
        Create a secure NEAR blockchain wallet linked to your Sheda account to manage assets and
        transactions.
      </p>

      {/* Read from local storage with no network involved, so it shows at once. */}
      {hasLocalWallet && localWalletMetadata?.accountId && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">Wallet found in this browser</p>
            <p className="truncate text-sm text-emerald-800">{localWalletMetadata.accountId}</p>
          </div>
          {loading && readiness !== "ready" && <Spinner size={18} className="text-emerald-700" />}
        </div>
      )}

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

      <BackupPrompt
        visible={showRestore}
        mode="restore"
        onClose={() => setShowRestore(false)}
        onDone={() => router.replace("/home")}
      />
    </>
  );
}

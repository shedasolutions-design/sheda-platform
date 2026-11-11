"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button";
import { useWallet } from "@/contexts/WalletContext";

export default function WalletCreatedPage() {
  const router = useRouter();
  const { walletState, connectWallet, loading, getAccountId, currentNetwork } = useWallet();

  const viewWallet = async () => {
    try {
      const accountId = walletState.account?.accountId || getAccountId();
      if (accountId && !walletState.isConnected) await connectWallet(accountId);
    } catch (error) {
      // Still navigate: the wallet page reconnects on its own.
      console.error("Error connecting wallet:", error);
    }
    router.push("/wallet");
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="w-full rounded-2xl bg-white p-6 text-center shadow-md">
        <CheckCircle2 size={64} className="mx-auto mb-4 text-green-600" />
        <h1 className="text-2xl font-bold">Wallet Ready!</h1>
        <p className="mt-2 text-sm text-secondaryText">
          Your NEAR wallet has been created and is ready to use.
          {currentNetwork === "testnet"
            ? " You've received free test tokens to explore the platform."
            : " You can now list properties, make bids, and manage assets directly from your wallet."}
        </p>

        {walletState.account && (
          <dl className="mt-6 rounded-xl bg-cardBackground p-4 text-left text-sm">
            <dt className="text-xs text-secondaryText">Account ID</dt>
            <dd className="mb-3 break-all font-semibold">{walletState.account.accountId}</dd>
            <dt className="text-xs text-secondaryText">Network</dt>
            <dd className={currentNetwork === "testnet" ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>
              {currentNetwork === "testnet" ? "Testnet" : "Mainnet"}
            </dd>
          </dl>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <Button full onClick={viewWallet} loading={loading}>
            {loading ? "Connecting..." : "View My Wallet"}
          </Button>
          <ButtonLink href="/home" variant="outline" full>
            Go to Home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

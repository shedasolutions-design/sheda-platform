"use client";

import { ShieldAlert, KeyRound, LogOut } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button, { ButtonLink } from "@/components/ui/Button";
import { useWallet } from "@/contexts/WalletContext";
import { isCheckDue } from "@/utilities/backupCheck";

/**
 * The last look before signing out.
 *
 * Signing out takes the wallet off this browser. Coming back needs the
 * Google backup (and its password) or the recovery phrase, so this is the
 * moment to make sure one of those exists and works:
 *
 *   - not backed up at all: a warning, and "Back up first" as the main button;
 *   - backed up, password not confirmed lately: "Test it first";
 *   - otherwise: a plain confirmation.
 */
export default function SignOutCheck({
  open,
  busy,
  onCancel,
  onSignOut,
}: {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onSignOut: () => void;
}) {
  const { walletState, isWalletSafe, hasCloudBackup } = useWallet();
  const accountId = walletState.account?.accountId;

  const state: "no-wallet" | "unsafe" | "test" | "ok" = !accountId
    ? "no-wallet"
    : !isWalletSafe
      ? "unsafe"
      : hasCloudBackup && isCheckDue(accountId)
        ? "test"
        : "ok";

  const signOutButton = (variant: "primary" | "outline" | "danger", label: string) => (
    <Button variant={variant} full loading={busy} onClick={onSignOut}>
      <LogOut size={16} /> {label}
    </Button>
  );

  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} title="Log out" size="sm">
      {state === "unsafe" ? (
        <>
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert size={18} className="shrink-0" /> Your wallet isn&apos;t backed up
            </p>
            <p className="mt-1">
              Logging out removes it from this browser. To get back in you&apos;ll need a Google backup or your
              recovery phrase. Without either, the wallet and anything in it can&apos;t be recovered, not even by
              Sheda.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <ButtonLink href="/wallet-recovery" full>
              Back up first
            </ButtonLink>
            {signOutButton("outline", "Log out anyway")}
          </div>
        </>
      ) : state === "test" ? (
        <>
          <div className="mb-4 rounded-xl border border-brandBorder bg-brandTint p-4 text-sm text-brandInk">
            <p className="flex items-center gap-2 font-semibold">
              <KeyRound size={18} className="shrink-0" /> Remember your backup password?
            </p>
            <p className="mt-1">
              You&apos;ll need it to restore your wallet when you log in again on a new device. Nobody can reset it,
              so it&apos;s worth a quick test while your wallet is still here.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <ButtonLink href="/wallet-recovery?check=1" full>
              Test it first
            </ButtonLink>
            {signOutButton("outline", "Log out")}
          </div>
        </>
      ) : (
        <>
          <p className="mb-5 text-sm text-secondaryText">Are you sure you want to log out?</p>
          <div className="flex flex-col gap-2">
            {signOutButton("primary", "Log out")}
            <Button variant="outline" full onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

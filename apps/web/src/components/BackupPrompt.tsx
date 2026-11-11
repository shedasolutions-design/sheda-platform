"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { useWallet } from "@/contexts/WalletContext";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import type { BackupRecord } from "@/services/cloudBackup";
import { checkPassphrase, MIN_PASSPHRASE_LENGTH } from "@/services/walletCrypto";

/**
 * Encrypted-backup UI, in two modes:
 *
 *   "backup"   offered right after a wallet is created or imported.
 *   "restore"  offered on a new browser when a backup exists for the Google
 *              account the user connects.
 *
 * The passphrase typed here never leaves the browser and is never uploaded
 * alongside the backup. That separation is what makes a stolen Firestore
 * document useless. Closing the dialog clears it from component state.
 *
 * Google is connected in a popup, not a redirect: in "backup" mode a freshly
 * generated recovery phrase is on the page behind this dialog, and a redirect
 * would throw the page away.
 */
export interface BackupPromptProps {
  visible: boolean;
  mode: "backup" | "restore";
  /** Wallet being backed up. Ignored in restore mode (the user picks). */
  accountId?: string;
  onClose: () => void;
  onDone?: () => void;
}

const STRENGTH_LABEL = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["text-red-600", "text-red-600", "text-amber-600", "text-emerald-600", "text-emerald-600"];

export default function BackupPrompt({ visible, mode, accountId, onClose, onDone }: BackupPromptProps) {
  const {
    isCloudBackupAvailable,
    connectBackupAccount,
    backupWallet,
    listCloudBackups,
    restoreFromCloud,
  } = useWallet();
  const { signInWithGooglePopup } = useGoogleAuth();

  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const strength = checkPassphrase(passphrase);
  const isBackup = mode === "backup";

  // Clear every secret-adjacent field whenever the dialog closes.
  useEffect(() => {
    if (!visible) {
      setPassphrase("");
      setConfirmPassphrase("");
      setErrorText(null);
      setStatus(null);
      setBusy(false);
      setBackups([]);
      setSelected(null);
      setConnected(false);
    }
  }, [visible]);

  const handleConnectGoogle = async () => {
    setErrorText(null);
    setBusy(true);
    setStatus("Waiting for Google…");
    try {
      const idToken = await signInWithGooglePopup();
      await connectBackupAccount(idToken);
      setConnected(true);
      if (mode === "restore") {
        setStatus("Looking for backups…");
        const found = await listCloudBackups();
        setBackups(found);
        setSelected(found[0]?.accountId ?? null);
        setStatus(found.length ? null : "No backups found for this Google account.");
      } else {
        setStatus(null);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Google sign-in failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = async () => {
    setErrorText(null);
    if (!strength.ok) return setErrorText(strength.problem ?? "Choose a stronger passphrase.");
    if (passphrase !== confirmPassphrase) return setErrorText("The two passphrases don't match.");
    if (!accountId) return setErrorText("No wallet selected to back up.");
    setBusy(true);
    // The pause here is key derivation, not the network. Saying so stops it
    // reading as a hung request.
    setStatus("Encrypting your wallet in this browser…");
    try {
      // "Remember on this device" is a phone feature: it needs a biometric
      // gate the browser cannot provide, so it is never offered here.
      await backupWallet(accountId, passphrase, { remember: false });
      onDone?.();
      onClose();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Backup failed.");
      setStatus(null);
    } finally {
      setBusy(false);
      setPassphrase("");
      setConfirmPassphrase("");
    }
  };

  const handleRestore = async () => {
    setErrorText(null);
    if (!selected) return setErrorText("Pick a backup to restore.");
    if (!passphrase) return setErrorText("Enter your recovery passphrase.");
    setBusy(true);
    setStatus("Decrypting in this browser…");
    try {
      await restoreFromCloud(selected, passphrase);
      onDone?.();
      onClose();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Restore failed.");
      setStatus(null);
    } finally {
      setBusy(false);
      setPassphrase("");
    }
  };

  if (!isCloudBackupAvailable) return null;

  return (
    <Modal
      open={visible}
      onClose={busy ? undefined : onClose}
      title={isBackup ? "Back up your wallet" : "Restore your wallet"}
    >
      <p className="mb-5 text-sm text-secondaryText">
        {isBackup
          ? "Your seed phrase is encrypted in this browser before it's uploaded. Sheda never sees it, and never receives your passphrase."
          : "Connect the Google account you backed up to, then enter the recovery passphrase you chose."}
      </p>

      {!connected ? (
        <Button variant="outline" full onClick={handleConnectGoogle} loading={busy}>
          Continue with Google
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          {mode === "restore" && backups.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Choose a backup</legend>
              {backups.map((b) => (
                <label
                  key={b.accountId}
                  className={`mb-2 flex cursor-pointer flex-col rounded-xl border p-3 ${
                    selected === b.accountId ? "border-primary bg-primaryLight" : "border-borderColor"
                  }`}
                >
                  <input
                    type="radio"
                    name="backup"
                    className="sr-only"
                    checked={selected === b.accountId}
                    onChange={() => setSelected(b.accountId)}
                  />
                  <span className="break-all font-semibold">{b.accountId}</span>
                  <span className="text-xs text-secondaryText">
                    {b.network ?? "testnet"} ·{" "}
                    {b.updatedAt ? new Date(b.updatedAt).toLocaleDateString() : "unknown date"}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <TextField
            label="Recovery passphrase"
            isPassword
            autoComplete={isBackup ? "new-password" : "current-password"}
            placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            hint={
              isBackup && passphrase.length > 0 ? (
                <span className={STRENGTH_COLOR[strength.score]}>
                  {strength.problem ?? STRENGTH_LABEL[strength.score]}
                </span>
              ) : undefined
            }
          />

          {isBackup && (
            <>
              <TextField
                label="Confirm passphrase"
                isPassword
                autoComplete="new-password"
                placeholder="Type it again"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
              />
              {/* Stated before the fact: there is no reset, because a reset
                  would mean Sheda could decrypt the backup. */}
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-900">
                  If you forget this passphrase, the backup is gone
                </p>
                <p className="mt-1 text-amber-800">
                  Nobody at Sheda can recover it for you. That&apos;s what keeps your funds yours.
                  Keep your seed phrase written down as well.
                </p>
              </div>
            </>
          )}

          {errorText && <p className="text-sm text-red-600">{errorText}</p>}
          {status && <p className="text-sm text-secondaryText">{status}</p>}

          <Button full onClick={isBackup ? handleBackup : handleRestore} loading={busy}>
            {isBackup ? "Encrypt and back up" : "Restore wallet"}
          </Button>
        </div>
      )}

      {!connected && status && <p className="mt-3 text-sm text-secondaryText">{status}</p>}
      {!connected && errorText && <p className="mt-3 text-sm text-red-600">{errorText}</p>}

      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="mx-auto mt-4 block text-sm text-secondaryText hover:underline disabled:opacity-50"
      >
        {isBackup ? "Not now" : "Skip"}
      </button>
    </Modal>
  );
}

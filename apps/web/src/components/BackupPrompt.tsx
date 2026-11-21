"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { useWallet } from "@/contexts/WalletContext";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { getCachedSession, restoreBackup, type BackupRecord } from "@/services/cloudBackup";
import { checkPassphrase, decryptSecret, MIN_PASSPHRASE_LENGTH } from "@/services/walletCrypto";
import { markChecked } from "@/utilities/backupCheck";

/**
 * Encrypted-backup UI, in three modes (backup, restore, check):
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
  /**
   * backup: encrypt and upload (also how the backup password is changed:
   * the new backup replaces the old one). restore: pick one and import it.
   * check: confirm the backup password still unlocks this wallet's backup.
   */
  mode: "backup" | "restore" | "check";
  /** Wallet being backed up. Ignored in restore mode (the user picks). */
  accountId?: string;
  /**
   * Restore mode: the wallet on the person's Sheda profile. Its backup is
   * listed first, picked by default and labelled, so a returning person
   * restores the wallet their deals were made with rather than another one.
   */
  preferredAccountId?: string;
  onClose: () => void;
  onDone?: () => void;
}

const STRENGTH_LABEL = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["text-red-600", "text-red-600", "text-brandInk", "text-emerald-600", "text-emerald-600"];

export default function BackupPrompt({ visible, mode, accountId, preferredAccountId, onClose, onDone }: BackupPromptProps) {
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

  // A failed check can turn into setting a new password, in place.
  const [active, setActive] = useState(mode);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkPassed, setCheckPassed] = useState(false);

  const strength = checkPassphrase(passphrase);
  const isBackup = active === "backup";
  const isCheck = active === "check";

  const showBackups = (found: BackupRecord[]) => {
    // The profile's own wallet first; the rest keep newest-first order.
    const ordered = preferredAccountId
      ? [...found.filter((b) => b.accountId === preferredAccountId), ...found.filter((b) => b.accountId !== preferredAccountId)]
      : found;
    setBackups(ordered);
    setSelected(ordered[0]?.accountId ?? null);
    setStatus(ordered.length ? null : "No backups found for this Google account.");
  };

  // Already connected to Google (signing in with Google just did it): go
  // straight to the list, no second Google step.
  useEffect(() => {
    if (!visible || !isCloudBackupAvailable) return;
    let alive = true;
    (async () => {
      const session = await getCachedSession().catch(() => null);
      if (!session || !alive) return;
      setConnected(true);
      if (mode !== "restore") return;
      setStatus("Looking for backups…");
      try {
        const found = await listCloudBackups();
        if (alive) showBackups(found);
      } catch (err) {
        if (alive) {
          setConnected(false);
          setStatus(null);
          setErrorText(err instanceof Error ? err.message : "Could not load your backups.");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, isCloudBackupAvailable]);

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
      setCheckFailed(false);
      setCheckPassed(false);
    }
    setActive(mode);
  }, [visible, mode]);

  const handleConnectGoogle = async () => {
    setErrorText(null);
    setBusy(true);
    setStatus("Waiting for Google…");
    try {
      const idToken = await signInWithGooglePopup();
      await connectBackupAccount(idToken);
      setConnected(true);
      if (active === "restore") {
        setStatus("Looking for backups…");
        showBackups(await listCloudBackups());
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
      // The password was just chosen, so it is known to work now.
      markChecked(accountId);
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
      markChecked(selected);
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

  // Downloads the backup and tries the password here in the browser. The
  // unlocked secret is dropped straight away: nothing is stored or imported.
  const handleCheck = async () => {
    setErrorText(null);
    setCheckFailed(false);
    if (!accountId) return setErrorText("No wallet selected.");
    if (!passphrase) return setErrorText("Enter your backup password.");
    setBusy(true);
    setStatus("Checking in this browser…");
    try {
      const record = await restoreBackup(accountId);
      if (!record) {
        setStatus(null);
        setCheckFailed(true);
        return setErrorText("There's no Google backup for this wallet yet. Back it up now.");
      }
      try {
        const secret = await decryptSecret(record.envelope, passphrase);
        void secret;
      } catch {
        setStatus(null);
        setCheckFailed(true);
        return setErrorText("That password doesn't unlock this backup.");
      }
      markChecked(accountId);
      setStatus(null);
      setCheckPassed(true);
      onDone?.();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Could not check the backup.");
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
      title={isBackup ? "Back up your wallet" : isCheck ? "Test your backup password" : "Restore your wallet"}
    >
      <p className="mb-5 text-sm text-secondaryText">
        {isBackup
          ? "Your seed phrase is encrypted in this browser before it's uploaded. Sheda never sees it, and never receives your passphrase. A new backup replaces the old one, so your old passphrase stops working."
          : isCheck
            ? "Make sure you still remember it, while this device has your wallet. It's checked here in your browser and nothing is changed."
            : "Connect the Google account you backed up to, then enter the recovery passphrase you chose."}
      </p>

      {!connected ? (
        <Button variant="outline" full onClick={handleConnectGoogle} loading={busy}>
          Continue with Google
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          {active === "restore" && backups.length > 0 && (
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
                  {b.accountId === preferredAccountId ? (
                    <span className="mb-1 w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      Your Sheda wallet
                    </span>
                  ) : preferredAccountId ? (
                    <span className="mb-1 w-fit rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-secondaryText">
                      Another wallet, not linked to this account
                    </span>
                  ) : null}
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
              <div className="rounded-xl border border-brandBorder bg-brandTint p-3 text-sm">
                <p className="font-semibold text-brandInk">
                  If you forget this passphrase, the backup is gone
                </p>
                <p className="mt-1 text-brandInk">
                  Nobody at Sheda can recover it for you. That&apos;s what keeps your funds yours.
                  Keep your seed phrase written down as well.
                </p>
              </div>
            </>
          )}

          {errorText && <p className="text-sm text-red-600">{errorText}</p>}
          {status && <p className="text-sm text-secondaryText">{status}</p>}
          {checkPassed && (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ That&apos;s the one. Your backup password works.
            </p>
          )}
          {isCheck && checkFailed && (
            <div className="rounded-xl border border-brandBorder bg-brandTint p-3 text-sm text-brandInk">
              Forgotten it? This device has your wallet, so you can set a new backup password now. The old one
              stops working.
              <Button
                variant="outline"
                full
                className="mt-3"
                onClick={() => {
                  setErrorText(null);
                  setCheckFailed(false);
                  setActive("backup");
                }}
              >
                Choose a new backup password
              </Button>
            </div>
          )}

          {!checkPassed && (
            <Button full onClick={isBackup ? handleBackup : isCheck ? handleCheck : handleRestore} loading={busy}>
              {isBackup ? "Encrypt and back up" : isCheck ? "Test password" : "Restore wallet"}
            </Button>
          )}
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
        {checkPassed ? "Done" : isBackup ? "Not now" : "Skip"}
      </button>
    </Modal>
  );
}

import { useState, useEffect } from "react";
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import { useWallet } from "@/contexts/WalletContext";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import {
  checkPassphrase,
  MIN_PASSPHRASE_LENGTH,
} from "@/services/walletCrypto";
import type { BackupRecord } from "@/services/cloudBackup";

/**
 * Encrypted-backup UI, in two modes:
 *
 *   "backup"  — offered right after a wallet is created or imported.
 *   "restore" — offered on a fresh device when a backup is found for the
 *               Google account the user just signed in with.
 *
 * The passphrase typed here NEVER leaves the device, and is never uploaded
 * alongside the backup — that separation is what makes a stolen Firestore
 * document useless.
 *
 * It CAN, at the user's choice, be remembered in the platform secure store so
 * a returning user unlocks with Face ID instead of retyping it (see
 * secureStorage.saveBackupPassphrase for why that is safe: anyone holding an
 * unlocked device already has the seed phrase sitting in the same store).
 * Nothing here writes it anywhere else, and closing the sheet clears it from
 * component state.
 */
export interface BackupPromptProps {
  visible: boolean;
  mode: "backup" | "restore";
  /** Wallet being backed up. Ignored in restore mode (user picks). */
  accountId?: string;
  onClose: () => void;
  onDone?: () => void;
}

const STRENGTH_LABEL = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["#DC2626", "#DC2626", "#D97706", "#059669", "#059669"];

export default function BackupPrompt({
  visible,
  mode,
  accountId,
  onClose,
  onDone,
}: BackupPromptProps) {
  const {
    isCloudBackupAvailable,
    connectBackupAccount,
    backupWallet,
    listCloudBackups,
    restoreFromCloud,
    canUseBiometricUnlock,
    hasRememberedPassphrase,
    unlockBackupPassphrase,
  } = useWallet();
  const { signInWithGoogle } = useGoogleAuth();

  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // Default ON where a real biometric gate exists: the whole point is that a
  // returning user stops retyping a long passphrase.
  const [remember, setRemember] = useState(true);
  const [hasRemembered, setHasRemembered] = useState(false);

  const strength = checkPassphrase(passphrase);

  // Clear every secret-adjacent field whenever the sheet closes, so a
  // passphrase cannot survive in component state behind a dismissed modal.
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
      setHasRemembered(false);
      setRemember(true);
    }
  }, [visible]);

  // Checked WITHOUT reading the value, so opening the sheet never throws an
  // unrequested Face ID prompt at the user.
  useEffect(() => {
    const target = mode === "backup" ? accountId : selected;
    if (!visible || !target) {
      setHasRemembered(false);
      return;
    }
    let cancelled = false;
    hasRememberedPassphrase(target)
      .then((v) => !cancelled && setHasRemembered(v))
      .catch(() => !cancelled && setHasRemembered(false));
    return () => {
      cancelled = true;
    };
  }, [visible, mode, accountId, selected, hasRememberedPassphrase]);

  /** Biometric unlock — fills the field rather than bypassing it, so the user
   *  can still see and correct what will be used. */
  const handleUnlock = async () => {
    const target = mode === "backup" ? accountId : selected;
    if (!target) return;
    setErrorText(null);
    setBusy(true);
    setStatus("Waiting for Face ID…");
    try {
      const recalled = await unlockBackupPassphrase(target);
      if (!recalled) {
        // Cancelling the OS prompt is a normal choice, not a failure.
        setStatus(null);
        return;
      }
      setPassphrase(recalled);
      setConfirmPassphrase(recalled);
      setStatus("Unlocked — passphrase filled in.");
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : "Could not unlock on this device."
      );
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const handleConnectGoogle = async () => {
    setErrorText(null);
    setBusy(true);
    setStatus("Opening Google sign-in…");
    try {
      const idToken = await signInWithGoogle();
      await connectBackupAccount(idToken);
      setConnected(true);

      if (mode === "restore") {
        setStatus("Looking for backups…");
        const found = await listCloudBackups();
        setBackups(found);
        setSelected(found[0]?.accountId ?? null);
        setStatus(
          found.length
            ? null
            : "No backups found for this Google account."
        );
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
    if (!strength.ok) {
      setErrorText(strength.problem ?? "Choose a stronger passphrase.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setErrorText("The two passphrases don't match.");
      return;
    }
    if (!accountId) {
      setErrorText("No wallet selected to back up.");
      return;
    }

    setBusy(true);
    // The 1-3s here is PBKDF2, not the network. Saying so stops it reading
    // as a hung request.
    setStatus("Encrypting your wallet on this device…");
    try {
      await backupWallet(accountId, passphrase, { remember });
      setStatus("Backup saved.");
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
    if (!selected) {
      setErrorText("Pick a backup to restore.");
      return;
    }
    if (!passphrase) {
      setErrorText("Enter your recovery passphrase.");
      return;
    }

    setBusy(true);
    setStatus("Decrypting on this device…");
    try {
      await restoreFromCloud(selected, passphrase);
      setStatus("Wallet restored.");
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

  const isBackup = mode === "backup";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-background rounded-t-2xl p-5 max-h-[88%]">
          <ScrollView showsVerticalScrollIndicator={false}>
            <InterSemiBold className="text-xl mb-1">
              {isBackup ? "Back up your wallet" : "Restore your wallet"}
            </InterSemiBold>
            <InterRegular className="text-secondaryText text-sm mb-4">
              {isBackup
                ? "Your seed phrase is encrypted on this device before it's uploaded. Sheda never sees it, and never receives your passphrase."
                : "We found a wallet backed up to your Google account. Enter the recovery passphrase you chose when you created it."}
            </InterRegular>

            {!connected ? (
              <>
                <Button
                  isFull
                  color="transparent"
                  className="rounded-xl border border-borderColor"
                  onPress={handleConnectGoogle}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <InterSemiBold>Continue with Google</InterSemiBold>
                  )}
                </Button>
                <TouchableOpacity onPress={onClose} className="mt-4">
                  <InterRegular className="text-secondaryText underline text-center">
                    {isBackup ? "Not now" : "Skip"}
                  </InterRegular>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {mode === "restore" && backups.length > 0 && (
                  <View className="mb-4">
                    <InterSemiBold className="text-sm mb-2">
                      Choose a backup
                    </InterSemiBold>
                    {backups.map((b) => (
                      <TouchableOpacity
                        key={b.accountId}
                        onPress={() => setSelected(b.accountId)}
                        className={`p-3 rounded-xl border mb-2 ${
                          selected === b.accountId
                            ? "border-primary"
                            : "border-borderColor"
                        }`}
                      >
                        <InterSemiBold className="text-sm">
                          {b.accountId}
                        </InterSemiBold>
                        <InterRegular className="text-secondaryText text-xs">
                          {b.network ?? "testnet"} ·{" "}
                          {b.updatedAt
                            ? new Date(b.updatedAt).toLocaleDateString()
                            : "unknown date"}
                        </InterRegular>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {hasRemembered && (
                  <TouchableOpacity
                    onPress={handleUnlock}
                    disabled={busy}
                    className="border border-borderColor rounded-xl p-3 mb-3 flex-row items-center justify-center"
                  >
                    <InterSemiBold className="text-sm">
                      {canUseBiometricUnlock
                        ? "Unlock with Face ID / fingerprint"
                        : "Use the passphrase saved on this device"}
                    </InterSemiBold>
                  </TouchableOpacity>
                )}

                <InterSemiBold className="text-sm mb-1">
                  Recovery passphrase
                </InterSemiBold>
                <TextInput
                  value={passphrase}
                  onChangeText={setPassphrase}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
                  placeholderTextColor="#9CA3AF"
                  className="border border-borderColor rounded-xl p-3 mb-2"
                />

                {isBackup && passphrase.length > 0 && (
                  <InterRegular
                    className="text-xs mb-2"
                    style={{ color: STRENGTH_COLOR[strength.score] }}
                  >
                    {strength.problem ?? STRENGTH_LABEL[strength.score]}
                  </InterRegular>
                )}

                {isBackup && (
                  <>
                    <InterSemiBold className="text-sm mb-1">
                      Confirm passphrase
                    </InterSemiBold>
                    <TextInput
                      value={confirmPassphrase}
                      onChangeText={setConfirmPassphrase}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Type it again"
                      placeholderTextColor="#9CA3AF"
                      className="border border-borderColor rounded-xl p-3 mb-3"
                    />
                    {/*
                      Offered only where the platform can actually gate the
                      read. On web there is no secure enclave and so no
                      user-presence check, and promising a Face ID unlock we
                      cannot enforce would be a lie about how protected it is.
                    */}
                    {canUseBiometricUnlock && (
                      <TouchableOpacity
                        onPress={() => setRemember((r) => !r)}
                        className="flex-row items-start mb-3"
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: remember }}
                      >
                        <View
                          className={`w-5 h-5 rounded border mr-3 mt-0.5 items-center justify-center ${
                            remember
                              ? "bg-primary border-primary"
                              : "border-borderColor"
                          }`}
                        >
                          {remember && (
                            <InterSemiBold className="text-background text-xs">
                              ✓
                            </InterSemiBold>
                          )}
                        </View>
                        <View className="flex-1">
                          <InterSemiBold className="text-xs">
                            Remember on this device
                          </InterSemiBold>
                          <InterRegular className="text-xs text-secondaryText">
                            Unlock with Face ID next time instead of typing it.
                            Other devices will still ask for the passphrase.
                          </InterRegular>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/*
                      Stated plainly and before the fact. This passphrase is the
                      only thing that can open the backup — there is no reset
                      link, because a reset would mean Sheda could decrypt it.
                    */}
                    <View className="bg-[#FEF3C7] rounded-xl p-3 mb-3">
                      <InterSemiBold className="text-xs text-[#92400E] mb-1">
                        If you forget this passphrase, the backup is gone
                      </InterSemiBold>
                      <InterRegular className="text-xs text-[#92400E]">
                        Nobody at Sheda can recover it for you — that's what
                        keeps your funds yours. Keep your seed phrase written
                        down as well.
                      </InterRegular>
                    </View>
                  </>
                )}

                {errorText && (
                  <InterRegular className="text-xs text-[#DC2626] mb-2">
                    {errorText}
                  </InterRegular>
                )}
                {status && (
                  <InterRegular className="text-xs text-secondaryText mb-2">
                    {status}
                  </InterRegular>
                )}

                <Button
                  isFull
                  className="rounded-xl"
                  onPress={isBackup ? handleBackup : handleRestore}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <InterSemiBold className="text-background">
                      {isBackup ? "Encrypt and back up" : "Restore wallet"}
                    </InterSemiBold>
                  )}
                </Button>

                <TouchableOpacity onPress={onClose} className="mt-4" disabled={busy}>
                  <InterRegular className="text-secondaryText underline text-center">
                    {isBackup ? "Not now" : "Skip"}
                  </InterRegular>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

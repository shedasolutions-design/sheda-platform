"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Copy, Eye, KeyRound, ShieldAlert } from "lucide-react";
import BackupPrompt from "@/components/BackupPrompt";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import { useCopy } from "@/hooks/useCopy";
import apiService from "@/services/api";

function Secret({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  const copy = useCopy();
  return (
    <section className="mb-5">
      <h2 className="mb-2 font-semibold">{label}</h2>
      {shown ? (
        <>
          <p className="mb-3 select-all break-words rounded-xl bg-cardBackground p-4 font-mono text-sm leading-6">{value}</p>
          <Button variant="outline" full onClick={() => copy(value, label)}>
            <Copy size={16} /> Copy {label.toLowerCase()}
          </Button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borderColor p-6 text-sm text-secondaryText hover:border-primary"
        >
          <Eye size={16} /> Click to reveal (make sure nobody can see your screen)
        </button>
      )}
    </section>
  );
}

/**
 * Shows the wallet's recovery phrase and private key so they can be written
 * down. A browser has no device lock, so the person proves it's them first:
 * with their transaction PIN if they set one, otherwise their password.
 */
function WalletRecovery() {
  const { walletState, getStoredSeedPhrase, getPrivateKeyFromStoredSeedPhrase, hasTransactionPin, getAuthorizedPrivateKey, isCloudBackupAvailable, hasCloudBackup, isWalletSafe, markPhraseSaved } = useWallet();
  const [showBackup, setShowBackup] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const { user } = useApi();
  const accountId = walletState.account?.accountId;
  const [usesPin, setUsesPin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    hasTransactionPin(accountId)
      .then(setUsesPin)
      .catch(() => setUsesPin(false));
  }, [accountId, hasTransactionPin]);

  const loadSecrets = async (id: string, knownKey?: string | null) => {
    const [s, k] = await Promise.all([getStoredSeedPhrase(id), knownKey ? Promise.resolve(knownKey) : getPrivateKeyFromStoredSeedPhrase(id)]);
    setSeed(s);
    setKey(k);
    setRevealed(true);
    if (!s && !k) setError("No keys are stored for this wallet on this device. If you set it up elsewhere, use that device or your written-down phrase.");
  };

  const unlock = async () => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      if (usesPin) {
        const k = await getAuthorizedPrivateKey(accountId);
        if (!k) {
          setError("PIN not confirmed.");
          return;
        }
        await loadSecrets(accountId, k);
        return;
      }
      if (!user?.email) {
        setError("Couldn't confirm who you are. Sign in again and retry.");
        return;
      }
      const res = await apiService.login(user.email, password);
      if (!res.ok) {
        setError(
          res.status && res.status < 500 ? "That password is incorrect." : "We couldn't reach the server. Check your connection and try again."
        );
        return;
      }
      setPassword("");
      await loadSecrets(accountId);
    } catch {
      setError("That password is incorrect, or we couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Backup & recovery" fallback="/profile-setting" />
      <div className="mx-auto max-w-xl px-5 py-6">
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <ShieldAlert size={18} /> Keep these secret
          </p>
          Your recovery phrase and private key give full control of your wallet. Never share them, never type them into a site you don&apos;t
          trust, and write them somewhere offline. Sheda will never ask for them.
        </div>

        {!accountId ? (
          <p className="text-center text-secondaryText">No wallet is connected on this device.</p>
        ) : (
          <>
            <p className="mb-5 rounded-xl bg-cardBackground p-4 text-sm">
              <span className="block text-xs uppercase tracking-wide text-secondaryText">Connected wallet</span>
              <span className="break-all font-medium">{accountId}</span>
            </p>

            {/* Encrypted in this browser with a passphrase only you know, then
                stored against your Google account, so a lost device isn't a lost wallet. */}
            {isCloudBackupAvailable && (
              <section className="mb-6 rounded-xl border border-borderColor p-4">
                <h2 className="mb-1 flex items-center gap-2 font-semibold">
                  <CloudUpload size={18} className="text-primary" /> Google backup
                </h2>
                <p className="mb-3 text-sm text-secondaryText">
                  {hasCloudBackup || backedUp
                    ? "This wallet is backed up to your Google account. You can back it up again, for example with a new passphrase."
                    : "Save an encrypted copy of this wallet to your Google account, so you can restore it on a new device. It's locked with a passphrase only you know."}
                </p>
                <Button variant={hasCloudBackup || backedUp ? "outline" : "primary"} full onClick={() => setShowBackup(true)}>
                  {hasCloudBackup || backedUp ? "Back up again" : "Back up to Google"}
                </Button>
              </section>
            )}

            {!revealed ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  unlock();
                }}
              >
                <p className="mb-4 text-sm text-secondaryText">
                  {usesPin ? "Enter your transaction PIN to view your keys." : "Enter your Sheda password to view your keys."}
                </p>
                {usesPin === false && (
                  <TextField
                    label="Password"
                    isPassword
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    hint="Signed up with Google? Set a transaction PIN under Profile settings and use that instead."
                  />
                )}
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <Button type="submit" full className="mt-5" loading={busy} disabled={usesPin === null || (usesPin === false && !password)}>
                  <KeyRound size={16} /> {usesPin ? "Enter PIN" : "View keys"}
                </Button>
              </form>
            ) : (
              <>
                {error && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
                {seed && <Secret label="Recovery phrase" value={seed} />}
                {key && <Secret label="Private key" value={key} />}
                {(seed || key) &&
                  (isWalletSafe ? (
                    <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                      ✓ This wallet is backed up. Keep your copy somewhere safe and offline.
                    </p>
                  ) : (
                    <Button full onClick={() => markPhraseSaved(accountId).catch(() => {})}>
                      I&apos;ve written it down safely
                    </Button>
                  ))}
              </>
            )}
          </>
        )}
      </div>
      {accountId && (
        <BackupPrompt
          visible={showBackup}
          mode="backup"
          accountId={accountId}
          onClose={() => setShowBackup(false)}
          onDone={() => {
            setBackedUp(true);
            setShowBackup(false);
          }}
        />
      )}
    </>
  );
}

export default function WalletRecoveryPage() {
  return (
    <AuthGuard requireAuth>
      <WalletRecovery />
    </AuthGuard>
  );
}

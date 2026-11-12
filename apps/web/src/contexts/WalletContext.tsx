import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import nearWalletService, {
  WalletAccount,
  WalletState,
  NetworkType,
  CreateWalletResult,
  CreateSubAccountResult,
  ImportWalletResult,
  FaucetInfo,
  WalletCreationStep,
} from "@/services/nearWallet";
import secureStorageService from "@/services/secureStorage";
import PinPromptModal from "@/components/common/PinPromptModal";
import { useApi } from "@/contexts/ApiContext";
import { setExplorerNetwork } from "@/utilities/nearExplorer";
import { clearCachedAssets } from "@/services/assetCache";
import { FEATURE_CLOUD_BACKUP } from "@/config/featureFlags";
import { isFirebaseConfigured } from "@/config/firebase";
import {
  hydrateMetadata,
  getWalletMetadataSync,
  patchWalletMetadata,
  clearWalletMetadata,
  isStaleEpoch,
  type WalletMetadata,
} from "@/services/platformAdapter";
import { WALLET_EPOCH } from "@/config/walletConfig";
import { ACTIVE_NETWORK } from "@/config/near";
import { encryptSecret, decryptSecret } from "@/services/walletCrypto";
import * as cloudBackup from "@/services/cloudBackup";
import type { BackupRecord } from "@/services/cloudBackup";

/**
 * Two-phase wallet readiness.
 *
 *   idle      — nothing attempted yet (no signed-in user)
 *   metadata  — Phase A done: we know from local storage whether a wallet
 *               exists and what its accountId is. Enough to render the real
 *               screen. Balances are not loaded.
 *   ready     — Phase B done: keys loaded, RPC verified, balances fetched.
 *   error     — Phase B failed. Phase A's answer (if any) still stands, so the
 *               UI keeps showing the known account rather than falling back to
 *               "no wallet".
 */
export type WalletReadiness = "idle" | "metadata" | "ready" | "error";

interface WalletContextType {
  // State
  walletState: WalletState;
  currentNetwork: NetworkType;
  /**
   * Phase B (background) is in flight. This is a HINT FOR SPINNERS ONLY.
   *
   * Do NOT put this on `disabled` for Create Wallet / Import / Sign In. That
   * was the old behaviour and it made those buttons dead for the length of an
   * Auth0 session check plus an RPC probe — up to 15s per endpoint on a bad
   * network. Nothing about a background balance fetch makes it unsafe to start
   * creating a wallet. Gate destructive or duplicate-prone actions on their own
   * local submitting flag instead (see app/wallet-setup/import-wallet).
   */
  loading: boolean;
  /** See WalletReadiness. Drives skeletons, not interactivity. */
  readiness: WalletReadiness;
  /**
   * Phase A result: a wallet was found on this device for this user. True
   * within milliseconds of launch, before any network call.
   */
  hasLocalWallet: boolean;
  /** Phase A metadata — accountId/publicKey known without touching the network. */
  localWalletMetadata: WalletMetadata | null;
  error: string | null;
  creationStep: WalletCreationStep | null;

  // Preview
  getPreviewAccountId: (email: string) => string | null;

  // Network management
  setNetwork: (network: NetworkType) => void;
  getCurrentNetwork: () => NetworkType;

  // Wallet operations
  createWallet: (email?: string) => Promise<CreateWalletResult>;
  createSubAccount: (
    mainAccountId: string,
    subAccountName: string,
    initialBalance?: string
  ) => Promise<CreateSubAccountResult>;
  importWallet: (
    seedPhrase: string,
    accountId?: string
  ) => Promise<ImportWalletResult>;
  importWalletByPrivateKey: (
    privateKey: string,
    accountId?: string
  ) => Promise<ImportWalletResult>;
  connectWallet: (accountId: string) => Promise<WalletAccount>;
  signIn: (accountId: string) => Promise<WalletAccount>;
  signOut: () => Promise<void>;

  // Account operations
  getAccountBalance: (accountId: string) => Promise<string>;
  getAccountTransactions: (
    accountId: string,
    limit?: number,
    /** Bypass the indexer's 5-minute cache — set by pull-to-refresh */
    forceRefresh?: boolean
  ) => Promise<any[]>;
  getTokenBalances: (accountId: string) => Promise<any[]>;
  sendTransaction: (
    accountId: string,
    receiverId: string,
    amount: string
  ) => Promise<string>;
  sendFungibleToken: (
    accountId: string,
    receiverId: string,
    tokenContractId: string,
    amount: string,
    decimals?: number
  ) => Promise<string>;
  accountExists: (accountId: string) => Promise<boolean>;

  // Utility methods
  getFaucetInfo: () => FaucetInfo | null;
  getAccountExplorerUrl: (accountId: string) => string;
  getWalletUrl: () => string;
  formatNearAmount: (amount: string) => string;
  parseNearAmount: (amount: string) => string;

  // State checks
  isSignedIn: () => boolean;
  getAccountId: () => string | null;
  getAccounts: () => WalletAccount[];
  clearAccounts: () => void;

  // Secure storage methods
  getStoredSeedPhrase: (accountId: string) => Promise<string | null>;
  getPrivateKeyFromStoredSeedPhrase: (
    accountId: string
  ) => Promise<string | null>;
  deleteStoredSeedPhrase: (accountId: string) => Promise<void>;
  isBiometricAvailable: () => Promise<boolean>;
  getSupportedBiometryType: () => Promise<string | null>;

  // Transaction PIN — opt-in UI confirmation gate in front of
  // getPrivateKeyFromStoredSeedPhrase. See PinPromptModal.
  getAuthorizedPrivateKey: (accountId: string) => Promise<string | null>;
  hasTransactionPin: (accountId: string) => Promise<boolean>;
  promptTransactionPinSetup: (accountId: string) => Promise<boolean>;
  promptTransactionPinChange: (accountId: string) => Promise<boolean>;

  // New methods for persistence
  saveWalletState: (accountId: string, seedPhrase: string, userEmail?: string) => Promise<void>;
  getStoredAccountId: (userEmail?: string) => Promise<string | null>;
  hasStoredWallet: (userEmail?: string) => Promise<boolean>;

  // ── Encrypted cloud backup (services/cloudBackup.ts) ──────────────────
  // The passphrase arguments below never leave the device: they are consumed
  // by walletCrypto to derive a key, and only ciphertext is uploaded.
  /** Whether this build can offer backup at all (Firebase configured). */
  isCloudBackupAvailable: boolean;
  /** Exchanges a Google id_token for a backup session. */
  connectBackupAccount: (googleIdToken: string) => Promise<void>;
  /**
   * Encrypts the wallet's secret under `passphrase` and uploads it.
   *
   * `remember` caches the passphrase in the platform secure store so the next
   * backup on this device can be unlocked with Face ID instead of retyping.
   * The passphrase still never leaves the device either way.
   */
  backupWallet: (
    accountId: string,
    passphrase: string,
    opts?: { remember?: boolean }
  ) => Promise<void>;
  /** True when a remembered passphrase would be gated by real biometrics. */
  canUseBiometricUnlock: boolean;
  /** Whether a passphrase is remembered here — does NOT prompt for biometrics. */
  hasRememberedPassphrase: (accountId: string) => Promise<boolean>;
  /** Prompts biometrics and returns the remembered passphrase, or null. */
  unlockBackupPassphrase: (accountId: string) => Promise<string | null>;
  /** Drops the remembered passphrase from this device. */
  forgetBackupPassphrase: (accountId: string) => Promise<void>;
  /** Lists this Google account's backups (envelopes stay encrypted). */
  listCloudBackups: () => Promise<BackupRecord[]>;
  /** Downloads, decrypts locally, and imports a backup. */
  restoreFromCloud: (
    accountId: string,
    passphrase: string,
    userEmail?: string
  ) => Promise<WalletAccount>;
  /** True when a backup for the signed-in user is known to exist. */
  hasCloudBackup: boolean;
  /**
   * True once the wallet can be recovered without this browser: backed up to
   * Google, or the user confirmed writing the recovery phrase down. Drives
   * the backup reminder.
   */
  isWalletSafe: boolean;
  /** Records that the user has written their recovery phrase down. */
  markPhraseSaved: (accountId?: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const { user, isInitializing: apiIsInitializing } = useApi();
  const userEmail = user?.email;

  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    account: null,
  });
  const [currentNetwork, setCurrentNetworkState] =
    useState<NetworkType>(ACTIVE_NETWORK);
  const [loading, setLoading] = useState(false);
  const [readiness, setReadiness] = useState<WalletReadiness>("idle");
  const [localWalletMetadata, setLocalWalletMetadata] =
    useState<WalletMetadata | null>(null);
  const [hasCloudBackup, setHasCloudBackup] = useState(false);
  // Whether reading a remembered passphrase would raise a real biometric
  // prompt. False on web and on devices with nothing enrolled, so the UI can
  // avoid promising a Face ID unlock it cannot deliver.
  const [canUseBiometricUnlock, setCanUseBiometricUnlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creationStep, setCreationStep] = useState<WalletCreationStep | null>(null);
  const [pinPrompt, setPinPrompt] = useState<{
    visible: boolean;
    accountId: string;
    mode: "verify" | "setup" | "change";
    resolve: (success: boolean) => void;
  } | null>(null);

  // Explorer links are built outside React (utilities/nearExplorer.ts, also
  // used by non-component code), so the active network has to be pushed to
  // it. A testnet hash opened on the mainnet explorer 404s, which reads as a
  // transaction that never happened.
  useEffect(() => {
    setExplorerNetwork(currentNetwork);
  }, [currentNetwork]);

  // Initialize/restore wallet once ApiContext has settled (user is either
  // populated or confirmed absent). Restoration is keyed by userEmail
  // (current_account_${email}) — running this while ApiContext is still
  // loading the user profile means userEmail is transiently undefined,
  // which makes the lookup miss the real key entirely and wipe a perfectly
  // valid stored wallet to disconnected. Waiting for isInitializing to
  // clear means userEmail is in its final, settled value before this ever
  // reads/writes wallet state.
  // ── PHASE A: fast, local, no network ────────────────────────────────────
  // One AsyncStorage/localStorage read (no Keychain, so no biometric prompt,
  // no RPC). Settles in single-digit milliseconds and tells the UI whether a
  // wallet exists and which account it is. Everything the onboarding and
  // dashboard screens need to render their real content comes from here.
  //
  // This runs INDEPENDENTLY of apiIsInitializing for the metadata read itself
  // and does not await Phase B, which is the whole point: the Create Wallet
  // and Sign In buttons are interactive from the first frame.
  // Guards the (unlikely but real) case of Phase B finishing first. Phase A is
  // one local read and Phase B does network work, so A wins in practice — but
  // if B has already concluded "no wallet" and cleared state, A must not then
  // repaint an account from metadata B just invalidated. Keyed by email so a
  // user switch starts clean.
  const phaseBSettledFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runPhaseA = async () => {
      if (!userEmail) {
        // No signed-in user: nothing is scoped to read. Not an error state.
        if (!cancelled) {
          setLocalWalletMetadata(null);
          setReadiness(apiIsInitializing ? "idle" : "metadata");
        }
        return;
      }

      let meta = await hydrateMetadata(userEmail);
      if (cancelled) return;

      // ── Clean-restart check ───────────────────────────────────────────
      // A wallet from an earlier WALLET_EPOCH belongs to a namespace the app
      // no longer provisions under (the funding account moved from
      // sheda.testnet to shedauser.testnet). Detach it so this user is
      // offered creation again instead of reconnecting to a dead namespace
      // forever — the account pointer is keyed by email and would otherwise
      // survive every app update.
      //
      // Deliberately does NOT delete the seed phrase. Detaching is
      // reversible by importing the phrase; deleting it is not, and a stale
      // namespace is not a reason to destroy someone's key material.
      if (isStaleEpoch(meta, WALLET_EPOCH)) {
        console.log(
          `WalletContext: detaching wallet from epoch ${meta?.epoch ?? 1} ` +
          `(current ${WALLET_EPOCH}) — seed phrase left in secure storage`
        );
        await clearWalletMetadata(userEmail);
        try {
          await secureStorageService.deletePrivateKey(
            `current_account_${userEmail}`
          );
        } catch {
          // Pointer already gone; nothing to undo.
        }
        meta = null;
        if (cancelled) return;
        setWalletState({ isConnected: false, account: null });
      }

      setLocalWalletMetadata(meta);
      setHasCloudBackup(Boolean(meta?.hasCloudBackup));
      setReadiness((r) => (r === "ready" ? r : "metadata"));

      // Show the known account immediately, marked not-yet-verified. Phase B
      // replaces this with the RPC-confirmed account and real balance.
      if (meta?.accountId && phaseBSettledFor.current !== userEmail) {
        setWalletState((prev) =>
          prev.isConnected
            ? prev
            : {
                isConnected: true,
                account: {
                  accountId: meta.accountId,
                  publicKey: meta.publicKey ?? "",
                  balance: "0",
                  isCreated: true,
                  authMethod: meta.authMethod ?? "seed",
                } as WalletAccount,
              }
        );
      }
    };

    runPhaseA();
    return () => {
      cancelled = true;
    };
  }, [userEmail, apiIsInitializing]);

  useEffect(() => {
    let cancelled = false;
    secureStorageService
      .canUseBiometricUnlock?.()
      .then((v) => !cancelled && setCanUseBiometricUnlock(v))
      .catch(() => !cancelled && setCanUseBiometricUnlock(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // ── One-time legacy plaintext migration ─────────────────────────────────
  // Fire-and-forget: it must never delay first paint. Runs once per process
  // (memoised inside secureStorage) and is safe to run with no wallet present.
  useEffect(() => {
    // Guarded rather than called outright: the provider must not hard-fail
    // because a caller (or a test double) supplied a storage service without
    // this method. A missing migration is a no-op, not a broken wallet.
    if (typeof secureStorageService?.migrateLegacyPlaintext !== "function") return;

    secureStorageService
      .migrateLegacyPlaintext()
      .then((report) => {
        if (report.migratedKeys.length || report.failedKeys.length) {
          // Key NAMES only — never values.
          console.log(
            "WalletContext: storage migration:",
            JSON.stringify({
              migrated: report.migratedKeys.length,
              failed: report.failedKeys.length,
            })
          );
        }
      })
      .catch((err) =>
        console.warn("WalletContext: storage migration skipped:", err)
      );
  }, []);

  // ── PHASE B: background verification ────────────────────────────────────
  // Loads key material, verifies the account against RPC, fetches balances.
  // Slow by nature. Nothing in the UI blocks on it.
  useEffect(() => {
    if (apiIsInitializing) return;

    const initializeWallet = async () => {
      try {
        setLoading(true);
        setError(null);


        // Check if there's a stored wallet for this user
        const hasStored = await hasStoredWallet(userEmail ?? undefined);
        if (hasStored) {
          const storedAccountId = await getStoredAccountId(userEmail ?? undefined);
          if (storedAccountId) {
            console.log(
              "WalletContext: Found stored wallet for", userEmail || "unknown user", ", attempting to reconnect..."
            );

            // Get the stored seed phrase
            const seedPhrase = await secureStorageService.getSeedPhrase(
              storedAccountId
            );
            if (seedPhrase) {
              // Import the wallet using the stored seed phrase
              const result = await nearWalletService.importWallet(
                seedPhrase,
                storedAccountId
              );
              if (result.isCreated) {
                // Connect to the imported wallet
                const account = await nearWalletService.connectWallet(
                  storedAccountId
                );
                setWalletState({
                  isConnected: true,
                  account: account,
                });
                console.log(
                  "WalletContext: Successfully reconnected to stored wallet (seed phrase)"
                );
              }
            } else {
              // No seed phrase — wallet was imported via private key
              // connectWallet will read the stored private key directly
              console.log("WalletContext: No seed phrase found, trying direct reconnect...");
              const account = await nearWalletService.connectWallet(
                storedAccountId
              );
              if (account.privateKey) {
                setWalletState({
                  isConnected: true,
                  account: account,
                });
                console.log(
                  "WalletContext: Successfully reconnected to stored wallet (private key)"
                );
              } else {
                console.warn("WalletContext: Stored wallet has no private key, cannot reconnect");
                setWalletState({ isConnected: false, account: null });
              }
            }
          }
        } else {
          // No stored wallet for this user — reset wallet state, and clear the
          // optimistic account Phase A may have painted from stale metadata.
          phaseBSettledFor.current = userEmail ?? null;
          setWalletState({ isConnected: false, account: null });
          if (userEmail) await clearWalletMetadata(userEmail);
          setLocalWalletMetadata(null);
        }

        // Set current network
        setCurrentNetworkState(nearWalletService.getCurrentNetwork());
        setReadiness("ready");
      } catch (err) {
        console.error("WalletContext: Failed to initialize wallet:", err);
        setError(
          err instanceof Error ? err.message : "Failed to initialize wallet"
        );
        // Phase B failing does NOT retract Phase A's answer. A dead RPC
        // endpoint is not evidence that the user's wallet stopped existing,
        // and blanking the screen on a network blip is how a working wallet
        // comes to look lost.
        setReadiness("error");
      } finally {
        setLoading(false);
      }
    };

    initializeWallet();
  }, [userEmail, apiIsInitializing]);

  // The account-ID pointer is strictly scoped per Sheda user (by email) —
  // there is deliberately no device-global fallback key. A device is often
  // shared across accounts (sign out, sign back in as someone else), and a
  // global pointer previously caused whichever account connected a wallet
  // last to have that wallet silently handed to the next signed-in user.
  // Without an email we have no way to know whose wallet this is, so we
  // refuse to persist it rather than guess.
  const saveAccountPointer = async (
    accountId: string,
    userEmail?: string
  ): Promise<void> => {
    if (!userEmail) {
      throw new Error(
        "Cannot save wallet state without a signed-in user — wallet storage must be scoped per account."
      );
    }
    await secureStorageService.savePrivateKey(`current_account_${userEmail}`, accountId);
  };

  // New method to save wallet state
  const saveWalletState = async (
    accountId: string,
    seedPhrase: string,
    userEmail?: string
  ): Promise<void> => {
    try {
      // Save the seed phrase
      await secureStorageService.saveSeedPhrase(accountId, seedPhrase);

      // Save the account ID for quick retrieval, scoped to this user only.
      await saveAccountPointer(accountId, userEmail);

      // Also write the fast, non-secret metadata record that Phase A reads.
      // Without this the next cold start would have to go through the
      // biometric-gated Keychain entry just to learn the accountId, which is
      // exactly the startup stall this replaces.
      if (userEmail) {
        const meta = await patchWalletMetadata(userEmail, {
          accountId,
          authMethod: "seed",
          network: nearWalletService.getCurrentNetwork(),
          epoch: WALLET_EPOCH,
        });
        setLocalWalletMetadata(meta);
      }

      console.log("WalletContext: Wallet state saved successfully for", userEmail);
    } catch (error) {
      console.error("WalletContext: Failed to save wallet state:", error);
      throw error;
    }
  };

  // New method to get stored account ID — scoped strictly to userEmail, no
  // device-global fallback (see saveAccountPointer above for why).
  const getStoredAccountId = async (userEmail?: string): Promise<string | null> => {
    try {
      if (!userEmail) return null;
      return await secureStorageService.getPrivateKey(`current_account_${userEmail}`);
    } catch (error) {
      console.error("WalletContext: Failed to get stored account ID:", error);
      return null;
    }
  };

  // New method to check if wallet is stored
  const hasStoredWallet = async (userEmail?: string): Promise<boolean> => {
    try {
      const accountId = await getStoredAccountId(userEmail);
      if (!accountId) return false;

      const seedPhrase = await secureStorageService.getSeedPhrase(accountId);
      if (seedPhrase !== null) return true;

      // Also check for directly-stored private key (from importWalletByPrivateKey)
      const storedPK = await secureStorageService.getPrivateKey(accountId);
      return storedPK !== null;
    } catch (error) {
      console.error("WalletContext: Failed to check stored wallet:", error);
      return false;
    }
  };

  // Network management
  const setNetwork = (network: NetworkType) => {
    try {
      nearWalletService.setNetwork(network);
      setCurrentNetworkState(network);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch network");
    }
  };

  const getCurrentNetwork = () => {
    return nearWalletService.getCurrentNetwork();
  };

  // Preview account ID
  const getPreviewAccountId = (email: string): string | null => {
    return nearWalletService.getPreviewAccountId(email);
  };

  // Wallet operations
  const createWallet = async (email?: string): Promise<CreateWalletResult> => {
    try {
      setLoading(true);
      setError(null);
      setCreationStep(null);

      // Check if wallet already exists for THIS user (using email as identifier)
      const hasStored = await hasStoredWallet(email);
      if (hasStored) {
        throw new Error(
          "Wallet already exists. Please import your existing wallet instead."
        );
      }

      const result = await nearWalletService.createWallet(
        email,
        (step) => {
          setCreationStep(step);
        },
        (accountId, seedPhrase) => saveWalletState(accountId, seedPhrase, email)
      );

      // Save the wallet state if creation was successful (with user-specific key)
      if (result.accountId && result.seedPhrase) {
        await saveWalletState(result.accountId, result.seedPhrase, email);

        // Also connect to the wallet so isConnected is true
        const account = await nearWalletService.connectWallet(result.accountId);
        setWalletState({
          isConnected: true,
          account,
        });
      }

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create wallet";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createSubAccount = async (
    mainAccountId: string,
    subAccountName: string,
    initialBalance?: string
  ): Promise<CreateSubAccountResult> => {
    try {
      setLoading(true);
      setError(null);
      const result = await nearWalletService.createSubAccount(
        mainAccountId,
        subAccountName,
        initialBalance
      );
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create sub-account";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const importWallet = async (
    seedPhrase: string,
    accountId?: string
  ): Promise<ImportWalletResult> => {
    try {
      setLoading(true);
      setError(null);
      const result = await nearWalletService.importWallet(
        seedPhrase,
        accountId,
        userEmail ?? undefined
      );

      // Connect to the imported wallet so isConnected is true
      if (result.isCreated && result.accountId) {
        const account = await nearWalletService.connectWallet(result.accountId);

        // Persist BEFORE flipping isConnected in the UI — otherwise a fast
        // refresh right after import can catch the window where the app
        // shows "connected" but the seed phrase hasn't actually finished
        // writing to storage yet, so restoration on that refresh finds
        // nothing and the wallet appears to have vanished.
        await saveWalletState(result.accountId, seedPhrase, userEmail ?? undefined);

        setWalletState({
          isConnected: true,
          account,
        });
      }

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to import wallet";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const importWalletByPrivateKey = async (
    privateKey: string,
    accountId?: string
  ): Promise<ImportWalletResult> => {
    try {
      setLoading(true);
      setError(null);
      const result = await nearWalletService.importWalletByPrivateKey(
        privateKey,
        accountId,
        userEmail ?? undefined
      );

      // Connect to the imported wallet so isConnected is true
      if (result.isCreated && result.accountId) {
        const account = await nearWalletService.connectWallet(result.accountId);

        // Persist BEFORE flipping isConnected — same reasoning as importWallet
        // above. Private-key import has no seed phrase, so save the pointer
        // directly (mirrors saveWalletState's user-scoped pointer write).
        await saveAccountPointer(result.accountId, userEmail ?? undefined);

        setWalletState({
          isConnected: true,
          account,
        });
      }

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to import wallet";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const connectWallet = async (accountId: string): Promise<WalletAccount> => {
    try {
      setLoading(true);
      setError(null);
      const account = await nearWalletService.connectWallet(accountId);

      setWalletState({
        isConnected: true,
        account,
      });

      return account;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to connect wallet";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (accountId: string): Promise<WalletAccount> => {
    try {
      setLoading(true);
      setError(null);
      const account = await nearWalletService.signIn(accountId);

      setWalletState({
        isConnected: true,
        account,
      });

      return account;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to sign in";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  // Disconnects the wallet from this device — called both when the user
  // explicitly disconnects from Settings and whenever they sign out of
  // their Sheda account (see hooks/useShedaApi.ts's logout wrapper). This
  // clears the account pointer so the wallet does NOT silently reconnect
  // next launch or hand itself to whichever account signs in next; it does
  // NOT delete the underlying seed phrase/private key, so the same user can
  // still re-import their own wallet later without re-entering it manually
  // via, e.g., a future "reconnect" flow.
  const signOut = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      if (userEmail) {
        await secureStorageService.deletePrivateKey(`current_account_${userEmail}`);
        // Clear the Phase A record too. Leaving it behind would make the next
        // cold start paint a "found wallet on device" banner for an account
        // this user just signed out of.
        await clearWalletMetadata(userEmail);
      }
      // The wallet's Assets tab primes itself from a per-account cache on
      // mount; drop this account's entry so a signed-out user's property
      // portfolio can't flash on screen for whoever connects next.
      if (walletState.account?.accountId) {
        await clearCachedAssets(walletState.account.accountId, currentNetwork);
        // A remembered passphrase is a one-tap route into this account's cloud
        // backup. Leaving it behind on a shared device would hand that to
        // whoever signs in next. The remote backup is untouched — the
        // passphrase can simply be typed again.
        //
        // Guarded, and failure-tolerant, because being unable to sign out is a
        // worse outcome than a stale convenience cache.
        try {
          await secureStorageService.deleteBackupPassphrase?.(
            walletState.account.accountId
          );
        } catch (err) {
          console.warn("WalletContext: could not clear remembered passphrase:", err);
        }
      }
      // Drop the cached Firebase backup session — it is a bearer credential
      // for this user's backup collection and must not outlive their session.
      // Deliberately does NOT delete the remote backup: signing out is not a
      // request to destroy the user's only off-device copy of their wallet.
      await cloudBackup.signOutBackup();
      await nearWalletService.signOut();

      setWalletState({
        isConnected: false,
        account: null,
      });
      setLocalWalletMetadata(null);
      setHasCloudBackup(false);
      setReadiness("metadata");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to sign out";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Account operations
  const getAccountBalance = async (accountId: string): Promise<string> => {
    try {
      setError(null);
      return await nearWalletService.getAccountBalance(accountId);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get account balance";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  // These two are stable (useCallback with no changing inputs) on purpose.
  // Screens list them in their effect dependencies, and both set `error`,
  // which re-renders this provider. As plain functions they were new on
  // every render, so a failed read set `error`, the provider re-rendered,
  // the screen saw a "new" loader and ran it again, which failed again:
  // an endless loop that sent ~30 RPC requests a second until FastNEAR
  // blocked the browser, after which every contract call failed too.
  const getAccountTransactions = useCallback(async (
    accountId: string,
    limit?: number,
    forceRefresh?: boolean
  ): Promise<any[]> => {
    try {
      setError(null);
      return await nearWalletService.getAccountTransactions(
        accountId,
        limit,
        forceRefresh
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to get account transactions";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  const getTokenBalances = useCallback(async (accountId: string): Promise<any[]> => {
    try {
      setError(null);
      return await nearWalletService.getTokenBalances(accountId);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get token balances";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  const sendTransaction = async (
    accountId: string,
    receiverId: string,
    amount: string
  ): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      return await nearWalletService.sendTransaction(
        accountId,
        receiverId,
        amount
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send transaction";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const sendFungibleToken = async (
    accountId: string,
    receiverId: string,
    tokenContractId: string,
    amount: string,
    decimals: number = 6
  ): Promise<string> => {
    try {
      setLoading(true);
      setError(null);
      return await nearWalletService.sendFungibleToken(
        accountId,
        receiverId,
        tokenContractId,
        amount,
        decimals
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send token";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const accountExists = async (accountId: string): Promise<boolean> => {
    try {
      setError(null);
      return await nearWalletService.accountExists(accountId);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to check account existence";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  // Utility methods
  const getFaucetInfo = (): FaucetInfo | null => {
    return nearWalletService.getFaucetInfo();
  };

  const getAccountExplorerUrl = (accountId: string): string => {
    return nearWalletService.getAccountExplorerUrl(accountId);
  };

  const getWalletUrl = (): string => {
    return nearWalletService.getWalletUrl();
  };

  const formatNearAmount = (amount: string): string => {
    return nearWalletService.formatNearAmount(amount);
  };

  const parseNearAmount = (amount: string): string => {
    return nearWalletService.parseNearAmount(amount);
  };

  // State checks
  const isSignedIn = (): boolean => {
    return nearWalletService.isSignedIn();
  };

  const getAccountId = (): string | null => {
    return nearWalletService.getAccountId();
  };

  const getAccounts = (): WalletAccount[] => {
    return nearWalletService.getAccounts();
  };

  const clearAccounts = (): void => {
    nearWalletService.clearAccounts();
    setWalletState({
      isConnected: false,
      account: null,
    });
  };

  // Secure storage methods
  const getStoredSeedPhrase = async (
    accountId: string
  ): Promise<string | null> => {
    try {
      return await nearWalletService.getStoredSeedPhrase(accountId);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to retrieve stored seed phrase";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const getPrivateKeyFromStoredSeedPhrase = async (
    accountId: string
  ): Promise<string | null> => {
    try {
      return await nearWalletService.getPrivateKeyFromStoredSeedPhrase(
        accountId
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to retrieve private key from stored seed phrase";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteStoredSeedPhrase = async (accountId: string): Promise<void> => {
    try {
      await nearWalletService.deleteStoredSeedPhrase(accountId);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to delete stored seed phrase";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  // Show the PIN modal and resolve once the user completes or cancels it.
  const requestPinConfirmation = (
    accountId: string,
    mode: "verify" | "setup" | "change"
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setPinPrompt({
        visible: true,
        accountId,
        mode,
        resolve: (success: boolean) => {
          setPinPrompt(null);
          resolve(success);
        },
      });
    });
  };

  const hasTransactionPin = async (accountId: string): Promise<boolean> => {
    return secureStorageService.hasPin(accountId);
  };

  const promptTransactionPinSetup = async (accountId: string): Promise<boolean> => {
    return requestPinConfirmation(accountId, "setup");
  };

  const promptTransactionPinChange = async (accountId: string): Promise<boolean> => {
    return requestPinConfirmation(accountId, "change");
  };

  // Single choke point every transaction-signing call site uses instead of
  // getPrivateKeyFromStoredSeedPhrase directly. If the user hasn't opted
  // into a transaction PIN, this behaves exactly as before — no prompt, no
  // interruption. If they have, it gates the same key retrieval behind PIN
  // confirmation first.
  const getAuthorizedPrivateKey = async (
    accountId: string
  ): Promise<string | null> => {
    const pinConfigured = await secureStorageService.hasPin(accountId);
    if (pinConfigured) {
      const confirmed = await requestPinConfirmation(accountId, "verify");
      if (!confirmed) return null;
    }
    return getPrivateKeyFromStoredSeedPhrase(accountId);
  };

  const isBiometricAvailable = async (): Promise<boolean> => {
    try {
      return await nearWalletService.isBiometricAvailable();
    } catch (err) {
      console.error("Failed to check biometric availability:", err);
      return false;
    }
  };

  const getSupportedBiometryType = async (): Promise<string | null> => {
    try {
      return await nearWalletService.getSupportedBiometryType();
    } catch (err) {
      console.error("Failed to get supported biometry type:", err);
      return null;
    }
  };

  // ── Encrypted cloud backup ──────────────────────────────────────────────
  // Layering rule enforced here: the passphrase is used to produce ciphertext
  // and is then dropped. It is never stored, never put in state, and never
  // passed to anything in services/cloudBackup.ts.

  const isCloudBackupAvailable = isFirebaseConfigured() && FEATURE_CLOUD_BACKUP;

  const isWalletSafe = hasCloudBackup || Boolean(localWalletMetadata?.phraseSavedAt);

  const markPhraseSaved = async (forAccountId?: string): Promise<void> => {
    // Passed explicitly right after create/import, when state hasn't caught up.
    const accountId = forAccountId ?? walletState.account?.accountId ?? localWalletMetadata?.accountId;
    if (!userEmail || !accountId) return;
    const meta = await patchWalletMetadata(userEmail, { accountId, phraseSavedAt: Date.now() });
    setLocalWalletMetadata(meta);
  };

  const connectBackupAccount = async (googleIdToken: string): Promise<void> => {
    await cloudBackup.signInWithGoogleIdToken(googleIdToken);
  };

  /**
   * Encrypts this wallet's secret and uploads it.
   *
   * Prefers the seed phrase (restoring from one rebuilds the full wallet);
   * falls back to the raw private key for wallets imported that way.
   */
  const hasRememberedPassphrase = (accountId: string): Promise<boolean> =>
    secureStorageService.hasBackupPassphrase(accountId);

  const unlockBackupPassphrase = (accountId: string): Promise<string | null> =>
    secureStorageService.getBackupPassphrase(accountId);

  const forgetBackupPassphrase = (accountId: string): Promise<void> =>
    secureStorageService.deleteBackupPassphrase(accountId);

  const backupWalletToCloud = async (
    accountId: string,
    passphrase: string,
    opts: { remember?: boolean } = {}
  ): Promise<void> => {
    if (!isCloudBackupAvailable) {
      throw new cloudBackup.CloudBackupNotConfiguredError();
    }

    const seedPhrase = await secureStorageService.getSeedPhrase(accountId);
    const privateKey = seedPhrase
      ? null
      : await secureStorageService.getPrivateKey(accountId);
    const secret = seedPhrase ?? privateKey;
    if (!secret) {
      throw new Error(
        "No wallet key found on this device to back up. Import or create a wallet first."
      );
    }

    const envelope = await encryptSecret(secret, passphrase);
    await cloudBackup.backupWallet(envelope, {
      accountId,
      publicKey: walletState.account?.publicKey,
      network: currentNetwork,
      secretKind: seedPhrase ? "seedPhrase" : "privateKey",
    });

    if (userEmail) {
      const meta = await patchWalletMetadata(userEmail, {
        accountId,
        hasCloudBackup: true,
        lastBackupAt: Date.now(),
      });
      setLocalWalletMetadata(meta);
      await cloudBackup.setLocalBackupHint(userEmail, true);
    }
    setHasCloudBackup(true);

    // Only after the upload actually succeeded — remembering a passphrase for
    // a backup that does not exist would offer a one-tap unlock leading
    // nowhere.
    if (opts.remember) {
      try {
        await secureStorageService.saveBackupPassphrase(accountId, passphrase);
      } catch (error) {
        // The backup itself is safe; the convenience cache is not worth
        // failing it over.
        console.warn("WalletContext: could not remember passphrase:", error);
      }
    }
  };

  const listCloudBackups = async (): Promise<BackupRecord[]> => {
    if (!isCloudBackupAvailable) return [];
    return cloudBackup.listBackups();
  };

  /**
   * Downloads a backup, decrypts it ON THIS DEVICE, and imports the wallet.
   *
   * The order matters: nothing is written to local storage until the decrypt
   * succeeds, so a wrong passphrase leaves the device exactly as it was.
   */
  const restoreFromCloud = async (
    accountId: string,
    passphrase: string,
    emailOverride?: string
  ): Promise<WalletAccount> => {
    if (!isCloudBackupAvailable) {
      throw new cloudBackup.CloudBackupNotConfiguredError();
    }
    const email = emailOverride ?? userEmail;

    try {
      setLoading(true);
      setError(null);

      const record = await cloudBackup.restoreBackup(accountId);
      if (!record) {
        throw new Error("No backup found for that wallet.");
      }

      // Throws a clear "check your passphrase" on a bad key — see walletCrypto.
      const secret = await decryptSecret(record.envelope, passphrase);

      const imported =
        record.secretKind === "privateKey"
          ? await nearWalletService.importWalletByPrivateKey(
              secret,
              record.accountId
            )
          : await nearWalletService.importWallet(secret, record.accountId);

      if (!imported.isCreated) {
        throw new Error(
          "The restored key does not match an existing account on this network."
        );
      }

      if (record.secretKind === "seedPhrase") {
        await saveWalletState(record.accountId, secret, email ?? undefined);
      } else {
        await secureStorageService.savePrivateKey(record.accountId, secret);
        await saveAccountPointer(record.accountId, email ?? undefined);
      }

      const account = await nearWalletService.connectWallet(record.accountId);
      setWalletState({ isConnected: true, account });

      if (email) {
        const meta = await patchWalletMetadata(email, {
          accountId: record.accountId,
          publicKey: account.publicKey,
          authMethod: record.secretKind === "privateKey" ? "privateKey" : "seed",
          network: record.network ?? currentNetwork,
          hasCloudBackup: true,
          epoch: WALLET_EPOCH,
        });
        setLocalWalletMetadata(meta);
        await cloudBackup.setLocalBackupHint(email, true);
      }
      setHasCloudBackup(true);
      setReadiness("ready");

      console.log(`WalletContext: restored wallet ${record.accountId} from backup`);
      return account;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to restore backup";
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const value: WalletContextType = {
    // State
    walletState,
    currentNetwork,
    loading,
    readiness,
    hasLocalWallet: Boolean(localWalletMetadata?.accountId),
    localWalletMetadata,
    error,
    creationStep,

    // Preview
    getPreviewAccountId,

    // Network management
    setNetwork,
    getCurrentNetwork,

    // Wallet operations
    createWallet,
    createSubAccount,
    importWallet,
    importWalletByPrivateKey,
    connectWallet,
    signIn,
    signOut,

    // Account operations
    getAccountBalance,
    getAccountTransactions,
    getTokenBalances,
    sendTransaction,
    sendFungibleToken,
    accountExists,

    // Utility methods
    getFaucetInfo,
    getAccountExplorerUrl,
    getWalletUrl,
    formatNearAmount,
    parseNearAmount,

    // State checks
    isSignedIn,
    getAccountId,
    getAccounts,
    clearAccounts,

    // Secure storage methods
    getStoredSeedPhrase,
    getPrivateKeyFromStoredSeedPhrase,
    deleteStoredSeedPhrase,
    isBiometricAvailable,
    getSupportedBiometryType,

    // Transaction PIN
    getAuthorizedPrivateKey,
    hasTransactionPin,
    promptTransactionPinSetup,
    promptTransactionPinChange,

    // New methods for persistence
    saveWalletState,
    getStoredAccountId,
    hasStoredWallet,

    // Encrypted cloud backup
    isCloudBackupAvailable,
    connectBackupAccount,
    backupWallet: backupWalletToCloud,
    canUseBiometricUnlock,
    hasRememberedPassphrase,
    unlockBackupPassphrase,
    forgetBackupPassphrase,
    listCloudBackups,
    restoreFromCloud,
    hasCloudBackup,
    isWalletSafe,
    markPhraseSaved,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
      {pinPrompt && (
        <PinPromptModal
          visible={pinPrompt.visible}
          accountId={pinPrompt.accountId}
          mode={pinPrompt.mode}
          onDone={pinPrompt.resolve}
        />
      )}
    </WalletContext.Provider>
  );
};

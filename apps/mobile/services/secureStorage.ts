import * as Keychain from "react-native-keychain";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, NativeModules } from "react-native";
import * as Crypto from "expo-crypto";
import { webSecretStore } from "./webSecretStore";

export interface MigrationReport {
  /** Storage keys moved out of plaintext. Key NAMES only — never values. */
  migratedKeys: string[];
  /** Keys that could not be moved; they are left untouched, not deleted. */
  failedKeys: string[];
  ranAt: number;
}

export interface SecureStorageService {
  saveSeedPhrase: (accountId: string, seedPhrase: string) => Promise<void>;
  getSeedPhrase: (accountId: string) => Promise<string | null>;
  deleteSeedPhrase: (accountId: string) => Promise<void>;
  savePrivateKey: (accountId: string, privateKey: string) => Promise<void>;
  getPrivateKey: (accountId: string) => Promise<string | null>;
  deletePrivateKey: (accountId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  isBiometricAvailable: () => Promise<boolean>;
  getSupportedBiometryType: () => Promise<string | null>;
  savePin: (accountId: string, pin: string) => Promise<void>;
  verifyPin: (accountId: string, pin: string) => Promise<boolean>;
  hasPin: (accountId: string) => Promise<boolean>;
  deletePin: (accountId: string) => Promise<void>;
  migrateLegacyPlaintext: () => Promise<MigrationReport>;

  // ── Backup passphrase, remembered on this device ──────────────────────
  // Lets a returning user unlock cloud backup with Face ID instead of
  // retyping their recovery passphrase. See saveBackupPassphrase for the
  // threat-model reasoning.
  saveBackupPassphrase: (accountId: string, passphrase: string) => Promise<void>;
  getBackupPassphrase: (accountId: string) => Promise<string | null>;
  hasBackupPassphrase: (accountId: string) => Promise<boolean>;
  deleteBackupPassphrase: (accountId: string) => Promise<void>;
  canUseBiometricUnlock: () => Promise<boolean>;
}

class SecureStorageServiceImpl implements SecureStorageService {
  private readonly SEED_PHRASE_PREFIX = "seed_phrase_";
  private readonly PRIVATE_KEY_PREFIX = "private_key_";
  private readonly PIN_PREFIX = "tx_pin_";
  private readonly isWeb = Platform.OS === "web";
  private hasWarnedAsyncFallback = false;

  /** Set once the migration has run, so it costs nothing on later calls. */
  private migrationPromise: Promise<MigrationReport> | null = null;

  /**
   * True when secrets can be encrypted at rest on this web runtime.
   * False in SSR/prerender and in bare Jest, where IndexedDB and
   * crypto.subtle are both absent.
   */
  private get webEncryptedAvailable(): boolean {
    return this.isWeb && webSecretStore.available();
  }

  // Check if Keychain native module is available (not available in Expo Go)
  private get keychainAvailable(): boolean {
    try {
      return !this.isWeb && NativeModules.RNKeychainManager != null;
    } catch {
      return false;
    }
  }

  // Use AsyncStorage fallback when Keychain is not available
  private get useAsyncFallback(): boolean {
    return this.isWeb || !this.keychainAvailable;
  }

  /** Log a one-time message when falling back to AsyncStorage */
  private logAsyncFallback(): void {
    if (!this.hasWarnedAsyncFallback) {
      this.hasWarnedAsyncFallback = true;
      console.log(
        "SecureStorage: Using AsyncStorage fallback (Keychain not available). " +
        "This is expected on web/Expo Go."
      );
    }
  }

  /**
   * Save seed phrase securely using device keychain or AsyncStorage fallback for web/Expo Go
   */
  async saveSeedPhrase(accountId: string, seedPhrase: string): Promise<void> {
    try {
      const key = `${this.SEED_PHRASE_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        // Web: AES-GCM in IndexedDB under a non-extractable key. This used to
        // be a plaintext localStorage write — the single worst storage
        // decision in the old wallet.
        await webSecretStore.set(key, seedPhrase);
      } else if (this.useAsyncFallback) {
        this.logAsyncFallback();
        await AsyncStorage.setItem(key, seedPhrase);
      } else {
        // Use Keychain for mobile platforms
        // BIOMETRY_ANY_OR_DEVICE_PASSCODE allows PIN/passcode fallback
        // when biometrics (fingerprint/Face ID) are unavailable on the device
        const options: Keychain.SetOptions = {
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
        };

        await Keychain.setInternetCredentials(
          key,
          accountId,
          seedPhrase,
          options
        );
      }

      console.log(`SecureStorage: Seed phrase saved for account ${accountId}`);
    } catch (error) {
      console.error("SecureStorage: Failed to save seed phrase:", error);
      throw new Error(`Failed to save seed phrase: ${error}`);
    }
  }

  /**
   * Retrieve seed phrase from secure storage
   */
  async getSeedPhrase(accountId: string): Promise<string | null> {
    try {
      const key = `${this.SEED_PHRASE_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        const fromIdb = await webSecretStore.get(key);
        if (fromIdb) return fromIdb;
        // Fall through to the legacy localStorage location so a user who
        // stored a wallet before this change can still sign in. The migration
        // (migrateLegacyPlaintext) moves and erases it on the next run.
        return await AsyncStorage.getItem(key);
      } else if (this.useAsyncFallback) {
        return await AsyncStorage.getItem(key);
      } else {
        // Use Keychain for mobile platforms
        const credentials = await Keychain.getInternetCredentials(key);

        if (credentials && credentials.password) {
          console.log(
            `SecureStorage: Seed phrase retrieved for account ${accountId}`
          );
          return credentials.password;
        }
      }

      return null;
    } catch (error) {
      console.error("SecureStorage: Failed to retrieve seed phrase:", error);
      return null;
    }
  }

  /**
   * Delete seed phrase from secure storage
   */
  async deleteSeedPhrase(accountId: string): Promise<void> {
    try {
      const key = `${this.SEED_PHRASE_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        await webSecretStore.remove(key);
        // Also clear any pre-migration copy so "delete" really deletes.
        await AsyncStorage.removeItem(key);
      } else if (this.useAsyncFallback) {
        await AsyncStorage.removeItem(key);
      } else {
        // Use Keychain for mobile platforms
        await Keychain.resetInternetCredentials({ server: key });
      }

      console.log(
        `SecureStorage: Seed phrase deleted for account ${accountId}`
      );
    } catch (error) {
      console.error("SecureStorage: Failed to delete seed phrase:", error);
      throw new Error(`Failed to delete seed phrase: ${error}`);
    }
  }

  /**
   * Save private key securely using device keychain or AsyncStorage fallback for web/Expo Go
   */
  async savePrivateKey(accountId: string, privateKey: string): Promise<void> {
    try {
      const key = `${this.PRIVATE_KEY_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        await webSecretStore.set(key, privateKey);
      } else if (this.useAsyncFallback) {
        this.logAsyncFallback();
        await AsyncStorage.setItem(key, privateKey);
      } else {
        // Use Keychain for mobile platforms
        // BIOMETRY_ANY_OR_DEVICE_PASSCODE allows PIN/passcode fallback
        // when biometrics (fingerprint/Face ID) are unavailable on the device
        const options: Keychain.SetOptions = {
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
        };

        await Keychain.setInternetCredentials(
          key,
          accountId,
          privateKey,
          options
        );
      }

      console.log(`SecureStorage: Private key saved for account ${accountId}`);
    } catch (error) {
      console.error("SecureStorage: Failed to save private key:", error);
      throw new Error(`Failed to save private key: ${error}`);
    }
  }

  /**
   * Get private key from secure storage
   */
  async getPrivateKey(accountId: string): Promise<string | null> {
    try {
      const key = `${this.PRIVATE_KEY_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        const fromIdb = await webSecretStore.get(key);
        if (fromIdb) return fromIdb;
        return await AsyncStorage.getItem(key); // legacy location
      } else if (this.useAsyncFallback) {
        return await AsyncStorage.getItem(key);
      } else {
        // Use Keychain for mobile platforms
        const credentials = await Keychain.getInternetCredentials(key);
        if (credentials) {
          console.log(
            `SecureStorage: Private key retrieved for account ${accountId}`
          );
          return credentials.password;
        }
      }

      return null;
    } catch (error) {
      console.error("SecureStorage: Failed to retrieve private key:", error);
      return null;
    }
  }

  /**
   * Delete private key from secure storage
   */
  async deletePrivateKey(accountId: string): Promise<void> {
    try {
      const key = `${this.PRIVATE_KEY_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        await webSecretStore.remove(key);
        await AsyncStorage.removeItem(key); // pre-migration copy
      } else if (this.useAsyncFallback) {
        await AsyncStorage.removeItem(key);
      } else {
        // Use Keychain for mobile platforms
        await Keychain.resetInternetCredentials({ server: key });
      }

      console.log(
        `SecureStorage: Private key deleted for account ${accountId}`
      );
    } catch (error) {
      console.error("SecureStorage: Failed to delete private key:", error);
      throw new Error(`Failed to delete private key: ${error}`);
    }
  }

  /**
   * Clear all stored data
   */
  async clearAllData(): Promise<void> {
    try {
      // Scoped to this module's own keys. The previous implementation called
      // AsyncStorage.clear(), which wipes the WHOLE app — cached listings,
      // notification state, the signed-in session, everything — for a method
      // whose name promises only to clear wallet secrets. Keychain's
      // resetInternetCredentials({server:""}) was equally wrong in the other
      // direction: it targets a server named "" and so removed nothing at all.
      const keys = await AsyncStorage.getAllKeys();
      const mine = keys.filter((k) => this.isOwnedKey(k));
      if (mine.length) await AsyncStorage.multiRemove(mine);

      if (this.webEncryptedAvailable) {
        await Promise.all(mine.map((k) => webSecretStore.remove(k).catch(() => {})));
      } else if (!this.useAsyncFallback) {
        await Promise.all(
          mine.map((k) =>
            Keychain.resetInternetCredentials({ server: k }).catch(() => {})
          )
        );
      }

      console.log(`SecureStorage: cleared ${mine.length} wallet key(s)`);
    } catch (error) {
      console.error("SecureStorage: Failed to clear data:", error);
      throw new Error(`Failed to clear data: ${error}`);
    }
  }

  /** True for keys this service owns — used to scope bulk operations. */
  private isOwnedKey(key: string): boolean {
    return (
      key.startsWith(this.SEED_PHRASE_PREFIX) ||
      key.startsWith(this.PRIVATE_KEY_PREFIX) ||
      key.startsWith(this.PIN_PREFIX)
    );
  }

  // ── Legacy plaintext migration ─────────────────────────────────────────
  /**
   * Moves any plaintext secret still sitting in AsyncStorage into the
   * encrypted store, then erases the plaintext copy.
   *
   * WHAT THIS FIXES: before this change, web and Expo Go wrote seed phrases and
   * private keys to AsyncStorage verbatim — on web that is localStorage, i.e.
   * readable by any script on the origin and visible in devtools at a glance.
   * Existing installs still have those values sitting there; shipping the new
   * encrypted store alone would leave the old plaintext behind indefinitely.
   *
   * SAFETY PROPERTIES:
   *   - Copy-verify-then-delete. The plaintext is removed only after the value
   *     has been written to the encrypted store AND read back identical. A
   *     failed migration therefore loses nothing; it retries next launch.
   *   - Idempotent. Already-migrated keys are skipped, and the whole run is
   *     memoised per process.
   *   - No secret is logged. The report carries key NAMES only.
   *   - Native Keychain installs are already encrypted and are left untouched.
   */
  async migrateLegacyPlaintext(): Promise<MigrationReport> {
    if (this.migrationPromise) return this.migrationPromise;
    this.migrationPromise = this.runMigration();
    return this.migrationPromise;
  }

  private async runMigration(): Promise<MigrationReport> {
    const report: MigrationReport = {
      migratedKeys: [],
      failedKeys: [],
      ranAt: Date.now(),
    };

    // Only web has a plaintext store worth draining. On native without
    // Keychain (Expo Go) AsyncStorage is the only option available, so there
    // is nowhere better to move the value to — see the README's note on Expo
    // Go being a development-only configuration.
    if (!this.webEncryptedAvailable) return report;

    try {
      const keys = await AsyncStorage.getAllKeys();
      const legacy = keys.filter(
        (k) =>
          k.startsWith(this.SEED_PHRASE_PREFIX) ||
          k.startsWith(this.PRIVATE_KEY_PREFIX)
      );
      if (!legacy.length) return report;

      console.log(
        `SecureStorage: migrating ${legacy.length} plaintext key(s) to encrypted storage`
      );

      for (const key of legacy) {
        try {
          const value = await AsyncStorage.getItem(key);
          if (!value) continue;

          await webSecretStore.set(key, value);

          // Verify before destroying the only copy.
          const readBack = await webSecretStore.get(key);
          if (readBack !== value) {
            report.failedKeys.push(key);
            console.warn(
              `SecureStorage: migration verify failed for ${key} — plaintext left in place`
            );
            continue;
          }

          await AsyncStorage.removeItem(key);
          report.migratedKeys.push(key);
        } catch (error) {
          report.failedKeys.push(key);
          console.warn(`SecureStorage: migration failed for ${key}:`, error);
        }
      }

      console.log(
        `SecureStorage: migration complete — ${report.migratedKeys.length} moved, ${report.failedKeys.length} left in place`
      );
    } catch (error) {
      console.warn("SecureStorage: migration could not enumerate keys:", error);
    }

    return report;
  }

  /**
   * Check if biometric authentication is available
   */
  async isBiometricAvailable(): Promise<boolean> {
    try {
      if (this.useAsyncFallback) {
        // Web doesn't support biometric authentication
        return false;
      }

      const biometryType = await Keychain.getSupportedBiometryType();
      return biometryType !== null;
    } catch (error) {
      console.error(
        "SecureStorage: Failed to check biometric availability:",
        error
      );
      return false;
    }
  }

  /**
   * Get supported biometric type
   */
  async getSupportedBiometryType(): Promise<string | null> {
    try {
      if (this.useAsyncFallback) {
        // Web doesn't support biometric authentication
        return null;
      }

      return await Keychain.getSupportedBiometryType();
    } catch (error) {
      console.error(
        "SecureStorage: Failed to get supported biometry type:",
        error
      );
      return null;
    }
  }

  // ---- Transaction PIN ----
  // This is a UI confirmation gate, not encryption — the PIN's hash is
  // stored so we can verify a re-entered PIN matches, not to protect the
  // seed phrase itself (that's still gated by the OS Keychain on native;
  // on web there's no equivalent, which is the actual gap this closes).

  private async hashPin(pin: string, salt: string): Promise<string> {
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${salt}:${pin}`
    );
  }

  async savePin(accountId: string, pin: string): Promise<void> {
    try {
      const key = `${this.PIN_PREFIX}${accountId}`;
      const saltBytes = await Crypto.getRandomBytesAsync(16);
      const salt = Array.from(saltBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const hash = await this.hashPin(pin, salt);
      const record = JSON.stringify({ hash, salt });

      if (this.useAsyncFallback) {
        this.logAsyncFallback();
        await AsyncStorage.setItem(key, record);
      } else {
        const options: Keychain.SetOptions = {
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        };
        await Keychain.setInternetCredentials(key, accountId, record, options);
      }

      console.log(`SecureStorage: Transaction PIN saved for account ${accountId}`);
    } catch (error) {
      console.error("SecureStorage: Failed to save transaction PIN:", error);
      throw new Error(`Failed to save transaction PIN: ${error}`);
    }
  }

  async verifyPin(accountId: string, pin: string): Promise<boolean> {
    try {
      const key = `${this.PIN_PREFIX}${accountId}`;
      let record: string | null = null;

      if (this.useAsyncFallback) {
        record = await AsyncStorage.getItem(key);
      } else {
        const credentials = await Keychain.getInternetCredentials(key);
        record = credentials ? credentials.password : null;
      }

      if (!record) return false;

      const { hash, salt } = JSON.parse(record) as { hash: string; salt: string };
      const candidateHash = await this.hashPin(pin, salt);
      return candidateHash === hash;
    } catch (error) {
      console.error("SecureStorage: Failed to verify transaction PIN:", error);
      return false;
    }
  }

  async hasPin(accountId: string): Promise<boolean> {
    try {
      const key = `${this.PIN_PREFIX}${accountId}`;

      if (this.useAsyncFallback) {
        return (await AsyncStorage.getItem(key)) != null;
      }
      const credentials = await Keychain.getInternetCredentials(key);
      return !!credentials;
    } catch (error) {
      console.error("SecureStorage: Failed to check transaction PIN:", error);
      return false;
    }
  }

  async deletePin(accountId: string): Promise<void> {
    try {
      const key = `${this.PIN_PREFIX}${accountId}`;

      if (this.useAsyncFallback) {
        await AsyncStorage.removeItem(key);
      } else {
        await Keychain.resetInternetCredentials({ server: key });
      }

      console.log(`SecureStorage: Transaction PIN deleted for account ${accountId}`);
    } catch (error) {
      console.error("SecureStorage: Failed to delete transaction PIN:", error);
      throw new Error(`Failed to delete transaction PIN: ${error}`);
    }
  }

  // ── Backup passphrase, remembered on this device ───────────────────────
  //
  // WHY THIS IS SAFE TO STORE AT ALL:
  // The recovery passphrase exists to protect the backup blob sitting in
  // Firestore — its threat model is "someone obtains the ciphertext", not
  // "someone has the user's unlocked device". Anyone holding an unlocked
  // device already has the seed phrase itself in this same secure store, so
  // caching the passphrase beside it grants an attacker nothing they did not
  // already have. What it does buy is a returning user tapping Face ID
  // instead of retyping a long passphrase.
  //
  // WHAT IS STILL PROTECTED: the passphrase never leaves the device and is
  // never uploaded, so a Firestore compromise remains useless without it.
  // That property is unchanged by this cache.
  //
  // ON NATIVE the entry carries BIOMETRY_ANY_OR_DEVICE_PASSCODE, so the OS
  // itself gates the read — a biometric prompt is enforced by the keystore
  // rather than by a UI check this code could be tricked into skipping.
  //
  // ON WEB there is no secure enclave, so it lands in the same IndexedDB
  // store as the seed (AES-GCM under a non-extractable key). No user-presence
  // check is possible there, which is exactly why isBiometricUnlock() reports
  // false on web and the UI does not promise one.

  private readonly BACKUP_PASSPHRASE_PREFIX = "backup_passphrase_";

  /** True when reading a remembered passphrase will demand biometrics. */
  async canUseBiometricUnlock(): Promise<boolean> {
    if (this.isWeb || !this.keychainAvailable) return false;
    try {
      return (await Keychain.getSupportedBiometryType()) !== null;
    } catch {
      return false;
    }
  }

  async saveBackupPassphrase(
    accountId: string,
    passphrase: string
  ): Promise<void> {
    try {
      const key = `${this.BACKUP_PASSPHRASE_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        await webSecretStore.set(key, passphrase);
      } else if (this.useAsyncFallback) {
        this.logAsyncFallback();
        await AsyncStorage.setItem(key, passphrase);
      } else {
        await Keychain.setInternetCredentials(key, accountId, passphrase, {
          accessControl:
            Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
        });
      }

      // Account only — the passphrase itself is never logged.
      console.log(`SecureStorage: Backup passphrase remembered for ${accountId}`);
    } catch (error) {
      console.error("SecureStorage: Failed to remember backup passphrase:", error);
      throw new Error(`Failed to remember backup passphrase: ${error}`);
    }
  }

  /**
   * Reads the remembered passphrase. On native this triggers the OS biometric
   * prompt; a user who cancels gets null, not an exception, because declining
   * to authenticate is a normal outcome rather than an error.
   */
  async getBackupPassphrase(accountId: string): Promise<string | null> {
    try {
      const key = `${this.BACKUP_PASSPHRASE_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        return await webSecretStore.get(key);
      }
      if (this.useAsyncFallback) {
        return await AsyncStorage.getItem(key);
      }
      const credentials = await Keychain.getInternetCredentials(key);
      return credentials ? credentials.password : null;
    } catch (error) {
      // Includes the user cancelling the biometric prompt.
      console.log("SecureStorage: Backup passphrase not unlocked");
      return null;
    }
  }

  /**
   * Whether a passphrase is remembered, WITHOUT prompting for biometrics.
   *
   * Deliberately does not call getBackupPassphrase: the UI needs this on
   * render to decide whether to offer an unlock button, and probing with a
   * real read would throw a Face ID sheet at the user the instant the screen
   * appears, before they have asked for anything.
   */
  async hasBackupPassphrase(accountId: string): Promise<boolean> {
    try {
      const key = `${this.BACKUP_PASSPHRASE_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        return (await webSecretStore.get(key)) != null;
      }
      if (this.useAsyncFallback) {
        return (await AsyncStorage.getItem(key)) != null;
      }
      // hasInternetCredentials reports existence without decrypting, so no
      // biometric prompt is raised.
      const exists = await Keychain.hasInternetCredentials({ server: key });
      return !!exists;
    } catch {
      return false;
    }
  }

  async deleteBackupPassphrase(accountId: string): Promise<void> {
    try {
      const key = `${this.BACKUP_PASSPHRASE_PREFIX}${accountId}`;

      if (this.webEncryptedAvailable) {
        await webSecretStore.remove(key);
        await AsyncStorage.removeItem(key);
      } else if (this.useAsyncFallback) {
        await AsyncStorage.removeItem(key);
      } else {
        await Keychain.resetInternetCredentials({ server: key });
      }
      console.log(`SecureStorage: Backup passphrase forgotten for ${accountId}`);
    } catch (error) {
      console.error("SecureStorage: Failed to forget backup passphrase:", error);
    }
  }
}

// Create singleton instance
const secureStorageService = new SecureStorageServiceImpl();

/**
 * Test seam: clears the per-process memoisation so each case starts fresh.
 *
 * Exists so tests do not need jest.resetModules() to get a clean singleton.
 * Under jest-expo, resetModules re-triggers Expo's lazy `fetch` global, which
 * drags in the native module graph and fails in a suite that mocks
 * react-native down to just Platform.
 */
export const __resetForTests = (): void => {
  (secureStorageService as any).migrationPromise = null;
  (secureStorageService as any).hasWarnedAsyncFallback = false;
};

export default secureStorageService;

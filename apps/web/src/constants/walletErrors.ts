// ============================================================================
// Wallet Error Codes & Messages
// ============================================================================
// Every wallet-related error MUST use these codes so the support team
// can diagnose issues from a single copyable reference string.
// ============================================================================

export interface WalletError {
    code: string;
    title: string;
    message: string;
    /** If true, this error should trigger an internal ops alert */
    alertOps?: boolean;
}

// ── Error Catalogue ─────────────────────────────────────────────────────────

export const WALLET_ERRORS = {
    ERR_ACCOUNT_EXISTS: {
        code: "ERR_ACCOUNT_EXISTS",
        title: "Account Already Taken",
        message:
            'This wallet name is already taken. We\'ll try "{alternative}" — confirm to continue.',
    },

    ERR_RPC_TIMEOUT: {
        code: "ERR_RPC_TIMEOUT",
        title: "Network Timeout",
        message:
            "We're having trouble connecting to the NEAR network. Please check your connection and try again. If this persists, contact support with code: ERR_RPC_TIMEOUT.",
    },

    ERR_RPC_INVALID: {
        code: "ERR_RPC_INVALID",
        title: "Network Error",
        message:
            "Something went wrong connecting to the blockchain. Try again in a moment. Support code: ERR_RPC_INVALID.",
    },

    ERR_FUNDING_INSUFFICIENT: {
        code: "ERR_FUNDING_INSUFFICIENT",
        title: "Low Funds Notice",
        message:
            "Your wallet was created, but there may not be enough funds to cover gas or minting transactions right now. Please contact the Sheda support team so we can assist you. Support code: ERR_FUNDING_INSUFFICIENT.",
        alertOps: true,
    },

    ERR_TX_FAILED: {
        code: "ERR_TX_FAILED",
        title: "Transaction Failed",
        message:
            "Your wallet could not be created due to a blockchain error. Support code: ERR_TX_FAILED.",
    },

    ERR_AIRDROP_FAILED: {
        code: "ERR_AIRDROP_FAILED",
        title: "Airdrop Issue",
        message:
            "Your wallet was created! However, the token airdrop failed. Contact support with code: ERR_AIRDROP_FAILED and we'll send your tokens manually.",
    },

    ERR_PASSKEY_BACKUP: {
        code: "ERR_PASSKEY_BACKUP",
        title: "Backup Failed",
        message:
            "Wallet created successfully, but passkey backup failed. Please try backing up again in Settings > Wallet > Backup.",
    },

    ERR_PASSKEY_RECOVERY: {
        code: "ERR_PASSKEY_RECOVERY",
        title: "Recovery Failed",
        message:
            "We couldn't recover your wallet with that passkey. Make sure you're using the same Google account and device. Support code: ERR_PASSKEY_RECOVERY.",
    },

    ERR_IMPORT_MISMATCH: {
        code: "ERR_IMPORT_MISMATCH",
        title: "Key Mismatch",
        message:
            'This key doesn\'t match your Sheda wallet ({expected}). Please use the correct key.',
    },

    ERR_SECURE_STORAGE: {
        code: "ERR_SECURE_STORAGE",
        title: "Storage Error",
        message:
            "We couldn't securely save your key on this device. Please try again or use a different backup method. Support code: ERR_SECURE_STORAGE.",
    },

    ERR_OFFLINE: {
        code: "ERR_OFFLINE",
        title: "You're Offline",
        message:
            "You're offline. Please connect to the internet to create or access your wallet.",
    },

    ERR_CONFIG: {
        code: "ERR_CONFIG",
        title: "Configuration Error",
        message:
            "The wallet creation service is not configured. Please restart the app or contact support. Support code: ERR_CONFIG.",
    },

    ERR_INVALID_SEED: {
        code: "ERR_INVALID_SEED",
        title: "Invalid Seed Phrase",
        message:
            "The seed phrase you entered is not valid. Please check for typos and ensure you have the correct 12 or 24 words.",
    },

    ERR_INVALID_KEY: {
        code: "ERR_INVALID_KEY",
        title: "Invalid Private Key",
        message:
            'The private key you entered is not valid. It should start with "ed25519:" followed by the base58-encoded key.',
    },

    ERR_ACCOUNT_NOT_FOUND: {
        code: "ERR_ACCOUNT_NOT_FOUND",
        title: "Account Not Found",
        message:
            "The account was not found on the blockchain. Please verify your account ID is correct.",
    },
} as const;

export type WalletErrorCode = keyof typeof WALLET_ERRORS;

// ── Helper functions ────────────────────────────────────────────────────────

/**
 * Build a user-friendly error with interpolated values.
 * Example: buildWalletError("ERR_ACCOUNT_EXISTS", { alternative: "hamadex2.sheda.testnet" })
 */
export function buildWalletError(
    code: WalletErrorCode,
    replacements?: Record<string, string>
): WalletError {
    const template = WALLET_ERRORS[code];
    let message: string = template.message as string;

    if (replacements) {
        for (const [key, value] of Object.entries(replacements)) {
            message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value);
        }
    }

    return {
        code: template.code as string,
        title: template.title as string,
        message,
        alertOps: 'alertOps' in template ? (template as any).alertOps : undefined,
    };
}

/**
 * Classify a raw error string into one of the known wallet error codes.
 */
export function classifyWalletError(errorMessage: string): WalletErrorCode {
    const msg = errorMessage.toLowerCase();

    // ── Account-level errors ────────────────────────────────────────────────
    if (msg.includes("already exists") || msg.includes("already taken"))
        return "ERR_ACCOUNT_EXISTS";
    if (msg.includes("does not exist") || msg.includes("account not found"))
        return "ERR_ACCOUNT_NOT_FOUND";
    if (msg.includes("does not match") || msg.includes("mismatch"))
        return "ERR_IMPORT_MISMATCH";

    // ── Key / seed errors ───────────────────────────────────────────────────
    if (msg.includes("invalid seed") || msg.includes("invalid mnemonic"))
        return "ERR_INVALID_SEED";
    if (msg.includes("invalid private key"))
        return "ERR_INVALID_KEY";

    // ── Funding errors ──────────────────────────────────────────────────────
    if (msg.includes("insufficient") || msg.includes("not enough balance"))
        return "ERR_FUNDING_INSUFFICIENT";
    if (msg.includes("airdrop"))
        return "ERR_AIRDROP_FAILED";

    // ── Configuration errors ────────────────────────────────────────────────
    if (msg.includes("not configured") || msg.includes("key is missing") || msg.includes("not available right now"))
        return "ERR_CONFIG";

    // ── Storage errors ──────────────────────────────────────────────────────
    if (msg.includes("secure storage") || msg.includes("keychain"))
        return "ERR_SECURE_STORAGE";

    // ── Network / connectivity errors ───────────────────────────────────────
    // Check these broadly to cover iOS, Android, and web platform error strings
    if (
        msg.includes("offline") ||
        msg.includes("network request failed") ||  // React Native fetch
        msg.includes("failed to fetch") ||          // Web fetch API
        msg.includes("load failed") ||               // iOS WKWebView / Safari
        msg.includes("enetunreach") ||               // Android: no network route
        msg.includes("the internet connection appears to be offline") // iOS
    )
        return "ERR_OFFLINE";

    if (
        msg.includes("timeout") ||
        msg.includes("timed out") ||
        msg.includes("econnrefused") ||             // Connection refused
        msg.includes("econnreset") ||               // Connection reset
        msg.includes("enotfound") ||                // DNS lookup failed
        msg.includes("epipe") ||                    // Broken pipe
        msg.includes("socket hang up") ||
        msg.includes("aborted") ||
        msg.includes("rpc connection timeout") ||
        msg.includes("fetch failed") ||
        msg.includes("network error") ||
        msg.includes("cors") ||
        msg.includes("nsurlerrordomain") ||         // iOS NSURLErrorDomain
        msg.includes("502") || msg.includes("bad gateway") ||
        msg.includes("503") || msg.includes("service unavailable") ||
        msg.includes("504") || msg.includes("gateway timeout") ||
        msg.includes("unable to connect")
    )
        return "ERR_RPC_TIMEOUT";

    // ── Transaction errors ──────────────────────────────────────────────────
    if (msg.includes("transaction") || msg.includes("tx failed"))
        return "ERR_TX_FAILED";

    return "ERR_RPC_INVALID"; // Default fallback
}

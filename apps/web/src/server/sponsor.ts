import "server-only";

import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { KeyPair, KeyPairString, PublicKey } from "@near-js/crypto";
import { NEAR } from "@near-js/tokens";
import {
  FUNDING_ACCOUNTS,
  getRpcEndpoints,
  sanitizeUsername,
} from "@/config/walletConfig";
import { ACTIVE_NETWORK } from "@/config/near";

// ============================================================================
// Sponsored account creation, on the server.
// ============================================================================
// Sheda pays for a new user's branded account (alice.shedauser.testnet) from
// its funding account. In the Expo app the funding account's private key was
// compiled into the client, where anyone could extract it and drain the
// account. Here it is read from a server-only environment variable and never
// leaves this process. The browser asks; this module decides and signs.
// ============================================================================

const NETWORK = ACTIVE_NETWORK;

/** What a new account starts with, matching the mobile app. */
export const INITIAL_BALANCE_NEAR = NETWORK === "testnet" ? "1" : "0.1";

/** Spending the funding account to exactly zero bricks it; keep a margin. */
const RESERVE_NEAR = "0.05";

export type SponsorOutcome =
  | { ok: true; accountId: string; initialBalance: string }
  /** Nothing was written. The client may fall through to a free path. */
  | { ok: false; code: "unavailable" | "taken" | "invalid"; message: string }
  /** A write may have happened. The client must not fall through. */
  | { ok: false; code: "ambiguous"; message: string };

function fundingKey(): string | null {
  const key =
    NETWORK === "testnet"
      ? process.env.NEAR_TESTNET_FUNDING_PRIVATE_KEY
      : process.env.NEAR_MAINNET_FUNDING_PRIVATE_KEY;
  return key && key.startsWith("ed25519:") ? key : null;
}

function provider(): JsonRpcProvider {
  return new JsonRpcProvider({ url: getRpcEndpoints(NETWORK)[0].url });
}

async function accountExists(p: JsonRpcProvider, accountId: string): Promise<boolean> {
  try {
    await p.viewAccount(accountId);
    return true;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/does not exist|UNKNOWN_ACCOUNT|AccountDoesNotExist/i.test(msg)) return false;
    throw e;
  }
}

/**
 * Only names Sheda issues: a sanitized label directly under the funding
 * account. Anything else would let a caller spend Sheda's NEAR creating
 * accounts of their choosing.
 */
export function isSponsorableAccountId(accountId: string): boolean {
  const suffix = FUNDING_ACCOUNTS[NETWORK].walletSuffix;
  if (!accountId.endsWith(suffix)) return false;
  const label = accountId.slice(0, -suffix.length);
  return label.length >= 2 && label === sanitizeUsername(label) && !label.includes(".");
}

export async function sponsorAccount(
  accountId: string,
  publicKey: string
): Promise<SponsorOutcome> {
  if (!isSponsorableAccountId(accountId)) {
    return { ok: false, code: "invalid", message: "That account name can't be sponsored." };
  }
  let pk: PublicKey;
  try {
    pk = PublicKey.fromString(publicKey);
  } catch {
    return { ok: false, code: "invalid", message: "That public key isn't valid." };
  }

  const key = fundingKey();
  if (!key) {
    return {
      ok: false,
      code: "unavailable",
      message: "Sheda has no funding account configured for this network.",
    };
  }

  const p = provider();
  const fundingId = FUNDING_ACCOUNTS[NETWORK].accountId;

  try {
    if (await accountExists(p, accountId)) {
      return { ok: false, code: "taken", message: "That account name is already taken." };
    }
    const state: any = await p.viewAccount(fundingId);
    const required =
      BigInt(NEAR.toUnits(INITIAL_BALANCE_NEAR)) + BigInt(NEAR.toUnits(RESERVE_NEAR));
    if (BigInt(state?.amount ?? 0) < required) {
      return { ok: false, code: "unavailable", message: "Sheda's funding account is out of NEAR." };
    }
  } catch {
    // Reads failed: nothing has been written yet, so falling through is safe.
    return {
      ok: false,
      code: "unavailable",
      message: "Sheda couldn't fund a new account just now.",
    };
  }

  const funding = new Account(
    fundingId,
    p,
    new KeyPairSigner(KeyPair.fromString(key as KeyPairString))
  );

  try {
    await funding.createAccount(accountId, pk, NEAR.toUnits(INITIAL_BALANCE_NEAR));
    return { ok: true, accountId, initialBalance: INITIAL_BALANCE_NEAR };
  } catch (e: any) {
    // Once the transaction is signed and sent, a failure does not prove the
    // account was not created. Check before telling the client it is safe to
    // try another path, or the user ends up with two wallets.
    try {
      if (await accountExists(p, accountId)) {
        return { ok: true, accountId, initialBalance: INITIAL_BALANCE_NEAR };
      }
      return {
        ok: false,
        code: "unavailable",
        message: "Sheda couldn't fund a new account just now.",
      };
    } catch {
      return {
        ok: false,
        code: "ambiguous",
        message: `Account creation may or may not have gone through: ${e?.message ?? e}`,
      };
    }
  }
}

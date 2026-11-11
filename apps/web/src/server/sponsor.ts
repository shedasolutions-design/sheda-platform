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

/**
 * Read the two facts sponsorship needs, trying each RPC endpoint in turn.
 *
 * This used to pin every call to `getRpcEndpoints(NETWORK)[0]`. The public
 * endpoints are shared and rate-limited; when the first one throttled, signup
 * reported "Sheda couldn't fund a new account just now" while the second
 * endpoint was healthy the whole time. Sheda's server is not subject to the
 * browser's CORS constraint, so it can simply move to the next endpoint.
 *
 * Returns the provider that answered as well as the facts, so the write that
 * follows goes to an endpoint we already know is reachable.
 */
async function readSponsorFacts(
  accountId: string,
  fundingId: string
): Promise<
  | { ok: true; provider: JsonRpcProvider; exists: boolean; fundingAmount: bigint }
  | { ok: false }
> {
  let lastError: unknown;
  for (const endpoint of getRpcEndpoints(NETWORK)) {
    const p = new JsonRpcProvider({ url: endpoint.url });
    try {
      // Independent reads: issuing them together keeps the slow public
      // endpoints from costing two round trips in series.
      const [exists, state] = await Promise.all([
        accountExists(p, accountId),
        p.viewAccount(fundingId),
      ]);
      return {
        ok: true,
        provider: p,
        exists,
        fundingAmount: BigInt(state?.amount ?? 0),
      };
    } catch (error) {
      lastError = error;
      console.warn(
        `Sheda sponsor: ${endpoint.label} read failed, trying next endpoint:`,
        error
      );
    }
  }
  if (lastError) console.warn("Sheda sponsor: every RPC endpoint failed to read:", lastError);
  return { ok: false };
}

async function accountExists(p: JsonRpcProvider, accountId: string): Promise<boolean> {
  try {
    await p.viewAccount(accountId);
    return true;
  } catch (e: any) {
    // The library says "doesn't exist" and puts AccountDoesNotExist in
    // `type`, not the message. Missing that made every new name look like
    // an RPC failure, so no new account could be funded.
    const msg = `${e?.type ?? ""} ${e?.name ?? ""} ${e?.message ?? e}`;
    if (/does not exist|doesn't exist|UNKNOWN_ACCOUNT|AccountDoesNotExist/i.test(msg)) return false;
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

  const fundingId = FUNDING_ACCOUNTS[NETWORK].accountId;
  const facts = await readSponsorFacts(accountId, fundingId);
  if (!facts.ok) {
    // Reads failed everywhere: nothing has been written yet, so falling
    // through to the free path is safe.
    return {
      ok: false,
      code: "unavailable",
      message: "Sheda couldn't fund a new account just now.",
    };
  }
  if (facts.exists) {
    return { ok: false, code: "taken", message: "That account name is already taken." };
  }
  const required =
    BigInt(NEAR.toUnits(INITIAL_BALANCE_NEAR)) + BigInt(NEAR.toUnits(RESERVE_NEAR));
  if (facts.fundingAmount < required) {
    return { ok: false, code: "unavailable", message: "Sheda's funding account is out of NEAR." };
  }

  const p = facts.provider;
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

/**
 * Sheda Collections configuration.
 *
 * Collections lets many people fund one building and own a share of the rent
 * it earns. It runs on three things the marketplace already has, and two it
 * does not.
 *
 * Already there: the marketplace contract, which never asks whether the
 * account owning a property NFT belongs to a person, so a vault can be the
 * landlord without the marketplace changing at all. The stablecoin. The
 * wallet.
 *
 * Both of the others are now deployed on testnet: the raise contract, which
 * holds the escrow and the phase schedule, and the stake registry, which
 * holds what a builder has put behind their promises.
 *
 * An empty id is still not an error and must never be treated as one. It
 * means that part of Collections is not live, and the screens say so rather
 * than spinning for something that is never going to arrive. Mainnet is
 * empty for exactly that reason: none of this has been audited, and an id
 * there would be a claim that it had.
 */

import { ACTIVE_NETWORK, CONTRACT_ID } from "./near";

export const COLLECTIONS_CONTRACTS = {
  testnet: {
    /**
     * Escrow, the phase schedule and the objection window.
     *
     * v4, deployed 2026-11-12, built with the `testnet` feature (holders'
     * objection window of 3 minutes instead of 7 days, so the whole flow
     * can be tested in one sitting). Owner and treasury are
     * sheda-council.testnet, a 2-of-3 multisig of sheda-signer-a/b/c, so
     * no single key can open raises, link vaults or declare a stall. A
     * frozen or stalled raise lets every investor reclaim their share of
     * the unpaid escrow and of the builder's cover. Pays in
     * usdc.fakes.testnet. Flat vaults: sheda-v4-pgt-t2/t3.testnet and
     * sheda-v4-lgf-f1/f2.testnet, each dividing rent over all 10,000 shares
     * and listed on market-v2.shedauser.testnet (v3 pointed at the old
     * marketplace, whose key was lost).
     */
    raise: "sheda-raise-v4.testnet",
    /**
     * Builder and manager stake, per profile. v4, controller
     * sheda-raise-v4.testnet, owner the council, stablecoin usdc.fakes.testnet.
     *
     * Its controller is the raise contract, which is what lets a stalled
     * project slash the cover behind it and stops anything else reaching a
     * builder's stake.
     */
    stakeRegistry: "sheda-stake-v4.testnet",
  },
  // Deliberately empty. None of this has been audited, and an id here
  // would be a claim that it had.
  mainnet: {
    raise: "",
    stakeRegistry: "",
  },
} as const;

/**
 * An override for a deployment that has not been promoted into the table
 * above yet.
 *
 * Deploying a contract is a separate act from shipping the web app, and
 * the person doing it should not have to edit a source file and wait for a
 * rebuild to point the demo at it. Empty or unset falls back to the table,
 * so local development and a plain `next build` behave exactly as before.
 */
const override = (value: string | undefined): string => value?.trim() || "";

export const RAISE_CONTRACT_ID =
  override(process.env.NEXT_PUBLIC_RAISE_CONTRACT_ID) ||
  COLLECTIONS_CONTRACTS[ACTIVE_NETWORK].raise;
export const STAKE_REGISTRY_ID =
  override(process.env.NEXT_PUBLIC_STAKE_REGISTRY_ID) ||
  COLLECTIONS_CONTRACTS[ACTIVE_NETWORK].stakeRegistry;

/** The marketplace a vault lists its unit on. The same one the app uses. */
export const COLLECTIONS_MARKETPLACE_ID = CONTRACT_ID;

/**
 * Whether a given piece of Collections can do anything yet.
 *
 * Checked at the point of use rather than once at startup, because the two
 * contracts arrive separately: browsing raises and claiming rent from a
 * vault will work before the stake registry exists.
 */
export const hasRaiseContract = (): boolean => RAISE_CONTRACT_ID.length > 0;
export const hasStakeRegistry = (): boolean => STAKE_REGISTRY_ID.length > 0;

/**
 * Gas, in TGas.
 *
 * Each of these crosses contracts and so has to carry enough for the
 * callback as well as the call. `claim` is the largest because it reads the
 * token balance, credits the accumulator and then transfers, which is three
 * hops before anything returns.
 */
export const COLLECTIONS_GAS = {
  CLAIM: 100n,
  CLAIM_SHARES: 100n,
  SYNC_INCOME: 80n,
  FT_TRANSFER_CALL: 100n,
  STAKE_WITHDRAW: 50n,
  MANAGER_ACTION: 80n,
  REDEEM: 100n,
} as const;

/** TGas to the yoctoNEAR a functionCall expects. */
export const tgas = (amount: bigint): bigint => amount * 1_000_000_000_000n;

/**
 * One yoctoNEAR, attached to every state-changing call.
 *
 * NEP-141 requires it on transfers so that a function-call access key
 * cannot move someone's tokens without a full-access signature. The vault
 * and the registry follow the same convention for their own privileged
 * methods.
 */
export const ONE_YOCTO = 1n;
export const NO_DEPOSIT = 0n;

/**
 * Shares in a vault are whole units and a unit divides into this many.
 *
 * Fixed rather than per vault so that a share is the same fraction
 * everywhere, which is what lets the app talk about "1.39% of the unit"
 * without first asking the chain what the denominator is.
 */
export const SHARES_PER_UNIT = 10_000n;

/**
 * Whether the deployed raise contract lets an investor take money out of a
 * round that is still filling. The v4 contract does not; v5 does (except in
 * a round's last 7 days). Screens only offer or mention it when true, so the
 * app never promises what the contract cannot do.
 */
export const RAISE_CAN_WITHDRAW = process.env.NEXT_PUBLIC_RAISE_CAN_WITHDRAW === "true";

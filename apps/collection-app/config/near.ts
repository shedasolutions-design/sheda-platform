import Constants from "expo-constants";

/**
 * Everything environment-specific, in one place.
 *
 * The same values the rental app uses, deliberately: a vault is only useful
 * if it is letting units through the marketplace that already exists, and
 * rent has to arrive in the coin that marketplace pays in.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

export const NETWORK = extra.network ?? "testnet";

/** The deployed rental marketplace. Vaults own property inside it. */
export const MARKETPLACE = extra.marketplaceContract ?? "market.shedauser.testnet";

/** The coin rent arrives in. One per vault, matched to the raise. */
export const STABLECOIN = extra.stablecoin ?? "usdt.fakes.testnet";

/**
 * FastNEAR. `rpc.testnet.near.org` is deprecated and rate-limits hard enough
 * that its failures read as contract bugs, so it is deliberately not here.
 */
export const RPC_ENDPOINTS =
  NETWORK === "mainnet"
    ? ["https://free.rpc.fastnear.com", "https://rpc.shitzuapes.xyz"]
    : ["https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"];

export const EXPLORER =
  NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

/** Atomic units per whole stablecoin. USDT and USDC both use six. */
export const STABLECOIN_DECIMALS = 6;

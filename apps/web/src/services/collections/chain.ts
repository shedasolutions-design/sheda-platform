/**
 * Reading and signing against the Collections contracts.
 *
 * Everything goes through `nearContractService`, which already owns the
 * endpoint failover, the view cache, the retry rules and the duplicate-write
 * suppression the marketplace needed. A second RPC path beside it would be a
 * second place to get those wrong, and they are the parts that decide
 * whether a holder's claim is submitted once or twice.
 *
 * Reads are shaped to match the contract's own return types, so when the
 * raise contract ships nothing here has to be reinterpreted.
 */

import nearContractService from "@/services/nearContract";
import {
  COLLECTIONS_GAS,
  NO_DEPOSIT,
  ONE_YOCTO,
  RAISE_CONTRACT_ID,
  STAKE_REGISTRY_ID,
  hasRaiseContract,
  hasStakeRegistry,
  tgas,
} from "@/config/collections";
import type { ContractCallResult } from "@/types/contract";

// ---- shapes the contracts return -------------------------------------------

/** Where the unit NFT is, as the vault reports it. */
export type Custody =
  | "AwaitingUnit"
  | { Held: { token_id: string } }
  | { Redeemed: { to: string } };

export interface VaultInfo {
  name: string;
  symbol: string;
  marketplace: string;
  property_id: string;
  stablecoin: string;
  manager: string;
  total_supply: string;
  supply_frozen: boolean;
  manager_bps: number;
  reserve_bps: number;
  platform_bps: number;
  reserve: string;
  acc_per_share: string;
  last_accounted: string;
  custody: Custody;
}

export interface Holding {
  vaultId: string;
  info: VaultInfo;
  balance: string;
  claimable: string;
}

/**
 * What one account put into one flat, and what it is still owed in shares.
 *
 * Two different questions rather than one, because the answer after a
 * claim is not "nothing happened". The commitment stays on chain as the
 * record of what was paid; `sharesOwed` falls to zero once the vault has
 * minted, so the screen can tell "claimed" apart from "never committed".
 */
export interface UnitPosition {
  committedAtomic: string;
  sharesOwed: string;
}

/** Mirrors the stake registry's ProfileView. */
export interface StakeProfile {
  total: string;
  allocated: string;
  free: string;
  slashed_total: string;
  slash_count: number;
}

export type CustodyState = "awaiting" | "held" | "redeemed";

export function custodyState(custody: Custody): CustodyState {
  if (custody === "AwaitingUnit") return "awaiting";
  if (typeof custody === "object" && "Redeemed" in custody) return "redeemed";
  return "held";
}

/**
 * Thrown when a piece of Collections has no contract deployed yet.
 *
 * A distinct type rather than a generic failure because the screens treat
 * the two completely differently: an unreachable network is worth retrying
 * and a contract that does not exist is not, and showing a spinner for the
 * second is how an app waits forever for something that is never coming.
 */
export class NotDeployedError extends Error {
  constructor(what: string) {
    super(`${what} is not deployed yet.`);
    this.name = "NotDeployedError";
  }
}

// ---- vault reads -----------------------------------------------------------

export async function getVaultInfo(vaultId: string): Promise<VaultInfo> {
  return nearContractService.viewOn<VaultInfo>(vaultId, "get_info", {});
}

export async function getShareBalance(
  vaultId: string,
  accountId: string
): Promise<string> {
  return nearContractService.viewOn<string>(vaultId, "ft_balance_of", {
    account_id: accountId,
  });
}

/**
 * What the vault says is owed, settled and accrued, right now.
 *
 * Always read from the chain before moving money rather than recomputed
 * locally. `money.ts` can reproduce the arithmetic for display between
 * syncs, but income credited since the last read only exists here.
 */
export async function getClaimable(
  vaultId: string,
  accountId: string
): Promise<string> {
  return nearContractService.viewOn<string>(vaultId, "claimable", {
    account_id: accountId,
  });
}

/**
 * What one account is owed in a flat, before it has claimed.
 *
 * `shares_owed` is the contract's own arithmetic, so the figure shown is
 * what a claim would mint rather than a second calculation that can round
 * differently. The commitment is read alongside it because a claimed
 * position still has a commitment and no shares owed, which is how the
 * screen distinguishes "already claimed" from "never invested".
 *
 * The live v1 raise contract predates both views. Callers that see a
 * missing method should treat the position as unavailable, not as zero.
 */
export async function getUnitPosition(
  projectSlug: string,
  unitCode: string,
  accountId: string
): Promise<UnitPosition> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");

  const [committed, shares] = await Promise.all([
    nearContractService.viewOn<string>(RAISE_CONTRACT_ID, "get_commitment", {
      project_id: projectSlug,
      account_id: accountId,
      unit: unitCode,
    }),
    nearContractService.viewOn<string>(RAISE_CONTRACT_ID, "shares_owed", {
      project_id: projectSlug,
      unit: unitCode,
      account_id: accountId,
    }),
  ]);

  return {
    committedAtomic: String(committed ?? "0"),
    sharesOwed: String(shares ?? "0"),
  };
}

export async function getHolding(
  vaultId: string,
  accountId: string
): Promise<Holding> {
  const [info, balance, claimable] = await Promise.all([
    getVaultInfo(vaultId),
    getShareBalance(vaultId, accountId),
    getClaimable(vaultId, accountId),
  ]);
  return { vaultId, info, balance, claimable };
}

/**
 * Every holding an account has across the vaults it is given.
 *
 * Partial failure is reported rather than swallowed. A holding missing
 * from this list because one read timed out looks exactly like a holding
 * that no longer exists, and that is not a thing to leave a holder
 * guessing about.
 */
export async function getHoldings(
  vaultIds: string[],
  accountId: string
): Promise<{ holdings: Holding[]; failed: string[] }> {
  const results = await Promise.allSettled(
    vaultIds.map((id) => getHolding(id, accountId))
  );

  const holdings: Holding[] = [];
  const failed: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      if (BigInt(result.value.balance || "0") > 0n) holdings.push(result.value);
    } else {
      failed.push(vaultIds[i]);
    }
  });
  return { holdings, failed };
}

// ---- vault writes ----------------------------------------------------------

/**
 * Take the rent owed on one vault.
 *
 * Deduped on the vault rather than the whole call, so two taps on Claim are
 * one instruction while claiming from two vaults stays two.
 */
export async function claim(
  accountId: string,
  privateKey: string,
  vaultId: string
): Promise<ContractCallResult<void>> {
  return nearContractService.callOn(accountId, privateKey, {
    contractId: vaultId,
    methodName: "claim",
    gas: tgas(COLLECTIONS_GAS.CLAIM),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `claim:${accountId}:${vaultId}`,
  });
}

/**
 * Ask a vault to go and look for rent that arrived without telling it.
 *
 * The marketplace pays landlords with a plain `ft_transfer`, which notifies
 * nobody, so money lands in a vault silently. Open to anyone on purpose: if
 * this needed the manager, a manager who stopped calling it would freeze
 * every holder out of their own rent.
 */
export async function syncIncome(
  accountId: string,
  privateKey: string,
  vaultId: string
): Promise<ContractCallResult<void>> {
  return nearContractService.callOn(accountId, privateKey, {
    contractId: vaultId,
    methodName: "sync_income",
    gas: tgas(COLLECTIONS_GAS.SYNC_INCOME),
    attachedDeposit: NO_DEPOSIT,
    dedupeKey: `sync:${vaultId}`,
  });
}

/** Move shares to someone else. */
export async function transferShares(
  accountId: string,
  privateKey: string,
  vaultId: string,
  receiverId: string,
  amount: string,
  memo?: string
): Promise<ContractCallResult<void>> {
  return nearContractService.callOn(accountId, privateKey, {
    contractId: vaultId,
    methodName: "ft_transfer",
    args: { receiver_id: receiverId, amount, memo: memo ?? null },
    gas: tgas(COLLECTIONS_GAS.FT_TRANSFER_CALL),
    attachedDeposit: ONE_YOCTO,
  });
}

// ---- committing to a raise -------------------------------------------------

/**
 * Put money into a raise.
 *
 * Sent as `ft_transfer_call` on the stablecoin rather than a transfer
 * followed by a notification. The transfer and the credit then happen in
 * one transaction and cannot come apart, which matters because the failure
 * in between is money in an escrow account with no record of whose it is.
 *
 * `msg` tells the raise contract which project and unit this is for. The
 * escrow is a separate account from any vault on purpose: a share purchase
 * arriving at a vault's own balance would be distributed as rent.
 */
export async function commitToRaise(
  accountId: string,
  privateKey: string,
  params: {
    stablecoin: string;
    escrowAccountId: string;
    amountAtomic: string;
    projectSlug: string;
    unitCode: string;
  }
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");

  return nearContractService.callOn(accountId, privateKey, {
    contractId: params.stablecoin,
    methodName: "ft_transfer_call",
    args: {
      receiver_id: params.escrowAccountId,
      amount: params.amountAtomic,
      memo: null,
      msg: JSON.stringify({ project: params.projectSlug, unit: params.unitCode }),
    },
    gas: tgas(COLLECTIONS_GAS.FT_TRANSFER_CALL),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `commit:${accountId}:${params.projectSlug}:${params.unitCode}:${params.amountAtomic}`,
  });
}

// ---- stake registry --------------------------------------------------------

export async function getStakeProfile(accountId: string): Promise<StakeProfile> {
  if (!hasStakeRegistry()) throw new NotDeployedError("The stake registry");
  return nearContractService.viewOn<StakeProfile>(STAKE_REGISTRY_ID, "get_profile", {
    account_id: accountId,
  });
}

/**
 * Cover a builder has posted for one project, in basis points of its target.
 *
 * Read from the registry rather than divided in the app, so the figure on a
 * project card is the figure the chain would actually pay out.
 */
export async function getCoverBps(
  projectSlug: string,
  accountId: string,
  targetAtomic: string
): Promise<number> {
  if (!hasStakeRegistry()) throw new NotDeployedError("The stake registry");
  return nearContractService.viewOn<number>(STAKE_REGISTRY_ID, "cover_bps", {
    project_id: projectSlug,
    account_id: accountId,
    target: targetAtomic,
  });
}

/** Add stake, through the stablecoin so deposit and credit are one step. */
export async function depositStake(
  accountId: string,
  privateKey: string,
  stablecoin: string,
  amountAtomic: string
): Promise<ContractCallResult<void>> {
  if (!hasStakeRegistry()) throw new NotDeployedError("The stake registry");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: stablecoin,
    methodName: "ft_transfer_call",
    args: {
      receiver_id: STAKE_REGISTRY_ID,
      amount: amountAtomic,
      memo: null,
      msg: "",
    },
    gas: tgas(COLLECTIONS_GAS.FT_TRANSFER_CALL),
    attachedDeposit: ONE_YOCTO,
  });
}

/** Take back stake nothing is relying on. The registry refuses the rest. */
export async function withdrawStake(
  accountId: string,
  privateKey: string,
  amountAtomic: string
): Promise<ContractCallResult<void>> {
  if (!hasStakeRegistry()) throw new NotDeployedError("The stake registry");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: STAKE_REGISTRY_ID,
    methodName: "withdraw",
    args: { amount: amountAtomic },
    gas: tgas(COLLECTIONS_GAS.STAKE_WITHDRAW),
    attachedDeposit: ONE_YOCTO,
  });
}

// ---- raise contract --------------------------------------------------------

/** Tell the raise a phase is finished and ask for it to be inspected. */
export async function requestInspection(
  accountId: string,
  privateKey: string,
  projectSlug: string,
  phaseIndex: number
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "request_inspection",
    args: { project_id: projectSlug, phase: phaseIndex },
    gas: tgas(COLLECTIONS_GAS.MANAGER_ACTION),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `inspect:${projectSlug}:${phaseIndex}`,
  });
}

/**
 * Turn a commitment into shares once the raise has funded.
 *
 * The vault address is not passed in. The raise contract remembers where
 * each flat's vault was deployed and checks that the caller committed to
 * that flat; letting the app name the vault would let it name someone
 * else's. Deduped on the position because a double tap must not become a
 * second mint attempt after the first one has marked the position claimed.
 */
export async function claimShares(
  accountId: string,
  privateKey: string,
  projectSlug: string,
  unitCode: string
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "claim_shares",
    args: { project_id: projectSlug, unit: unitCode },
    gas: tgas(COLLECTIONS_GAS.CLAIM_SHARES),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `claim-shares:${accountId}:${projectSlug}:${unitCode}`,
  });
}

/**
 * The property manager signing off a finished phase.
 *
 * The contract refuses this from the builder and from anyone else, so the
 * screen's check is a courtesy rather than the rule. Sending it anyway
 * would produce a rejected transaction and no explanation the holder can
 * act on, which is why the button only appears for the manager's account.
 */
export async function attestPhase(
  accountId: string,
  privateKey: string,
  projectSlug: string,
  phaseIndex: number
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "attest",
    args: { project_id: projectSlug, phase: phaseIndex },
    gas: tgas(COLLECTIONS_GAS.MANAGER_ACTION),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `attest:${accountId}:${projectSlug}:${phaseIndex}`,
  });
}

/** A holder objecting to a release inside the seven day window. */
export async function objectToRelease(
  accountId: string,
  privateKey: string,
  projectSlug: string,
  phaseIndex: number
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "object",
    args: { project_id: projectSlug, phase: phaseIndex },
    gas: tgas(COLLECTIONS_GAS.MANAGER_ACTION),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `object:${accountId}:${projectSlug}:${phaseIndex}`,
  });
}

/** The raise as the contract has it: status, raised and target (atomic). */
export async function getRaiseChainState(
  projectSlug: string
): Promise<{ status: string; raised: string; target: string } | null> {
  if (!hasRaiseContract()) return null;
  const project = await nearContractService.viewOn<{
    status: string;
    raised: string | number;
    target: string | number;
  } | null>(RAISE_CONTRACT_ID, "get_project", { project_id: projectSlug });
  return project ? { status: project.status, raised: String(project.raised), target: String(project.target) } : null;
}

/**
 * Close a raise that is full (or past its deadline). Anyone may.
 *
 * Shares can only be claimed from a raise the contract calls Funded, and
 * only close_raise makes it so. Nothing in the app called it, so a raise
 * that reached its target stayed Open and nobody could claim.
 */
export async function closeRaise(
  accountId: string,
  privateKey: string,
  projectSlug: string
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "close_raise",
    args: { project_id: projectSlug },
    gas: tgas(COLLECTIONS_GAS.MANAGER_ACTION),
    attachedDeposit: BigInt(0),
    dedupeKey: `close-raise:${projectSlug}`,
  });
}

/**
 * Shares sold per unit, read from the raise contract.
 *
 * The unit screen used the backend's mirror (collection_unit.shares_sold),
 * which nothing updates when someone invests: a fully funded raise showed
 * "0% funded" on both flats. The contract's get_project carries each unit's
 * raised amount; shares sold is that over the unit price.
 */
export async function getChainSharesSold(
  escrowAccountId: string,
  projectSlug: string
): Promise<Record<string, string>> {
  const project = await nearContractService.viewOn<{
    units?: { code: string; price: number | string; total_shares: number | string; raised: number | string }[];
  } | null>(escrowAccountId, "get_project", { project_id: projectSlug });
  const out: Record<string, string> = {};
  for (const u of project?.units ?? []) {
    const price = BigInt(String(u.price));
    if (price === BigInt(0)) continue;
    out[u.code] = ((BigInt(String(u.raised)) * BigInt(String(u.total_shares))) / price).toString();
  }
  return out;
}

// ---- getting money back from a raise that stopped or failed ---------------

/** The raise's state as the contract sees it ("Open", "Funded", "Stalled", "Failed", ...). */
export async function getRaiseChainStatus(projectSlug: string): Promise<string | null> {
  if (!hasRaiseContract()) return null;
  const project = await nearContractService.viewOn<{ status: string } | null>(
    RAISE_CONTRACT_ID,
    "get_project",
    { project_id: projectSlug }
  );
  return project?.status ?? null;
}

/**
 * What this investor can take back from a stopped raise: their share of the
 * escrow never paid to the builder, and their share of the builder's cover.
 * Each is fixed by the contract and does not depend on anyone else claiming.
 */
export async function getMoneyBack(
  projectSlug: string,
  accountId: string
): Promise<{ escrow: string; cover: string }> {
  if (!hasRaiseContract()) return { escrow: "0", cover: "0" };
  const [escrow, cover] = await Promise.all([
    nearContractService.viewOn<string>(RAISE_CONTRACT_ID, "reclaim_value", {
      project_id: projectSlug,
      account_id: accountId,
    }),
    nearContractService.viewOn<string>(RAISE_CONTRACT_ID, "opt_out_value", {
      project_id: projectSlug,
      account_id: accountId,
    }),
  ]);
  return { escrow: String(escrow ?? "0"), cover: String(cover ?? "0") };
}

/** Take back your share of the unpaid escrow from a stopped raise. */
export async function reclaimEscrow(
  accountId: string,
  privateKey: string,
  projectSlug: string
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "reclaim",
    args: { project_id: projectSlug },
    gas: tgas(COLLECTIONS_GAS.CLAIM),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `reclaim:${accountId}:${projectSlug}`,
  });
}

/** Take your share of the builder's cover (from their stake) on a stopped raise. */
export async function claimCover(
  accountId: string,
  privateKey: string,
  projectSlug: string
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "opt_out",
    args: { project_id: projectSlug },
    gas: tgas(COLLECTIONS_GAS.CLAIM),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `cover:${accountId}:${projectSlug}`,
  });
}

/** Take everything you put in back from a raise that did not reach its target. */
export async function refundFailedRaise(
  accountId: string,
  privateKey: string,
  projectSlug: string
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: RAISE_CONTRACT_ID,
    methodName: "refund",
    args: { project_id: projectSlug },
    gas: tgas(COLLECTIONS_GAS.CLAIM),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `refund:${accountId}:${projectSlug}`,
  });
}

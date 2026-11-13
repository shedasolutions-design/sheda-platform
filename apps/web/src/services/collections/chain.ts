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
import { raiseOf } from "@/services/collections/raiseRegistry";
import {
  COLLECTIONS_GAS,
  COLLECTIONS_MARKETPLACE_ID,
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
    nearContractService.viewOn<string>(raiseOf(projectSlug), "get_commitment", {
      project_id: projectSlug,
      account_id: accountId,
      unit: unitCode,
    }),
    nearContractService.viewOn<string>(raiseOf(projectSlug), "shares_owed", {
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
    /** v5 raises: the manager this investor votes for. */
    vote?: string | null;
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
      msg: JSON.stringify({
        project: params.projectSlug,
        unit: params.unitCode,
        ...(params.vote ? { vote: params.vote } : {}),
      }),
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
    contractId: raiseOf(projectSlug),
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
    contractId: raiseOf(projectSlug),
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
    contractId: raiseOf(projectSlug),
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
    contractId: raiseOf(projectSlug),
    methodName: "object",
    args: { project_id: projectSlug, phase: phaseIndex },
    gas: tgas(COLLECTIONS_GAS.MANAGER_ACTION),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `object:${accountId}:${projectSlug}:${phaseIndex}`,
  });
}

/**
 * A project as the contract has it, laid over the backend's copy.
 *
 * The backend mirrors phase states, unit funding and the raise status, but
 * nothing updates that mirror when someone acts on chain: a builder who had
 * just requested an inspection still saw "Building", a funded raise read
 * "open", a full flat read "0% funded". The contract is the record; the
 * backend copy is used only if the chain can't be read.
 */
export async function withChainState<
  T extends {
    slug: string;
    escrow_account_id?: string | null;
    status: string;
    phases: { position: number; state: string }[];
    unit_list: { code: string; shares_sold: string }[];
  }
>(project: T): Promise<T> {
  try {
    const live = await nearContractService.viewOn<{
      status: string;
      phases?: { state: string; attested_at_ns?: number | string }[];
      units?: { code: string; price: number | string; total_shares: number | string; raised: number | string }[];
    } | null>(project.escrow_account_id || raiseOf(project.slug), "get_project", { project_id: project.slug });
    if (!live) return project;
    const snake = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    const sold: Record<string, string> = {};
    for (const u of live.units ?? []) {
      const price = BigInt(String(u.price));
      if (price > BigInt(0)) sold[u.code] = ((BigInt(String(u.raised)) * BigInt(String(u.total_shares))) / price).toString();
    }
    return {
      ...project,
      status: snake(live.status),
      phases: project.phases.map((ph) => {
        const c = live.phases?.[ph.position];
        if (!c) return ph;
        const attested = Number(c.attested_at_ns ?? 0);
        return { ...ph, state: snake(c.state), ...(attested > 0 ? { attested_at_ms: attested / 1e6 } : {}) };
      }),
      unit_list: project.unit_list.map((u) => (sold[u.code] != null ? { ...u, shares_sold: sold[u.code] } : u)),
    };
  } catch {
    return project;
  }
}

/** How long holders have to object after a sign-off, from the contract. */
export async function getObjectionWindowMs(): Promise<number | null> {
  if (!hasRaiseContract()) return null;
  try {
    const ns = await nearContractService.viewOn<string | number>(RAISE_CONTRACT_ID, "objection_window_ns", {});
    return Number(ns) / 1e6;
  } catch {
    return null;
  }
}

/**
 * Settle a phase once its objection window has closed: pays the builder, or
 * holds the phase if enough holders objected. Anyone may.
 *
 * Nothing in the app called release_phase, so every signed-off phase would
 * have sat in its objection window for good and no builder was ever paid.
 */
export async function releasePhase(
  accountId: string,
  privateKey: string,
  projectSlug: string,
  phaseIndex: number
): Promise<ContractCallResult<void>> {
  if (!hasRaiseContract()) throw new NotDeployedError("The raise contract");
  return nearContractService.callOn(accountId, privateKey, {
    contractId: raiseOf(projectSlug),
    methodName: "release_phase",
    args: { project_id: projectSlug, phase: phaseIndex },
    gas: tgas(COLLECTIONS_GAS.CLAIM),
    attachedDeposit: BigInt(0),
    dedupeKey: `release-phase:${projectSlug}:${phaseIndex}`,
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
  } | null>(raiseOf(projectSlug), "get_project", { project_id: projectSlug });
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
    contractId: raiseOf(projectSlug),
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
    raiseOf(projectSlug),
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
    nearContractService.viewOn<string>(raiseOf(projectSlug), "reclaim_value", {
      project_id: projectSlug,
      account_id: accountId,
    }),
    nearContractService.viewOn<string>(raiseOf(projectSlug), "opt_out_value", {
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
    contractId: raiseOf(projectSlug),
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
    contractId: raiseOf(projectSlug),
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
    contractId: raiseOf(projectSlug),
    methodName: "refund",
    args: { project_id: projectSlug },
    gas: tgas(COLLECTIONS_GAS.CLAIM),
    attachedDeposit: ONE_YOCTO,
    dedupeKey: `refund:${accountId}:${projectSlug}`,
  });
}

/** One account's place in one round, as the raise contract has it. */
export interface RoundPosition {
  status: string;
  raised: bigint;
  target: bigint;
  deadlineMs: number;
  committed: bigint;
  refunded: boolean;
  sharesOwed: bigint;
  /** What this account has in each flat. */
  units: { code: string; committed: bigint }[];
  /** v5 only: may take money out of this round right now. */
  canWithdraw: boolean;
  /** v5 only: when withdrawals stop, ms since epoch. */
  withdrawUntilMs: number | null;
}

/**
 * Where someone stands in a round: what they put in, whether it filled,
 * how long is left, and whether they have already been refunded. Null when
 * they never committed, so Portfolio lists only rounds they are in.
 */
export async function getRoundPosition(projectSlug: string, accountId: string): Promise<RoundPosition | null> {
  if (!hasRaiseContract()) return null;
  const committed = BigInt(
    String(
      (await nearContractService.viewOn<string>(raiseOf(projectSlug), "get_total_commitment", {
        project_id: projectSlug,
        account_id: accountId,
      })) ?? "0"
    )
  );
  if (committed <= BigInt(0)) return null;
  const [project, refunded] = await Promise.all([
    nearContractService.viewOn<{
      status: string;
      raised: string | number;
      target: string | number;
      deadline_ns: string | number;
      units: { code: string }[];
    } | null>(raiseOf(projectSlug), "get_project", { project_id: projectSlug }),
    nearContractService.viewOn<boolean>(raiseOf(projectSlug), "has_opted_out_view", {
      project_id: projectSlug,
      account_id: accountId,
    }),
  ]);
  if (!project) return null;
  const owed = await Promise.all(
    (project.units ?? []).map((u) =>
      nearContractService
        .viewOn<string>(raiseOf(projectSlug), "shares_owed", {
          project_id: projectSlug,
          unit: u.code,
          account_id: accountId,
        })
        .then((v) => BigInt(String(v ?? "0")))
        .catch(() => BigInt(0))
    )
  );
  const unitCommitments = await Promise.all(
    (project.units ?? []).map(async (u) => ({
      code: u.code,
      committed: await getCommitmentToUnit(projectSlug, accountId, u.code).catch(() => BigInt(0)),
    }))
  );
  const deadlineMs = Number(BigInt(String(project.deadline_ns)) / BigInt(1_000_000));
  const raised = BigInt(String(project.raised));
  const target = BigInt(String(project.target));
  // Only a v5 raise answers withdraw_cutoff_ns.
  const cutoff = await getWithdrawCutoffMs(projectSlug);
  const withdrawUntilMs = cutoff == null ? null : deadlineMs - cutoff;
  return {
    status: project.status,
    raised,
    target,
    deadlineMs,
    committed,
    refunded: Boolean(refunded),
    sharesOwed: owed.reduce((a, b) => a + b, BigInt(0)),
    units: unitCommitments.filter((u) => u.committed > BigInt(0)),
    canWithdraw: withdrawUntilMs != null && project.status === "Open" && raised < target && Date.now() < withdrawUntilMs,
    withdrawUntilMs,
  };
}

/** What a finished flat is doing: handed over, listed for rent, or let. */
export interface FlatStage {
  stage: "building" | "with_manager" | "listed" | "rented" | "redeemed";
  leaseEndsMs?: number;
}

/**
 * Read a flat's stage from its vault (handover) and the marketplace
 * (listing and lease). The vault lists the flat under its property id.
 */
export async function getFlatStage(vaultId: string): Promise<FlatStage> {
  const info = await getVaultInfo(vaultId);
  const state = custodyState(info.custody);
  if (state === "awaiting") return { stage: "building" };
  if (state === "redeemed") return { stage: "redeemed" };
  const property = await nearContractService
    .viewOn<{
      price: string;
      lease_duration_days?: number | null;
      active_lease?: { active: boolean; end_time: number } | null;
    } | null>(COLLECTIONS_MARKETPLACE_ID, "get_property_by_id", { property_id: Number(info.property_id) })
    .catch(() => null);
  if (property?.active_lease?.active) {
    return { stage: "rented", leaseEndsMs: Math.floor(Number(property.active_lease.end_time) / 1_000_000) };
  }
  if (property && property.lease_duration_days && BigInt(property.price || "0") > BigInt(0)) return { stage: "listed" };
  return { stage: "with_manager" };
}

/** How much of a stablecoin an account holds, in atomic units. */
export async function getStablecoinBalance(token: string, accountId: string): Promise<bigint> {
  const v = await nearContractService.viewOn<string>(token, "ft_balance_of", { account_id: accountId });
  return BigInt(String(v ?? "0"));
}

// ---- v5: manager vote, withdrawals, approvals --------------------------------

export interface RaiseCandidate {
  account: string;
  fee_bps: number;
  self_managed: boolean;
  votes: string;
}

/** A raise's v5 terms, or null on a v4 raise (no candidates there). */
export interface RaiseTerms {
  candidates: RaiseCandidate[];
  selfManaged: boolean;
  managerFeeBps: number;
  packHash: string;
  manager: string;
  status: string;
  deadlineMs: number;
  raised: bigint;
  target: bigint;
}

export async function getRaiseTerms(projectSlug: string): Promise<RaiseTerms | null> {
  if (!hasRaiseContract()) return null;
  const p = await nearContractService.viewOn<{
    candidates?: { account: string; fee_bps: number; self_managed: boolean; votes: string | number }[];
    self_managed?: boolean;
    manager_fee_bps?: number;
    pack_hash?: string;
    manager: string;
    status: string;
    deadline_ns: string | number;
    raised: string | number;
    target: string | number;
  } | null>(raiseOf(projectSlug), "get_project", { project_id: projectSlug });
  if (!p || !Array.isArray(p.candidates)) return null;
  return {
    candidates: p.candidates.map((c) => ({ ...c, votes: String(c.votes) })),
    selfManaged: Boolean(p.self_managed),
    managerFeeBps: p.manager_fee_bps ?? 0,
    packHash: p.pack_hash ?? "",
    manager: p.manager,
    status: p.status,
    deadlineMs: Number(BigInt(String(p.deadline_ns)) / BigInt(1_000_000)),
    raised: BigInt(String(p.raised)),
    target: BigInt(String(p.target)),
  };
}

export async function getWithdrawCutoffMs(projectSlug: string): Promise<number | null> {
  try {
    const ns = await nearContractService.viewOn<string | number>(raiseOf(projectSlug), "withdraw_cutoff_ns", {});
    return Number(BigInt(String(ns)) / BigInt(1_000_000));
  } catch {
    return null;
  }
}

export async function getMyVote(projectSlug: string, accountId: string): Promise<string | null> {
  try {
    return (
      (await nearContractService.viewOn<string | null>(raiseOf(projectSlug), "get_vote", {
        project_id: projectSlug,
        account_id: accountId,
      })) ?? null
    );
  } catch {
    return null;
  }
}

export async function getCommitmentToUnit(projectSlug: string, accountId: string, unit: string): Promise<bigint> {
  const v = await nearContractService.viewOn<string>(raiseOf(projectSlug), "get_commitment", {
    project_id: projectSlug,
    account_id: accountId,
    unit,
  });
  return BigInt(String(v ?? "0"));
}

export async function hasApprovedPhase(projectSlug: string, phase: number, accountId: string): Promise<boolean> {
  try {
    return Boolean(
      await nearContractService.viewOn<boolean>(raiseOf(projectSlug), "has_approved", {
        project_id: projectSlug,
        phase,
        account_id: accountId,
      })
    );
  } catch {
    return false;
  }
}

function signedCall(
  accountId: string,
  privateKey: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  opts: { gas: bigint; yocto: boolean; key: string }
): Promise<ContractCallResult<void>> {
  return nearContractService.callOn(accountId, privateKey, {
    contractId,
    methodName,
    args,
    gas: tgas(opts.gas),
    attachedDeposit: opts.yocto ? ONE_YOCTO : NO_DEPOSIT,
    dedupeKey: opts.key,
  });
}

export function voteForManager(accountId: string, privateKey: string, projectSlug: string, candidate: string) {
  return signedCall(accountId, privateKey, raiseOf(projectSlug), "vote_manager", { project_id: projectSlug, candidate }, {
    gas: COLLECTIONS_GAS.MANAGER_ACTION,
    yocto: false,
    key: "vote:" + accountId + ":" + projectSlug + ":" + candidate,
  });
}

export function withdrawFromRound(accountId: string, privateKey: string, projectSlug: string, unit: string) {
  return signedCall(accountId, privateKey, raiseOf(projectSlug), "withdraw", { project_id: projectSlug, unit }, {
    gas: COLLECTIONS_GAS.CLAIM,
    yocto: true,
    key: "withdraw:" + accountId + ":" + projectSlug + ":" + unit,
  });
}

export function approvePhase(accountId: string, privateKey: string, projectSlug: string, phase: number) {
  return signedCall(accountId, privateKey, raiseOf(projectSlug), "approve", { project_id: projectSlug, phase }, {
    gas: COLLECTIONS_GAS.MANAGER_ACTION,
    yocto: true,
    key: "approve:" + accountId + ":" + projectSlug + ":" + phase,
  });
}

// ---- v5 vaults: the share market and manager votes ---------------------------

export interface ShareListing {
  id: number;
  seller: string;
  shares: string;
  pricePerShare: string;
}

export interface ShareOffer {
  id: number;
  buyer: string;
  shares: string;
  pricePerShare: string;
}

/** Listings in a v5 vault; null if the vault has no market (v4). */
export async function getShareListings(vaultId: string): Promise<ShareListing[] | null> {
  try {
    const rows = await nearContractService.viewOn<[number, { seller: string; shares: string; price_per_share: string }][]>(
      vaultId,
      "get_listings",
      { from: 0, limit: 100 }
    );
    return rows.map(([id, l]) => ({
      id: Number(id),
      seller: l.seller,
      shares: String(l.shares),
      pricePerShare: String(l.price_per_share),
    }));
  } catch {
    return null;
  }
}

export async function getShareOffers(vaultId: string): Promise<ShareOffer[] | null> {
  try {
    const rows = await nearContractService.viewOn<[number, { buyer: string; shares: string; price_per_share: string }][]>(
      vaultId,
      "get_offers",
      { from: 0, limit: 100 }
    );
    return rows.map(([id, o]) => ({
      id: Number(id),
      buyer: o.buyer,
      shares: String(o.shares),
      pricePerShare: String(o.price_per_share),
    }));
  } catch {
    return null;
  }
}

export async function getLockedShares(vaultId: string, accountId: string): Promise<bigint> {
  try {
    return BigInt(String(await nearContractService.viewOn<string>(vaultId, "locked_shares", { account_id: accountId })));
  } catch {
    return BigInt(0);
  }
}

export function listShares(accountId: string, privateKey: string, vaultId: string, shares: string, pricePerShare: string) {
  return signedCall(accountId, privateKey, vaultId, "list_shares", { shares, price_per_share: pricePerShare }, {
    gas: COLLECTIONS_GAS.MANAGER_ACTION,
    yocto: false,
    key: "list:" + accountId + ":" + vaultId + ":" + shares + ":" + pricePerShare,
  });
}

export function cancelShareListing(accountId: string, privateKey: string, vaultId: string, listingId: number) {
  return signedCall(accountId, privateKey, vaultId, "cancel_listing", { listing_id: listingId }, {
    gas: COLLECTIONS_GAS.MANAGER_ACTION,
    yocto: false,
    key: "unlist:" + accountId + ":" + vaultId + ":" + listingId,
  });
}

/** Pay for shares from a listing; whatever is not used comes back. */
export function buyShares(
  accountId: string,
  privateKey: string,
  p: { stablecoin: string; vaultId: string; listingId: number; shares: string; amountAtomic: string }
) {
  return signedCall(
    accountId,
    privateKey,
    p.stablecoin,
    "ft_transfer_call",
    { receiver_id: p.vaultId, amount: p.amountAtomic, memo: null, msg: JSON.stringify({ buy: p.listingId, shares: p.shares }) },
    { gas: COLLECTIONS_GAS.FT_TRANSFER_CALL, yocto: true, key: "buy:" + accountId + ":" + p.vaultId + ":" + p.listingId + ":" + p.shares }
  );
}

/** Post a standing offer: the money waits in the vault at your price. */
export function postShareOffer(
  accountId: string,
  privateKey: string,
  p: { stablecoin: string; vaultId: string; shares: string; pricePerShare: string }
) {
  const amount = (BigInt(p.shares) * BigInt(p.pricePerShare)).toString();
  return signedCall(
    accountId,
    privateKey,
    p.stablecoin,
    "ft_transfer_call",
    {
      receiver_id: p.vaultId,
      amount,
      memo: null,
      msg: JSON.stringify({ offer: { shares: p.shares, price_per_share: p.pricePerShare } }),
    },
    { gas: COLLECTIONS_GAS.FT_TRANSFER_CALL, yocto: true, key: "offer:" + accountId + ":" + p.vaultId + ":" + p.shares + ":" + p.pricePerShare }
  );
}

export function sellToOffer(accountId: string, privateKey: string, vaultId: string, offerId: number, shares: string) {
  return signedCall(accountId, privateKey, vaultId, "sell_to_offer", { offer_id: offerId, shares }, {
    gas: COLLECTIONS_GAS.CLAIM,
    yocto: true,
    key: "sell:" + accountId + ":" + vaultId + ":" + offerId + ":" + shares,
  });
}

export function cancelShareOffer(accountId: string, privateKey: string, vaultId: string, offerId: number) {
  return signedCall(accountId, privateKey, vaultId, "cancel_offer", { offer_id: offerId }, {
    gas: COLLECTIONS_GAS.CLAIM,
    yocto: true,
    key: "unoffer:" + accountId + ":" + vaultId + ":" + offerId,
  });
}

export async function getVaultManagerVote(
  vaultId: string,
  accountId: string
): Promise<{ manager: string; fee_bps: number } | null> {
  try {
    return await nearContractService.viewOn<{ manager: string; fee_bps: number } | null>(vaultId, "get_manager_vote", {
      account_id: accountId,
    });
  } catch {
    return null;
  }
}

export async function getManagerVoteSupport(vaultId: string, manager: string, feeBps: number): Promise<bigint> {
  try {
    return BigInt(String(await nearContractService.viewOn<string>(vaultId, "manager_vote_support", { manager, fee_bps: feeBps })));
  } catch {
    return BigInt(0);
  }
}

export function voteVaultManager(accountId: string, privateKey: string, vaultId: string, manager: string, feeBps: number) {
  return signedCall(accountId, privateKey, vaultId, "vote_manager", { manager, fee_bps: feeBps }, {
    gas: COLLECTIONS_GAS.MANAGER_ACTION,
    yocto: false,
    key: "vvote:" + accountId + ":" + vaultId + ":" + manager + ":" + feeBps,
  });
}

export function applyVaultManagerVote(accountId: string, privateKey: string, vaultId: string, manager: string, feeBps: number) {
  return signedCall(accountId, privateKey, vaultId, "apply_manager_vote", { manager, fee_bps: feeBps }, {
    gas: COLLECTIONS_GAS.CLAIM,
    yocto: false,
    key: "vapply:" + accountId + ":" + vaultId + ":" + manager + ":" + feeBps,
  });
}

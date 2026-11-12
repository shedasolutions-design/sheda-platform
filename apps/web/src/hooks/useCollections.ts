import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import apiService, {
  type CollectionDirectoryEntry,
  type CollectionProfile,
  type CollectionProjectDetail,
  type CollectionProjectSummary,
  type CollectionRole,
  type CollectionUnit,
} from "@/services/api";
import * as chain from "@/services/collections/chain";
import {
  NotDeployedError,
  type Holding,
  type UnitPosition,
} from "@/services/collections/chain";
import { hasRaiseContract, hasStakeRegistry } from "@/config/collections";
import { describeApiError } from "@/services/collections/errors";
import type { ContractCallResult } from "@/types/contract";

/**
 * Collections, bound to the signed-in account.
 *
 * The same split the rest of the app uses: reads need no wallet, writes
 * sign with the connected account's key through `nearContractService`.
 * Browsing raises and reading a profile work for someone who has not
 * connected anything, because a person deciding whether this is worth
 * their money has not decided to sign anything yet.
 *
 * Two kinds of failure are kept apart throughout, because the screens
 * respond to them differently. A network error is worth retrying. A
 * contract that is not deployed is not, and showing a spinner for one is
 * how an app waits forever for something that is never coming.
 */

export interface CollectionsState {
  loading: boolean;
  error: string | null;
  /** Set when the thing being asked for has no contract yet. */
  unavailable: string | null;
}

function describe(e: unknown): { error: string | null; unavailable: string | null } {
  if (e instanceof NotDeployedError) return { error: null, unavailable: e.message };
  return {
    error: e instanceof Error ? e.message : "Something went wrong.",
    unavailable: null,
  };
}

export function useCollections() {
  const { walletState } = useWallet();
  const [state, setState] = useState<CollectionsState>({
    loading: false,
    error: null,
    unavailable: null,
  });

  const accountId = walletState.account?.accountId ?? null;
  const connected = Boolean(accountId);

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    setState({ loading: true, error: null, unavailable: null });
    try {
      const value = await operation();
      setState({ loading: false, error: null, unavailable: null });
      return value;
    } catch (e) {
      setState({ loading: false, ...describe(e) });
      return null;
    }
  }, []);

  /**
   * Run something that needs a signature.
   *
   * The private key is read at the moment of use rather than held, so a
   * screen that rendered while connected and acted after a sign out fails
   * cleanly instead of signing with a stale key.
   */
  const signed = useCallback(
    async (
      operation: (accountId: string, privateKey: string) => Promise<ContractCallResult<void>>
    ): Promise<ContractCallResult<void>> => {
      const id = walletState.account?.accountId;
      const key = walletState.account?.privateKey;
      if (!id || !key) {
        const error = "Connect your wallet before signing this.";
        setState({ loading: false, error, unavailable: null });
        return { success: false, error };
      }

      setState({ loading: true, error: null, unavailable: null });
      try {
        const result = await operation(id, key);
        setState({
          loading: false,
          error: result.success ? null : result.error ?? "That did not go through.",
          unavailable: null,
        });
        return result;
      } catch (e) {
        const described = describe(e);
        setState({ loading: false, ...described });
        return { success: false, error: described.error ?? described.unavailable ?? "Failed" };
      }
    },
    [walletState]
  );

  return {
    ...state,
    accountId,
    connected,
    /** Which parts of Collections are live at all. */
    capabilities: {
      raises: hasRaiseContract(),
      stake: hasStakeRegistry(),
    },

    // ---- reads that need no wallet ----
    listProjects: useCallback(
      () =>
        run(async () => {
          const response = await apiService.getCollectionProjects({ status: "open" });
          if (!response.ok) throw new Error(describeApiError(response.error, "Could not load raises."));
          return response.data as CollectionProjectSummary[];
        }),
      [run]
    ),

    getProject: useCallback(
      (slug: string) =>
        run(async () => {
          const response = await apiService.getCollectionProject(slug);
          if (!response.ok) throw new Error(describeApiError(response.error, "Could not load that raise."));
          return response.data as CollectionProjectDetail;
        }),
      [run]
    ),

    getDirectory: useCallback(
      (role: CollectionRole) =>
        run(async () => {
          const response = await apiService.getCollectionDirectory(role);
          if (!response.ok) throw new Error(describeApiError(response.error, "Could not load the directory."));
          return response.data as CollectionDirectoryEntry[];
        }),
      [run]
    ),

    getProfile: useCallback(
      (profileId: number) =>
        run(async () => {
          const response = await apiService.getCollectionProfile(profileId);
          if (!response.ok) throw new Error(describeApiError(response.error, "Could not load that profile."));
          return response.data as CollectionProfile;
        }),
      [run]
    ),

    // ---- chain reads ----
    getHoldings: useCallback(
      (vaultIds: string[]) =>
        run(async () => {
          if (!accountId) return { holdings: [] as Holding[], failed: [] as string[] };
          return chain.getHoldings(vaultIds, accountId);
        }),
      [run, accountId]
    ),

    getStakeProfile: useCallback(
      () => run(async () => (accountId ? chain.getStakeProfile(accountId) : null)),
      [run, accountId]
    ),

    getUnitPosition: useCallback(
      (slug: string, unitCode: string) =>
        run(async () =>
          accountId ? chain.getUnitPosition(slug, unitCode, accountId) : null
        ),
      [run, accountId]
    ),

    // ---- writes ----
    claim: useCallback(
      (vaultId: string) => signed((id, key) => chain.claim(id, key, vaultId)),
      [signed]
    ),

    syncIncome: useCallback(
      (vaultId: string) => signed((id, key) => chain.syncIncome(id, key, vaultId)),
      [signed]
    ),

    commit: useCallback(
      (params: {
        stablecoin: string;
        escrowAccountId: string;
        amountAtomic: string;
        projectSlug: string;
        unitCode: string;
      }) => signed((id, key) => chain.commitToRaise(id, key, params)),
      [signed]
    ),

    depositStake: useCallback(
      (stablecoin: string, amountAtomic: string) =>
        signed((id, key) => chain.depositStake(id, key, stablecoin, amountAtomic)),
      [signed]
    ),

    withdrawStake: useCallback(
      (amountAtomic: string) => signed((id, key) => chain.withdrawStake(id, key, amountAtomic)),
      [signed]
    ),

    requestInspection: useCallback(
      (slug: string, phaseIndex: number) =>
        signed((id, key) => chain.requestInspection(id, key, slug, phaseIndex)),
      [signed]
    ),

    attest: useCallback(
      (slug: string, phaseIndex: number) =>
        signed((id, key) => chain.attestPhase(id, key, slug, phaseIndex)),
      [signed]
    ),

    claimShares: useCallback(
      (slug: string, unitCode: string) =>
        signed((id, key) => chain.claimShares(id, key, slug, unitCode)),
      [signed]
    ),

    objectToRelease: useCallback(
      (slug: string, phaseIndex: number) =>
        signed((id, key) => chain.objectToRelease(id, key, slug, phaseIndex)),
      [signed]
    ),
  };
}

/**
 * The Collections profiles on the signed-in account.
 *
 * A list rather than one, because a company that both builds and manages
 * holds two and their records must never be averaged together. Loaded once
 * per sign in: the builder screens need to know which profile is acting
 * before they can show anything at all.
 */
export function useMyCollectionProfiles() {
  const { walletState } = useWallet();
  const [profiles, setProfiles] = useState<CollectionProfile[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.getMyCollectionProfiles();
      setProfiles(response.ok ? (response.data as CollectionProfile[]) : []);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const builder = useMemo(
    () => profiles?.find((p) => p.role === "builder") ?? null,
    [profiles]
  );
  const manager = useMemo(
    () => profiles?.find((p) => p.role === "manager") ?? null,
    [profiles]
  );

  /**
   * Whether the NEAR account this profile claims is the one signed in.
   *
   * A profile pointing at a different account can be read but must not be
   * acted as: its stake, and everything a slash would reach, belongs to
   * someone else's keys.
   */
  const actingAccountMatches = useCallback(
    (profile: CollectionProfile | null): boolean =>
      Boolean(
        profile?.near_account_id &&
          walletState.account?.accountId &&
          profile.near_account_id === walletState.account.accountId
      ),
    [walletState]
  );

  return { profiles, builder, manager, loading, reload: load, actingAccountMatches };
}

/**
 * The signed-in account's commitments in one raise, flat by flat.
 *
 * Kept out of `useCollections` because it fans out one view per flat and
 * should fail softly. The live v1 raise contract predates `shares_owed`;
 * against it every read fails with MethodNotFound, and the screen must say
 * nothing rather than paint an error over a project page that otherwise
 * works. A network failure is kept apart from that, because it is worth
 * retrying.
 */
export function useUnitPositions(projectSlug: string, units: CollectionUnit[]) {
  const { walletState } = useWallet();
  const accountId = walletState.account?.accountId ?? null;
  const codes = useMemo(() => units.map((u) => u.code), [units]);

  const [positions, setPositions] = useState<Record<string, UnitPosition>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const load = useCallback(async () => {
    if (!accountId || codes.length === 0) {
      setPositions({});
      setError(null);
      setUnsupported(false);
      return;
    }
    if (!hasRaiseContract()) {
      setPositions({});
      setUnsupported(true);
      return;
    }

    setLoading(true);
    setError(null);
    const results = await Promise.allSettled(
      codes.map((code) => chain.getUnitPosition(projectSlug, code, accountId))
    );

    const next: Record<string, UnitPosition> = {};
    let missingMethod = false;
    let firstError: string | null = null;

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        next[codes[i]] = result.value;
        return;
      }
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      if (/MethodNotFound|method\b.*\bnot found|not found\b.*\bmethod/i.test(message)) {
        missingMethod = true;
      } else if (!firstError) {
        firstError = message;
      }
    });

    setPositions(next);
    setUnsupported(missingMethod);
    setError(firstError);
    setLoading(false);
  }, [accountId, projectSlug, codes]);

  useEffect(() => {
    load();
  }, [load]);

  return { positions, loading, error, unsupported, reload: load };
}

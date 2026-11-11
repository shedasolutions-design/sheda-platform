"use client";

import { InterBold, InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, View } from "@/components/collections/rn";
import { Stack } from "@/components/collections/nav";
import {
  Badge,
  C,
  Card,
  CollectionsButton,
  Empty,
  Note,
  RADIUS,
  Screen,
  StatRow,
  StatTile,
  TYPE,
} from "@/components/collections/ui";
import { useCollections } from "@/hooks/useCollections";
import { custodyState, type Holding } from "@/services/collections/chain";
import { bpsToPercent, formatWithSymbol, ownershipBps } from "@/services/collections/money";
import apiService, { type CollectionProjectSummary } from "@/services/api";

/**
 * What you hold, and what is waiting for you.
 *
 * Vacancy is shown as plainly as income. A unit earning nothing this
 * month is the thing a holder most needs to know and the thing a
 * portfolio screen most often hides behind a total.
 *
 * Which vaults to read comes from the backend rather than from a list
 * kept here: it knows every raise, and a hardcoded list would silently
 * stop including units bought after it was written.
 */
export default function Holdings() {
  const { getHoldings, claim, connected, accountId, loading, error } = useCollections();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!connected) {
      setHoldings([]);
      return;
    }
    const projects = await apiService.getCollectionProjects({});
    const vaults = projects.ok
      ? (projects.data as CollectionProjectSummary[])
          .map((p) => p.vault_account_id)
          .filter((v): v is string => Boolean(v))
      : [];

    if (vaults.length === 0) {
      setHoldings([]);
      setFailed([]);
      return;
    }

    const result = await getHoldings(vaults);
    if (result) {
      setHoldings(result.holdings);
      setFailed(result.failed);
    }
  }, [connected, getHoldings]);

  useEffect(() => {
    load();
  }, [load]);

  const total = (holdings ?? []).reduce((sum, h) => sum + BigInt(h.claimable || "0"), 0n);
  const earning = (holdings ?? []).filter((h) => BigInt(h.claimable || "0") > 0n).length;
  const token = holdings?.[0]?.info.stablecoin;

  const onClaim = async (vaultId: string) => {
    setClaiming(vaultId);
    const result = await claim(vaultId);
    setClaiming(null);
    if (result.success) load();
  };

  return (
    <>
      <Stack.Screen options={{ title: "Your holdings" }} />
      <Screen
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={C.primary} />
        }
      >
        <View
          style={{
            backgroundColor: C.primaryTint,
            borderRadius: RADIUS,
            padding: 17,
            gap: 6,
          }}
        >
          <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
            Rent ready to claim
          </InterRegular>
          <InterBold style={{ fontSize: 30, lineHeight: 36, color: C.primary }}>
            {formatWithSymbol(total.toString(), token)}
          </InterBold>
          <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
            {holdings === null
              ? "Reading your vaults"
              : `Across ${holdings.length} ${holdings.length === 1 ? "unit" : "units"}, ${earning} ${
                  earning === 1 ? "is" : "are"
                } earning right now`}
          </InterRegular>
        </View>

        {!connected ? (
          <Empty
            title="Connect a wallet to see your holdings"
            body="Your units, the rent they have earned and anything ready to claim will show here. Browsing raises needs no wallet."
          />
        ) : null}

        {error ? <Note tone="critical">{error}</Note> : null}

        {failed.length > 0 ? (
          <Note>
            {failed.length} {failed.length === 1 ? "vault" : "vaults"} could not be read just
            now, so anything held there is missing from this list rather than gone. Pull to try
            again.
          </Note>
        ) : null}

        {connected && holdings === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : connected && holdings && holdings.length === 0 ? (
          <Empty
            title="You do not hold any units yet"
            body="Back a raise and your share of its rent will appear here once the building is let."
          />
        ) : (
          <View style={{ gap: 11 }}>
            {(holdings ?? []).map((h) => (
              <HoldingRow
                key={h.vaultId}
                holding={h}
                busy={claiming === h.vaultId}
                onClaim={() => onClaim(h.vaultId)}
              />
            ))}
          </View>
        )}

        {accountId ? (
          <InterRegular
            style={{ ...TYPE.micro, color: C.textMuted, textAlign: "center" }}
          >
            Read for {accountId}
          </InterRegular>
        ) : null}
      </Screen>
    </>
  );
}

function HoldingRow({
  holding,
  busy,
  onClaim,
}: {
  holding: Holding;
  busy: boolean;
  onClaim: () => void;
}) {
  const { info, balance, claimable } = holding;
  const state = custodyState(info.custody);
  const share = ownershipBps(balance, info.total_supply);
  const paying = BigInt(claimable || "0") > 0n;

  const status =
    state === "awaiting"
      ? { label: "Still being built", tone: "caution" as const }
      : state === "redeemed"
        ? { label: "Redeemed", tone: "plain" as const }
        : paying
          ? { label: "Earning", tone: "positive" as const }
          : { label: "No rent yet this period", tone: "caution" as const };

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{info.name}</InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
              {balance} shares · {bpsToPercent(share)} of the unit
            </InterRegular>
          </View>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <StatRow>
          <StatTile
            label="Ready to claim"
            value={formatWithSymbol(claimable, info.stablecoin)}
            tone={paying ? "positive" : "plain"}
          />
          <StatTile label="Managed by" value={info.manager} />
        </StatRow>

        {paying ? (
          <CollectionsButton label="Claim" loading={busy} onPress={onClaim} />
        ) : null}
      </View>
    </Card>
  );
}

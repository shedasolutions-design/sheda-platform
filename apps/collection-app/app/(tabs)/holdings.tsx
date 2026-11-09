import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";
import { InterBold, InterRegular, InterSemiBold } from "@/components/Text";
import { Badge, Card, EmptyState, Note, StatRow, StatTile } from "@/components/ui";
import { COLORS, GUTTER, RADIUS, TYPE } from "@/constants/theme";
import { bpsToPercent, naira, ownershipBps } from "@/services/money";
import { custodyState, getHolding, type Holding } from "@/services/vault";
import { DEMO_HOLDINGS, DEMO_MODE } from "@/services/demo";

/**
 * What you hold, and what is waiting for you.
 *
 * Vacancy is shown as plainly as income. A unit earning nothing this month
 * is the thing a holder most needs to know and the thing a portfolio screen
 * most often hides behind a total.
 */

/** Vaults to read. Replaced by a per-account index when stage 3 lands. */
const WATCHED_VAULTS: string[] = [];

export default function Holdings() {
  const [accountId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>(DEMO_MODE ? DEMO_HOLDINGS : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (DEMO_MODE) return;
    if (!accountId || WATCHED_VAULTS.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        WATCHED_VAULTS.map((vaultId) => getHolding(vaultId, accountId))
      );
      const ok = results
        .filter((r): r is PromiseFulfilledResult<Holding> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((h) => BigInt(h.balance || "0") > 0n);
      setHoldings(ok);
      // Partial failure is reported rather than hidden: a holding missing
      // from this list because one read failed would look like a holding
      // that no longer exists.
      if (results.some((r) => r.status === "rejected")) {
        setError("Some vaults could not be read. Pull to try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the network.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalClaimable = holdings.reduce((sum, h) => sum + BigInt(h.claimable || "0"), 0n);
  const earning = holdings.filter((h) => BigInt(h.claimable || "0") > 0n).length;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, paddingBottom: 44, gap: 18 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />
        }
      >
        <View
          style={{
            backgroundColor: COLORS.primaryTint,
            borderRadius: RADIUS,
            padding: 17,
            gap: 14,
          }}
        >
          <View style={{ gap: 2 }}>
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              Rent ready to claim
            </InterRegular>
            <InterBold style={{ fontSize: 30, lineHeight: 36, color: COLORS.primary }}>
              {naira(totalClaimable.toString())}
            </InterBold>
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              Across {holdings.length} {holdings.length === 1 ? "unit" : "units"}, {earning}{" "}
              {earning === 1 ? "is" : "are"} earning right now
            </InterRegular>
          </View>
          <Button
            label="Claim"
            disabled={totalClaimable === 0n}
            onPress={() => {
              // Claiming signs against each vault. Wired with the wallet in
              // stage 7; the amount above is already read from the chain.
            }}
          />
        </View>

        {DEMO_MODE ? (
          <Note>
            Example holdings. Nothing here is yours and no wallet is connected. They are on screen
            so the flows can be reviewed before the raise contract ships.
          </Note>
        ) : null}

        {error ? <Note tone="critical">{error}</Note> : null}

        {loading && holdings.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : holdings.length === 0 ? (
          <EmptyState
            title={
              accountId ? "You do not hold any units yet" : "Connect a wallet to see your holdings"
            }
            body={
              accountId
                ? "Back a raise and your share of its rent will appear here once the building is let."
                : "Your units, the rent they have earned and anything ready to claim will show here."
            }
          />
        ) : (
          <View style={{ gap: 11 }}>
            {holdings.map((h) => (
              <HoldingRow key={h.vaultId} holding={h} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HoldingRow({ holding }: { holding: Holding }) {
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
            <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>
              {info.name}
            </InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              {balance} shares · {bpsToPercent(share)} of the unit
            </InterRegular>
          </View>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <StatRow>
          <StatTile
            label="Ready to claim"
            value={naira(claimable)}
            tone={paying ? "positive" : "plain"}
          />
          <StatTile label="Managed by" value={info.manager} />
        </StatRow>
      </View>
    </Card>
  );
}

"use client";

import { InterBold, InterRegular } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, TextInput, View } from "@/components/collections/rn";
import { Stack, router } from "@/components/collections/nav";
import {
  C,
  Card,
  CollectionsButton,
  Divider,
  Empty,
  FinePrint,
  ListRow,
  Meter,
  Note,
  NotLiveYet,
  RADIUS,
  Screen,
  Section,
  StatRow,
  StatTile,
  TYPE,
} from "@/components/collections/ui";
import { useCollections, useMyCollectionProfiles } from "@/hooks/useCollections";
import { formatWithSymbol, parseAmount } from "@/services/collections/money";
import { DEFAULT_TOKEN } from "@/config/tokens";
import type { StakeProfile } from "@/services/collections/chain";

/**
 * Stake, and what it is buying.
 *
 * The number that matters is the free balance, because that is the only
 * one a new raise can advertise against. A builder with ten million
 * staked across three raises each promising eighteen percent cover has
 * promised the same ten million three times, and the registry refuses it.
 * Showing the total alone would hide exactly that.
 *
 * Read from the chain rather than the backend. This is the figure a
 * builder decides against, and a cached copy of it is the one number here
 * that must never be slightly out of date.
 */
export default function Stake() {
  const { builder, actingAccountMatches } = useMyCollectionProfiles();
  const {
    getStakeProfile,
    depositStake,
    withdrawStake,
    loading,
    error,
    unavailable,
    capabilities,
    connected,
  } = useCollections();
  const [stake, setStake] = useState<StakeProfile | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"add" | "withdraw" | null>(null);

  const load = useCallback(async () => {
    if (!connected || !capabilities.stake) return;
    const result = await getStakeProfile();
    if (result) setStake(result);
  }, [connected, capabilities.stake, getStakeProfile]);

  useEffect(() => {
    load();
  }, [load]);

  const token = DEFAULT_TOKEN;

  if (!capabilities.stake) {
    return (
      <>
        <Stack.Screen options={{ title: "Your stake" }} />
        <Screen>
          <NotLiveYet
            what="The stake registry is not deployed yet"
            body="Stake is your own money held against the promises you make to investors, and it is what a completion guarantee is actually made of. Until the registry exists there is nowhere to put it, so no raise can advertise cover."
          />
          {builder ? (
            <ListRow
              title="Your public profile"
              subtitle="What investors can read about you today"
              onPress={() => router.push(`/collections/person/${builder.id}`)}
            />
          ) : null}
        </Screen>
      </>
    );
  }

  if (!connected) {
    return (
      <>
        <Stack.Screen options={{ title: "Your stake" }} />
        <Screen>
          <Empty
            title="Connect your wallet"
            body="Stake belongs to a NEAR account, so this reads from the account you are signed in as."
          />
        </Screen>
      </>
    );
  }

  const mismatch = builder != null && builder.near_account_id != null && !actingAccountMatches(builder);
  const total = BigInt(stake?.total ?? "0");
  const allocated = BigInt(stake?.allocated ?? "0");
  const allocatedPct = total > 0n ? Number((allocated * 100n) / total) : 0;

  const typedAtomic = amount ? parseAmount(amount, token) : null;
  const typed = Boolean(typedAtomic && BigInt(typedAtomic) > 0n);
  const tooMuch = Boolean(typedAtomic && BigInt(typedAtomic) > BigInt(stake?.free ?? "0"));

  const onAdd = async () => {
    if (!typedAtomic) return;
    setBusy("add");
    const result = await depositStake(token, typedAtomic);
    setBusy(null);
    if (result.success) {
      setAmount("");
      load();
    }
  };

  const onWithdraw = async () => {
    if (!typedAtomic) return;
    setBusy("withdraw");
    const result = await withdrawStake(typedAtomic);
    setBusy(null);
    if (result.success) {
      setAmount("");
      load();
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Your stake" }} />
      <Screen>
        <View style={{ gap: 6 }}>
          <InterBold style={{ ...TYPE.display, color: C.text }}>Your stake</InterBold>
          <InterRegular style={{ ...TYPE.body, color: C.textSecondary }}>
            Your own money, held against the promises you make to investors. It is what a
            completion guarantee is actually made of.
          </InterRegular>
        </View>

        {mismatch ? (
          <Note tone="critical">
            Your builder profile is registered to {builder?.near_account_id}, and you are signed
            in as a different account. The stake below belongs to the account you are signed in
            as, not to that profile.
          </Note>
        ) : null}

        {error ? <Note tone="critical">{error}</Note> : null}
        {unavailable ? <Note>{unavailable}</Note> : null}

        {loading && !stake ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : (
          <Card>
            <View style={{ gap: 14 }}>
              <View style={{ gap: 3 }}>
                <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
                  Free to back a new raise
                </InterRegular>
                <InterBold style={{ fontSize: 30, lineHeight: 36, color: C.primary }}>
                  {formatWithSymbol(stake?.free ?? "0", token, 0)}
                </InterBold>
              </View>

              <View style={{ gap: 6 }}>
                <Meter pct={allocatedPct} tone="caution" />
                <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
                  {formatWithSymbol(stake?.allocated ?? "0", token, 0)} of{" "}
                  {formatWithSymbol(stake?.total ?? "0", token, 0)} is already promised to a live
                  raise and cannot be withdrawn.
                </InterRegular>
              </View>

              <Divider />

              <StatRow>
                <StatTile
                  label="Posted in total"
                  value={formatWithSymbol(stake?.total ?? "0", token, 0)}
                />
                <StatTile
                  label="Ever slashed"
                  value={formatWithSymbol(stake?.slashed_total ?? "0", token, 0)}
                  tone={(stake?.slash_count ?? 0) > 0 ? "critical" : "positive"}
                  note={
                    (stake?.slash_count ?? 0) > 0
                      ? `${stake?.slash_count} time${stake?.slash_count === 1 ? "" : "s"}`
                      : "never"
                  }
                />
              </StatRow>
            </View>
          </Card>
        )}

        <Note>
          Only the free balance can back a new raise. The same stake cannot stand behind two
          raises at once, because a cover figure that is only true if your other project
          succeeds is not cover at all.
        </Note>

        <Section title="Adding and taking back">
          <TextInput
            accessibilityLabel="Amount of stake"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="Amount"
            placeholderTextColor={C.textMuted}
            style={{
              borderWidth: 1,
              borderColor: C.border,
              borderRadius: RADIUS,
              paddingHorizontal: 14,
              paddingVertical: 13,
              fontFamily: "Inter-Medium",
              fontSize: 16,
              color: C.text,
            }}
          />
          {tooMuch ? (
            <InterRegular style={{ ...TYPE.label, color: C.primary }}>
              Only {formatWithSymbol(stake?.free ?? "0", token, 0)} is free. The rest is
              promised to a live raise, and the registry will refuse to release it.
            </InterRegular>
          ) : null}
          <View style={{ flexDirection: "row", gap: 9 }}>
            <View style={{ flex: 1 }}>
              <CollectionsButton
                label="Add stake"
                variant="outline"
                disabled={!typed}
                loading={busy === "add"}
                onPress={onAdd}
              />
            </View>
            <View style={{ flex: 1 }}>
              <CollectionsButton
                label="Withdraw"
                variant="quiet"
                disabled={!typed || tooMuch}
                loading={busy === "withdraw"}
                onPress={onWithdraw}
              />
            </View>
          </View>
          <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
            A withdrawal is checked against the free balance by the registry itself, not here.
            That is the point: a builder must not be able to take back cover investors are
            still being shown.
          </InterRegular>
        </Section>

        {builder ? (
          <ListRow
            title="See your public profile"
            subtitle="The same record investors read, including anything that went wrong"
            onPress={() => router.push(`/collections/person/${builder.id}`)}
          />
        ) : null}

        <FinePrint>
          Read live from the chain for the account you are signed in as. Nothing here is cached.
        </FinePrint>
      </Screen>
    </>
  );
}

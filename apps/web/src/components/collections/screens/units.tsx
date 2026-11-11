"use client";

import { InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TextInput, TouchableOpacity, View } from "@/components/collections/rn";
import { Stack, useLocalSearchParams } from "@/components/collections/nav";
import {
  C,
  Card,
  CollectionsButton,
  Empty,
  Meter,
  Note,
  NotLiveYet,
  RADIUS,
  Screen,
  TYPE,
} from "@/components/collections/ui";
import { useCollections } from "@/hooks/useCollections";
import {
  amountForShares,
  formatWithSymbol,
  ownershipBps,
  parseAmount,
  sharesForAmount,
  bpsToPercent,
} from "@/services/collections/money";
import { DEFAULT_TOKEN } from "@/config/tokens";
import { RAISE_CONTRACT_ID } from "@/config/collections";
import type { CollectionProjectDetail, CollectionUnit } from "@/services/api";

/**
 * Pick a flat, then say how much.
 *
 * Funding is shown per unit so nobody discovers after committing that
 * their flat was the one nobody else wanted. The confirmation restates
 * what the money buys in shares and in a percentage of that one unit,
 * because "0.0139 of the supply" is not a thing anyone can picture.
 *
 * The share counts here come from the backend's mirror, which is fine for
 * choosing. The commit itself sends the amount to the chain, and the
 * contract is what decides whether it fits: a stale count at that moment
 * is the difference between a stake that works and one that reverts.
 */
export default function ChooseUnit() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { getProject, commit, loading, error, capabilities, connected } = useCollections();

  const [project, setProject] = useState<CollectionProjectDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getProject(String(slug));
    if (result) setProject(result);
  }, [getProject, slug]);

  useEffect(() => {
    load();
  }, [load]);

  const unit = project?.unit_list.find((u) => u.code === selected) ?? null;
  // The coin the raise is denominated in. One for now, from config; when a
  // raise can name its own it comes off the project rather than from here.
  const token = DEFAULT_TOKEN;
  const atomic = useMemo(() => (amount ? parseAmount(amount, token) : null), [amount, token]);

  if (!project) {
    return (
      <>
        <Stack.Screen options={{ title: "Choose a unit" }} />
        <Screen>
          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : (
            <Empty title="We could not find that project" body={error ?? "Go back and retry."} />
          )}
        </Screen>
      </>
    );
  }

  const shares = unit && atomic ? sharesForAmount(atomic, unit.price_atomic, unit.total_shares) : "0";
  const available = unit
    ? BigInt(unit.total_shares || "0") - BigInt(unit.shares_sold || "0")
    : 0n;
  const tooMany = unit ? BigInt(shares || "0") > available : false;
  const tooSmall = Boolean(atomic) && BigInt(shares || "0") === 0n;
  const minimum = unit ? amountForShares("1", unit.price_atomic, unit.total_shares) : "0";
  const ready = Boolean(unit && atomic && !tooMany && !tooSmall);

  // One raise contract holds the escrow for every project, keyed by the
  // project id in the transfer message. The backend's own field records
  // which deployment a project lives on, so a future v2 routes correctly
  // rather than sending money to the contract that happens to be current.
  const escrow = project.escrow_account_id || RAISE_CONTRACT_ID;

  const onCommit = async () => {
    if (!unit || !atomic || !escrow) return;
    const result = await commit({
      stablecoin: token,
      escrowAccountId: escrow,
      amountAtomic: atomic,
      projectSlug: project.slug,
      unitCode: unit.code,
    });
    if (result.success) {
      setDone(result.transactionHash ?? "submitted");
      setAmount("");
      load();
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Choose a unit" }} />
      <Screen>
        <View style={{ gap: 6 }}>
          <InterSemiBold style={{ ...TYPE.title, color: C.text }}>
            Which flat do you want a piece of?
          </InterSemiBold>
          <InterRegular style={{ ...TYPE.body, color: C.textSecondary }}>
            You are buying a share of one specific unit, and you will earn from that
            unit&apos;s rent only.
          </InterRegular>
        </View>

        <View style={{ gap: 10 }}>
          {project.unit_list.map((u) => (
            <UnitRow
              key={u.code}
              unit={u}
              token={token}
              selected={selected === u.code}
              onPress={() => setSelected(selected === u.code ? null : u.code)}
            />
          ))}
        </View>

        {done ? (
          <Note tone="positive">
            Submitted. Your shares appear in Holdings once the transaction settles.
          </Note>
        ) : null}

        {unit ? (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>
                How much do you want to put into {unit.label}?
              </InterSemiBold>
              <TextInput
                accessibilityLabel="Amount to invest"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder={`Minimum ${formatWithSymbol(minimum, token, 0)}`}
                placeholderTextColor={C.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: tooMany || tooSmall ? C.primary : C.border,
                  borderRadius: RADIUS,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontFamily: "Inter-Medium",
                  fontSize: 16,
                  color: C.text,
                }}
              />
              {tooMany ? (
                <InterRegular style={{ ...TYPE.label, color: C.primary }}>
                  Only {available.toString()} shares are left in this unit. Try a smaller amount.
                </InterRegular>
              ) : null}
              {tooSmall ? (
                <InterRegular style={{ ...TYPE.label, color: C.primary }}>
                  That is less than one share. The smallest stake here is{" "}
                  {formatWithSymbol(minimum, token, 0)}.
                </InterRegular>
              ) : null}
            </View>

            {ready && atomic ? (
              <Card>
                <View style={{ gap: 12 }}>
                  <Line
                    label="You get"
                    value={`${shares} shares · ${bpsToPercent(
                      ownershipBps(shares, unit.total_shares)
                    )} of ${unit.label}`}
                  />
                  <Line
                    label="What that is a claim on"
                    value="A share of this unit's rent, under the terms published on the project page. It is not title to the property."
                  />
                  <Line label="Sheda fee" value="2%, charged only if the raise completes" />
                </View>
              </Card>
            ) : null}

            {error ? <Note tone="critical">{error}</Note> : null}

            {!capabilities.raises || !escrow ? (
              <NotLiveYet
                what="Committing is not live yet"
                body="The raise contract holds the escrow that money would go into, and it is not deployed. The arithmetic above is real, and the button appears the moment there is somewhere safe for the money to land."
              />
            ) : !connected ? (
              <Note>Connect your wallet to commit. Browsing needs no wallet.</Note>
            ) : (
              <CollectionsButton
                label={
                  atomic ? `Commit ${formatWithSymbol(atomic, token, 0)}` : "Enter an amount"
                }
                disabled={!ready}
                loading={loading}
                onPress={onCommit}
              />
            )}
          </View>
        ) : null}
      </Screen>
    </>
  );
}

function UnitRow({
  unit,
  token,
  selected,
  onPress,
}: {
  unit: CollectionUnit;
  token: string;
  selected: boolean;
  onPress: () => void;
}) {
  const total = BigInt(unit.total_shares || "0");
  const pct = total > 0n ? Number((BigInt(unit.shares_sold || "0") * 100n) / total) : 0;
  const full = pct >= 100;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: full }}
      activeOpacity={0.85}
      disabled={full}
      onPress={onPress}
      style={{
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? C.primary : C.border,
        borderRadius: RADIUS,
        padding: 14,
        gap: 8,
        opacity: full ? 0.55 : 1,
        backgroundColor: selected ? C.primaryTint : C.background,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{unit.label}</InterSemiBold>
          <InterRegular style={{ ...TYPE.label, color: C.textSecondary, marginTop: 1 }}>
            {unit.bedrooms} bed · {formatWithSymbol(unit.price_atomic, token, 0)} whole
          </InterRegular>
        </View>
        <InterSemiBold style={{ ...TYPE.label, color: full ? C.textMuted : C.primary }}>
          {full ? "Fully funded" : `${pct}% funded`}
        </InterSemiBold>
      </View>
      <Meter pct={pct} tone={full ? "plain" : "brand"} height={5} />
    </TouchableOpacity>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>{label}</InterRegular>
      <InterSemiBold style={{ ...TYPE.body, color: C.text }}>{value}</InterSemiBold>
    </View>
  );
}

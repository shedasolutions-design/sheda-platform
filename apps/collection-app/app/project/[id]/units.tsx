import { useMemo, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/Button";
import { InterBold, InterMedium, InterRegular, InterSemiBold } from "@/components/Text";
import { COLORS, RADIUS } from "@/constants/theme";
import { amountForShares, naira, parseMoney, sharesForAmount } from "@/services/money";
import { coverFor, getProject, sharesRemaining, unitFundedPct, type Unit } from "@/services/projects";

/**
 * Pick a flat, then say how much.
 *
 * Funding is shown per unit so nobody discovers after committing that their
 * flat was the one nobody else wanted. The confirmation restates the
 * guarantee in money rather than as a percentage, because a ratio is
 * abstract at the moment a person is deciding.
 */
export default function ChooseUnit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = getProject(String(id));
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const unit = project?.unitList.find((u) => u.id === selected) ?? null;
  const atomic = useMemo(() => parseMoney(amount), [amount]);

  if (!project) {
    return (
      <SafeAreaView edges={["bottom"]} style={{ flex: 1, padding: 20 }}>
        <InterSemiBold style={{ fontSize: 15 }}>We could not find that project.</InterSemiBold>
      </SafeAreaView>
    );
  }

  const shares = unit && atomic ? sharesForAmount(atomic, unit.priceAtomic, unit.totalShares) : "0";
  const available = unit ? sharesRemaining(unit) : 0n;
  const tooMany = unit ? BigInt(shares || "0") > available : false;
  const tooSmall = Boolean(atomic) && BigInt(shares || "0") === 0n;
  const ready = Boolean(unit && atomic && !tooMany && !tooSmall);

  const cover = atomic ? coverFor(atomic, project.guaranteeBps) : "0";
  const minimum = unit ? amountForShares("1", unit.priceAtomic, unit.totalShares) : "0";

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28, gap: 18 }}>
        <View>
          <InterBold style={{ fontSize: 18, color: COLORS.primaryText }}>
            Which flat do you want a piece of?
          </InterBold>
          <InterRegular
            style={{ fontSize: 12, color: COLORS.secondaryText, marginTop: 4, lineHeight: 18 }}
          >
            You are buying a share of one specific unit, and you will earn from that unit&apos;s
            rent only.
          </InterRegular>
        </View>

        <View style={{ gap: 10 }}>
          {project.unitList.map((u) => (
            <UnitRow
              key={u.id}
              unit={u}
              selected={selected === u.id}
              onPress={() => setSelected(selected === u.id ? null : u.id)}
            />
          ))}
        </View>

        {unit ? (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <InterSemiBold style={{ fontSize: 14, color: COLORS.primaryText }}>
                How much do you want to put into {unit.label}?
              </InterSemiBold>
              <TextInput
                accessibilityLabel="Amount to invest"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder={`Minimum ${naira(minimum, 0)}`}
                placeholderTextColor={COLORS.secondaryText}
                style={{
                  borderWidth: 1,
                  borderColor: tooMany || tooSmall ? COLORS.primary : COLORS.borderColor,
                  borderRadius: RADIUS,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontFamily: "Inter-Medium",
                  fontSize: 16,
                  color: COLORS.primaryText,
                }}
              />
              {tooMany ? (
                <InterRegular style={{ fontSize: 11, color: COLORS.primary }}>
                  Only {available.toString()} shares are left in this unit. Try a smaller amount.
                </InterRegular>
              ) : null}
              {tooSmall ? (
                <InterRegular style={{ fontSize: 11, color: COLORS.primary }}>
                  That is less than one share. The smallest stake here is {naira(minimum, 0)}.
                </InterRegular>
              ) : null}
            </View>

            {ready && atomic ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.borderColor,
                  borderRadius: RADIUS,
                  padding: 14,
                  gap: 12,
                }}
              >
                <Line
                  label="You get"
                  value={`${shares} shares · ${((Number(shares) / Number(unit.totalShares)) * 100).toFixed(2)}% of ${unit.label}`}
                />
                <Line
                  label="If the build stalls"
                  value={
                    project.guaranteeBps > 0
                      ? `about ${naira(cover, 0)} back of your ${naira(atomic, 0)}`
                      : "you recover only what has not been spent"
                  }
                  tone={project.guaranteeBps > 0 ? "positive" : "caution"}
                />
                <Line label="Sheda fee" value="2%, charged only if the raise completes" />
                <View
                  style={{
                    backgroundColor: COLORS.cautionLight,
                    borderRadius: 8,
                    padding: 11,
                  }}
                >
                  <InterMedium style={{ fontSize: 11, color: COLORS.caution, lineHeight: 17 }}>
                    This is a claim on the rent this unit earns, under the terms published above.
                    It is not title to the property.
                  </InterMedium>
                </View>
              </View>
            ) : null}

            <Button
              label={atomic ? `Commit ${naira(atomic, 0)}` : "Enter an amount"}
              disabled={!ready}
              onPress={() => {
                // Signing arrives with the raise contract in stage 3. Until
                // then this screen proves the arithmetic and the disclosure,
                // which is the part that has to be right first.
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function UnitRow({
  unit,
  selected,
  onPress,
}: {
  unit: Unit;
  selected: boolean;
  onPress: () => void;
}) {
  const pct = unitFundedPct(unit);
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
        borderColor: selected ? COLORS.primary : COLORS.borderColor,
        borderRadius: RADIUS,
        padding: 14,
        gap: 8,
        opacity: full ? 0.55 : 1,
        backgroundColor: selected ? COLORS.primaryLight : COLORS.background,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <InterSemiBold style={{ fontSize: 14, color: COLORS.primaryText }}>
            {unit.label}
          </InterSemiBold>
          <InterRegular style={{ fontSize: 11, color: COLORS.secondaryText, marginTop: 1 }}>
            {unit.bedrooms} bed · {naira(unit.priceAtomic, 0)} whole
          </InterRegular>
        </View>
        <InterSemiBold
          style={{ fontSize: 12, color: full ? COLORS.secondaryText : COLORS.primary }}
        >
          {full ? "Fully funded" : `${pct}% funded`}
        </InterSemiBold>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: COLORS.cardBackground }}>
        <View
          style={{
            width: `${Math.min(100, pct)}%`,
            height: "100%",
            borderRadius: 3,
            backgroundColor: full ? COLORS.secondaryText : COLORS.primary,
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

function Line({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "positive" | "caution";
}) {
  const colour =
    tone === "positive" ? COLORS.positive : tone === "caution" ? COLORS.caution : COLORS.primaryText;
  return (
    <View style={{ gap: 2 }}>
      <InterRegular style={{ fontSize: 11, color: COLORS.secondaryText }}>{label}</InterRegular>
      <InterSemiBold style={{ fontSize: 13, color: colour, lineHeight: 19 }}>{value}</InterSemiBold>
    </View>
  );
}

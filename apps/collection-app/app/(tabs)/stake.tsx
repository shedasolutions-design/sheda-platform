import { View } from "react-native";
import { router } from "expo-router";
import Button from "@/components/Button";
import { InterBold, InterRegular, InterSemiBold } from "@/components/Text";
import { ScoreBreakdown, ScoreHeadline } from "@/components/Score";
import {
  Card,
  Divider,
  FinePrint,
  KeyValue,
  Meter,
  Note,
  PageTitle,
  Screen,
  Section,
  StatRow,
  StatTile,
} from "@/components/ui";
import { COLORS, RADIUS_INNER, TYPE } from "@/constants/theme";
import { naira } from "@/services/money";
import { projectsOf } from "@/services/builder";
import { coverBps, scoreFor } from "@/services/people";
import { useActingBuilder } from "@/services/role";

/**
 * Stake, and what it is buying.
 *
 * The number that matters is the free balance, because that is the only one
 * a new raise can advertise against. A builder with ten million staked
 * across three raises each promising eighteen percent cover has promised
 * the same ten million three times, and the registry refuses it. Showing
 * total alone would hide exactly that.
 */
export default function Stake() {
  const actingAs = useActingBuilder();

  const { stake } = actingAs;
  const total = BigInt(stake.total);
  const allocated = BigInt(stake.allocated);
  const allocatedPct = total > 0n ? Number((allocated * 100n) / total) : 0;
  const live = projectsOf(actingAs.id);
  const score = scoreFor(actingAs);
  const slashed = stake.slashCount > 0;

  return (
    <Screen>
      <PageTitle
        title="Your stake"
        subtitle="Your own money, held against the promises you make to investors. It is what a completion guarantee is actually made of."
      />

      <Card>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 3 }}>
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              Free to back a new raise
            </InterRegular>
            <InterBold style={{ fontSize: 30, lineHeight: 36, color: COLORS.primary }}>
              {naira(stake.free, 0)}
            </InterBold>
          </View>

          <View style={{ gap: 6 }}>
            <Meter pct={allocatedPct} tone="caution" />
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              {naira(stake.allocated, 0)} of {naira(stake.total, 0)} is already promised to a live
              raise and cannot be withdrawn.
            </InterRegular>
          </View>

          <Divider />

          <StatRow>
            <StatTile label="Posted in total" value={naira(stake.total, 0)} />
            <StatTile
              label="Ever slashed"
              value={naira(stake.slashedTotal, 0)}
              tone={slashed ? "critical" : "positive"}
              note={slashed ? `${stake.slashCount} time` : "never"}
            />
          </StatRow>

          <View style={{ flexDirection: "row", gap: 9 }}>
            <View style={{ flex: 1 }}>
              <Button label="Add stake" variant="outline" onPress={() => {}} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Withdraw"
                variant="quiet"
                disabled={BigInt(stake.free) === 0n}
                onPress={() => {}}
              />
            </View>
          </View>
        </View>
      </Card>

      <Note>
        Only the free balance can back a new raise. The same stake cannot stand behind two raises
        at once, because a cover figure that is only true if your other project succeeds is not
        cover at all.
      </Note>

      <Section title="What it is backing">
        {live.length === 0 ? (
          <Card>
            <InterRegular style={{ ...TYPE.body, color: COLORS.secondaryText }}>
              Nothing yet. Stake is only locked once a raise opens against it.
            </InterRegular>
          </Card>
        ) : (
          live.map((p) => (
            <Card key={p.id}>
              <View style={{ gap: 11 }}>
                <KeyValue
                  label={p.name}
                  value={
                    p.guaranteeBps > 0
                      ? `${(p.guaranteeBps / 100).toFixed(0)}% cover promised`
                      : "No cover promised"
                  }
                  tone={p.guaranteeBps > 0 ? "positive" : "caution"}
                  note={
                    p.guaranteeBps > 0
                      ? `Investors are shown this figure. If the build stalls below half finished, ${naira(
                          ((BigInt(p.target) * BigInt(p.guaranteeBps)) / 10_000n).toString(),
                          0
                        )} of your stake goes to them.`
                      : "Investors are told plainly that this raise has no cover behind it."
                  }
                />
                <View
                  style={{
                    backgroundColor: COLORS.cardBackground,
                    borderRadius: RADIUS_INNER,
                    padding: 10,
                  }}
                >
                  <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
                    Locked for this raise:{" "}
                    <InterSemiBold style={{ ...TYPE.label, color: COLORS.primaryText }}>
                      {naira(
                        ((BigInt(p.target) * BigInt(p.guaranteeBps)) / 10_000n).toString(),
                        0
                      )}
                    </InterSemiBold>
                  </InterRegular>
                </View>
              </View>
            </Card>
          ))
        )}
      </Section>

      <Section title="How this affects your rank">
        <Card>
          <View style={{ gap: 15 }}>
            <ScoreHeadline score={score} />
            {score.tier === "unrated" ? null : (
              <>
                <Divider />
                <ScoreBreakdown score={score} />
              </>
            )}
            <Button
              label="See your public profile"
              variant="quiet"
              onPress={() => router.push(`/person/${actingAs.id}`)}
            />
          </View>
        </Card>
      </Section>

      <FinePrint>
        {`Cover posted across everything you have raised is currently ${(
          coverBps(actingAs) / 100
        ).toFixed(1)}%. Investors see this on your profile.`}
      </FinePrint>
    </Screen>
  );
}

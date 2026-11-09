import { View } from "react-native";
import { InterBold, InterRegular, InterSemiBold } from "./Text";
import { Badge, Card, Meter, type Tone } from "./ui";
import { COLORS, RADIUS_INNER, TYPE } from "@/constants/theme";
import { TIER_LABEL, type Score, type Tier } from "@/services/people";

/**
 * How a rank is shown.
 *
 * The score is never shown alone. Every place the number appears at size,
 * the components that produced it appear with it, each labelled with the
 * fact it came from. A reader who disagrees with the rank should be able to
 * see exactly which part they disagree with, which is the difference
 * between a rating and an assertion.
 */

export const TIER_TONE: Record<Tier, Tone> = {
  excellent: "positive",
  strong: "positive",
  fair: "caution",
  weak: "critical",
  unrated: "plain",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return <Badge label={TIER_LABEL[tier]} tone={TIER_TONE[tier]} />;
}

/** The headline number, with its tier. */
export function ScoreHeadline({ score }: { score: Score }) {
  if (score.tier === "unrated") {
    return (
      <View style={{ gap: 6 }}>
        <TierBadge tier="unrated" />
        <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText }}>
          {score.unratedBecause}
        </InterRegular>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <InterBold style={{ fontSize: 34, lineHeight: 38, color: COLORS.primaryText }}>
          {score.total}
        </InterBold>
        <InterRegular style={{ ...TYPE.body, color: COLORS.mutedText }}>/ 100</InterRegular>
      </View>
      <View style={{ paddingBottom: 5 }}>
        <TierBadge tier={score.tier} />
      </View>
    </View>
  );
}

/** Each component, its points, and the fact behind it. */
export function ScoreBreakdown({ score }: { score: Score }) {
  if (score.tier === "unrated") return null;

  return (
    <View style={{ gap: 13 }}>
      {score.components.map((c) => (
        <View key={c.label} style={{ gap: 5 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <InterSemiBold style={{ ...TYPE.body, color: COLORS.primaryText }}>
              {c.label}
            </InterSemiBold>
            <InterSemiBold style={{ ...TYPE.body, color: COLORS.secondaryText }}>
              {c.points} of {c.outOf}
            </InterSemiBold>
          </View>
          <Meter pct={(c.points / c.outOf) * 100} tone={toneForShare(c.points / c.outOf)} height={5} />
          <InterRegular style={{ ...TYPE.label, lineHeight: 16, color: COLORS.secondaryText }}>
            {c.basis}
          </InterRegular>
        </View>
      ))}
    </View>
  );
}

function toneForShare(share: number): Tone {
  if (share >= 0.8) return "positive";
  if (share >= 0.5) return "caution";
  return "critical";
}

/** The standing explanation, shown once per profile. */
export function HowThisIsWorkedOut({ kind }: { kind: "builder" | "manager" }) {
  const lines =
    kind === "builder"
      ? [
          "Delivery, out of 50. Jobs handed over on the published date count in full, late ones count for half, and an abandoned job counts against.",
          "Cover posted, out of 25. How much of everything they have raised is backed by their own stake. Full marks at 25%.",
          "Integrity, out of 25. Whether stake has ever been taken from them for a failure.",
        ]
      : [
          "Occupancy, out of 40. The share of time their units were actually let.",
          "Paying on time, out of 35. Rent periods credited to holders without a gap.",
          "Conduct, out of 25. Disputes a holder vote has upheld against them.",
        ];

  return (
    <Card style={{ backgroundColor: COLORS.cardBackground, borderColor: COLORS.cardBackground }}>
      <View style={{ gap: 9 }}>
        <InterSemiBold style={{ ...TYPE.body, color: COLORS.primaryText }}>
          How this is worked out
        </InterSemiBold>
        {lines.map((l) => (
          <View key={l} style={{ flexDirection: "row", gap: 7 }}>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: COLORS.mutedText,
                marginTop: 6,
              }}
            />
            <InterRegular
              style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText, flex: 1 }}
            >
              {l}
            </InterRegular>
          </View>
        ))}
        <View
          style={{
            backgroundColor: COLORS.background,
            borderRadius: RADIUS_INNER,
            padding: 10,
            marginTop: 2,
          }}
        >
          <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText }}>
            Every figure comes from events the chain already records. Nothing here is self
            reported, and Sheda does not adjust a score by hand.
          </InterRegular>
        </View>
      </View>
    </Card>
  );
}

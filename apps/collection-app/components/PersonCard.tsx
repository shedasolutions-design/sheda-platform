import { TouchableOpacity, View } from "react-native";
import { InterBold, InterRegular, InterSemiBold } from "./Text";
import { TierBadge } from "./Score";
import { Avatar } from "./ui";
import { COLORS, RADIUS, TYPE } from "@/constants/theme";
import { coverBps, finished, type RankedPerson } from "@/services/people";

/**
 * A builder or manager as they appear in the directory.
 *
 * The rank number is shown only where one was earned. An unrated profile
 * gets a dash rather than a position at the bottom of the list, because a
 * number there would read as "worst" when it means "no evidence".
 */
export default function PersonCard({
  entry,
  onPress,
}: {
  entry: RankedPerson;
  onPress?: () => void;
}) {
  const { person, score, rank } = entry;
  const done = finished(person);

  const summary =
    person.kind === "builder"
      ? `${done.length} finished · ${(coverBps(person) / 100).toFixed(0)}% cover posted`
      : `${person.management?.unitsManaged ?? 0} units · ${occupancyPct(entry)}% let`;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.borderColor,
        borderRadius: RADIUS,
        padding: 13,
      }}
    >
      <View style={{ width: 22, alignItems: "center" }}>
        <InterBold
          style={{
            ...TYPE.body,
            color: rank === null ? COLORS.mutedText : COLORS.primaryText,
          }}
        >
          {rank === null ? "–" : rank}
        </InterBold>
      </View>

      <Avatar name={person.name} size={40} />

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }} numberOfLines={1}>
          {person.name}
        </InterSemiBold>
        {/* Wraps rather than truncating. A rank is a claim about someone,
            and the line that says what it was built on is the last thing
            that should be cut off to make room for the number itself. */}
        <InterRegular
          style={{ ...TYPE.micro, lineHeight: 15, color: COLORS.secondaryText }}
          numberOfLines={2}
        >
          {person.location} · {summary}
        </InterRegular>
      </View>

      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {score.tier === "unrated" ? (
          <TierBadge tier="unrated" />
        ) : (
          <>
            <InterBold style={{ ...TYPE.title, color: COLORS.primaryText }}>
              {score.total}
            </InterBold>
            <TierBadge tier={score.tier} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

function occupancyPct(entry: RankedPerson): number {
  const m = entry.person.management;
  if (!m || m.mandateMonths === 0) return 0;
  return Math.round((m.letMonths / m.mandateMonths) * 100);
}

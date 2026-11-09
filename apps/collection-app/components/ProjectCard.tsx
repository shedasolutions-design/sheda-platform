import { TouchableOpacity, View } from "react-native";
import { InterBold, InterMedium, InterRegular, InterSemiBold } from "./Text";
import { COLORS, RADIUS } from "@/constants/theme";
import { naira } from "@/services/money";
import type { Project } from "@/services/projects";

/**
 * A raise, as it appears in a list.
 *
 * Two rules here come straight out of the risk register, and both are about
 * what a card implies rather than what it says.
 *
 * R26. The projected return is the builder's estimate. Showing it bare
 * makes it look like a platform figure, so it is labelled on the card, not
 * in terms somewhere else.
 *
 * The guarantee is shown as a ratio and is printed even when there is none.
 * A blank where a cover figure would sit reads as reassurance, and "no
 * guarantee" is exactly the thing a person deciding where to put money needs
 * to notice.
 */
export default function ProjectCard({
  project,
  onPress,
}: {
  project: Project;
  onPress?: () => void;
}) {
  const funded = Number(BigInt(project.raised) * 100n / BigInt(project.target || "1"));
  const covered = project.guaranteeBps > 0;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        backgroundColor: COLORS.background,
        borderColor: COLORS.borderColor,
        borderWidth: 1,
        borderRadius: RADIUS,
        overflow: "hidden",
        marginBottom: 14,
      }}
    >
      <View
        style={{
          height: 132,
          backgroundColor: COLORS.cardBackground,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <InterMedium style={{ color: COLORS.secondaryText, fontSize: 12 }}>
          {project.location}
        </InterMedium>
      </View>

      <View style={{ padding: 14, gap: 10 }}>
        <View>
          <InterBold style={{ fontSize: 16, color: COLORS.primaryText }}>{project.name}</InterBold>
          <InterRegular style={{ fontSize: 12, color: COLORS.secondaryText, marginTop: 2 }}>
            {project.builder} · {project.units} units
          </InterRegular>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Stat
            label="Est. return"
            value={`${project.estimatedReturnPct}% p.a.`}
            note="builder's figure"
          />
          <Stat
            label="Guarantee"
            value={covered ? `${(project.guaranteeBps / 100).toFixed(0)}% cover` : "None"}
            tone={covered ? "positive" : "plain"}
            note={covered ? "if the build stalls" : "no cover offered"}
          />
        </View>

        <View style={{ gap: 6 }}>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.cardBackground,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.min(100, Math.max(0, funded))}%`,
                height: "100%",
                backgroundColor: COLORS.primary,
              }}
            />
          </View>
          <InterRegular style={{ fontSize: 12, color: COLORS.secondaryText }}>
            {naira(project.raised, 0)} of {naira(project.target, 0)} · {project.daysLeft} days left
          </InterRegular>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "plain" | "positive";
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tone === "positive" ? COLORS.positiveLight : COLORS.cardBackground,
        borderRadius: 8,
        padding: 10,
      }}
    >
      <InterRegular style={{ fontSize: 10, color: COLORS.secondaryText }}>{label}</InterRegular>
      <InterSemiBold
        style={{
          fontSize: 14,
          marginTop: 2,
          color: tone === "positive" ? COLORS.positive : COLORS.primaryText,
        }}
      >
        {value}
      </InterSemiBold>
      {note ? (
        <InterRegular style={{ fontSize: 9, color: COLORS.secondaryText, marginTop: 1 }}>
          {note}
        </InterRegular>
      ) : null}
    </View>
  );
}

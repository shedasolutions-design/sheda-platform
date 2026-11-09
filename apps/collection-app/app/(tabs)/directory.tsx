import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import PersonCard from "@/components/PersonCard";
import { InterRegular } from "@/components/Text";
import { FinePrint, PageTitle, Screen, Section, Segmented } from "@/components/ui";
import { COLORS, TYPE } from "@/constants/theme";
import { ranked, type PersonKind } from "@/services/people";

/**
 * Everyone who can be backed, in order.
 *
 * The ranked list is the point of the directory, but the part that does the
 * work is the split between rated and unrated. A new builder appearing at
 * the bottom of a single ordered list reads as the worst one, when what is
 * true is that nobody knows yet. So the unrated profiles sit under their own
 * heading, which says so.
 */
export default function Directory() {
  const [kind, setKind] = useState<PersonKind>("builder");
  const entries = ranked(kind);
  const rated = entries.filter((e) => e.rank !== null);
  const unrated = entries.filter((e) => e.rank === null);

  return (
    <Screen>
      <PageTitle
        title="Who you are backing"
        subtitle="Builders put the buildings up. Managers let them and pass the rent on. Both are ranked on what the chain has recorded them doing."
      />

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "builder", label: "Builders" },
          { value: "manager", label: "Managers" },
        ]}
      />

      <Section title={kind === "builder" ? "Ranked builders" : "Ranked managers"}>
        {rated.map((entry) => (
          <PersonCard
            key={entry.person.id}
            entry={entry}
            onPress={() => router.push(`/person/${entry.person.id}`)}
          />
        ))}
      </Section>

      {unrated.length > 0 ? (
        <Section title="Not enough history yet">
          <InterRegular
            style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText, marginBottom: 2 }}
          >
            {kind === "builder"
              ? "Fewer than two finished projects on Sheda. They are not ranked low, they are not ranked at all."
              : "Under a year of mandates. There is not enough yet to say how they manage a building."}
          </InterRegular>
          {unrated.map((entry) => (
            <PersonCard
              key={entry.person.id}
              entry={entry}
              onPress={() => router.push(`/person/${entry.person.id}`)}
            />
          ))}
        </Section>
      ) : null}

      <FinePrint>
        Ranks are computed from on-chain events alone. Sheda does not adjust them, and a high rank
        is a record of what someone has done before, not a prediction or a recommendation.
      </FinePrint>
    </Screen>
  );
}

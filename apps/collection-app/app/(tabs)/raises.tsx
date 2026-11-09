import { View } from "react-native";
import { router } from "expo-router";
import Button from "@/components/Button";
import { InterRegular, InterSemiBold } from "@/components/Text";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  FinePrint,
  Meter,
  Note,
  PageTitle,
  Screen,
  Section,
  StatRow,
  StatTile,
} from "@/components/ui";
import { COLORS, TYPE } from "@/constants/theme";
import { naira } from "@/services/money";
import { projectsOf, releasedSoFar } from "@/services/builder";
import { finished, scoreFor, type TrackRecordEntry } from "@/services/people";
import { useActingBuilder } from "@/services/role";
import type { Project } from "@/services/projects";

/**
 * What a builder is running.
 *
 * Two figures matter more than the rest and are put side by side: what has
 * been raised, and what has actually been released. A builder reading only
 * the first would think the money is theirs, and the whole point of the
 * phase schedule is that it is not yet.
 */
export default function Raises() {
  const actingAs = useActingBuilder();

  const live = projectsOf(actingAs.id);
  const history = finished(actingAs);
  const score = scoreFor(actingAs);

  return (
    <Screen>
      <PageTitle
        title={actingAs.name}
        subtitle={`Builder since ${actingAs.since}. ${
          score.tier === "unrated" ? "Not ranked yet." : `Ranked ${score.total} out of 100.`
        }`}
      />

      <Section title="Open raises">
        {live.length === 0 ? (
          <EmptyState
            title="No open raises"
            body="Start one and it will appear here with its phase schedule."
          />
        ) : (
          live.map((p) => <RaiseCard key={p.id} project={p} />)
        )}
      </Section>

      <Button
        label="Start a new raise"
        variant="outline"
        onPress={() => {
          // Opening a raise writes to the raise contract, which is stage 3.
          // The screens that collect it come with it, because collecting
          // terms the contract cannot yet enforce would be a form that
          // lies.
        }}
      />

      <Note>
        A new raise needs free stake to back its completion guarantee. You have{" "}
        {naira(actingAs.stake.free, 0)} free, which is enough to advertise cover on a raise of up
        to {naira((BigInt(actingAs.stake.free) * 4n).toString(), 0)} at 25%.
      </Note>

      {history.length > 0 ? (
        <Section title="Delivered">
          {history.map((entry) => (
            <HistoryRow key={entry.projectId} entry={entry} />
          ))}
        </Section>
      ) : null}

      <FinePrint>
        Everything on this page is public. Investors see the same record, including anything that
        went wrong.
      </FinePrint>
    </Screen>
  );
}

function RaiseCard({ project }: { project: Project }) {
  const raisedPct = Number((BigInt(project.raised) * 100n) / BigInt(project.target || "1"));
  const released = releasedSoFar(project);
  const releasedPct = Number((BigInt(released) * 100n) / BigInt(project.target || "1"));

  return (
    <Card>
      <View style={{ gap: 13 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>
              {project.name}
            </InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              {project.location} · closes in {project.daysLeft} days
            </InterRegular>
          </View>
          <Badge label="Raising" tone="brand" />
        </View>

        <View style={{ gap: 6 }}>
          <Meter pct={raisedPct} />
          <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
            {naira(project.raised, 0)} of {naira(project.target, 0)} committed
          </InterRegular>
        </View>

        <Divider />

        <StatRow>
          <StatTile
            label="Released to you"
            value={naira(released, 0)}
            note={`${releasedPct}% of the target`}
            tone={releasedPct > 0 ? "positive" : "plain"}
          />
          <StatTile
            label="Still in escrow"
            value={naira((BigInt(project.raised) - BigInt(released)).toString(), 0)}
            note="held until phases pass"
          />
        </StatRow>

        <Button
          label="View as an investor sees it"
          variant="quiet"
          onPress={() => router.push(`/project/${project.id}`)}
        />
      </View>
    </Card>
  );
}

function HistoryRow({ entry }: { entry: TrackRecordEntry }) {
  const tone =
    entry.outcome === "on-time" ? "positive" : entry.outcome === "late" ? "caution" : "critical";
  const label =
    entry.outcome === "on-time" ? "On time" : entry.outcome === "late" ? "Late" : "Abandoned";

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>
            {entry.name}
          </InterSemiBold>
          <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
            {entry.year} · {naira(entry.raised, 0)} raised
          </InterRegular>
        </View>
        <Badge label={label} tone={tone} />
      </View>
    </Card>
  );
}

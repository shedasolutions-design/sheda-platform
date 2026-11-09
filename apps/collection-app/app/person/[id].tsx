import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { InterBold, InterMedium, InterRegular, InterSemiBold } from "@/components/Text";
import { HowThisIsWorkedOut, ScoreBreakdown, ScoreHeadline } from "@/components/Score";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  EmptyState,
  KeyValue,
  ListRow,
  Note,
  Screen,
  Section,
  StatRow,
  StatTile,
  type Tone,
} from "@/components/ui";
import { COLORS, TYPE } from "@/constants/theme";
import { naira } from "@/services/money";
import {
  coverBps,
  getPerson,
  ranked,
  scoreFor,
  totalRaised,
  worksWith,
  type Person,
  type TrackRecordEntry,
} from "@/services/people";

/**
 * A builder or a manager, in full.
 *
 * The things that would be left out of a brochure are the point of this
 * page: the abandoned job, the slashed stake, the months a building sat
 * empty. A profile that only lists successes tells a reader nothing they
 * can use, because every profile would look the same.
 */
export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = getPerson(String(id));

  if (!person) {
    return (
      <Screen>
        <EmptyState
          title="We could not find that profile"
          body="It may have been removed. Go back and pick another."
        />
      </Screen>
    );
  }

  const score = scoreFor(person);
  const place = ranked(person.kind).find((e) => e.person.id === person.id);
  const peers = worksWith(person);

  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Avatar name={person.name} size={56} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <InterBold style={{ ...TYPE.title, color: COLORS.primaryText }}>{person.name}</InterBold>
          <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
            {person.kind === "builder" ? "Builder" : "Property manager"} · {person.location}
          </InterRegular>
          <InterRegular style={{ ...TYPE.micro, color: COLORS.mutedText }}>
            {person.accountId}
          </InterRegular>
        </View>
      </View>

      <InterRegular style={{ ...TYPE.body, color: COLORS.primaryText }}>{person.about}</InterRegular>

      {person.partOfGroup ? (
        <Note>
          Part of the same group as {person.partOfGroup}. They may not sign off construction
          phases on that builder&apos;s own projects, because nobody should be able to approve
          their own work.
        </Note>
      ) : null}

      <Card>
        <View style={{ gap: 15 }}>
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}
          >
            <ScoreHeadline score={score} />
            {place?.rank ? (
              <Badge
                label={`#${place.rank} of ${ranked(person.kind).filter((e) => e.rank !== null).length}`}
                tone="brand"
              />
            ) : null}
          </View>
          {score.tier === "unrated" ? null : (
            <>
              <Divider />
              <ScoreBreakdown score={score} />
            </>
          )}
        </View>
      </Card>

      <HowThisIsWorkedOut kind={person.kind} />

      {person.kind === "builder" ? (
        <BuilderFacts person={person} />
      ) : (
        <ManagerFacts person={person} />
      )}

      <Section title="Every job, including the bad ones">
        {person.record.map((entry) => (
          <RecordRow key={entry.projectId} entry={entry} />
        ))}
      </Section>

      {peers.length > 0 ? (
        <Section title="Works with">
          {peers.map((p) => (
            <ListRow
              key={p.id}
              leading={<Avatar name={p.name} size={34} />}
              title={p.name}
              subtitle={p.kind === "builder" ? "Builder" : "Property manager"}
              onPress={() => router.push(`/person/${p.id}`)}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function BuilderFacts({ person }: { person: Person }) {
  const slashed = person.stake.slashCount > 0;

  return (
    <Section title="Stake behind their promises">
      <StatRow>
        <StatTile label="Posted" value={naira(person.stake.total, 0)} />
        <StatTile
          label="Backing live raises"
          value={naira(person.stake.allocated, 0)}
          note="cannot be withdrawn"
        />
      </StatRow>
      <StatRow>
        <StatTile
          label="Free to back a new raise"
          value={naira(person.stake.free, 0)}
          tone={BigInt(person.stake.free) > 0n ? "positive" : "plain"}
        />
        <StatTile
          label="Ever slashed"
          value={naira(person.stake.slashedTotal, 0)}
          tone={slashed ? "critical" : "plain"}
          note={slashed ? `${person.stake.slashCount} time` : "never"}
        />
      </StatRow>

      <Card>
        <View style={{ gap: 13 }}>
          <KeyValue
            label="Raised across every job"
            value={naira(totalRaised(person), 0)}
            note={`${person.record.length} raises since ${person.since}`}
          />
          <Divider />
          <KeyValue
            label="Cover posted against that"
            value={`${(coverBps(person) / 100).toFixed(1)}%`}
            note="Their own money, forfeited to holders if a build stalls below half finished."
            tone={coverBps(person) >= 2000 ? "positive" : coverBps(person) >= 500 ? "caution" : "critical"}
          />
        </View>
      </Card>

      {slashed ? (
        <Note tone="critical">
          {naira(person.stake.slashedTotal, 0)} of this builder&apos;s stake has been taken and
          paid to holders after a project failed. That is kept on the profile permanently.
        </Note>
      ) : null}
    </Section>
  );
}

function ManagerFacts({ person }: { person: Person }) {
  const m = person.management;
  if (!m) return null;

  const occupancy = m.mandateMonths > 0 ? Math.round((m.letMonths / m.mandateMonths) * 100) : 0;
  const onTime = m.periodsDue > 0 ? Math.round((m.periodsPaidOnTime / m.periodsDue) * 100) : 0;

  return (
    <Section title="What their mandates have done">
      <StatRow>
        <StatTile label="Units managed" value={String(m.unitsManaged)} />
        <StatTile
          label="Of the time, let"
          value={`${occupancy}%`}
          tone={occupancy >= 90 ? "positive" : occupancy >= 70 ? "caution" : "critical"}
        />
      </StatRow>
      <StatRow>
        <StatTile
          label="Rent periods paid on time"
          value={`${onTime}%`}
          tone={onTime >= 95 ? "positive" : onTime >= 80 ? "caution" : "critical"}
          note={`${m.periodsPaidOnTime} of ${m.periodsDue}`}
        />
        <StatTile
          label="Disputes upheld"
          value={String(m.disputesUpheld)}
          tone={m.disputesUpheld === 0 ? "positive" : "critical"}
        />
      </StatRow>

      <Card>
        <KeyValue
          label="Rent passed through to holders"
          value={naira(m.rentPaidOut, 0)}
          note="Counted from credits the vaults recorded, not from what the manager reports."
        />
      </Card>

      {m.disputesUpheld > 0 ? (
        <Note tone="critical">
          A holder vote has upheld {m.disputesUpheld} dispute against this manager. Holders can
          vote to replace a manager at any time.
        </Note>
      ) : null}
    </Section>
  );
}

const OUTCOME: Record<TrackRecordEntry["outcome"], { label: string; tone: Tone }> = {
  "on-time": { label: "On time", tone: "positive" },
  late: { label: "Late", tone: "caution" },
  abandoned: { label: "Abandoned", tone: "critical" },
  running: { label: "In progress", tone: "brand" },
};

function RecordRow({ entry }: { entry: TrackRecordEntry }) {
  const outcome = OUTCOME[entry.outcome];

  return (
    <Card>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>
              {entry.name}
            </InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              {entry.location} · {entry.year}
            </InterRegular>
          </View>
          <Badge label={outcome.label} tone={outcome.tone} />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <InterMedium style={{ ...TYPE.label, color: COLORS.secondaryText }}>
            {naira(entry.raised, 0)} raised
          </InterMedium>
          {entry.monthsLate ? (
            <InterMedium style={{ ...TYPE.label, color: COLORS.caution }}>
              {entry.monthsLate} months past handover
            </InterMedium>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

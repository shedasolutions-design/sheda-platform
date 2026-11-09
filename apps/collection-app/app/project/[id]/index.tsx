import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Button from "@/components/Button";
import { InterMedium, InterRegular, InterSemiBold } from "@/components/Text";
import { TierBadge } from "@/components/Score";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  EmptyState,
  KeyValue,
  Meter,
  Screen,
  Section,
  StatRow,
  StatTile,
  Chevron,
} from "@/components/ui";
import { ListRow } from "@/components/ui";
import { COLORS, TYPE } from "@/constants/theme";
import { naira } from "@/services/money";
import { getProject, type DocumentStatus, type Phase } from "@/services/projects";
import { getPerson, scoreFor } from "@/services/people";

/**
 * Everything someone needs before committing money.
 *
 * Under an open market model the investor carries the judgement, so this
 * screen owes them the material to make it: who is asking, what has been
 * checked, what has not, and what they have delivered before. An unverified
 * document is shown as loudly as a verified one, because a blank reads as
 * approval.
 */
export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = getProject(String(id));

  if (!project) {
    return (
      <Screen>
        <EmptyState
          title="We could not find that project"
          body="It may have closed. Go back and pick another."
        />
      </Screen>
    );
  }

  const covered = project.guaranteeBps > 0;
  const raisedPct = Number((BigInt(project.raised) * 100n) / BigInt(project.target || "1"));

  return (
    <Screen>
      <View style={{ gap: 9 }}>
        <InterSemiBold style={{ ...TYPE.display, color: COLORS.primaryText }}>
          {project.name}
        </InterSemiBold>
        <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
          {project.location} · {project.units} units
        </InterRegular>
        <InterRegular style={{ ...TYPE.body, color: COLORS.primaryText }}>
          {project.description}
        </InterRegular>
      </View>

      <Card>
        <View style={{ gap: 13 }}>
          <View style={{ gap: 7 }}>
            <Meter pct={raisedPct} height={7} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <InterSemiBold style={{ ...TYPE.body, color: COLORS.primaryText }}>
                {naira(project.raised, 0)} of {naira(project.target, 0)}
              </InterSemiBold>
              <InterRegular style={{ ...TYPE.body, color: COLORS.secondaryText }}>
                {project.daysLeft} days left
              </InterRegular>
            </View>
          </View>

          <Divider />

          <StatRow>
            <StatTile
              label="Estimated return"
              value={`${project.estimatedReturnPct}% a year`}
              note="the builder's figure"
            />
            <StatTile
              label="Completion guarantee"
              value={covered ? `${(project.guaranteeBps / 100).toFixed(0)}%` : "None"}
              tone={covered ? "positive" : "caution"}
              note={covered ? "of what you put in" : "no cover offered"}
            />
          </StatRow>

          <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText }}>
            {covered
              ? "The guarantee is returned to you if the build stalls below half finished. It is a share of your money, not all of it. The return is the builder's own estimate and Sheda does not verify it."
              : "If this build stalls you recover only what has not already been spent. The return is the builder's own estimate and Sheda does not verify it."}
          </InterRegular>
        </View>
      </Card>

      <Section title="Who is behind this">
        <PersonRow id={project.builderId} role="Builder" />
        <PersonRow id={project.managerId} role="Property manager" />
        {project.builderIsManager ? (
          <Card style={{ backgroundColor: COLORS.cautionLight, borderColor: COLORS.cautionLight }}>
            <InterMedium style={{ ...TYPE.label, lineHeight: 17, color: COLORS.caution }}>
              The manager is part of the builder&apos;s own group, so they may not sign off these
              construction phases. An independent reviewer is required before any money is
              released.
            </InterMedium>
          </Card>
        ) : null}
      </Section>

      <Section title="Documents">
        <Card>
          <View style={{ gap: 13 }}>
            {project.documents.map((doc, i) => (
              <View key={doc.label} style={{ gap: 13 }}>
                {i > 0 ? <Divider /> : null}
                <DocumentRow label={doc.label} status={doc.status} />
              </View>
            ))}
          </View>
        </Card>
      </Section>

      <Section title="How the money is released">
        <Card>
          <View style={{ gap: 14 }}>
            {project.phases.map((phase, index) => (
              <PhaseRow key={phase.name} phase={phase} index={index} />
            ))}
          </View>
        </Card>
        <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText }}>
          Each phase is inspected and signed off before its money is released. Holders have seven
          days to object, and a quarter of them objecting holds the payment.
        </InterRegular>
      </Section>

      <Button label="Choose a unit" onPress={() => router.push(`/project/${project.id}/units`)} />
    </Screen>
  );
}

/** The builder or manager, with their rank, opening their full profile. */
function PersonRow({ id, role }: { id: string; role: string }) {
  const person = getPerson(id);
  if (!person) return null;
  const score = scoreFor(person);

  return (
    <ListRow
      leading={<Avatar name={person.name} size={40} />}
      title={person.name}
      subtitle={`${role} · ${person.location}`}
      onPress={() => router.push(`/person/${person.id}`)}
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            {score.tier === "unrated" ? (
              <TierBadge tier="unrated" />
            ) : (
              <>
                <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>
                  {score.total}
                </InterSemiBold>
                <TierBadge tier={score.tier} />
              </>
            )}
          </View>
          <Chevron />
        </View>
      }
    />
  );
}

const DOC_LABEL: Record<DocumentStatus, string> = {
  verified: "Verified by Sheda",
  uploaded: "Uploaded, not verified",
  missing: "Not provided",
};

function DocumentRow({ label, status }: { label: string; status: DocumentStatus }) {
  const tone = status === "verified" ? "positive" : status === "uploaded" ? "caution" : "critical";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <InterMedium style={{ ...TYPE.body, color: COLORS.primaryText, flexShrink: 1 }}>
        {label}
      </InterMedium>
      <Badge label={DOC_LABEL[status]} tone={tone} />
    </View>
  );
}

function PhaseRow({ phase, index }: { phase: Phase; index: number }) {
  const done = phase.status === "done";
  const current = phase.status === "current";
  const colour = done ? COLORS.positive : current ? COLORS.primary : COLORS.mutedText;
  const background = done
    ? COLORS.positiveLight
    : current
      ? COLORS.active
      : COLORS.cardBackground;

  return (
    <View style={{ flexDirection: "row", gap: 11, alignItems: "flex-start" }}>
      <View
        style={{
          width: 21,
          height: 21,
          borderRadius: 11,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <InterSemiBold style={{ ...TYPE.micro, color: colour }}>
          {done ? "✓" : String(index + 1)}
        </InterSemiBold>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <InterMedium style={{ ...TYPE.body, color: COLORS.primaryText }}>{phase.name}</InterMedium>
        <InterRegular style={{ ...TYPE.label, lineHeight: 16, color: COLORS.secondaryText }}>
          {(phase.tranche / 100).toFixed(0)}% of the raise
          {phase.attestedBy ? ` · signed off by ${phase.attestedBy}` : ""}
          {current ? " · in progress" : ""}
        </InterRegular>
      </View>
    </View>
  );
}

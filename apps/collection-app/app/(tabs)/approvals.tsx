import { View } from "react-native";
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
  type Tone,
} from "@/components/ui";
import { COLORS, TYPE } from "@/constants/theme";
import { bpsToPercent, naira } from "@/services/money";
import {
  PHASE_LABEL,
  actionFor,
  pipelineFor,
  trancheValue,
  type PhaseState,
  type PhaseStatus,
} from "@/services/builder";
import { getProject } from "@/services/projects";
import { useActingBuilder } from "@/services/role";

/**
 * The phases, and who is holding each one up.
 *
 * A builder's real question here is never "what is the status", it is "what
 * is stopping my money". So every row names the party the phase is waiting
 * on and what, if anything, the builder can do about it. Where the answer
 * is nothing, the row says that rather than offering a button that quietly
 * does not work.
 */
const TONE: Record<PhaseState, Tone> = {
  locked: "plain",
  building: "brand",
  "awaiting-inspection": "caution",
  "objection-window": "caution",
  held: "critical",
  released: "positive",
};

export default function Approvals() {
  const actingAs = useActingBuilder();

  const pipeline = pipelineFor(actingAs.id);
  const active = pipeline.filter((p) => p.state !== "released" && p.state !== "locked");
  const released = pipeline.filter((p) => p.state === "released");
  const upcoming = pipeline.filter((p) => p.state === "locked");

  return (
    <Screen>
      <PageTitle
        title="Sign-offs"
        subtitle="Money is released a phase at a time. Each one is inspected by the property manager, then holders have seven days to object."
      />

      <Note>
        You cannot sign off your own phases. An inspection is carried out by the property manager
        on the project, who must be independent of you, and the money moves only after the
        objection window closes.
      </Note>

      <Section title="Needs attention">
        {active.length === 0 ? (
          <EmptyState title="Nothing waiting" body="Every phase is either released or not started." />
        ) : (
          active.map((p) => <PhaseCard key={`${p.projectId}-${p.index}`} phase={p} />)
        )}
      </Section>

      {released.length > 0 ? (
        <Section title="Released">
          {released.map((p) => (
            <PhaseCard key={`${p.projectId}-${p.index}`} phase={p} compact />
          ))}
        </Section>
      ) : null}

      {upcoming.length > 0 ? (
        <Section title="Later phases">
          {upcoming.map((p) => (
            <PhaseCard key={`${p.projectId}-${p.index}`} phase={p} compact />
          ))}
        </Section>
      ) : null}

      <FinePrint>
        Holders see every one of these states on the project page, including a payment that is
        being held.
      </FinePrint>
    </Screen>
  );
}

function PhaseCard({ phase, compact = false }: { phase: PhaseStatus; compact?: boolean }) {
  const project = getProject(phase.projectId);
  const worth = project ? trancheValue(project, phase.tranche) : "0";
  const action = actionFor(phase.state);

  return (
    <Card>
      <View style={{ gap: compact ? 8 : 13 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>
              {phase.name}
            </InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
              {phase.projectName} · {naira(worth, 0)}
            </InterRegular>
          </View>
          <Badge label={PHASE_LABEL[phase.state]} tone={TONE[phase.state]} />
        </View>

        {compact ? null : (
          <>
            <Divider />
            <WaitingOn phase={phase} />
            {action ? (
              <Button
                label={action}
                variant={phase.state === "held" ? "primary" : "quiet"}
                onPress={() => {
                  // Each of these writes to the raise contract, which is
                  // stage 3. The states and the parties are settled here
                  // first because they are what the contract has to encode.
                }}
              />
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}

function WaitingOn({ phase }: { phase: PhaseStatus }) {
  if (phase.state === "objection-window") {
    const objected = phase.objectionBps ?? 0;
    const share = (objected / phase.objectionThresholdBps) * 100;

    return (
      <View style={{ gap: 9 }}>
        <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText }}>
          {phase.inspector} signed this off on {phase.attestedOn}. Holders have {phase.daysLeft}{" "}
          days left to object.
        </InterRegular>
        <Meter pct={share} tone={share >= 100 ? "critical" : "caution"} height={5} />
        <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
          {bpsToPercent(objected)} of holders have objected. It takes{" "}
          {bpsToPercent(phase.objectionThresholdBps)} to hold the payment.
        </InterRegular>
      </View>
    );
  }

  const line =
    phase.state === "awaiting-inspection"
      ? `Waiting on ${phase.inspector} to inspect and sign off. You cannot move this along yourself.`
      : phase.state === "building"
        ? "Yours to finish. Request an inspection once it is done."
        : phase.state === "held"
          ? "Enough holders objected that the payment is held. It stays held until the objection is resolved."
          : "Not started. The phase before this one has to be released first.";

  return (
    <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText }}>
      {line}
    </InterRegular>
  );
}

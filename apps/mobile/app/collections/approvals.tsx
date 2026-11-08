import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import InterRegular from "@/components/Text/InterRegular";
import InterSemiBold from "@/components/Text/InterSemiBold";
import {
  Badge,
  C,
  Card,
  CollectionsButton,
  Divider,
  Empty,
  FinePrint,
  Note,
  NotLiveYet,
  PageTitle,
  Screen,
  Section,
  TYPE,
  type Tone,
} from "@/components/collections/ui";
import { useCollections, useMyCollectionProfiles } from "@/hooks/useCollections";
import apiService, {
  type CollectionPhase,
  type CollectionPhaseState,
  type CollectionProjectDetail,
  type CollectionProjectSummary,
} from "@/services/api";

/**
 * The phases, and who is holding each one up.
 *
 * A builder's real question here is never "what is the status", it is
 * "what is stopping my money". So every row names the party the phase is
 * waiting on and what, if anything, the builder can do about it. Where
 * the answer is nothing, the row says so rather than offering a button
 * that quietly does not work.
 */
const LABEL: Record<CollectionPhaseState, string> = {
  locked: "Not started",
  building: "Building",
  awaiting_inspection: "Waiting on inspection",
  objection_window: "Holders may object",
  held: "Payment held",
  released: "Released",
};

const TONE: Record<CollectionPhaseState, Tone> = {
  locked: "plain",
  building: "brand",
  awaiting_inspection: "caution",
  objection_window: "caution",
  held: "critical",
  released: "positive",
};

interface Row {
  project: CollectionProjectDetail;
  phase: CollectionPhase;
}

export default function Approvals() {
  const { builder } = useMyCollectionProfiles();
  const { requestInspection, capabilities, loading, error } = useCollections();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const mine = await apiService.getMyCollectionProjects();
    if (!mine.ok) {
      setRows([]);
      return;
    }
    const summaries = mine.data as CollectionProjectSummary[];
    const details = await Promise.all(
      summaries.map((s) => apiService.getCollectionProject(s.slug))
    );
    const collected: Row[] = [];
    details.forEach((d) => {
      if (!d.ok) return;
      const project = d.data as CollectionProjectDetail;
      project.phases.forEach((phase) => collected.push({ project, phase }));
    });
    setRows(collected);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRequest = async (row: Row) => {
    setBusy(row.phase.id);
    const result = await requestInspection(row.project.slug, row.phase.position);
    setBusy(null);
    if (result.success) load();
  };

  const active = (rows ?? []).filter(
    (r) => r.phase.state !== "released" && r.phase.state !== "locked"
  );
  const released = (rows ?? []).filter((r) => r.phase.state === "released");
  const later = (rows ?? []).filter((r) => r.phase.state === "locked");

  return (
    <>
      <Stack.Screen options={{ title: "Sign-offs" }} />
      <Screen>
        <PageTitle
          title="Sign-offs"
          subtitle="Money is released a phase at a time. Each one is inspected by the property manager, then holders have seven days to object."
        />

        <Note>
          You cannot sign off your own phases. An inspection is carried out by the property
          manager on the project, who must be independent of you, and the money moves only after
          the objection window closes.
        </Note>

        {error ? <Note tone="critical">{error}</Note> : null}

        {!builder ? (
          <Empty
            title="You do not have a builder profile"
            body="Sign-offs belong to a raise, and a raise belongs to a builder profile."
          />
        ) : rows === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : rows.length === 0 ? (
          <Empty
            title="No phases yet"
            body="Open a raise with a phase schedule and each step will appear here."
          />
        ) : (
          <>
            <Section title="Needs attention">
              {active.length === 0 ? (
                <Empty
                  title="Nothing waiting"
                  body="Every phase is either released or not started."
                />
              ) : (
                active.map((row) => (
                  <PhaseCard
                    key={row.phase.id}
                    row={row}
                    busy={busy === row.phase.id}
                    canAct={capabilities.raises}
                    onRequest={() => onRequest(row)}
                  />
                ))
              )}
            </Section>

            {released.length > 0 ? (
              <Section title="Released">
                {released.map((row) => (
                  <PhaseCard key={row.phase.id} row={row} compact />
                ))}
              </Section>
            ) : null}

            {later.length > 0 ? (
              <Section title="Later phases">
                {later.map((row) => (
                  <PhaseCard key={row.phase.id} row={row} compact />
                ))}
              </Section>
            ) : null}
          </>
        )}

        {!capabilities.raises && rows && rows.length > 0 ? (
          <NotLiveYet
            what="Acting on a phase is not live yet"
            body="The schedule above is real and holders can read it. Requesting an inspection writes to the raise contract, which is not deployed, so the buttons stay out until they can do what they say."
          />
        ) : null}

        <FinePrint>
          Holders see every one of these states on the project page, including a payment that is
          being held.
        </FinePrint>
      </Screen>
    </>
  );
}

function PhaseCard({
  row,
  compact = false,
  busy = false,
  canAct = false,
  onRequest,
}: {
  row: Row;
  compact?: boolean;
  busy?: boolean;
  canAct?: boolean;
  onRequest?: () => void;
}) {
  const { project, phase } = row;
  const manager = project.manager?.display_name ?? "the property manager";

  return (
    <Card>
      <View style={{ gap: compact ? 8 : 13 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{phase.name}</InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
              {project.name} · {(phase.tranche_bps / 100).toFixed(0)}% of the raise
            </InterRegular>
          </View>
          <Badge label={LABEL[phase.state]} tone={TONE[phase.state]} />
        </View>

        {compact ? null : (
          <>
            <Divider />
            <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
              {waitingOn(phase.state, manager)}
            </InterRegular>
            {phase.state === "building" && canAct && onRequest ? (
              <CollectionsButton
                label="Mark finished and request inspection"
                variant="quiet"
                loading={busy}
                onPress={onRequest}
              />
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}

function waitingOn(state: CollectionPhaseState, manager: string): string {
  switch (state) {
    case "building":
      return "Yours to finish. Request an inspection once it is done.";
    case "awaiting_inspection":
      return `Waiting on ${manager} to inspect and sign off. You cannot move this along yourself.`;
    case "objection_window":
      return `${manager} has signed this off. Holders have seven days to object, and a quarter of them objecting holds the payment.`;
    case "held":
      return "Enough holders objected that the payment is held. It stays held until the objection is resolved.";
    case "released":
      return "Paid out.";
    default:
      return "Not started. The phase before this one has to be released first.";
  }
}

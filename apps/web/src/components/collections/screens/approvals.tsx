"use client";

import { withChainState } from "@/services/collections/chain";
import { InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "@/components/collections/rn";
import { Stack } from "@/components/collections/nav";
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
  const { builder, manager, actingAccountMatches } = useMyCollectionProfiles();
  const { requestInspection, attest, capabilities, error } = useCollections();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!builder && !manager) {
      setRows([]);
      return;
    }

    // A project can reach this screen from either side. The builder is
    // asking for an inspection; the manager is the one who performs it.
    // Both lists are read and deduped on the slug so a person holding both
    // profiles sees each phase once.
    const responses: Awaited<
      ReturnType<typeof apiService.getMyCollectionProjects>
    >[] = [];
    if (builder) responses.push(await apiService.getMyCollectionProjects());
    if (manager) responses.push(await apiService.getManagedCollectionProjects());

    const summaries = new Map<string, CollectionProjectSummary>();
    responses.forEach((response) => {
      if (!response.ok) return;
      (response.data as CollectionProjectSummary[]).forEach((summary) => {
        summaries.set(summary.slug, summary);
      });
    });

    const details = await Promise.all(
      Array.from(summaries.values()).map((s) =>
        apiService.getCollectionProject(s.slug)
      )
    );
    const collected: Row[] = [];
    // Phase states as the contract has them: the backend's copy still said
    // "Building" after the builder had requested an inspection on chain.
    const live = await Promise.all(
      details.filter((d) => d.ok).map((d) => withChainState(d.data as CollectionProjectDetail))
    );
    live.forEach((project) => {
      project.phases.forEach((phase) => collected.push({ project, phase }));
    });
    setRows(collected);
  }, [builder, manager]);

  useEffect(() => {
    load();
  }, [load]);

  const onRequest = async (row: Row) => {
    setBusy(row.phase.id);
    const result = await requestInspection(row.project.slug, row.phase.position);
    setBusy(null);
    if (result.success) load();
  };

  const onAttest = async (row: Row) => {
    setBusy(row.phase.id);
    const result = await attest(row.project.slug, row.phase.position);
    setBusy(null);
    if (result.success) load();
  };

  const roleFor = (project: CollectionProjectDetail): Viewer => {
    if (manager && project.manager?.id === manager.id) return "manager";
    if (builder && project.builder?.id === builder.id) return "builder";
    return "viewer";
  };

  const canRequestOn = (project: CollectionProjectDetail): boolean =>
    Boolean(
      builder &&
        project.builder?.id === builder.id &&
        actingAccountMatches(builder) &&
        capabilities.raises
    );

  const canAttestOn = (project: CollectionProjectDetail): boolean =>
    Boolean(
      manager &&
        project.manager?.id === manager.id &&
        actingAccountMatches(manager) &&
        capabilities.raises
    );

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
          subtitle="Money is released a phase at a time. The builder asks for an inspection, the property manager signs it off, then holders have seven days to object."
        />

        <Note>
          You cannot sign off your own phases. An inspection is carried out by the property
          manager on the project, who must be independent of the builder, and the money moves
          only after the objection window closes.
        </Note>

        {error ? <Note tone="critical">{error}</Note> : null}

        {!builder && !manager ? (
          <Empty
            title="You do not have a Collections profile"
            body="Sign-offs belong to a raise. A builder requests an inspection and a property manager performs it."
          />
        ) : rows === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : rows.length === 0 ? (
          <Empty
            title="No phases yet"
            body="A raise with a phase schedule will list each step here."
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
                    viewer={roleFor(row.project)}
                    busy={busy === row.phase.id}
                    live={capabilities.raises}
                    canRequest={canRequestOn(row.project)}
                    canAttest={canAttestOn(row.project)}
                    onRequest={() => onRequest(row)}
                    onAttest={() => onAttest(row)}
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
            body="The schedule above is real and holders can read it. Acting on a phase writes to the raise contract, which is not deployed on this network, so the buttons stay out until they can do what they say."
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

type Viewer = "builder" | "manager" | "viewer";

function PhaseCard({
  row,
  compact = false,
  busy = false,
  live = false,
  viewer = "viewer",
  canRequest = false,
  canAttest = false,
  onRequest,
  onAttest,
}: {
  row: Row;
  compact?: boolean;
  busy?: boolean;
  live?: boolean;
  viewer?: Viewer;
  canRequest?: boolean;
  canAttest?: boolean;
  onRequest?: () => void;
  onAttest?: () => void;
}) {
  const { project, phase } = row;
  const managerName = project.manager?.display_name ?? "the property manager";
  const wrongAccount =
    live &&
    ((viewer === "manager" && phase.state === "awaiting_inspection" && !canAttest) ||
      (viewer === "builder" && phase.state === "building" && !canRequest));

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
              {waitingOn(phase.state, managerName, viewer)}
            </InterRegular>

            {wrongAccount ? (
              <Note>
                This profile points at a different NEAR account from the one signed in.
                Connect the account this profile belongs to before acting on the phase.
              </Note>
            ) : null}

            {phase.state === "building" && canRequest && onRequest ? (
              <CollectionsButton
                label="Mark finished and request inspection"
                variant="quiet"
                loading={busy}
                onPress={onRequest}
              />
            ) : null}

            {phase.state === "awaiting_inspection" && canAttest && onAttest ? (
              <CollectionsButton
                label="I have inspected this — sign it off"
                loading={busy}
                onPress={onAttest}
              />
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}

function waitingOn(
  state: CollectionPhaseState,
  manager: string,
  viewer: Viewer
): string {
  switch (state) {
    case "building":
      return viewer === "manager"
        ? "Waiting on the builder to finish this phase. You cannot inspect it until they submit it."
        : "Yours to finish. Request an inspection once it is done.";
    case "awaiting_inspection":
      return viewer === "manager"
        ? "Yours to inspect. Sign it off once you have seen the work; holders then have seven days to object."
        : `Waiting on ${manager} to inspect and sign off. You cannot move this along yourself.`;
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

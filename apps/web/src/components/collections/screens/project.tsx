"use client";

import { InterMedium, InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "@/components/collections/rn";
import { Stack, router, useLocalSearchParams } from "@/components/collections/nav";
import { TierBadge } from "@/components/collections/Score";
import {
  Avatar,
  Badge,
  C,
  Card,
  Chevron,
  CollectionsButton,
  Divider,
  Empty,
  ListRow,
  Meter,
  Note,
  Screen,
  Section,
  StatRow,
  StatTile,
  TYPE,
} from "@/components/collections/ui";
import { useCollections, useUnitPositions } from "@/hooks/useCollections";
import { scoreFor } from "@/services/collections/ranking";
import { formatWithSymbol } from "@/services/collections/money";
import { DEFAULT_TOKEN } from "@/config/tokens";
import { useApi } from "@/contexts/ApiContext";
import apiService from "@/services/api";
import { DocumentList, DocumentUploader, PhotoAdder, PhotoGallery } from "@/components/collections/Attachments";
import type {
  CollectionPhase,
  CollectionProfile,
  CollectionProjectDetail,
} from "@/services/api";

/**
 * Everything someone needs before committing money.
 *
 * Under an open market model the investor carries the judgement, so this
 * screen owes them the material to make it: who is asking, what has been
 * checked, what has not, and what they have delivered before. An
 * unverified document is shown as loudly as a verified one, because a
 * blank where a document belongs reads as approval.
 */
export default function ProjectDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { getProject, loading, error, connected } = useCollections();
  const { user } = useApi();
  const [project, setProject] = useState<CollectionProjectDetail | null>(null);

  const load = useCallback(async () => {
    const result = await getProject(String(slug));
    if (result) setProject(result);
  }, [getProject, slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !project) {
    return (
      <>
        <Stack.Screen options={{ title: "Project" }} />
        <Screen>
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        </Screen>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <Stack.Screen options={{ title: "Project" }} />
        <Screen>
          <Empty
            title="We could not find that project"
            body={error ?? "It may have closed. Go back and pick another."}
          />
        </Screen>
      </>
    );
  }

  const released = project.phases_released_bps;
  // The builder who owns this raise can add its photos and documents here.
  const isOwner = !!user?.id && project.builder?.user_id === Number(user.id);
  const errorOf = (r: { ok: boolean; error?: any }) =>
    r.ok ? null : String(r.error?.detail ?? r.error?.message ?? r.error ?? "That did not save. Please try again.");

  return (
    <>
      <Stack.Screen options={{ title: "Project" }} />
      <Screen>
        <View style={{ gap: 9 }}>
          <InterSemiBold style={{ ...TYPE.display, color: C.text }}>{project.name}</InterSemiBold>
          <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
            {project.location} · {project.units} units
          </InterRegular>
          <PhotoGallery urls={project.image_urls ?? []} alt={project.name} />
          {isOwner ? (
            <PhotoAdder
              onAttach={async (urls) => {
                const start = project.image_urls?.length ?? 0;
                for (let i = 0; i < urls.length; i++) {
                  const err = errorOf(await apiService.addCollectionImage(project.slug, { image_url: urls[i], position: start + i }));
                  if (err) return err;
                }
                await load();
                return null;
              }}
            />
          ) : null}
          {project.description ? (
            <InterRegular style={{ ...TYPE.body, color: C.text }}>
              {project.description}
            </InterRegular>
          ) : null}
        </View>

        <Card>
          <View style={{ gap: 13 }}>
            <StatRow>
              <StatTile
                label="Estimated return"
                value={
                  project.estimated_return_pct != null
                    ? `${project.estimated_return_pct}% a year`
                    : "Not stated"
                }
                note="the builder's figure"
              />
              <StatTile
                label="Released so far"
                value={`${(released / 100).toFixed(0)}%`}
                tone={released > 0 ? "positive" : "plain"}
                note="of the raise"
              />
            </StatRow>

            <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
              The return is the builder&apos;s own estimate. Sheda does not verify it and does not
              guarantee it. What the raise is worth and what it has collected are held on chain,
              not here.
            </InterRegular>
          </View>
        </Card>

        <Section title="Who is behind this">
          {project.builder ? <PersonRow profile={project.builder} role="Builder" /> : null}
          {project.manager ? (
            <PersonRow profile={project.manager} role="Property manager" />
          ) : null}
          {sameGroup(project) ? (
            <Note>
              The manager is part of the builder&apos;s own group, so they may not sign off these
              construction phases. An independent reviewer is required before any money is
              released.
            </Note>
          ) : null}
        </Section>

        {project.documents.length > 0 || isOwner ? (
          <Section title="Documents">
            <DocumentList
              documents={project.documents}
              empty="The builder has not attached any documents yet. Ask for the plans, budget and title before you invest."
            />
            {isOwner ? (
              <DocumentUploader
                kinds={RAISE_DOCUMENT_KINDS}
                onAttach={async (label, fileUrl) => {
                  const err = errorOf(await apiService.addCollectionDocument(project.slug, { label, file_url: fileUrl }));
                  if (!err) await load();
                  return err;
                }}
              />
            ) : null}
          </Section>
        ) : null}

        {project.phases.length > 0 ? (
          <Section title="How the money is released">
            <Card>
              <View style={{ gap: 14 }}>
                {project.phases.map((phase) => (
                  <PhaseRow key={phase.id} phase={phase} />
                ))}
              </View>
            </Card>
            <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
              Each phase is inspected and signed off before its money is released. Holders have
              seven days to object, and a quarter of them objecting holds the payment.
            </InterRegular>
          </Section>
        ) : null}

        {connected && project.unit_list.length > 0 ? (
          <YourShares project={project} />
        ) : null}

        {project.unit_list.length > 0 ? (
          <CollectionsButton
            label="Choose a unit"
            onPress={() => router.push(`/collections/project/${project.slug}/units`)}
          />
        ) : (
          <Empty
            title="No units listed yet"
            body="The builder has not published the flats this raise divides into."
          />
        )}
      </Screen>
    </>
  );
}

const CLAIMABLE_STATUSES = new Set(["funded", "building", "delivered"]);

/**
 * What the signed-in account already put into this raise.
 *
 * Commitments and shares are read separately so the two states that look
 * the same from a balance can be told apart: a commitment with shares owed
 * is waiting to be claimed, and a commitment with nothing owed has already
 * been minted. The live v1 raise contract has no `shares_owed`; against it
 * `unsupported` is true and this section stays absent rather than showing
 * an empty position as if nobody had invested.
 */
function YourShares({ project }: { project: CollectionProjectDetail }) {
  const token = DEFAULT_TOKEN;
  const { positions, unsupported, reload } = useUnitPositions(
    project.slug,
    project.unit_list
  );
  const {
    claimShares,
    loading,
    error: claimError,
  } = useCollections();
  const [busy, setBusy] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  if (unsupported) return null;

  const rows = project.unit_list
    .map((unit) => ({ unit, position: positions[unit.code] }))
    .filter((row) => BigInt(row.position?.committedAtomic || "0") > 0n);

  if (rows.length === 0) return null;

  const canClaim = CLAIMABLE_STATUSES.has(project.status);

  const onClaim = async (unitCode: string) => {
    setBusy(unitCode);
    setFailure(null);
    const result = await claimShares(project.slug, unitCode);
    setBusy(null);
    if (result.success) {
      setClaimed((prev) => ({
        ...prev,
        [unitCode]: result.transactionHash ?? "submitted",
      }));
      await reload();
    } else {
      setFailure(result.error ?? "That claim did not go through.");
    }
  };

  return (
    <Section title="Your position">
      {rows.map(({ unit, position }) => {
        const committed = position?.committedAtomic ?? "0";
        const owed = position?.sharesOwed ?? "0";
        const alreadyClaimed = claimed[unit.code] || BigInt(owed) === 0n;

        return (
          <Card key={unit.code}>
            <View style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>
                    {unit.label}
                  </InterSemiBold>
                  <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
                    You put in {formatWithSymbol(committed, token, 0)}
                  </InterRegular>
                </View>
                <Badge
                  label={alreadyClaimed ? "Shares claimed" : "Shares to claim"}
                  tone={alreadyClaimed ? "positive" : "caution"}
                />
              </View>

              {alreadyClaimed ? (
                <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
                  Your shares are in this flat. Rent paid into its vault accrues to
                  them, and you can claim it from Holdings.
                </InterRegular>
              ) : !canClaim ? (
                <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
                  {owed} shares are set aside for you. They can be claimed once the
                  raise reaches its target and the flat&apos;s vault exists.
                </InterRegular>
              ) : !unit.vault_account_id ? (
                <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
                  {owed} shares are set aside for you, but this flat&apos;s vault has
                  not been recorded yet. The operator has to deploy it and register it
                  with the raise contract before shares can be minted.
                </InterRegular>
              ) : (
                <CollectionsButton
                  label={`Claim ${owed} shares`}
                  loading={busy === unit.code && loading}
                  onPress={() => onClaim(unit.code)}
                />
              )}
            </View>
          </Card>
        );
      })}

      {claimError || failure ? (
        <Note tone="critical">{failure ?? claimError}</Note>
      ) : null}
    </Section>
  );
}

/** R2. A manager inside the builder's own group may not inspect its work. */
function sameGroup(project: CollectionProjectDetail): boolean {
  const group = project.manager?.part_of_group?.trim().toLowerCase();
  const builder = project.builder?.display_name.trim().toLowerCase();
  return Boolean(group && builder && group === builder);
}

function PersonRow({ profile, role }: { profile: CollectionProfile; role: string }) {
  const score = scoreFor(profile);

  return (
    <ListRow
      leading={<Avatar name={profile.display_name} size={40} />}
      title={profile.display_name}
      subtitle={`${role}${profile.location ? ` · ${profile.location}` : ""}`}
      onPress={() => router.push(`/collections/person/${profile.id}`)}
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            {score.tier === "unrated" ? (
              <TierBadge tier="unrated" />
            ) : (
              <>
                <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>
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

/** What a builder is asked to attach to a raise. */
const RAISE_DOCUMENT_KINDS = [
  "Building plans (architectural drawings)",
  "Budget / bill of quantities",
  "Title document (C of O, Governor's Consent)",
  "Building approval / permit",
  "Survey plan",
  "Structural drawings",
  "Environmental impact assessment",
  "Other",
];

const PHASE_LABEL: Record<CollectionPhase["state"], string> = {
  locked: "Not started",
  building: "Building",
  awaiting_inspection: "Waiting on inspection",
  objection_window: "Holders may object",
  held: "Payment held",
  released: "Released",
};

const PHASE_TONE = {
  locked: C.textMuted,
  building: C.primary,
  awaiting_inspection: C.caution,
  objection_window: C.caution,
  held: C.critical,
  released: C.positive,
} as const;

function PhaseRow({ phase }: { phase: CollectionPhase }) {
  const done = phase.state === "released";
  const colour = PHASE_TONE[phase.state];

  return (
    <View style={{ flexDirection: "row", gap: 11, alignItems: "flex-start" }}>
      <View
        style={{
          width: 21,
          height: 21,
          borderRadius: 11,
          backgroundColor: done ? C.positiveLight : C.surface,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <InterSemiBold style={{ ...TYPE.micro, color: colour }}>
          {done ? "✓" : String(phase.position + 1)}
        </InterSemiBold>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <InterMedium style={{ ...TYPE.body, color: C.text }}>{phase.name}</InterMedium>
        <InterRegular style={{ ...TYPE.label, lineHeight: 16, color: C.textSecondary }}>
          {(phase.tranche_bps / 100).toFixed(0)}% of the raise · {PHASE_LABEL[phase.state]}
        </InterRegular>
        {phase.state === "objection_window" ? (
          <View style={{ marginTop: 4, gap: 4 }}>
            <Meter pct={100} tone="caution" height={4} />
            <InterRegular style={{ ...TYPE.micro, color: C.caution }}>
              Holders can object to this release until the window closes.
            </InterRegular>
          </View>
        ) : null}
      </View>
    </View>
  );
}

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
import { useWallet } from "@/contexts/WalletContext";
import * as chain from "@/services/collections/chain";
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

        {project.phases.length > 0 ? <PhaseList project={project} onChanged={load} /> : null}

        {connected ? <MoneyBack slug={project.slug} /> : null}

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
    closeRaise,
    loading,
    error: claimError,
  } = useCollections();
  const [busy, setBusy] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  // The contract's view of the raise. The backend's project.status is not
  // updated when a raise fills, so it said "open" on a funded raise and the
  // claim button never appeared.
  const [chainState, setChainState] = useState<{ status: string; raised: string; target: string } | null>(null);
  const loadChainState = useCallback(async () => {
    try {
      setChainState(await chain.getRaiseChainState(project.slug));
    } catch {
      setChainState(null);
    }
  }, [project.slug]);
  useEffect(() => {
    loadChainState();
  }, [loadChainState]);

  if (unsupported) return null;

  const rows = project.unit_list
    .map((unit) => ({ unit, position: positions[unit.code] }))
    .filter((row) => BigInt(row.position?.committedAtomic || "0") > 0n);

  if (rows.length === 0) return null;

  const chainStatus = chainState?.status?.toLowerCase();
  const canClaim = CLAIMABLE_STATUSES.has(chainStatus ?? project.status);
  const fullButOpen =
    chainStatus === "open" && chainState != null && BigInt(chainState.raised) >= BigInt(chainState.target);

  const onClose = async () => {
    setBusy("close");
    setFailure(null);
    const result = await closeRaise(project.slug);
    setBusy(null);
    if (result.success) await loadChainState();
    else setFailure(result.error ?? "The raise could not be closed just now.");
  };

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
      {fullButOpen ? (
        <Card>
          <View style={{ gap: 10 }}>
            <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
              This raise has reached its target. Close it to start the build and let
              everyone claim their shares. Anyone can do this.
            </InterRegular>
            <CollectionsButton label="Close the raise" loading={busy === "close" && loading} onPress={onClose} />
          </View>
        </Card>
      ) : null}
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

/**
 * The phase schedule, and the holder's say over each release.
 *
 * The contract lets anyone holding shares object while a signed-off phase is
 * in its window, and a quarter of holders objecting holds the payment. The
 * app had the call but no button, so holders could not actually object.
 */
function PhaseList({ project, onChanged }: { project: CollectionProjectDetail; onChanged: () => void }) {
  const { positions } = useUnitPositions(project.slug, project.unit_list);
  const { objectToRelease, loading, connected } = useCollections();
  const [windowMs, setWindowMs] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    chain.getObjectionWindowMs().then(setWindowMs);
  }, []);

  const holder = Object.values(positions).some((p) => BigInt(p?.committedAtomic || "0") > BigInt(0));
  const windowOpen = (phase: CollectionPhase) =>
    phase.state === "objection_window" &&
    (windowMs == null || phase.attested_at_ms == null || Date.now() < phase.attested_at_ms + windowMs);

  const onObject = async (phase: CollectionPhase) => {
    setBusy(phase.position);
    setMessage(null);
    const result = await objectToRelease(project.slug, phase.position);
    setBusy(null);
    setMessage(
      result.success
        ? "Your objection is recorded. If a quarter of holders object before the window closes, the payment is held."
        : result.error ?? "Your objection did not go through."
    );
    if (result.success) onChanged();
  };

  const minutes = windowMs ? Math.round(windowMs / 60000) : null;
  const windowText =
    minutes == null ? "a set time" : minutes < 120 ? `${minutes} minutes` : `${Math.round(minutes / 1440)} days`;

  return (
    <Section title="How the money is released">
      <Card>
        <View style={{ gap: 14 }}>
          {project.phases.map((phase) => (
            <PhaseRow
              key={phase.id}
              phase={phase}
              canObject={connected && holder && windowOpen(phase)}
              objecting={busy === phase.position && loading}
              onObject={() => onObject(phase)}
            />
          ))}
        </View>
      </Card>
      {message ? <Note>{message}</Note> : null}
      <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
        Each phase is inspected and signed off before its money is released. Holders have {windowText} to
        object, and a quarter of them objecting holds the payment and stops the raise.
      </InterRegular>
    </Section>
  );
}

function PhaseRow({
  phase,
  canObject = false,
  objecting = false,
  onObject,
}: {
  phase: CollectionPhase;
  canObject?: boolean;
  objecting?: boolean;
  onObject?: () => void;
}) {
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
            {canObject && onObject ? (
              <CollectionsButton label="Object to this release" variant="quiet" loading={objecting} onPress={onObject} />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Getting money back from a raise that stopped or failed.
 *
 * Read from the contract rather than the backend, because a raise stops on
 * chain the moment holders freeze a phase. Every investor's amounts are
 * fixed by the contract and do not change when someone else claims.
 */
function MoneyBack({ slug }: { slug: string }) {
  const { walletState } = useWallet();
  const accountId = walletState.account?.accountId ?? null;
  const { reclaimEscrow, claimCover, refundFailedRaise } = useCollections();
  const [status, setStatus] = useState<string | null>(null);
  const [owed, setOwed] = useState<{ escrow: string; cover: string }>({ escrow: "0", cover: "0" });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const s = await chain.getRaiseChainStatus(slug);
      setStatus(s);
      if (s === "Stalled") setOwed(await chain.getMoneyBack(slug, accountId));
    } catch {
      setStatus(null);
    }
  }, [slug, accountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (status !== "Stalled" && status !== "Failed") return null;

  const run = async (label: string, action: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(label);
    setNote(null);
    const r = await action();
    setBusy(null);
    setNote(r.success ? "Sent. It can take a few seconds to arrive in your wallet." : r.error ?? "That did not go through.");
    if (r.success) setTimeout(load, 4000);
  };

  if (status === "Failed") {
    return (
      <Section title="This raise did not reach its target">
        <Note>Everything you put in is yours to take back in full.</Note>
        <CollectionsButton
          label={busy ? "Sending..." : "Get my money back"}
          onPress={() => run("refund", () => refundFailedRaise(slug))}
        />
        {note ? <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>{note}</InterRegular> : null}
      </Section>
    );
  }

  const escrow = BigInt(owed.escrow || "0");
  const cover = BigInt(owed.cover || "0");
  return (
    <Section title="This raise has stopped">
      <Note>
        Building stopped, either because holders objected to a phase or because Sheda declared it
        stalled. No more money goes to the builder. Each investor takes back their own share of
        what was not paid out, plus their share of any cover the builder staked, whenever they
        choose; nobody else claiming changes your amounts.
      </Note>
      <Card>
        <View style={{ gap: 13 }}>
          <StatRow>
            <StatTile label="Unpaid escrow you are owed" value={formatWithSymbol(owed.escrow, DEFAULT_TOKEN)} />
            <StatTile label="Your share of the builder's cover" value={formatWithSymbol(owed.cover, DEFAULT_TOKEN)} />
          </StatRow>
        </View>
      </Card>
      {escrow > 0n ? (
        <CollectionsButton
          label={busy === "escrow" ? "Sending..." : "Take back my share of the escrow"}
          onPress={() => run("escrow", () => reclaimEscrow(slug))}
        />
      ) : null}
      {cover > 0n ? (
        <CollectionsButton
          label={busy === "cover" ? "Sending..." : "Claim my share of the cover"}
          onPress={() => run("cover", () => claimCover(slug))}
        />
      ) : null}
      {escrow === 0n && cover === 0n ? (
        <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
          Nothing is waiting for you here: you have taken your share, or you did not invest in this raise.
        </InterRegular>
      ) : null}
      {note ? <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>{note}</InterRegular> : null}
    </Section>
  );
}

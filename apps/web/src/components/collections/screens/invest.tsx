"use client";

import { InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, View } from "@/components/collections/rn";
import { router, useFocusEffect } from "@/components/collections/nav";
import {
  Avatar,
  Badge,
  C,
  Card,
  CollectionsButton,
  Divider,
  Empty,
  FinePrint,
  ListRow,
  Meter,
  Note,
  PageTitle,
  Screen,
  Section,
  StatRow,
  StatTile,
  TYPE,
} from "@/components/collections/ui";
import { useMode } from "@/contexts/ModeContext";
import { useCollections, useMyCollectionProfiles } from "@/hooks/useCollections";
import apiService, { type CollectionProjectSummary } from "@/services/api";

/**
 * Invest: the way into Collections, from whichever side you are on.
 *
 * One tab rather than two sets of them. The app already knows whether
 * someone is browsing or selling, through the same mode switch that
 * decides whether they see Saved or Activities, and Collections has
 * exactly that shape: a buyer backs buildings, a seller raises for them.
 * Adding a second role concept beside the existing one would mean two
 * switches that can disagree.
 *
 * Everything past this screen is a push, so the marketplace keeps the five
 * tabs it has. A sixth would have cost every existing tab a fifth of its
 * width for a feature nobody has used yet.
 */
export default function Invest() {
  const { isSeller } = useMode();
  return isSeller ? <BuilderSide /> : <BuyerSide />;
}

// ---- buyer -----------------------------------------------------------------

function BuyerSide() {
  const { listProjects, loading, error } = useCollections();
  const [projects, setProjects] = useState<CollectionProjectSummary[] | null>(null);

  const load = useCallback(async () => {
    const result = await listProjects();
    if (result) setProjects(result);
  }, [listProjects]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.primary} />}>
      <PageTitle
        title="Back a building"
        subtitle="Put money into a development before it is built, and earn a share of the rent once it is let."
      />

      <ListRow
        title="Your holdings"
        subtitle="Units you hold, and rent ready to claim"
        onPress={() => router.push("/collections/holdings")}
      />
      <ListRow
        title="Who you are backing"
        subtitle="Builders and managers, ranked on what the chain recorded"
        onPress={() => router.push("/collections/directory")}
      />

      {error ? <Note tone="critical">{error}</Note> : null}

      <Section title="Open raises">
        {loading && projects === null ? (
          <View style={{ paddingVertical: 36, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : projects && projects.length > 0 ? (
          projects.map((p) => <RaiseCard key={p.id} project={p} />)
        ) : (
          <Empty
            title="No raises are open"
            body="When a builder opens one it will appear here, with its phase schedule and who is behind it."
          />
        )}
      </Section>

      <FinePrint>
        Returns shown are each builder&apos;s own estimate. Sheda does not verify them and does
        not guarantee any return.
      </FinePrint>
    </Screen>
  );
}

function RaiseCard({ project }: { project: CollectionProjectSummary }) {
  const closes = project.closes_at ? daysUntil(project.closes_at) : null;

  return (
    <Card padded={false}>
      <View style={{ padding: 15, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{project.name}</InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
              {project.location} · {project.units} units
            </InterRegular>
          </View>
          <Badge
            label={closes !== null ? `${closes} days left` : "Open"}
            tone={closes !== null && closes <= 3 ? "caution" : "brand"}
          />
        </View>

        <StatRow>
          <StatTile
            label="Est. return"
            value={
              project.estimated_return_pct != null
                ? `${project.estimated_return_pct}% p.a.`
                : "Not stated"
            }
            note="the builder's figure"
          />
          <StatTile
            label="Builder"
            value={project.builder?.display_name ?? "Unknown"}
            note={project.builder?.location ?? undefined}
          />
        </StatRow>

        <Divider />

        <ListRow
          title="See the full raise"
          subtitle="Phase schedule, documents, and who is behind it"
          onPress={() => router.push(`/collections/project/${project.slug}`)}
        />
      </View>
    </Card>
  );
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ---- builder ---------------------------------------------------------------

function BuilderSide() {
  const { builder, loading, reload, actingAccountMatches } = useMyCollectionProfiles();
  const [projects, setProjects] = useState<CollectionProjectSummary[] | null>(null);

  const loadProjects = useCallback(async () => {
    const response = await apiService.getMyCollectionProjects();
    setProjects(response.ok ? (response.data as CollectionProjectSummary[]) : []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  if (loading && !builder) {
    return (
      <Screen>
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={C.primary} />
        </View>
      </Screen>
    );
  }

  if (!builder) {
    return (
      <Screen>
        <PageTitle
          title="Raise for a building"
          subtitle="Fund a development from many people at once, and hand them a share of the rent when it is let."
        />
        <Empty
          title="You do not have a builder profile yet"
          body="A builder profile is what investors read before backing you. It carries your delivery record and the stake behind your promises, and both are public."
        />
        <CollectionsButton
          label="Register as a builder"
          onPress={() => router.push("/collections/become-builder")}
        />
        <ListRow
          title="See how builders are ranked"
          subtitle="Every figure comes from the chain, not from what anyone says about themselves"
          onPress={() => router.push("/collections/directory")}
        />
      </Screen>
    );
  }

  const mismatch = builder.near_account_id != null && !actingAccountMatches(builder);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.primary} />}>
      <PageTitle
        title={builder.display_name}
        subtitle={`Builder on Sheda since ${builder.since_year ?? "recently"}.`}
      />

      {mismatch ? (
        <Note tone="critical">
          This profile is registered to {builder.near_account_id}, and you are signed in as a
          different account. You can read it, but anything that moves money has to be signed by
          the account the stake belongs to.
        </Note>
      ) : null}

      <ListRow
        leading={<Avatar name={builder.display_name} size={38} />}
        title="Your public profile"
        subtitle="What investors see, including anything that went wrong"
        onPress={() => router.push(`/collections/person/${builder.id}`)}
      />
      <ListRow
        title="Sign-offs"
        subtitle="Every phase, and which party is holding it up"
        onPress={() => router.push("/collections/approvals")}
      />
      <ListRow
        title="Your stake"
        subtitle="What is free, and what your promises are made of"
        onPress={() => router.push("/collections/stake")}
      />

      <Section title="Your raises">
        {projects === null ? (
          <View style={{ paddingVertical: 28, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : projects.length === 0 ? (
          <Empty
            title="No raises yet"
            body="Open one and it will appear here with its phase schedule and what has been released."
          />
        ) : (
          projects.map((p) => <BuilderRaiseCard key={p.id} project={p} />)
        )}
      </Section>

      <CollectionsButton
        label="Open a new raise"
        variant="outline"
        onPress={() => router.push("/collections/new-raise")}
      />

      <Note>
        A raise starts as a draft. Sheda publishes it on chain once the documents and the
        manager&apos;s independence have been checked, and that step is deliberately not yours:
        the terms are what investors commit against, and a raise anyone could put on chain would
        route around every check made before it.
      </Note>

      <FinePrint>
        Everything on your profile is public. Investors see the same record you do.
      </FinePrint>
    </Screen>
  );
}

function BuilderRaiseCard({ project }: { project: CollectionProjectSummary }) {
  const released = project.phases_released_bps;

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{project.name}</InterSemiBold>
            <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
              {project.location}
            </InterRegular>
          </View>
          <Badge
            label={project.status === "draft" ? "Draft" : project.status}
            tone={project.status === "draft" ? "plain" : "brand"}
          />
        </View>

        {released > 0 ? (
          <View style={{ gap: 6 }}>
            <Meter pct={released / 100} tone="positive" />
            <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
              {(released / 100).toFixed(0)}% of the raise has been released to you
            </InterRegular>
          </View>
        ) : null}

        <ListRow
          title="View as an investor sees it"
          onPress={() => router.push(`/collections/project/${project.slug}`)}
        />
      </View>
    </Card>
  );
}

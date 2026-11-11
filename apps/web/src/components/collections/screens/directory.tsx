"use client";

import { InterBold, InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "@/components/collections/rn";
import { Stack, router } from "@/components/collections/nav";
import { TierBadge } from "@/components/collections/Score";
import {
  Avatar,
  C,
  Empty,
  FinePrint,
  Note,
  PageTitle,
  RADIUS,
  Screen,
  Section,
  Segmented,
  TYPE,
} from "@/components/collections/ui";
import { useCollections } from "@/hooks/useCollections";
import { rankEntries, summaryLine, type RankedEntry } from "@/services/collections/ranking";
import type { CollectionDirectoryEntry, CollectionRole } from "@/services/api";

/**
 * Everyone who can be backed, in order.
 *
 * The server returns these unordered and unscored. Ordering them here is
 * the point: the ranking is computed in the app from counts the chain
 * published, so it can show its working rather than ask to be believed.
 *
 * The split between rated and unrated does the real work. A new builder at
 * the bottom of one list reads as the worst one, when what is true is that
 * nobody knows yet.
 */
export default function Directory() {
  const [role, setRole] = useState<CollectionRole>("builder");
  const [entries, setEntries] = useState<CollectionDirectoryEntry[] | null>(null);
  const { getDirectory, loading, error } = useCollections();

  const load = useCallback(async () => {
    const result = await getDirectory(role);
    setEntries(result ?? []);
  }, [getDirectory, role]);

  useEffect(() => {
    setEntries(null);
    load();
  }, [load]);

  const ranked = entries ? rankEntries(entries) : [];
  const rated = ranked.filter((r) => r.rank !== null);
  const unrated = ranked.filter((r) => r.rank === null);

  return (
    <>
      <Stack.Screen options={{ title: "Directory" }} />
      <Screen>
        <PageTitle
          title="Who you are backing"
          subtitle="Builders put the buildings up. Managers let them and pass the rent on. Both are ranked on what the chain has recorded them doing."
        />

        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: "builder", label: "Builders" },
            { value: "manager", label: "Managers" },
          ]}
        />

        {error ? <Note tone="critical">{error}</Note> : null}

        {entries === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : ranked.length === 0 ? (
          <Empty
            title={role === "builder" ? "No builders yet" : "No managers yet"}
            body="Profiles appear here once somebody registers one."
          />
        ) : (
          <>
            {rated.length > 0 ? (
              <Section title={role === "builder" ? "Ranked builders" : "Ranked managers"}>
                {rated.map((r) => (
                  <PersonRow key={r.entry.profile.id} ranked={r} />
                ))}
              </Section>
            ) : null}

            {unrated.length > 0 ? (
              <Section title="Not enough history yet">
                <InterRegular
                  style={{
                    ...TYPE.label,
                    lineHeight: 17,
                    color: C.textSecondary,
                    marginBottom: 2,
                  }}
                >
                  {role === "builder"
                    ? "Fewer than two finished projects on Sheda. They are not ranked low, they are not ranked at all."
                    : "Under a year of mandates. There is not enough yet to say how they manage a building."}
                </InterRegular>
                {unrated.map((r) => (
                  <PersonRow key={r.entry.profile.id} ranked={r} />
                ))}
              </Section>
            ) : null}
          </>
        )}

        <FinePrint>
          Ranks are worked out in the app from on-chain events alone. Sheda does not adjust them,
          and a high rank is a record of what someone has done before, not a prediction or a
          recommendation.
        </FinePrint>
      </Screen>
    </>
  );
}

function PersonRow({ ranked }: { ranked: RankedEntry }) {
  const { entry, score, rank } = ranked;
  const profile = entry.profile;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.85}
      onPress={() => router.push(`/collections/person/${profile.id}`)}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: RADIUS,
        padding: 13,
      }}
    >
      <View style={{ width: 22, alignItems: "center" }}>
        <InterBold style={{ ...TYPE.body, color: rank === null ? C.textMuted : C.text }}>
          {rank === null ? "–" : rank}
        </InterBold>
      </View>

      <Avatar name={profile.display_name} size={40} />

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <InterSemiBold style={{ ...TYPE.heading, color: C.text }} numberOfLines={1}>
          {profile.display_name}
        </InterSemiBold>
        {/* Wraps rather than truncating: the line saying what the rank was
            built on is the last thing that should be cut to fit the number. */}
        <InterRegular
          style={{ ...TYPE.micro, lineHeight: 15, color: C.textSecondary }}
          numberOfLines={2}
        >
          {profile.location ? `${profile.location} · ` : ""}
          {summaryLine(profile)}
        </InterRegular>
      </View>

      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {score.tier === "unrated" ? (
          <TierBadge tier="unrated" />
        ) : (
          <>
            <InterBold style={{ ...TYPE.title, color: C.text }}>{score.total}</InterBold>
            <TierBadge tier={score.tier} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

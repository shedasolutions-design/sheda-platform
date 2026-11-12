"use client";

import { InterBold, InterRegular } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "@/components/collections/rn";
import { Stack, useLocalSearchParams } from "@/components/collections/nav";
import {
  HowThisIsWorkedOut,
  ScoreBreakdown,
  ScoreHeadline,
} from "@/components/collections/Score";
import {
  Avatar,
  Badge,
  C,
  Card,
  Divider,
  Empty,
  KeyValue,
  Note,
  Screen,
  Section,
  StatRow,
  StatTile,
  TYPE,
} from "@/components/collections/ui";
import { useCollections } from "@/hooks/useCollections";
import {
  coverBps,
  finishedCount,
  freshnessLabel,
  recordOf,
  scoreFor,
  ROLE_LABEL,
} from "@/services/collections/ranking";
import { formatWithSymbol } from "@/services/collections/money";
import { DEFAULT_TOKEN } from "@/config/tokens";
import apiService, { type CollectionDocument, type CollectionProfile } from "@/services/api";
import { useApi } from "@/contexts/ApiContext";
import { DocumentList, DocumentUploader } from "@/components/collections/Attachments";

/** What a builder or manager is asked to show about themselves. */
const PROFILE_DOCUMENT_KINDS: Record<string, string[]> = {
  builder: [
    "CAC certificate of incorporation",
    "Professional licence (COREN / ARCON)",
    "Tax clearance certificate",
    "Permit to operate",
    "Insurance certificate",
    "Company profile",
    "Other",
  ],
  manager: [
    "CAC certificate of incorporation",
    "Estate surveyor licence (ESVARBON)",
    "Tax clearance certificate",
    "Insurance certificate",
    "Company profile",
    "Other",
  ],
};

/**
 * Licences and registration, read by anyone; the owner adds to them here.
 * Each shows whether Sheda has checked it, never just that it exists.
 */
function ProfileDocuments({ profile }: { profile: CollectionProfile }) {
  const { user } = useApi();
  const isOwner = !!user?.id && profile.user_id === Number(user.id);
  const [docs, setDocs] = useState<CollectionDocument[] | null>(null);

  const load = useCallback(async () => {
    const r = await apiService.getProfileDocuments(profile.id);
    setDocs(r.ok ? r.data : []);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (docs === null) return null;
  if (!docs.length && !isOwner) {
    return (
      <Section title="Licences and registration">
        <Note>
          No licences or registration papers yet. Ask for them before you invest with this{" "}
          {profile.role === "builder" ? "builder" : "manager"}.
        </Note>
      </Section>
    );
  }
  return (
    <Section title="Licences and registration">
      <DocumentList
        documents={docs}
        empty="Add your company registration and licences so investors can check who you are."
      />
      {isOwner ? (
        <DocumentUploader
          kinds={PROFILE_DOCUMENT_KINDS[profile.role] ?? PROFILE_DOCUMENT_KINDS.builder}
          onAttach={async (label, fileUrl) => {
            const r = await apiService.addProfileDocument(profile.id, { label, file_url: fileUrl });
            if (!r.ok) return String((r as any).error?.detail ?? "That did not save. Please try again.");
            await load();
            return null;
          }}
        />
      ) : null}
    </Section>
  );
}

/**
 * A builder or a manager, in full.
 *
 * The things a brochure would leave out are the point of this page: the
 * abandoned job, the slashed stake, the months a building sat empty. A
 * profile that only lists successes tells a reader nothing they can use,
 * because every profile would look the same.
 */
export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getProfile, loading, error } = useCollections();
  const [profile, setProfile] = useState<CollectionProfile | null>(null);

  const load = useCallback(async () => {
    const result = await getProfile(Number(id));
    if (result) setProfile(result);
  }, [getProfile, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) {
    return (
      <>
        <Stack.Screen options={{ title: "Profile" }} />
        <Screen>
          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : (
            <Empty
              title="We could not find that profile"
              body={error ?? "It may have been removed. Go back and pick another."}
            />
          )}
        </Screen>
      </>
    );
  }

  const score = scoreFor(profile);
  const record = recordOf(profile);

  return (
    <>
      <Stack.Screen options={{ title: "Profile" }} />
      <Screen>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Avatar name={profile.display_name} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <InterBold style={{ ...TYPE.title, color: C.text }}>
              {profile.display_name}
            </InterBold>
            <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
              {ROLE_LABEL[profile.role]}
              {profile.location ? ` · ${profile.location}` : ""}
            </InterRegular>
            {profile.near_account_id ? (
              <InterRegular style={{ ...TYPE.micro, color: C.textMuted }}>
                {profile.near_account_id}
              </InterRegular>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
          {profile.kyc_verified ? <Badge label="Identity checked" tone="positive" /> : null}
          {profile.since_year ? (
            <Badge label={`On Sheda since ${profile.since_year}`} tone="plain" />
          ) : null}
          {profile.suspended ? <Badge label="Suspended" tone="critical" /> : null}
        </View>

        {profile.about ? (
          <InterRegular style={{ ...TYPE.body, color: C.text }}>{profile.about}</InterRegular>
        ) : null}

        <ProfileDocuments profile={profile} />

        {profile.part_of_group ? (
          <Note>
            Part of the same group as {profile.part_of_group}. They may not sign off construction
            phases on that builder&apos;s own projects, because nobody should be able to approve
            their own work.
          </Note>
        ) : null}

        <Card>
          <View style={{ gap: 15 }}>
            <ScoreHeadline score={score} />
            {score.tier === "unrated" ? null : (
              <>
                <Divider />
                <ScoreBreakdown score={score} />
              </>
            )}
          </View>
        </Card>

        <HowThisIsWorkedOut kind={profile.role} freshness={freshnessLabel(record)} />

        {profile.role === "builder" ? (
          <BuilderFacts profile={profile} />
        ) : (
          <ManagerFacts profile={profile} />
        )}

        {profile.kyc_verified ? null : (
          <Note>
            This account has not completed identity checks. That is separate from the rank above,
            which measures what they have done rather than who they are.
          </Note>
        )}
      </Screen>
    </>
  );
}

function BuilderFacts({ profile }: { profile: CollectionProfile }) {
  const r = recordOf(profile);
  const slashed = r.slash_count > 0;
  const token = DEFAULT_TOKEN;

  return (
    <Section title="Record and stake">
      <StatRow>
        <StatTile label="Finished jobs" value={String(finishedCount(r))} />
        <StatTile
          label="Abandoned"
          value={String(r.projects_abandoned)}
          tone={r.projects_abandoned > 0 ? "critical" : "positive"}
        />
      </StatRow>
      <StatRow>
        <StatTile label="On time" value={String(r.projects_on_time)} tone="positive" />
        <StatTile
          label="Late"
          value={String(r.projects_late)}
          tone={r.projects_late > 0 ? "caution" : "plain"}
        />
      </StatRow>

      <Card>
        <View style={{ gap: 13 }}>
          <KeyValue
            label="Raised across every job"
            value={formatWithSymbol(r.total_raised, token, 0)}
            note={`${r.projects_running} running right now`}
          />
          <Divider />
          <KeyValue
            label="Stake posted"
            value={formatWithSymbol(r.stake_total, token, 0)}
            note={`${formatWithSymbol(r.stake_allocated, token, 0)} of it is promised to a live raise`}
          />
          <Divider />
          <KeyValue
            label="Cover posted against everything raised"
            value={`${(coverBps(r) / 100).toFixed(1)}%`}
            tone={
              coverBps(r) >= 2000 ? "positive" : coverBps(r) >= 500 ? "caution" : "critical"
            }
            note="Their own money, forfeited to holders if a build stalls below half finished."
          />
        </View>
      </Card>

      {slashed ? (
        <Note tone="critical">
          {formatWithSymbol(r.stake_slashed_total, token, 0)} of this builder&apos;s stake has
          been taken and paid to holders after a project failed. That stays on the profile
          permanently.
        </Note>
      ) : null}
    </Section>
  );
}

function ManagerFacts({ profile }: { profile: CollectionProfile }) {
  const r = recordOf(profile);
  const token = DEFAULT_TOKEN;
  const occupancy =
    r.mandate_months > 0 ? Math.round((r.let_months / r.mandate_months) * 100) : 0;
  const onTime =
    r.periods_due > 0 ? Math.round((r.periods_paid_on_time / r.periods_due) * 100) : 0;

  return (
    <Section title="What their mandates have done">
      <StatRow>
        <StatTile label="Units managed" value={String(r.units_managed)} />
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
          note={`${r.periods_paid_on_time} of ${r.periods_due}`}
        />
        <StatTile
          label="Disputes upheld"
          value={String(r.disputes_upheld)}
          tone={r.disputes_upheld === 0 ? "positive" : "critical"}
        />
      </StatRow>

      <Card>
        <KeyValue
          label="Rent passed through to holders"
          value={formatWithSymbol(r.rent_paid_out, token, 0)}
          note="Counted from credits the vaults recorded, not from what the manager reports."
        />
      </Card>

      {r.disputes_upheld > 0 ? (
        <Note tone="critical">
          A holder vote has upheld {r.disputes_upheld} dispute against this manager. Holders can
          vote to replace a manager at any time.
        </Note>
      ) : null}
    </Section>
  );
}

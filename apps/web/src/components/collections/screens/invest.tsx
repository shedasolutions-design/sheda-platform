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
  Empty,
  FinePrint,
  ListRow,
  Meter,
  Note,
  PageTitle,
  Screen,
  Section,
  TYPE,
} from "@/components/collections/ui";
import { useMode } from "@/contexts/ModeContext";
import { useMyCollectionProfiles } from "@/hooks/useCollections";
import apiService, { type CollectionProjectSummary } from "@/services/api";
import Link from "next/link";
import { Building, MapPin } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import nearContractService from "@/services/nearContract";
import { RAISE_CONTRACT_ID } from "@/config/collections";

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

type Filter = "all" | "open" | "funded" | "closed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "funded", label: "Funded" },
  { id: "closed", label: "Closed" },
];

/** A raise as a card needs it: the backend summary plus the contract's live numbers. */
interface RaiseView {
  project: CollectionProjectSummary;
  status: string;
  raised: bigint;
  target: bigint;
  flatsOpen: number;
  flats: number;
  /** Cheapest price of one share, in USDC atomic units (6 decimals). */
  minSharePrice: bigint | null;
}

function bucket(status: string): Filter {
  if (status === "open") return "open";
  if (status === "funded" || status === "building") return "funded";
  return "closed";
}

/**
 * Invest, laid out after the ideation design: a header with Portfolio, filter
 * chips, and a photo card per building with its live funding bar, flats still
 * open, price per share and estimated return. Funding and status come from
 * the raise contract, the record; the backend supplies photos and names.
 */
function BuyerSide() {
  const [views, setViews] = useState<RaiseView[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await apiService.getCollectionProjects({});
    if (!response.ok) {
      setError("We could not load the buildings. Pull to try again.");
      setViews([]);
      return;
    }
    const summaries = response.data as CollectionProjectSummary[];
    const loaded = await Promise.all(
      summaries.map(async (project): Promise<RaiseView> => {
        try {
          const live = await nearContractService.viewOn<{
            status: string;
            raised: string | number;
            target: string | number;
            units?: { price: string | number; total_shares: string | number; raised: string | number }[];
          } | null>(project.escrow_account_id || RAISE_CONTRACT_ID, "get_project", { project_id: project.slug });
          const units = live?.units ?? [];
          const prices = units
            .map((u) => (BigInt(String(u.total_shares)) > 0n ? BigInt(String(u.price)) / BigInt(String(u.total_shares)) : null))
            .filter((p): p is bigint => p !== null);
          return {
            project,
            status: live ? live.status.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() : project.status,
            raised: BigInt(String(live?.raised ?? 0)),
            target: BigInt(String(live?.target ?? 0)),
            flatsOpen: units.filter((u) => BigInt(String(u.raised)) < BigInt(String(u.price))).length,
            flats: units.length || project.units,
            minSharePrice: prices.length ? prices.reduce((a, b) => (b < a ? b : a)) : null,
          };
        } catch {
          return { project, status: project.status, raised: 0n, target: 0n, flatsOpen: 0, flats: project.units, minSharePrice: null };
        }
      })
    );
    setViews(loaded);
  }, []);

  useEffect(() => {
    // Deferred a tick so the effect itself sets no state.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const shown = (views ?? []).filter((v) => filter === "all" || bucket(v.status) === filter);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-10 pt-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primaryText">Invest</h1>
        <Link href="/collections/holdings" className="text-sm font-medium text-primary">
          Portfolio
        </Link>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm transition ${
              filter === f.id ? "bg-primary text-white" : "bg-primaryLight text-secondaryText hover:bg-active"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {views === null ? (
        <div className="flex justify-center py-16">
          <ActivityIndicator color={C.primary} />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-borderColor px-6 py-12 text-center">
          <p className="font-semibold text-primaryText">
            {filter === "all" ? "No buildings to invest in yet" : "Nothing here right now"}
          </p>
          <p className="mt-1 text-sm text-secondaryText">
            When a builder opens a raise it appears here, with its phase schedule and who is behind it.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {shown.map((v) => (
            <InvestCard key={v.project.id} view={v} />
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href="/collections/directory" className="font-medium text-primary">
          Builders and managers
        </Link>
        <Link href="/business-profile" className="font-medium text-primary">
          Raise money for a building
        </Link>
      </div>
      <p className="mt-4 text-xs text-secondaryText">
        Returns shown are each builder&apos;s own estimate. Sheda does not verify them and does not
        guarantee any return.
      </p>
    </div>
  );
}

function InvestCard({ view }: { view: RaiseView }) {
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  const { project, status, raised, target, flatsOpen, flats, minSharePrice } = view;
  const pct = target > 0n ? Math.min(100, Number((raised * 100n) / target)) : 0;
  const open = status === "open";
  const closes = open && project.closes_at ? daysUntil(project.closes_at) : null;
  const shareUsd = minSharePrice != null ? Number(minSharePrice) / 1_000_000 : null;

  const statusText =
    status === "open"
      ? `${pct}% funded`
      : status === "funded" || status === "building"
        ? "Fully funded"
        : status === "delivered"
          ? "Completed"
          : status === "stalled"
            ? "Stopped"
            : "Closed";

  return (
    <article className="overflow-hidden rounded-2xl border border-borderColor bg-white shadow-sm">
      <Link href={`/collections/project/${project.slug}`} className="block">
        <div className="relative aspect-[16/9] bg-gray-100">
          {project.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : null}
          {closes !== null ? (
            <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-primaryText">
              {closes} day{closes === 1 ? "" : "s"} left
            </span>
          ) : null}
        </div>
      </Link>
      <div className="space-y-3 p-4">
        <div>
          <h2 className="text-base font-semibold text-primaryText">{project.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondaryText">
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {project.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <Building size={13} /> {flats} flat{flats === 1 ? "" : "s"}
            </span>
            {project.builder ? <span>by {project.builder.display_name}</span> : null}
          </p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <p className="text-lg font-semibold text-primaryText">
            {project.estimated_return_pct != null ? `${project.estimated_return_pct}% a year` : "Return not stated"}
            <span className="ml-1 text-xs font-normal text-secondaryText">est.</span>
          </p>
          <p className={`text-sm font-medium ${open ? "text-primary" : "text-secondaryText"}`}>{statusText}</p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div className={`h-full rounded-full ${barOf(status, pct).cls}`} style={{ width: `${barOf(status, pct).width}%` }} />
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-secondaryText">Flats open to invest</dt>
            <dd className="font-medium text-primaryText">
              {flatsOpen} of {flats}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-secondaryText">Price per share</dt>
            <dd className="font-medium text-primaryText">
              {shareUsd != null
                ? selectedCurrency === "USD"
                  ? `from ${formatUsd(shareUsd)}`
                  : `from ${formatPrice(shareUsd)} (${formatUsd(shareUsd)})`
                : "—"}
            </dd>
          </div>
        </dl>

        <Link
          href={`/collections/project/${project.slug}`}
          className={`block rounded-xl py-3 text-center text-sm font-semibold ${
            open ? "bg-primary text-white hover:bg-[#a82227]" : "border border-borderColor text-primaryText hover:bg-cardBackground"
          }`}
        >
          {open ? "Invest now" : "View details"}
        </Link>
      </div>
    </article>
  );
}

function barOf(status: string, pct: number): { cls: string; width: number } {
  if (status === "open") return { cls: "bg-primary", width: pct };
  if (status === "funded" || status === "building" || status === "delivered") return { cls: "bg-green-500", width: 100 };
  return { cls: "bg-gray-300", width: 100 };
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
          label="Set up your builder profile"
          onPress={() => router.push("/business-profile")}
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

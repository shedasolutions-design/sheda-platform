"use client";

import { InterMedium, InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "@/components/collections/rn";
import { Stack, router, useLocalSearchParams } from "@/components/collections/nav";
import { Building, MapPin } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import InfoTip, { MoreText } from "@/components/ui/InfoTip";
import {
  BuilderStrip,
  FollowButton,
  ManagerSection,
  MoreInformation,
  ProjectPackCard,
  ProjectTimeline,
  UpdatesFeed,
} from "@/components/collections/ProjectSections";
import { OsmMap } from "@/components/collections/RaiseExtras";
import { PROJECT_TYPE_TEXT } from "@/services/collections/copy";
import {
  DEFAULT_FEE_BPS,
  perPeriod,
  rentRangeOf,
  sharePriceOf,
  sharesFor,
  yearlyRentFor,
  type Period,
} from "@/services/collections/rent";
import {
  Badge,
  C,
  Card,
  CollectionsButton,
  Empty,
  Meter,
  Note,
  Screen,
  Section,
  StatRow,
  StatTile,
  TYPE,
} from "@/components/collections/ui";
import { useCollections, useUnitPositions } from "@/hooks/useCollections";
import { formatWithSymbol } from "@/services/collections/money";
import { DEFAULT_TOKEN } from "@/config/tokens";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import * as chain from "@/services/collections/chain";
import apiService from "@/services/api";
import { DocumentList, DocumentUploader, PhotoAdder, PhotoGallery } from "@/components/collections/Attachments";
import type {
  CollectionPhase,
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
  const [tab, setTab] = useState<"about" | "updates">("about");

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

        <ProjectSummary project={project} />
        {project.builder ? <BuilderStrip builder={project.builder} /> : null}
        {user ? (
          <div className="flex justify-end">
            <FollowButton slug={project.slug} />
          </div>
        ) : null}

        <div className="flex border-b border-borderColor" role="tablist">
          {(["about", "updates"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium ${
                tab === t ? "border-b-2 border-primary text-primary" : "text-secondaryText"
              }`}
            >
              {t === "about" ? "About" : `Updates${updateCount(project) ? ` (${updateCount(project)})` : ""}`}
            </button>
          ))}
        </div>

        {tab === "updates" ? (
          <UpdatesFeed
            project={project}
            canPost={isOwner || (!!user?.id && project.manager?.user_id === Number(user.id))}
            onPosted={load}
          />
        ) : (
          <>
            {project.description ? (
              <div>
                <h2 className="mb-1 text-sm font-semibold text-primaryText">Description</h2>
                <MoreText text={project.description} className="text-sm leading-relaxed text-secondaryText" />
              </div>
            ) : null}

            <ProjectTimeline project={project} />

            <KeyNumbers project={project} released={released} />

            {["stalled", "failed", "cancelled"].includes(project.status) ? null : (
              <RentEstimator project={project} isOwner={isOwner} onChanged={load} />
            )}

            {project.latitude != null && project.longitude != null ? (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-primaryText">Location</h2>
                <OsmMap lat={project.latitude} lon={project.longitude} label={project.name} />
                <p className="text-xs text-secondaryText">{project.address || project.location}</p>
              </section>
            ) : null}

            <ManagerSection project={project} />

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-primaryText">Project pack and documents</h2>
              <ProjectPackCard project={project} />
              {project.documents.some((d) => !d.is_pack) ? (
                <DocumentList documents={project.documents.filter((d) => !d.is_pack)} />
              ) : null}
              {isOwner ? (
                <DocumentUploader
                  kinds={RAISE_DOCUMENT_KINDS}
                  onAttach={async (label, fileUrl) => {
                    const err = errorOf(
                      await apiService.addCollectionDocument(project.slug, {
                        label,
                        file_url: fileUrl,
                        is_pack: label === PACK_KIND,
                      })
                    );
                    if (!err) await load();
                    return err;
                  }}
                />
              ) : null}
            </section>

            {project.phases.length > 0 ? <PhaseList project={project} onChanged={load} /> : null}

            <MoreInformation project={project} />

            {connected ? <MoneyBack slug={project.slug} /> : null}

            {connected && project.unit_list.length > 0 ? <YourShares project={project} /> : null}
          </>
        )}

        {project.unit_list.length > 0 ? (
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 -mx-1 bg-white/95 px-1 pb-3 pt-2 backdrop-blur md:bottom-0">
            <button
              type="button"
              onClick={() => router.push(`/collections/project/${project.slug}/units`)}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-white hover:bg-[#a82227]"
            >
              {project.status === "open" ? "Invest now" : "See the flats"}
            </button>
            {project.status !== "open" && !["stalled", "failed", "cancelled"].includes(project.status) ? (
              <a href="/collections/shares" className="mt-2 block text-center text-sm font-medium text-primary">
                Round closed? Buy from investors
              </a>
            ) : null}
          </div>
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

function updateCount(project: CollectionProjectDetail): number {
  return (project.updates?.length ?? 0) + project.phases.reduce((n, ph) => n + (ph.updates?.length ?? 0), 0);
}

/** Live funding figures from the flats; shares sold come from the contract. */
function fundingOf(project: CollectionProjectDetail) {
  let target = 0n;
  let raised = 0n;
  let open = 0;
  let minShare: bigint | null = null;
  for (const u of project.unit_list) {
    const price = BigInt(u.price_atomic || "0");
    const total = BigInt(u.total_shares || "0");
    const sold = BigInt(u.shares_sold || "0");
    target += price;
    if (total > 0n) {
      raised += (sold * price) / total;
      const per = price / total;
      if (minShare === null || per < minShare) minShare = per;
    }
    if (sold < total) open += 1;
  }
  const pct = target > 0n ? Math.min(100, Number((raised * 100n) / target)) : 0;
  return { target, raised, open, minShare, pct };
}

const STATUS_TEXT: Record<string, string> = {
  draft: "Draft, not open yet",
  open: "Open to invest",
  funded: "Fully funded",
  building: "Being built",
  delivered: "Completed",
  stalled: "Stopped",
  failed: "Did not reach target",
  cancelled: "Cancelled",
};

function barOf(status: string, pct: number): { cls: string; width: number } {
  if (status === "open") return { cls: "bg-primary", width: pct };
  if (status === "funded" || status === "building" || status === "delivered") return { cls: "bg-green-500", width: 100 };
  return { cls: "bg-gray-300", width: 100 };
}

/** USDC atomic units (6 decimals) shown in the person's chosen currency, as on Invest. */
function useMoney() {
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();
  return (atomic: bigint) => {
    const usd = Number(atomic) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : `${formatPrice(usd)} (${formatUsd(usd)})`;
  };
}

function ProjectSummary({ project }: { project: CollectionProjectDetail }) {
  const { pct, raised, target } = fundingOf(project);
  const money = useMoney();
  const open = project.status === "open";
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-primaryText">{project.name}</h1>
        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-secondaryText">
          <MapPin size={13} /> {project.location}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-primaryText">
        <span className="inline-flex items-center gap-1 rounded-lg border border-borderColor px-2.5 py-1">
          <Building size={13} /> {project.units} flat{project.units === 1 ? "" : "s"}
        </span>
        <span className="rounded-lg border border-borderColor px-2.5 py-1">
          {STATUS_TEXT[project.status] ?? project.status}
        </span>
        {project.project_type ? (
          <span className="rounded-lg border border-borderColor px-2.5 py-1">
            {PROJECT_TYPE_TEXT[project.project_type] ?? project.project_type}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-lg font-semibold text-primaryText">
          {project.estimated_return_pct != null ? `${project.estimated_return_pct}% a year` : "Return not stated"}
          <span className="ml-1 text-xs font-normal text-secondaryText">est.</span>
        </p>
        {open ? <p className="text-sm font-medium text-primary">{pct}% funded</p> : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div
          className={`h-full rounded-full ${barOf(project.status, pct).cls}`}
          style={{ width: `${barOf(project.status, pct).width}%` }}
        />
      </div>
      {target > 0n ? (
        <p className="text-xs text-secondaryText">
          {money(raised)} raised of {money(target)}
        </p>
      ) : null}
    </div>
  );
}

function KeyNumbers({ project, released }: { project: CollectionProjectDetail; released: number }) {
  const { open, minShare } = fundingOf(project);
  const money = useMoney();
  const rows: [React.ReactNode, string][] = [
    ["Flats open to invest", `${open} of ${project.unit_list.length || project.units}`],
    ["Price per share", minShare != null ? `from ${money(minShare)}` : "—"],
    [
      <span key="r" className="inline-flex items-center gap-1">
        Estimated return
        <InfoTip label="About the estimated return">
          The builder&apos;s own estimate. Sheda does not check it and does not guarantee any return.
        </InfoTip>
      </span>,
      project.estimated_return_pct != null ? `${project.estimated_return_pct}% a year` : "Not stated",
    ],
    [
      <span key="d" className="inline-flex items-center gap-1">
        Paid to the builder
        <InfoTip label="About payments to the builder">
          Investors&apos; money is held by the raise contract and paid out phase by phase, only after each phase
          is inspected and signed off. These figures are read from the blockchain, not from Sheda.
        </InfoTip>
      </span>,
      `${(released / 100).toFixed(0)}% of the raise`,
    ],
  ];
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3">
          <dt className="text-secondaryText">{k}</dt>
          <dd className="font-medium text-primaryText">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const PERIODS: { id: Period; label: string; suffix: string }[] = [
  { id: "day", label: "Day", suffix: "a day" },
  { id: "month", label: "Month", suffix: "a month" },
  { id: "year", label: "Year", suffix: "a year" },
];

const toAtomic = (usd: string): bigint => {
  const n = Number(usd.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1_000_000)) : 0n;
};

/**
 * What a stake might earn in rent, from the builder's expected rent range.
 *
 * Starts from what this person already put into the flat, or $100 if
 * nothing. Counts whole shares only (the contract sells no fractions) and
 * takes off the vault's real fees where the vault exists, the launch fees
 * where it does not yet.
 */
function RentEstimator({
  project,
  isOwner,
  onChanged,
}: {
  project: CollectionProjectDetail;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const money = useMoney();
  const { positions } = useUnitPositions(project.slug, project.unit_list);
  const priced = project.unit_list.filter((u) => rentRangeOf(u) && sharePriceOf(u));
  const [code, setCode] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [fees, setFees] = useState<Record<string, number>>({});

  const unit = priced.find((u) => u.code === code) ?? priced[0] ?? null;
  const committed = unit ? BigInt(positions[unit.code]?.committedAtomic || "0") : 0n;
  const amountText = amount ?? (committed > 0n ? String(Number(committed) / 1_000_000) : "100");

  useEffect(() => {
    let alive = true;
    const vaults = project.unit_list.filter((u) => u.vault_account_id);
    Promise.all(
      vaults.map(async (u) => {
        try {
          const info = await chain.getVaultInfo(u.vault_account_id as string);
          return [u.code, info.manager_bps + info.reserve_bps + info.platform_bps] as const;
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      if (alive) setFees(Object.fromEntries(rows.filter((r): r is readonly [string, number] => r !== null)));
    });
    return () => {
      alive = false;
    };
  }, [project.unit_list]);

  if (!unit) {
    return (
      <div className="rounded-2xl border border-borderColor p-4">
        <h2 className="text-sm font-semibold text-primaryText">Rent you could earn</h2>
        <p className="mt-1 text-sm text-secondaryText">The builder has not given an expected rent yet.</p>
        {isOwner ? <RentEditor project={project} onChanged={onChanged} /> : null}
      </div>
    );
  }

  const range = rentRangeOf(unit)!;
  const total = BigInt(unit.total_shares);
  const shares = sharesFor(toAtomic(amountText), unit);
  const feeBps = fees[unit.code] ?? DEFAULT_FEE_BPS;
  const shown = perPeriod(yearlyRentFor(shares > total ? total : shares, total, range, feeBps), period);
  const suffix = PERIODS.find((p) => p.id === period)!.suffix;
  const pct = total > 0n ? (Number((shares > total ? total : shares) * 10_000n / total) / 100).toString() : "0";
  const minShare = sharePriceOf(unit)!;

  return (
    <div className="rounded-2xl border border-borderColor p-4">
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-semibold text-primaryText">Rent you could earn</h2>
        <InfoTip label="How this estimate works">
          Uses the builder&apos;s expected rent for the whole flat, from their research on rents nearby (see the
          documents). Your part is your share of the flat, after the vault&apos;s fees ({feeBps / 100}%). Rent
          starts only once the flat is finished and let, and empty months earn nothing. An estimate, not a promise.
        </InfoTip>
      </div>

      {priced.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {priced.map((u) => (
            <button
              key={u.code}
              type="button"
              onClick={() => {
                setCode(u.code);
                setAmount(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                u.code === unit.code ? "bg-primary text-white" : "bg-primaryLight text-secondaryText"
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      ) : null}

      <label className="mt-3 block text-xs text-secondaryText">
        {committed > 0n && amount === null ? "What you put in (USD)" : "If you invest (USD)"}
        <input
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-xl border border-borderColor px-3 py-2.5 text-base text-primaryText outline-none focus:border-primary"
        />
      </label>
      <p className="mt-1 text-xs text-secondaryText">
        {shares > 0n
          ? `${shares > total ? total : shares} shares, ${pct}% of ${unit.label}`
          : `One share costs ${money(minShare)}`}
        {shares > total ? " (the whole flat)" : ""}
      </p>

      <div className="mt-3 flex rounded-xl bg-gray-100 p-1 text-xs" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={period === p.id}
            onClick={() => setPeriod(p.id)}
            className={`flex-1 rounded-lg py-1.5 ${period === p.id ? "bg-white font-medium text-primaryText shadow-sm" : "text-secondaryText"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xl font-semibold text-primaryText">
        {money(shown.min)} – {money(shown.max)}
        <span className="ml-1 text-xs font-normal text-secondaryText">{suffix}</span>
      </p>
      <p className="mt-1 text-xs text-secondaryText">
        Whole flat lets for {money(range.min)} – {money(range.max)} a year, by the builder&apos;s estimate.
      </p>

      {isOwner ? <RentEditor project={project} onChanged={onChanged} /> : null}
    </div>
  );
}

/**
 * The builder sets each flat's expected yearly rent. Same rule as the
 * server: editable on a draft, and on an open raise only where none was
 * given, since investors may have committed against a figure once shown.
 */
function RentEditor({ project, onChanged }: { project: CollectionProjectDetail; onChanged: () => void }) {
  const editable = project.unit_list.filter((u) => project.status === "draft" || !rentRangeOf(u));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, { lo: string; hi: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (editable.length === 0) return null;

  const valueOf = (code: string, rangeLo?: string | null, rangeHi?: string | null) =>
    values[code] ?? {
      lo: rangeLo ? String(Number(rangeLo) / 1_000_000) : "",
      hi: rangeHi ? String(Number(rangeHi) / 1_000_000) : "",
    };

  const save = async (code: string, lo: string, hi: string) => {
    const a = toAtomic(lo);
    const b = toAtomic(hi);
    if (a <= 0n || b <= 0n) return setMessage("Enter both a low and a high yearly rent.");
    if (a > b) return setMessage("The low rent is more than the high rent.");
    setBusy(code);
    setMessage(null);
    const r = await apiService.setCollectionUnitRent(project.slug, code, {
      rent_min_atomic: a.toString(),
      rent_max_atomic: b.toString(),
    });
    setBusy(null);
    if (!r.ok) {
      const err = r.error as { detail?: unknown; message?: string } | undefined;
      return setMessage(String(err?.detail ?? err?.message ?? "That did not save. Please try again."));
    }
    setMessage(project.status === "draft" ? "Saved." : "Saved. It is now fixed for this raise.");
    onChanged();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-medium text-primary">
        Set expected rent
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-borderColor pt-3">
      <p className="inline-flex items-center gap-1 text-xs text-secondaryText">
        Yearly rent for each whole flat
        <InfoTip label="About setting rent">
          Base it on rents for similar flats nearby and add that research to the documents. On an open raise you
          can add it once, and it cannot be changed after.
        </InfoTip>
      </p>
      {editable.map((u) => {
        const v = valueOf(u.code, u.rent_min_atomic, u.rent_max_atomic);
        const set = (patch: Partial<{ lo: string; hi: string }>) => setValues({ ...values, [u.code]: { ...v, ...patch } });
        return (
          <div key={u.code} className="space-y-2">
            <p className="text-sm font-medium text-primaryText">{u.label}</p>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                placeholder="Low (USD)"
                value={v.lo}
                onChange={(e) => set({ lo: e.target.value })}
                className="min-w-0 flex-1 rounded-xl border border-borderColor px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                inputMode="decimal"
                placeholder="High (USD)"
                value={v.hi}
                onChange={(e) => set({ hi: e.target.value })}
                className="min-w-0 flex-1 rounded-xl border border-borderColor px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={busy === u.code}
                onClick={() => save(u.code, v.lo, v.hi)}
                className="rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy === u.code ? "…" : "Save"}
              </button>
            </div>
          </div>
        );
      })}
      {message ? <p className="text-xs text-secondaryText">{message}</p> : null}
    </div>
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

/** What a builder is asked to attach to a raise. */
const PACK_KIND = "Project pack (every agreement and term)";

const RAISE_DOCUMENT_KINDS = [
  PACK_KIND,
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
  const { objectToRelease, approvePhase, loading, connected } = useCollections();
  const { walletState } = useWallet();
  const me = walletState.account?.accountId ?? null;
  const [windowMs, setWindowMs] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // v5: a raise managed by the builder's own company pays a phase only once
  // more than half of the money approves it.
  const [selfManaged, setSelfManaged] = useState(false);
  const [approved, setApproved] = useState<Record<number, boolean>>({});
  useEffect(() => {
    chain.getObjectionWindowMs().then(setWindowMs);
    chain
      .getRaiseTerms(project.slug)
      .then((t) => setSelfManaged(Boolean(t?.selfManaged)))
      .catch(() => setSelfManaged(false));
  }, [project.slug]);
  useEffect(() => {
    if (!selfManaged || !me) return;
    let alive = true;
    Promise.all(
      project.phases
        .filter((ph) => ph.state === "objection_window")
        .map(async (ph) => [ph.position, await chain.hasApprovedPhase(project.slug, ph.position, me)] as const)
    ).then((rows) => alive && setApproved(Object.fromEntries(rows)));
    return () => {
      alive = false;
    };
  }, [selfManaged, me, project.slug, project.phases]);

  const onApprove = async (phase: CollectionPhase) => {
    setBusy(phase.position);
    setMessage(null);
    const result = await approvePhase(project.slug, phase.position);
    setBusy(null);
    setMessage(
      result.success
        ? "Your approval is recorded. The payment goes to the builder once more than half of investors approve."
        : result.error ?? "Your approval did not go through."
    );
    if (result.success) {
      setApproved({ ...approved, [phase.position]: true });
      onChanged();
    }
  };

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
              canApprove={
                selfManaged && connected && holder && phase.state === "objection_window" && !approved[phase.position]
              }
              onApprove={() => onApprove(phase)}
            />
          ))}
        </View>
      </Card>
      {message ? <Note>{message}</Note> : null}
      <p className="inline-flex items-center gap-1 text-xs text-secondaryText">
        Paid phase by phase, after inspection.
        <InfoTip label="How payments are released">
          Each phase is inspected and signed off before its money is released. Holders then have {windowText} to
          object, and if a quarter of them object, the payment is held and the raise stops.
        </InfoTip>
      </p>
    </Section>
  );
}

function PhaseRow({
  phase,
  canObject = false,
  objecting = false,
  onObject,
  canApprove = false,
  onApprove,
}: {
  phase: CollectionPhase;
  canObject?: boolean;
  objecting?: boolean;
  onObject?: () => void;
  canApprove?: boolean;
  onApprove?: () => void;
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
            {canApprove && onApprove ? (
              <CollectionsButton label="Approve this payment" loading={objecting} onPress={onApprove} />
            ) : null}
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

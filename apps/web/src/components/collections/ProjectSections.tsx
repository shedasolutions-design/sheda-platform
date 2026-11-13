"use client";

/* eslint-disable @next/next/no-img-element -- logos and photos come from arbitrary hosts */
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, ChevronDown, FileText, Fingerprint, ShieldAlert } from "lucide-react";
import InfoTip, { MoreText } from "@/components/ui/InfoTip";
import apiService, {
  type CollectionNomination,
  type CollectionProfile,
  type CollectionProjectDetail,
  type CollectionProjectUpdate,
} from "@/services/api";
import { getFlatStage, type FlatStage } from "@/services/collections/chain";
import { INFO, INVEST_RISKS } from "@/services/collections/copy";

// ---- builder ---------------------------------------------------------------

export function BuilderStrip({ builder }: { builder: CollectionProfile }) {
  return (
    <Link
      href={`/collections/person/${builder.id}`}
      className="flex items-center gap-3 rounded-2xl border border-borderColor p-3 hover:bg-cardBackground"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-sm font-semibold text-secondaryText">
        {builder.avatar_url ? (
          <img src={builder.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          builder.display_name.slice(0, 2).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-primaryText">
          <span className="truncate">{builder.display_name}</span>
          {builder.kyc_verified ? <BadgeCheck size={14} className="shrink-0 text-green-600" aria-label="Identity checked" /> : null}
        </span>
        <span className="block truncate text-xs text-secondaryText">
          Builder{builder.location ? ` · ${builder.location}` : ""}
        </span>
      </span>
      <span className="text-xs font-medium text-primary">View profile</span>
    </Link>
  );
}

// ---- timeline --------------------------------------------------------------

const STAGES = ["Funding", "Building", "With manager", "Listed for rent", "Rented"] as const;

/**
 * Where the building is, from funding to rented, read from the contracts:
 * the raise for funding and phases, each flat's vault for handover, and the
 * marketplace for whether it is listed or let.
 */
export function ProjectTimeline({ project }: { project: CollectionProjectDetail }) {
  const [flats, setFlats] = useState<Record<string, FlatStage>>({});

  useEffect(() => {
    let alive = true;
    Promise.all(
      project.unit_list
        .filter((u) => u.vault_account_id)
        .map(async (u) => [u.code, await getFlatStage(u.vault_account_id as string).catch(() => null)] as const)
    ).then((rows) => {
      if (alive) setFlats(Object.fromEntries(rows.filter((r): r is readonly [string, FlatStage] => r[1] !== null)));
    });
    return () => {
      alive = false;
    };
  }, [project.unit_list]);

  const stalled = ["stalled", "failed", "cancelled"].includes(project.status);
  const released = project.phases.filter((p) => p.state === "released").length;
  const flatStages = Object.values(flats);
  const best = (s: FlatStage["stage"]) => flatStages.some((f) => f.stage === s);

  let at = 0;
  if (project.status !== "open" && project.status !== "draft") at = 1;
  if (best("with_manager")) at = 2;
  if (best("listed")) at = 3;
  if (best("rented")) at = 4;

  const detail: Record<number, string> = {
    1:
      project.project_type === "completed"
        ? "Handover to the manager"
        : `${released} of ${project.phases.length} phases paid`,
    4: flatStages.filter((f) => f.stage === "rented").length + ` of ${project.unit_list.length} flats rented`,
  };

  if (stalled) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
        <ShieldAlert size={16} /> This raise has stopped. Investors can take their money back.
      </p>
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-primaryText">Where this building is</h2>
      <ol className="flex items-start">
        {STAGES.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : i <= at ? "bg-primary" : "bg-gray-200"}`} />
              <span
                className={`h-3 w-3 shrink-0 rounded-full ${i < at ? "bg-primary" : i === at ? "bg-primary ring-4 ring-primaryLight" : "bg-gray-200"}`}
              />
              <span className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? "bg-transparent" : i < at ? "bg-primary" : "bg-gray-200"}`} />
            </div>
            <span className={`mt-1.5 text-[10px] leading-tight ${i <= at ? "text-primaryText" : "text-secondaryText"}`}>{s}</span>
            {i === at && detail[i] ? <span className="text-[10px] text-secondaryText">{detail[i]}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---- manager ---------------------------------------------------------------

function PledgeView({ pledge }: { pledge: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-primary">
        {open ? "Hide pledge" : "Read their pledge"}
      </button>
      {open ? (
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-cardBackground p-3 font-sans text-xs leading-relaxed text-primaryText">
          {pledge}
        </pre>
      ) : null}
    </div>
  );
}

function ManagerRow({ nomination, chosen }: { nomination: CollectionNomination; chosen: boolean }) {
  const p = nomination.profile;
  if (!p) return null;
  return (
    <div className={`rounded-xl border p-3 ${chosen ? "border-primary" : "border-borderColor"}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-xs font-semibold text-secondaryText">
          {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : p.display_name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/collections/person/${p.id}`} className="block truncate text-sm font-semibold text-primaryText">
            {p.display_name}
          </Link>
          <p className="truncate text-xs text-secondaryText">{p.location ?? "Location not given"}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-primaryText">{nomination.fee_bps != null ? `${nomination.fee_bps / 100}%` : "—"}</p>
          <p className="text-[10px] text-secondaryText">of rent</p>
        </div>
      </div>
      {chosen ? <p className="mt-2 text-xs font-medium text-primary">Chosen manager</p> : null}
      {nomination.self_managed ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">The builder&apos;s own company</p>
      ) : null}
      {nomination.status === "invited" ? <p className="mt-2 text-xs text-secondaryText">Has not accepted yet</p> : null}
      {nomination.pledge ? <PledgeView pledge={nomination.pledge} /> : null}
    </div>
  );
}

export function ManagerSection({ project }: { project: CollectionProjectDetail }) {
  const noms = project.nominations ?? [];
  const chosenId = project.manager?.id ?? null;
  if (noms.length === 0 && !project.manager) return null;
  return (
    <section className="space-y-2">
      <h2 className="inline-flex items-center gap-1 text-sm font-semibold text-primaryText">
        Property manager
        <InfoTip label="About the manager">{INFO.manager}</InfoTip>
      </h2>
      {project.self_managed ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{INFO.selfManaged}</p>
      ) : null}
      {noms.length > 1 && !chosenId ? (
        <p className="text-xs text-secondaryText">The builder suggested these managers. Investors choose one when they invest.</p>
      ) : null}
      {noms.map((n) => (
        <ManagerRow key={n.id} nomination={n} chosen={n.profile?.id === chosenId} />
      ))}
      {noms.length === 0 && project.manager ? (
        <ManagerRow
          nomination={{ id: 0, status: "accepted", self_managed: false, fee_bps: project.manager.fee_bps, pledge: project.manager.pledge, profile: project.manager }}
          chosen
        />
      ) : null}
    </section>
  );
}

// ---- project pack ----------------------------------------------------------

export function ProjectPackCard({ project }: { project: CollectionProjectDetail }) {
  const pack = project.documents.find((d) => d.is_pack && d.file_url);
  if (!pack) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
        The project pack has not been uploaded yet. Do not invest until you can read it.
      </p>
    );
  }
  return (
    <a
      href={pack.file_url as string}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-borderColor p-4 hover:bg-cardBackground"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primaryLight text-primary">
        <FileText size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-primaryText">
          Read the project pack
          <InfoTip label="About the project pack">{INFO.pack}</InfoTip>
        </span>
        <span className="block text-xs text-secondaryText">
          {pack.status === "verified" ? "Checked by Sheda" : "Not yet checked by Sheda"}
        </span>
        {pack.sha256 ? (
          <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-secondaryText" title={pack.sha256}>
            <Fingerprint size={11} /> {pack.sha256.slice(0, 12)}…{pack.sha256.slice(-6)}
          </span>
        ) : null}
      </span>
    </a>
  );
}

// ---- more information ------------------------------------------------------

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-borderColor last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-primaryText"
      >
        {title}
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="pb-3 text-sm leading-relaxed text-secondaryText">{children}</div> : null}
    </div>
  );
}

export function MoreInformation({ project }: { project: CollectionProjectDetail }) {
  const shares = project.unit_list[0]?.total_shares;
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-primaryText">More information</h2>
      <div className="rounded-2xl border border-borderColor px-4">
        <Accordion title="What you own">
          Each flat is divided into equal shares held in its own vault on the blockchain. Owning shares means owning
          that part of the flat&apos;s rent, and a say in who manages it.
          {shares ? ` Holding all ${Number(shares).toLocaleString()} shares of a flat lets you take the whole flat.` : ""}
        </Accordion>
        <Accordion title="How your money is protected">
          {INFO.escrow} Once it fills, money goes to the builder{" "}
          {project.project_type === "completed"
            ? "after the manager confirms they have taken over the building."
            : "phase by phase, only after the manager inspects each phase and holders have had time to object."}
        </Accordion>
        <Accordion title="Rent and fees">{INFO.fees}</Accordion>
        <Accordion title="Management">
          {INFO.manager} Holders can replace the manager if more than half of a flat&apos;s shares vote to.
        </Accordion>
        <Accordion title="Selling your shares">{INFO.resale}</Accordion>
        <Accordion title="Leaving a round">
          While a round is filling you can take your money out, except in its last 7 days. If it does not fill by its
          deadline, everyone gets everything back.
        </Accordion>
        <Accordion title="Risks">
          <ul className="list-disc space-y-1 pl-4">
            {INVEST_RISKS.slice(0, 4).map((r) => (
              <li key={r.title}>{r.title}</li>
            ))}
          </ul>
          <Link href="/collections/risks" className="mt-2 inline-block font-medium text-primary">
            Read all the risks
          </Link>
        </Accordion>
      </div>
    </section>
  );
}

// ---- updates ---------------------------------------------------------------

const KIND_TEXT: Record<CollectionProjectUpdate["kind"], string> = {
  progress: "Progress",
  rental: "Rental report",
  maintenance: "Maintenance",
  announcement: "Announcement",
};

interface FeedItem {
  key: string;
  when: string;
  who: string;
  tag: string;
  body: string;
  image?: string | null;
}

export function UpdatesFeed({
  project,
  canPost,
  onPosted,
}: {
  project: CollectionProjectDetail;
  canPost: boolean;
  onPosted: () => void;
}) {
  const items: FeedItem[] = [
    ...(project.updates ?? []).map((u) => ({
      key: `u${u.id}`,
      when: u.created_at,
      who: u.author_name,
      tag: KIND_TEXT[u.kind] ?? "Update",
      body: u.body,
      image: u.image_url,
    })),
    ...project.phases.flatMap((ph) =>
      (ph.updates ?? []).map((u) => ({
        key: `p${u.id}`,
        when: u.created_at,
        who: "Builder or manager",
        tag: ph.name,
        body: u.body,
        image: u.image_url,
      }))
    ),
  ].sort((a, b) => b.when.localeCompare(a.when));

  return (
    <div className="space-y-3">
      {canPost ? <UpdateComposer slug={project.slug} onPosted={onPosted} /> : null}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-borderColor px-6 py-10 text-center">
          <p className="font-medium text-primaryText">No updates yet</p>
          <p className="mt-1 text-sm text-secondaryText">
            Building progress, inspections, rental reports and announcements will appear here.
          </p>
        </div>
      ) : (
        items.map((it) => (
          <article key={it.key} className="rounded-2xl border border-borderColor p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-secondaryText">
              <span className="rounded-full bg-primaryLight px-2 py-0.5 font-medium text-primary">{it.tag}</span>
              <span>{new Date(it.when).toLocaleDateString()}</span>
            </div>
            <MoreText text={it.body} className="mt-2 text-sm text-primaryText" />
            {it.image ? <img src={it.image} alt="" className="mt-2 max-h-64 w-full rounded-xl object-cover" /> : null}
            <p className="mt-2 text-xs text-secondaryText">{it.who}</p>
          </article>
        ))
      )}
    </div>
  );
}

function UpdateComposer({ slug, onPosted }: { slug: string; onPosted: () => void }) {
  const [kind, setKind] = useState<CollectionProjectUpdate["kind"]>("progress");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const post = async () => {
    setBusy(true);
    setNote(null);
    const r = await apiService.postCollectionUpdate(slug, { kind, body: body.trim() });
    setBusy(false);
    if (!r.ok) return setNote("That did not post. Please try again.");
    setBody("");
    onPosted();
  };
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-borderColor p-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_TEXT) as CollectionProjectUpdate["kind"][]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-lg px-2.5 py-1 text-xs ${kind === k ? "bg-primary text-white" : "bg-primaryLight text-secondaryText"}`}
          >
            {KIND_TEXT[k]}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Tell holders what happened."
        className="min-h-20 w-full rounded-xl border border-borderColor p-3 text-sm outline-none focus:border-primary"
      />
      <button
        type="button"
        disabled={busy || !body.trim()}
        onClick={post}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Posting…" : "Post update"}
      </button>
      {note ? <p className="text-xs text-red-600">{note}</p> : null}
    </div>
  );
}

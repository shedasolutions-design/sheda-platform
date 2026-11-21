/**
 * The share market's data: every flat whose vault runs a market, with the
 * building it belongs to, its listings and offers, and what the viewer holds.
 * Shared by the market list and a single listing's page.
 */
import apiService, {
  type CollectionProjectDetail,
  type CollectionProjectSummary,
  type CollectionUnit,
} from "@/services/api";
import { getShareBalance, getShareListings, getShareOffers, type ShareListing, type ShareOffer } from "@/services/collections/chain";
import { DEFAULT_FEE_BPS } from "@/services/collections/rent";

export interface MarketFlat {
  vault: string;
  slug: string;
  project: CollectionProjectDetail;
  unit: CollectionUnit;
  cover: string | null;
  totalShares: bigint;
  /** What a share cost in the original raise. */
  originalPerShare: bigint;
  /** Taken from rent before holders are paid: manager's fee, reserve and Sheda. */
  feeBps: number;
  listings: ShareListing[];
  offers: ShareOffer[];
  mine: bigint;
}

function flatsOf(project: CollectionProjectDetail): CollectionUnit[] {
  return project.unit_list.filter((u) => !!u.vault_account_id);
}

async function toFlat(project: CollectionProjectDetail, unit: CollectionUnit, me: string | null): Promise<MarketFlat | null> {
  const vault = unit.vault_account_id as string;
  const listings = await getShareListings(vault);
  if (listings === null) return null; // a vault without a market yet
  const offers = (await getShareOffers(vault)) ?? [];
  const total = BigInt(unit.total_shares || "0");
  return {
    vault,
    slug: project.slug,
    project,
    unit,
    cover: project.cover_image_url ?? project.image_urls?.[0] ?? null,
    totalShares: total,
    originalPerShare: total > 0n ? BigInt(unit.price_atomic) / total : 0n,
    // Manager's fee, plus the 5% repair reserve and Sheda's 2%, as the project page counts it.
    feeBps: project.manager?.fee_bps != null ? project.manager.fee_bps + 700 : DEFAULT_FEE_BPS,
    listings,
    offers,
    mine: me ? BigInt(await getShareBalance(vault, me).catch(() => "0")) : 0n,
  };
}

/** Every flat with a market. */
export async function loadMarket(me: string | null): Promise<MarketFlat[]> {
  const r = await apiService.getCollectionProjects({});
  const summaries = r.ok ? (r.data as CollectionProjectSummary[]) : [];
  const details = await Promise.all(summaries.map((p) => apiService.getCollectionProject(p.slug)));
  const out: MarketFlat[] = [];
  for (const d of details) {
    if (!d.ok) continue;
    for (const unit of flatsOf(d.data)) {
      const flat = await toFlat(d.data, unit, me);
      if (flat) out.push(flat);
    }
  }
  return out;
}

/** One flat, by building and vault. */
export async function loadFlat(slug: string, vault: string, me: string | null): Promise<MarketFlat | null> {
  const d = await apiService.getCollectionProject(slug);
  if (!d.ok) return null;
  const unit = flatsOf(d.data).find((u) => u.vault_account_id === vault);
  return unit ? toFlat(d.data, unit, me) : null;
}

/** How a listing's price compares with what a share cost in the raise. */
export function premiumPct(flat: MarketFlat, pricePerShare: string): number {
  if (flat.originalPerShare <= 0n) return 0;
  return Math.round(((Number(pricePerShare) - Number(flat.originalPerShare)) / Number(flat.originalPerShare)) * 100);
}

export function listingHref(flat: MarketFlat, listingId: number): string {
  return `/collections/shares/listing?${new URLSearchParams({ slug: flat.slug, vault: flat.vault, id: String(listingId) }).toString()}`;
}

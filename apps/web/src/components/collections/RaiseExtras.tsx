"use client";

/* eslint-disable @next/next/no-img-element -- map tiles come from OpenStreetMap */
import { useEffect, useState } from "react";
import { MapPin, Search } from "lucide-react";
import apiService, { type CollectionProfile, type CollectionProjectType } from "@/services/api";
import { PROJECT_TYPE_TEXT } from "@/services/collections/copy";

// ---- map -------------------------------------------------------------------

const TILE = 256;

function tileOf(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

/**
 * A small map with a pin, drawn from OpenStreetMap tiles.
 *
 * Images rather than an embedded map: the app's security policy forbids
 * frames (nobody can load a page inside Sheda), and plain images need no
 * script from another site. Tapping opens the full map.
 */
export function OsmMap({ lat, lon, label, height = 180 }: { lat: number; lon: number; label?: string; height?: number }) {
  const z = 16;
  const { x, y } = tileOf(lat, lon, z);
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  // Pin position inside the 3x3 block, in pixels from its top-left.
  const px = (x - (cx - 1)) * TILE;
  const py = (y - (cy - 1)) * TILE;
  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      tiles.push({
        key: `${dx}:${dy}`,
        src: `https://tile.openstreetmap.org/${z}/${cx + dx}/${cy + dy}.png`,
        left: (dx + 1) * TILE,
        top: (dy + 1) * TILE,
      });
    }
  }
  const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${z}/${lat}/${lon}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="relative block overflow-hidden rounded-2xl border border-borderColor bg-gray-100"
      style={{ height }}
      aria-label={label ? `Map of ${label}` : "Map"}
    >
      <div
        className="absolute"
        style={{ width: TILE * 3, height: TILE * 3, left: `calc(50% - ${px}px)`, top: `calc(50% - ${py}px)` }}
      >
        {tiles.map((t) => (
          <img key={t.key} src={t.src} alt="" className="absolute" style={{ left: t.left, top: t.top, width: TILE, height: TILE }} />
        ))}
      </div>
      <MapPin
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-primary drop-shadow"
        size={32}
        fill="currentColor"
        stroke="white"
        aria-hidden="true"
      />
      <span className="absolute bottom-1 right-1 rounded bg-white/85 px-1.5 text-[10px] text-secondaryText">
        © OpenStreetMap contributors
      </span>
    </a>
  );
}

interface Place {
  display_name: string;
  lat: string;
  lon: string;
}

/** Find an address on OpenStreetMap and pin it. */
export function LocationPicker({
  address,
  lat,
  lon,
  onChange,
}: {
  address: string;
  lat: number | null;
  lon: number | null;
  onChange: (v: { address: string; lat: number | null; lon: number | null }) => void;
}) {
  const [query, setQuery] = useState(address);
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 3) return setNote("Type the street and area first.");
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query.trim())}`,
        { headers: { Accept: "application/json" } }
      );
      const list = (await r.json()) as Place[];
      setResults(list);
      if (!list.length) setNote("Nothing found. Try the street name and the area, e.g. 12 Admiralty Way, Lekki.");
    } catch {
      setNote("The map search is not answering. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm text-primaryText">
        Address
        <div className="mt-1 flex gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange({ address: e.target.value, lat, lon });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
            placeholder="Street, area, city"
            className="min-w-0 flex-1 rounded-xl border border-borderColor px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={search}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-xl border border-borderColor px-3 text-sm font-medium text-primaryText disabled:opacity-60"
          >
            <Search size={14} /> {busy ? "…" : "Find"}
          </button>
        </div>
      </label>
      {results && results.length > 0 ? (
        <ul className="divide-y divide-borderColor rounded-xl border border-borderColor">
          {results.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onChange({ address: query.trim(), lat: Number(p.lat), lon: Number(p.lon) });
                  setResults(null);
                }}
                className="w-full px-3 py-2 text-left text-xs text-primaryText hover:bg-cardBackground"
              >
                {p.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="text-xs text-secondaryText">{note}</p> : null}
      {lat != null && lon != null ? <OsmMap lat={lat} lon={lon} label={address} height={160} /> : null}
    </div>
  );
}

// ---- project type ----------------------------------------------------------

export function ProjectTypePicker({
  value,
  onChange,
}: {
  value: CollectionProjectType;
  onChange: (v: CollectionProjectType) => void;
}) {
  const options: CollectionProjectType[] = ["off_plan", "under_construction", "completed"];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Project type">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={`rounded-xl px-3 py-2 text-sm ${
            value === o ? "bg-primary text-white" : "border border-borderColor text-primaryText"
          }`}
        >
          {PROJECT_TYPE_TEXT[o]}
        </button>
      ))}
    </div>
  );
}

// ---- suggested managers ----------------------------------------------------

/**
 * Pick up to three property managers to suggest to investors. Lists every
 * manager on Sheda (nearest first by matching location text) plus the
 * builder's own manager profile, which is marked as the builder's company.
 */
export function ManagerPicker({
  location,
  selected,
  onChange,
  ownManager,
}: {
  location: string;
  selected: number[];
  onChange: (ids: number[]) => void;
  ownManager: CollectionProfile | null;
}) {
  const [managers, setManagers] = useState<CollectionProfile[] | null>(null);

  useEffect(() => {
    let alive = true;
    apiService.getCollectionDirectory("manager", { silent: true }).then((r) => {
      if (!alive) return;
      const list = r.ok ? r.data.map((d) => d.profile).filter((p) => !p.suspended) : [];
      setManagers(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const area = location.toLowerCase().split(/[,\s]+/).filter((w) => w.length > 2);
  const near = (p: CollectionProfile) =>
    area.some((w) => (p.location ?? "").toLowerCase().includes(w)) ? 0 : 1;
  const all = [...(managers ?? [])];
  if (ownManager && !all.some((m) => m.id === ownManager.id)) all.push(ownManager);
  all.sort((a, b) => near(a) - near(b));

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < 3 ? [...selected, id] : selected);

  if (managers === null) return <p className="text-sm text-secondaryText">Loading managers…</p>;
  if (all.length === 0)
    return (
      <p className="text-sm text-secondaryText">
        No property managers are on Sheda yet. If your company manages property, add a property manager profile in
        Business profile and suggest yourself; investors will be told it is your own company.
      </p>
    );

  return (
    <div className="space-y-2">
      {all.map((m) => {
        const own = ownManager?.id === m.id;
        const on = selected.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            aria-pressed={on}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
              on ? "border-primary bg-primaryLight" : "border-borderColor"
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-xs font-semibold text-secondaryText">
              {m.avatar_url ? <img src={m.avatar_url} alt="" className="h-full w-full object-cover" /> : m.display_name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-primaryText">
                {m.display_name}
                {own ? <span className="ml-1 text-xs font-normal text-amber-700">(your company)</span> : null}
              </span>
              <span className="block truncate text-xs text-secondaryText">
                {m.location ?? "Location not given"}
                {m.fee_bps != null ? ` · ${m.fee_bps / 100}% of rent` : " · fee not set yet"}
              </span>
            </span>
            <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${on ? "border-primary bg-primary" : "border-borderColor"}`} />
          </button>
        );
      })}
      <p className="text-xs text-secondaryText">
        {selected.length}/3 chosen. Each one must accept before the raise opens; investors then pick one.
      </p>
    </div>
  );
}

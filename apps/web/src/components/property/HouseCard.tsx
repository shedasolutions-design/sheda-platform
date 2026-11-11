"use client";

import Link from "next/link";
import { Bath, BedDouble, ChevronRight, EyeOff, MapPin, Trash2 } from "lucide-react";
import type { HouseProps } from "@/types";
import getFullImageUrl from "@/utilities/imageUrl";
import Favorite from "./Favorite";
import PriceDisplay from "./PriceDisplay";

/**
 * A property in a list. The whole card links to its details page; the
 * favourite and owner actions sit above the link and do not navigate.
 */
export default function HouseCard({
  house,
  onDelete,
  onDelist,
}: {
  house: HouseProps;
  onDelete?: (id: string) => void;
  onDelist?: (id: string) => void;
}) {
  const unavailable = house.isUnavailable === true;
  const src =
    typeof house.image === "string" && house.image
      ? getFullImageUrl(house.image)
      : house.image?.uri ?? "/images/apt-1.png";
  const price = parseFloat(String(house.price).replace(/[^0-9.-]/g, "")) || 0;
  const href = `/details/${house.id}`;

  return (
    <article className={`relative w-full rounded-lg bg-white ${unavailable ? "opacity-60" : ""}`}>
      <div className="relative overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={house.title}
          loading="lazy"
          className="h-[175px] w-full rounded-lg object-cover md:h-[200px]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/images/apt-1.png";
          }}
        />
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45">
            <span className="rounded-full bg-white/90 px-4 py-1.5 text-[13px] font-semibold text-red-800">
              Unavailable
            </span>
          </div>
        )}
      </div>

      <div className="w-full px-3 py-2">
        <h3 className="text-sm font-medium leading-5">
          {unavailable ? (
            house.title
          ) : (
            // Stretched link: the whole card is clickable, but only one link
            // is announced to screen readers.
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {house.title}
            </Link>
          )}
        </h3>
        {/* luxury_villa → "Luxury Villa" (the backend spells types with underscores). */}
        <p className="text-xs capitalize text-secondaryText">{String(house.type ?? "").replace(/_/g, " ")}</p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#878787BF]">
          <li className="flex items-center gap-1">
            <MapPin size={12} /> {house.location}
          </li>
          <li className="flex items-center gap-1">
            <BedDouble size={14} /> {house.bedrooms} Bed
          </li>
          <li className="flex items-center gap-1">
            <Bath size={13} /> {house.bathrooms} Bath
          </li>
        </ul>
        <div className="mt-1 flex items-center justify-between">
          <PriceDisplay
            amountFiat={price}
            fiatCode={house.priceCurrency || "NGN"}
            suffix={house.mode === "rent" ? "/year" : ""}
            compact
          />
          {unavailable ? (
            <span className="text-xs text-gray-400">Sold / Rented</span>
          ) : (
            <span aria-hidden="true" className="flex items-center text-primary">
              View Details <ChevronRight size={20} />
            </span>
          )}
        </div>
      </div>

      {/* Above the stretched link so they stay clickable. */}
      <div className="absolute inset-x-0 top-0 z-10 flex justify-between px-2 py-3">
        <div className="flex gap-2">
          {onDelist && (
            <button
              type="button"
              aria-label="Delist property"
              onClick={() => onDelist(house.id)}
              className="rounded-full bg-white/90 p-2 shadow-sm hover:bg-white"
            >
              <EyeOff size={18} className="text-amber-500" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Delete property"
              onClick={() => onDelete(house.id)}
              className="rounded-full bg-white/90 p-2 shadow-sm hover:bg-white"
            >
              <Trash2 size={18} className="text-primary" />
            </button>
          )}
        </div>
        <Favorite propertyId={parseInt(house.id) || 0} className="h-8 w-8 border-0 bg-white/90" />
      </div>
    </article>
  );
}

export function PropertySkeleton() {
  return (
    <div className="animate-pulse p-3" aria-hidden="true">
      <div className="h-40 w-full rounded-xl bg-[#E1E9EE]" />
      <div className="mt-3 h-4 w-[70%] rounded bg-[#E1E9EE]" />
      <div className="mt-2 h-3.5 w-1/2 rounded bg-[#E1E9EE]" />
      <div className="mt-3 flex gap-2">
        <div className="h-4 w-20 rounded bg-[#E1E9EE]" />
        <div className="h-6 w-12 rounded-lg bg-[#E1E9EE]" />
        <div className="h-6 w-12 rounded-lg bg-[#E1E9EE]" />
      </div>
    </div>
  );
}

export function PropertySkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading properties" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <PropertySkeleton key={i} />
      ))}
    </div>
  );
}

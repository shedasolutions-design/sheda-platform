import type { PropertySearchParams } from "@/services/api";

/**
 * Turning what the filter screen collects into what the search endpoint takes.
 *
 * The screen gathered a location, a price range, bedrooms, bathrooms, a
 * listing type, furnished, a sort order and eight extras — computed a filtered
 * list from them, threw it away, and applied only the property type as a
 * category chip. Everything else a person set did nothing at all, and nothing
 * said so: the results simply came back unchanged, which reads as "no
 * properties match" rather than "that filter was ignored".
 *
 * The backend already accepts every one of these, so they are translated and
 * sent rather than discarded.
 */

/** What the filter screen holds, mirrored from app/filter/FilterInput.tsx. */
export interface FilterValues {
  location: string;
  propertyType: string;
  listingType: string;
  sortBy: string;
  bedrooms: number;
  bathrooms: number;
  minPrice: number;
  maxPrice: number;
  furnished: boolean;
  extras: {
    airConditioner: boolean;
    popCeiling: boolean;
    floorTiles: boolean;
    runningWater: boolean;
    furniture: boolean;
    prepaidMeter: boolean;
    wifi: boolean;
    negotiable: boolean;
  };
}

/** Screen wording → the column names the backend maps amenities onto. */
const EXTRA_TO_AMENITY: Record<string, string> = {
  airConditioner: "air_condition",
  popCeiling: "pop_ceiling",
  floorTiles: "floor_tiles",
  runningWater: "running_water",
  furniture: "furniture",
  prepaidMeter: "prepaid_meter",
  wifi: "wifi",
  // `negotiable` is deliberately absent: it is `is_negotiable` on the
  // property, not an amenity, and the search endpoint has no filter for it.
  // Sending it would be silently dropped, so it stays a local concern.
};

/** Screen wording → the sort values the endpoint understands. */
const SORT_MAP: Record<string, string> = {
  "price-asc": "price_asc",
  "price-desc": "price_desc",
  newest: "created_desc",
  oldest: "created_asc",
};

/** The property types the backend knows, lowercased as it stores them. */
const BACKEND_PROPERTY_TYPES = new Set([
  "apartment",
  "land",
  "shortlet",
  "shared_apartment",
]);

/**
 * Build the search parameters for a set of filters.
 *
 * Returns `null` when nothing was actually narrowed, so the caller can leave
 * the ordinary feed alone rather than issuing a search that constrains
 * nothing.
 */
export function filtersToSearchParams(
  filters: Partial<FilterValues> | null | undefined,
  query?: string
): PropertySearchParams | null {
  if (!filters) return query?.trim() ? { query: query.trim() } : null;

  const params: PropertySearchParams = { query: query?.trim() || "*" };
  let narrowed = false;

  if (filters.location?.trim()) {
    params.location = filters.location.trim();
    narrowed = true;
  }

  // Only the four types the backend stores. The screen also offers Bungalows,
  // Duplexes and the rest, which have no type on the backend — filtering on
  // those server-side would match nothing, so they are left to the title
  // matching the home screen already does.
  const type = filters.propertyType?.trim().toLowerCase().replace(/\s+/g, "_");
  if (type && BACKEND_PROPERTY_TYPES.has(type)) {
    params.property_type = type;
    narrowed = true;
  }

  if (filters.listingType?.trim()) {
    params.listing_type = filters.listingType.trim().toLowerCase();
    narrowed = true;
  }

  // Zero means "Any" on both selectors, not "none".
  if (filters.bedrooms && filters.bedrooms > 0) {
    params.min_bedroom = filters.bedrooms;
    narrowed = true;
  }
  if (filters.bathrooms && filters.bathrooms > 0) {
    params.min_bathroom = filters.bathrooms;
    narrowed = true;
  }

  if (filters.minPrice && filters.minPrice > 0) {
    params.min_price = filters.minPrice;
    narrowed = true;
  }
  // A max of zero is the slider at rest, not a request for free properties.
  if (filters.maxPrice && filters.maxPrice > 0) {
    params.max_price = filters.maxPrice;
    narrowed = true;
  }

  // Only sent when true: `furnished=false` would exclude every property whose
  // column was never set, which is not what leaving a box unticked means.
  if (filters.furnished) {
    params.furnished = true;
    narrowed = true;
  }

  const amenities = Object.entries(filters.extras ?? {})
    .filter(([key, on]) => on && EXTRA_TO_AMENITY[key])
    .map(([key]) => EXTRA_TO_AMENITY[key]);
  if (amenities.length) {
    params.amenities = amenities;
    narrowed = true;
  }

  const sort = filters.sortBy && SORT_MAP[filters.sortBy];
  if (sort) {
    params.sort = sort;
    // A sort alone is a real request — show everything, in that order.
    narrowed = true;
  }

  if (!narrowed && !query?.trim()) return null;
  return params;
}

/** Whether a stored filter set still narrows anything. */
export function hasActiveFilters(
  filters: Partial<FilterValues> | null | undefined
): boolean {
  return filtersToSearchParams(filters) !== null;
}

/**
 * The category chips the home screen shows, in the terms the backend uses.
 *
 * The UI names them for people ("Shared Apartments"); the backend stores
 * `PropertyTypeEnum` ("shared_apartment"). Sending the label straight through
 * filters on a type that does not exist, which returns an empty page rather
 * than an error — so the mismatch reads as "no properties" instead of "wrong
 * filter", and that is exactly the kind of bug nobody reports.
 *
 * Kept apart from the hook that uses it so it can be tested without pulling in
 * the API client and, through it, native storage.
 */
const CATEGORY_TO_PROPERTY_TYPE: Record<string, string> = {
  Apartments: "apartment",
  Land: "land",
  Shortlets: "shortlet",
  "Shared Apartments": "shared_apartment",
  Bungalows: "bungalow",
  Duplexes: "duplex",
  "Luxury Villas": "luxury_villa",
  Townhouses: "townhouse",
  "Waterfront Properties": "waterfront",
  "New Developments": "new_development",
  "Affordable Homes": "affordable_home",
};

/**
 * The backend `property_type` for a category chip, or `undefined` for "do not
 * filter by type" — which is what "All", a missing value, and anything
 * unrecognised all mean.
 */
export function categoryToPropertyType(
  category?: string | null
): string | undefined {
  if (!category || category === "All") return undefined;
  return CATEGORY_TO_PROPERTY_TYPE[category];
}

export const PROPERTY_CATEGORIES = Object.keys(CATEGORY_TO_PROPERTY_TYPE);

/**
 * Whether a property belongs in a category chip.
 *
 * A listing with a type matches on its type alone. The title used to count
 * too, as a substring: "Land" matched every title containing "Island", so
 * a shortlet in Victoria Island showed under Land. A title is only read for
 * a listing with no type at all, and then as whole words.
 *
 * Applied on top of backend results as well as local ones, so a search with a
 * chip selected narrows the same way whichever list is on screen.
 */
export function matchesCategory(
  property: { property_type?: string | null; title?: string | null },
  category?: string | null
): boolean {
  if (!category || category === "All") return true;
  const wanted = CATEGORY_TO_PROPERTY_TYPE[category];
  const type = property.property_type?.trim().toLowerCase();
  if (type) return !!wanted && type === wanted;

  // No type on record: whole words of the title, singular or plural.
  const label = category.toLowerCase();
  const singular = label.endsWith("ies")
    ? label.slice(0, -3) + "y"
    : label.endsWith("xes") || label.endsWith("ses")
      ? label.slice(0, -2)
      : label.endsWith("s")
        ? label.slice(0, -1)
        : label;
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const words = new RegExp(`\\b(${escape(singular)}|${escape(label)})\\b`, "i");
  return words.test(property.title || "");
}

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
 * Only four of the twelve chips correspond to a `PropertyTypeEnum` value. The
 * rest — Bungalows, Duplexes, Luxury Villas, Townhouses, Waterfront
 * Properties, New Developments, Affordable Homes — have no backend type at
 * all, and are matched against the listing's title instead. Loose, but it is
 * what those chips have always done, and dropping it would quietly empty
 * seven of the twelve.
 *
 * Applied on top of backend results as well as local ones, so a search with a
 * chip selected narrows the same way whichever list is on screen.
 */
export function matchesCategory(
  property: { property_type?: string | null; title?: string | null },
  category?: string | null
): boolean {
  if (!category || category === "All") return true;

  const categoryLower = category.toLowerCase();
  const typeLower = property.property_type?.toLowerCase().replace("_", " ");

  if (categoryLower === "apartments" && typeLower === "apartment") return true;
  if (categoryLower === "land" && typeLower === "land") return true;
  if (categoryLower === "shortlets" && typeLower === "shortlet") return true;
  if (categoryLower === "shared apartments" && typeLower === "shared apartment") return true;

  // Chips are plural, types are singular.
  let categorySingular = categoryLower;
  if (categoryLower.endsWith("ies")) {
    categorySingular = categoryLower.slice(0, -3) + "y";
  } else if (categoryLower.endsWith("es") && categoryLower !== "houses") {
    categorySingular = categoryLower.slice(0, -2);
  } else if (categoryLower.endsWith("s")) {
    categorySingular = categoryLower.slice(0, -1);
  }

  if (typeLower === categorySingular) return true;
  if (typeLower === categoryLower) return true;

  if (property.title?.toLowerCase().includes(categorySingular)) return true;
  if (property.title?.toLowerCase().includes(categoryLower)) return true;

  return false;
}

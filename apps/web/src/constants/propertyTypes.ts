/**
 * Single source of truth for all property types across the app.
 *
 * Used by:
 * - Home screen categories (categories-mock.ts)
 * - Filter screen (FilterInput.tsx)
 * - Listing forms (PropertyDescriptionForm.tsx, PropertyListingForm.tsx)
 * - API types (api.ts)
 */

export const PROPERTY_TYPES = [
  "apartment",
  "land",
  "shortlet",
  "shared apartment",
  "bungalow",
  "duplex",
  "luxury villa",
  "townhouse",
  "waterfront",
  "new development",
  "affordable home",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Display labels for each property type */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  land: "Land",
  shortlet: "Shortlet",
  "shared apartment": "Shared Apartment",
  bungalow: "Bungalow",
  duplex: "Duplex",
  "luxury villa": "Luxury Villa",
  townhouse: "Townhouse",
  waterfront: "Waterfront Property",
  "new development": "New Development",
  "affordable home": "Affordable Home",
};

/**
 * Build SelectInput options from the canonical list.
 * @param includeAll If true, prepends an "All Types" option with value "".
 */
export function getPropertyTypeOptions(includeAll = false) {
  const options = PROPERTY_TYPES.map((t) => ({
    label: PROPERTY_TYPE_LABELS[t],
    value: t,
  }));
  return includeAll
    ? [{ label: "All Types", value: "" as string }, ...options]
    : options;
}

/** Property types that represent land (no rooms, no interior features) */
export const isLandType = (type: string) =>
  type.toLowerCase() === "land";

/** Property types that are short-term stays */
export const isShortletType = (type: string) =>
  type.toLowerCase() === "shortlet";

/** Property types with rooms (bedrooms, bathrooms, furnishing) */
export const isHousingType = (type: string) =>
  !isLandType(type);

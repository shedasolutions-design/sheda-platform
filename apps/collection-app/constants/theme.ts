/**
 * Sheda's palette and type scale, in the one place a non-Tailwind style can
 * reach them.
 *
 * NativeWind covers most of the app, but anything passed as a prop, such as
 * an ActivityIndicator colour or a StatusBar tint, needs the literal.
 * Keeping them here means the two cannot drift apart silently.
 */
export const COLORS = {
  primary: "#C1272D",
  primaryLight: "#C1272D0A",
  primaryTint: "#FDF4F4",
  background: "#FFFFFF",
  primaryText: "#0B0B0C",
  secondaryText: "#6F7276",
  mutedText: "#9A9DA2",
  cardBackground: "#F6F6F7",
  borderColor: "#E4E5E7",
  borderStrong: "#D2D4D7",
  active: "#FFE6E6",
  positive: "#0F7A46",
  positiveLight: "#E8F4ED",
  caution: "#9D5C06",
  cautionLight: "#FBF2E2",
  critical: "#A3171D",
  criticalLight: "#FBECEC",
} as const;

/** The rental app's button radius. Matched so the two feel like one product. */
export const RADIUS = 12;

/** Radius for the smaller surfaces sitting inside a card. */
export const RADIUS_INNER = 9;

/**
 * One type scale, used everywhere.
 *
 * Sizes chosen by hand before this existed drifted a point at a time until
 * nine of them were in use and no two screens agreed. Six steps with fixed
 * line heights is enough for this product and keeps the rhythm even.
 */
export const TYPE = {
  display: { fontSize: 23, lineHeight: 29 },
  title: { fontSize: 17, lineHeight: 23 },
  heading: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 11, lineHeight: 15 },
  micro: { fontSize: 10, lineHeight: 14 },
} as const;

/** The page gutter. One number, so nothing sits a few pixels off everything else. */
export const GUTTER = 20;

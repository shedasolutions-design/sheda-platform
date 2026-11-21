/**
 * Sheda heroes: the default profile pictures, an original illustrated set.
 *
 * Drawn here as SVG (no image files, nothing licensed from anyone): a hero
 * from the chest up, in a cape and costume, with a chest badge for
 * something done on Sheda and a city behind. Some wear a full cowl with
 * lens eyes, a domino mask, a visor, an eye patch or a hard hat. Used as a
 * data URL in an <img>, so nothing is injected into the page.
 */

type Hair = "short" | "afro" | "bun" | "long" | "curly" | "bald" | "none";
type Face = "plain" | "domino" | "patch" | "visor" | "cowl";
type Emblem = "house" | "key" | "chart" | "check" | "shield" | "compass" | "document" | "star";

export interface HeroDef {
  id: string;
  name: string;
  tagline: string;
  skin: string;
  hair: Hair;
  hairColor: string;
  face: Face;
  /** Mask, cowl or visor colour. */
  mask: string;
  hardHat?: boolean;
  beard?: boolean;
  speed?: boolean;
  cape: string;
  suit: string;
  trim: string;
  bg: string;
  emblem: Emblem;
}

const RED = "#C1272D";
const DEEP = "#8E1B20";
const INK = "#1F2430";
const GOLD = "#E9B949";
const NAVY = "#23324A";

export const HEROES: HeroDef[] = [
  { id: "builder", name: "The Builder", tagline: "Raises it floor by floor", skin: "#8D5524", hair: "none", hairColor: "#1B1B1B", face: "domino", mask: RED, hardHat: true, cape: RED, suit: NAVY, trim: GOLD, bg: "#FDE7E7", emblem: "house" },
  { id: "speedster", name: "The Speedster", tagline: "First to every new listing", skin: "#C68642", hair: "none", hairColor: "#000", face: "cowl", mask: RED, speed: true, cape: DEEP, suit: RED, trim: GOLD, bg: "#FFF1D6", emblem: "key" },
  { id: "investor", name: "The Investor", tagline: "Owns a share of the skyline", skin: "#5C3A21", hair: "bun", hairColor: "#140C08", face: "visor", mask: GOLD, cape: NAVY, suit: RED, trim: GOLD, bg: "#E6EDF7", emblem: "chart" },
  { id: "inspector", name: "The Inspector", tagline: "Signs off every phase", skin: "#E0AC69", hair: "none", hairColor: "#5A3A22", face: "patch", mask: INK, hardHat: true, cape: GOLD, suit: INK, trim: RED, bg: "#EEF1F5", emblem: "check" },
  { id: "guardian", name: "The Guardian", tagline: "Keeps the escrow safe", skin: "#5C3A21", hair: "none", hairColor: "#000", face: "cowl", mask: NAVY, cape: RED, suit: NAVY, trim: GOLD, bg: "#FDE7E7", emblem: "shield" },
  { id: "navigator", name: "The Navigator", tagline: "Knows every street", skin: "#F1C27D", hair: "bald", hairColor: "#3B2A1A", face: "patch", mask: INK, beard: true, cape: NAVY, suit: RED, trim: GOLD, bg: "#E6EDF7", emblem: "compass" },
  { id: "homeowner", name: "The Homeowner", tagline: "Found the one", skin: "#8D5524", hair: "long", hairColor: "#1B1B1B", face: "domino", mask: INK, cape: DEEP, suit: RED, trim: GOLD, bg: "#FFF1D6", emblem: "star" },
  { id: "dealmaker", name: "The Dealmaker", tagline: "Closes it fair and square", skin: "#C68642", hair: "curly", hairColor: "#3A2312", face: "visor", mask: RED, cape: GOLD, suit: NAVY, trim: RED, bg: "#EEF1F5", emblem: "document" },
];

function emblem(kind: Emblem, c: string): string {
  switch (kind) {
    case "house":
      return `<path d="M70 135 L80 126 L90 135 V143 H70 Z" fill="${c}"/><rect x="77.5" y="136.5" width="5" height="6.5" fill="#fff"/>`;
    case "key":
      return `<circle cx="74.5" cy="134.5" r="5" fill="none" stroke="${c}" stroke-width="2.8"/><path d="M79.5 134.5 H91 M87 134.5 V139 M90.5 134.5 V138" stroke="${c}" stroke-width="2.8" stroke-linecap="round"/>`;
    case "chart":
      return `<rect x="70" y="136" width="5" height="7" rx="1" fill="${c}"/><rect x="77.5" y="131" width="5" height="12" rx="1" fill="${c}"/><rect x="85" y="126" width="5" height="17" rx="1" fill="${c}"/>`;
    case "check":
      return `<path d="M71 134 L78 141 L90 128" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "shield":
      return `<path d="M80 124.5 L89.5 128 V134.5 Q89.5 141.5 80 145 Q70.5 141.5 70.5 134.5 V128 Z" fill="${c}"/><path d="M76 134.5 L79.3 137.8 L84.5 131.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`;
    case "compass":
      return `<circle cx="80" cy="134.5" r="9" fill="none" stroke="${c}" stroke-width="2.4"/><path d="M80 127 L83.4 134.5 L80 142 L76.6 134.5 Z" fill="${c}"/>`;
    case "document":
      return `<rect x="72.5" y="125" width="15" height="19" rx="2" fill="${c}"/><path d="M76 130.5 H84 M76 134.5 H84 M76 138.5 H81" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>`;
    case "star":
      return `<path d="M80 124.5 L83 131.2 L90 131.8 L84.7 136.4 L86.3 143.3 L80 139.6 L73.7 143.3 L75.3 136.4 L70 131.8 L77 131.2 Z" fill="${c}"/>`;
  }
}

/** A city behind the hero, and a burst of light. */
function backdrop(h: HeroDef): string {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const x = 80 + Math.cos(a) * 120;
    const y = 70 + Math.sin(a) * 120;
    const x2 = 80 + Math.cos(a + 0.16) * 120;
    const y2 = 70 + Math.sin(a + 0.16) * 120;
    return `<path d="M80 70 L${x.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="#fff" opacity=".35"/>`;
  }).join("");
  const city = [
    [8, 96, 16, 70], [26, 84, 12, 80], [40, 100, 14, 60], [104, 92, 14, 70], [120, 80, 12, 80], [134, 98, 18, 62],
  ]
    .map(([x, y, w, hgt]) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" fill="#fff" opacity=".55"/>`)
    .join("");
  const streaks = h.speed
    ? [40, 52, 64].map((y, i) => `<path d="M${6 + i * 4} ${y} H${36 - i * 3}" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" opacity=".9"/><path d="M${126 + i * 3} ${y + 6} H${154 - i * 4}" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" opacity=".9"/>`).join("")
    : "";
  return `<rect width="160" height="160" fill="url(#bg-${h.id})"/>${rays}${city}${streaks}`;
}

function cape(h: HeroDef): string {
  return `<path d="M8 160 C12 112 40 92 80 92 C120 92 148 112 152 160 Z" fill="${h.cape}"/>
<path d="M22 160 C28 124 48 104 80 104" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="4"/>
<path d="M138 160 C132 124 112 104 80 104" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="4"/>`;
}

function body(h: HeroDef): string {
  return `<path d="M34 160 C36 126 54 110 80 110 C106 110 124 126 126 160 Z" fill="url(#suit-${h.id})"/>
<path d="M58 112 L80 124 L102 112" fill="none" stroke="${h.trim}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="55" cy="114" r="5" fill="${GOLD}" stroke="#fff" stroke-width="1.2"/><circle cx="105" cy="114" r="5" fill="${GOLD}" stroke="#fff" stroke-width="1.2"/>
<path d="M80 120 L96 126 V136 Q96 147 80 153 Q64 147 64 136 V126 Z" fill="#fff" stroke="${h.trim}" stroke-width="2.4"/>
<g transform="translate(0 1.5) scale(1)">${emblem(h.emblem, RED)}</g>`;
}

function hairBack(h: HeroDef): string {
  if (h.face === "cowl") return "";
  if (h.hair === "afro") return `<circle cx="80" cy="58" r="38" fill="${h.hairColor}"/>`;
  if (h.hair === "long") return `<path d="M44 70 Q42 30 80 30 Q118 30 116 70 L120 112 Q105 104 104 86 L56 86 Q55 104 40 112 Z" fill="${h.hairColor}"/>`;
  return "";
}

function hairFront(h: HeroDef): string {
  if (h.hardHat || h.face === "cowl") return "";
  switch (h.hair) {
    case "short":
      return `<path d="M48 66 Q45 32 80 31 Q115 32 112 66 Q106 46 80 45 Q56 46 48 66 Z" fill="${h.hairColor}"/>`;
    case "bun":
      return `<circle cx="80" cy="27" r="12" fill="${h.hairColor}"/><path d="M48 66 Q45 34 80 33 Q115 34 112 66 Q105 48 80 47 Q57 48 48 66 Z" fill="${h.hairColor}"/>`;
    case "long":
      return `<path d="M48 64 Q48 34 80 33 Q112 34 112 64 Q98 44 80 48 Q64 44 48 64 Z" fill="${h.hairColor}"/>`;
    case "curly":
      return [54, 66, 80, 94, 106].map((x, i) => `<circle cx="${x}" cy="${40 + (i % 2) * 4}" r="10.5" fill="${h.hairColor}"/>`).join("");
    case "afro":
      return `<path d="M49 60 Q60 42 80 42 Q100 42 111 60 Q96 51 80 51 Q64 51 49 60 Z" fill="${h.hairColor}"/>`;
    default:
      return "";
  }
}

function face(h: HeroDef): string {
  const smile = `<path d="M70 87 Q80 95 90 87" fill="none" stroke="#3A1E12" stroke-width="2.8" stroke-linecap="round"/>`;
  const brows = `<path d="M62 60 Q69 56 76 60 M84 60 Q91 56 98 60" fill="none" stroke="#2A1A10" stroke-width="2.4" stroke-linecap="round"/>`;
  const eyes = `<circle cx="69" cy="69" r="3.6" fill="${INK}"/><circle cx="91" cy="69" r="3.6" fill="${INK}"/><circle cx="70.2" cy="67.8" r="1.1" fill="#fff"/><circle cx="92.2" cy="67.8" r="1.1" fill="#fff"/>`;
  switch (h.face) {
    case "cowl":
      // Covers the head down to the nose; the jaw and smile stay visible.
      return `<path d="M46 74 Q44 34 80 33 Q116 34 114 74 Q114 79 108 80 Q96 74 80 77 Q64 74 52 80 Q46 79 46 74 Z" fill="url(#mask-${h.id})"/>
<path d="M76.5 34 Q80 31 83.5 34 L82.2 58 Q80 61 77.8 58 Z" fill="${h.trim}"/><circle cx="80" cy="45" r="3.2" fill="#fff" opacity=".9"/>
<path d="M58 66 Q66 57 77 64 Q72 74 61 72 Z" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
<path d="M102 66 Q94 57 83 64 Q88 74 99 72 Z" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
<path d="M62 48 Q80 40 98 48" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>${smile}`;
    case "domino":
      return `${brows}<path d="M52 66 Q66 56 80 64 Q94 56 108 66 Q105 80 92 78 Q85 77 80 72 Q75 77 68 78 Q55 80 52 66 Z" fill="${h.mask}"/>
<path d="M52 66 Q44 70 40 82 M53 69 Q47 76 46 86" fill="none" stroke="${h.mask}" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="68.5" cy="69" rx="5" ry="3.9" fill="#fff"/><ellipse cx="91.5" cy="69" rx="5" ry="3.9" fill="#fff"/><circle cx="69" cy="69.3" r="2.4" fill="${INK}"/><circle cx="91" cy="69.3" r="2.4" fill="${INK}"/>${smile}`;
    case "visor":
      return `<rect x="50" y="61" width="60" height="15" rx="7.5" fill="${INK}"/><rect x="53" y="63.5" width="54" height="10" rx="5" fill="url(#mask-${h.id})"/>
<path d="M58 66 H72" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>${brows}${smile}`;
    case "patch":
      return `${brows}<path d="M46 56 L114 80" stroke="${h.mask}" stroke-width="2.8"/><ellipse cx="91" cy="69.5" rx="9.5" ry="8.5" fill="${h.mask}"/><circle cx="69" cy="69" r="3.6" fill="${INK}"/><circle cx="70.2" cy="67.8" r="1.1" fill="#fff"/>${smile}`;
    default:
      return `${brows}${eyes}${smile}`;
  }
}

/** One hero as an SVG string. */
export function heroSvg(h: HeroDef): string {
  const hardHat = h.hardHat
    ? `<path d="M47 60 Q48 26 80 24 Q112 26 113 60 Z" fill="${GOLD}"/><path d="M75 24 H85 V42 H75 Z" fill="#D9A633"/><path d="M40 57 H120 V65 Q80 71 40 65 Z" fill="#D9A633"/><path d="M58 34 Q66 29 74 30" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : "";
  const beard = h.beard
    ? `<path d="M50 74 Q52 106 80 108 Q108 106 110 74 Q101 92 80 92 Q59 92 50 74 Z" fill="${h.hairColor}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${h.name}">
<defs>
<clipPath id="c-${h.id}"><circle cx="80" cy="80" r="80"/></clipPath>
<radialGradient id="bg-${h.id}" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${h.bg}"/></radialGradient>
<linearGradient id="suit-${h.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${h.suit}"/><stop offset="1" stop-color="${h.suit}" stop-opacity=".82"/></linearGradient>
<linearGradient id="mask-${h.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${h.mask}"/><stop offset="1" stop-color="${h.mask}" stop-opacity=".85"/></linearGradient>
</defs>
<g clip-path="url(#c-${h.id})">
${backdrop(h)}${cape(h)}${body(h)}
<rect x="71" y="90" width="18" height="22" rx="7" fill="${h.skin}"/>
${hairBack(h)}
<circle cx="47" cy="72" r="7" fill="${h.skin}"/><circle cx="113" cy="72" r="7" fill="${h.skin}"/>
<circle cx="80" cy="68" r="33" fill="${h.skin}"/>
${hairFront(h)}${beard}${face(h)}${hardHat}
</g>
<circle cx="80" cy="80" r="78.5" fill="none" stroke="#fff" stroke-width="3"/>
</svg>`;
}

/** As a data URL for <img src>. */
export function heroDataUrl(h: HeroDef): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(heroSvg(h))}`;
}

/** The same hero for the same person every time, until they pick one. */
export function heroFor(seed: string | number | null | undefined): HeroDef {
  const s = String(seed ?? "");
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return HEROES[n % HEROES.length];
}

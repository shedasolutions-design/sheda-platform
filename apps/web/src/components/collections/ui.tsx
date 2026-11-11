"use client";

import { InterBold, InterMedium, InterRegular, InterSemiBold } from "@/components/collections/rn";
import type { ReactNode } from "react";
import { TouchableOpacity, View } from "@/components/collections/rn";
import { RefreshCw } from "lucide-react";
import type { ReactElement } from "react";

type ViewStyle = Record<string, unknown>;

/**
 * The pieces every Collections screen is built from.
 *
 * Kept under components/collections rather than merged into the shared
 * component folder. Collections is a new product sharing an app with a
 * working marketplace, and the marketplace's components are load bearing
 * for people using it today. Keeping these apart means nothing here can
 * change how a listing or a bid renders, and the whole feature stays
 * removable.
 *
 * It reuses the app's Text components, so the typography is the same by
 * construction rather than by matching numbers twice.
 */

export const C = {
  primary: "#C1272D",
  primaryTint: "#FDF4F4",
  background: "#FFFFFF",
  text: "#0B0B0C",
  textSecondary: "#6F7276",
  textMuted: "#9A9DA2",
  surface: "#F6F6F7",
  border: "#E4E5E7",
  positive: "#0F7A46",
  positiveLight: "#E8F4ED",
  caution: "#9D5C06",
  cautionLight: "#FBF2E2",
  critical: "#A3171D",
  criticalLight: "#FBECEC",
} as const;

export const TYPE = {
  display: { fontSize: 23, lineHeight: 29 },
  title: { fontSize: 17, lineHeight: 23 },
  heading: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 11, lineHeight: 15 },
  micro: { fontSize: 10, lineHeight: 14 },
} as const;

export const RADIUS = 12;
export const RADIUS_INNER = 9;
export const GUTTER = 20;

export type Tone = "plain" | "positive" | "caution" | "critical" | "brand";

const FG: Record<Tone, string> = {
  plain: C.text,
  positive: C.positive,
  caution: C.caution,
  critical: C.critical,
  brand: C.primary,
};

const BG: Record<Tone, string> = {
  plain: C.surface,
  positive: C.positiveLight,
  caution: C.cautionLight,
  critical: C.criticalLight,
  brand: C.primaryTint,
};

export function Screen({
  children,
  gap = 22,
  refreshControl,
}: {
  children: ReactNode;
  gap?: number;
  /** A <RefreshControl>: on the web it becomes a refresh button. */
  refreshControl?: ReactElement<{ refreshing: boolean; onRefresh: () => void }>;
}) {
  const r = refreshControl?.props;
  return (
    <div className="mx-auto w-full max-w-2xl" style={{ padding: GUTTER, paddingBottom: 44, display: "flex", flexDirection: "column", gap }}>
      {r && (
        <button
          type="button"
          onClick={r.onRefresh}
          disabled={r.refreshing}
          aria-label="Refresh"
          className="-mb-3 self-end rounded-lg p-2 text-secondaryText hover:bg-cardBackground"
        >
          <RefreshCw size={16} className={r.refreshing ? "animate-spin" : ""} />
        </button>
      )}
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <InterBold style={{ ...TYPE.display, color: C.text }}>{title}</InterBold>
      {subtitle ? (
        <InterRegular style={{ ...TYPE.body, color: C.textSecondary }}>{subtitle}</InterRegular>
      ) : null}
    </View>
  );
}

export function Section({
  title,
  action,
  children,
  gap = 10,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View style={{ gap: 11 }}>
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <InterSemiBold style={{ ...TYPE.title, color: C.text }}>{title}</InterSemiBold>
          {action}
        </View>
      ) : null}
      <View style={{ gap }}>{children}</View>
    </View>
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: C.background,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: RADIUS,
        padding: padded ? 15 : 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

export function Badge({ label, tone = "plain" }: { label: string; tone?: Tone }) {
  return (
    <View
      style={{
        backgroundColor: BG[tone],
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        alignSelf: "flex-start",
      }}
    >
      <InterSemiBold style={{ ...TYPE.micro, color: FG[tone] }}>{label}</InterSemiBold>
    </View>
  );
}

export function StatTile({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: BG[tone],
        borderRadius: RADIUS_INNER,
        padding: 11,
        gap: 2,
      }}
    >
      <InterRegular style={{ ...TYPE.micro, color: C.textSecondary }}>{label}</InterRegular>
      <InterSemiBold style={{ ...TYPE.heading, color: FG[tone] }}>{value}</InterSemiBold>
      {note ? <InterRegular style={{ ...TYPE.micro, color: C.textMuted }}>{note}</InterRegular> : null}
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 8 }}>{children}</View>;
}

export function KeyValue({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
}) {
  return (
    <View style={{ gap: 2 }}>
      <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>{label}</InterRegular>
      <InterSemiBold style={{ ...TYPE.heading, color: FG[tone] }}>{value}</InterSemiBold>
      {note ? <InterRegular style={{ ...TYPE.label, color: C.textMuted }}>{note}</InterRegular> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.border }} />;
}

export function Meter({
  pct,
  tone = "brand",
  height = 6,
}: {
  pct: number;
  tone?: Tone;
  height?: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: C.surface,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${clamped}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: tone === "plain" ? C.textMuted : FG[tone],
        }}
      />
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .replace(/[^A-Za-z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS_INNER,
        backgroundColor: C.primaryTint,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <InterBold style={{ fontSize: size * 0.34, color: C.primary }}>{initials}</InterBold>
    </View>
  );
}

export function Chevron() {
  return <InterSemiBold style={{ fontSize: 17, color: C.textMuted }}>›</InterSemiBold>;
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  leading,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  leading?: ReactNode;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: RADIUS,
        padding: 13,
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{title}</InterSemiBold>
        {subtitle ? (
          <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>{subtitle}</InterRegular>
        ) : null}
      </View>
      {right ?? <Chevron />}
    </TouchableOpacity>
  );
}

export function Note({ children, tone = "caution" }: { children: ReactNode; tone?: Tone }) {
  return (
    <View style={{ backgroundColor: BG[tone], borderRadius: RADIUS_INNER, padding: 12 }}>
      <InterMedium style={{ ...TYPE.label, lineHeight: 17, color: FG[tone] }}>
        {children}
      </InterMedium>
    </View>
  );
}

export function FinePrint({ children }: { children: ReactNode }) {
  return (
    <InterRegular
      style={{ ...TYPE.label, lineHeight: 17, color: C.textMuted, textAlign: "center" }}
    >
      {children}
    </InterRegular>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <View style={{ gap: 5, paddingVertical: 10, alignItems: "center" }}>
        <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{title}</InterSemiBold>
        <InterRegular
          style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary, textAlign: "center" }}
        >
          {body}
        </InterRegular>
      </View>
    </Card>
  );
}

/**
 * Shown where a part of Collections has no contract deployed yet.
 *
 * Distinct from an error and from an empty list on purpose. "Nothing here"
 * invites a refresh and "something went wrong" invites a retry, and neither
 * is true: there is nothing to reach, and waiting will not change that.
 */
export function NotLiveYet({ what, body }: { what: string; body: string }) {
  return (
    <Card style={{ backgroundColor: C.surface, borderColor: C.surface }}>
      <View style={{ gap: 5 }}>
        <InterSemiBold style={{ ...TYPE.heading, color: C.text }}>{what}</InterSemiBold>
        <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
          {body}
        </InterRegular>
      </View>
    </Card>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: C.surface,
        borderRadius: RADIUS_INNER,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            activeOpacity={0.85}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 8,
              borderRadius: 7,
              backgroundColor: on ? C.background : "transparent",
            }}
          >
            <InterSemiBold style={{ ...TYPE.label, color: on ? C.text : C.textSecondary }}>
              {o.label}
            </InterSemiBold>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function CollectionsButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "outline" | "quiet";
  disabled?: boolean;
  loading?: boolean;
}) {
  const inactive = disabled || loading;
  const background =
    variant === "primary" ? C.primary : variant === "outline" ? "transparent" : C.surface;
  const colour = variant === "primary" ? "#FFFFFF" : variant === "outline" ? C.primary : C.text;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      activeOpacity={0.85}
      disabled={inactive}
      onPress={onPress}
      style={{
        backgroundColor: background,
        borderRadius: RADIUS,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor: C.primary,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        opacity: inactive ? 0.5 : 1,
      }}
    >
      <InterSemiBold style={{ fontSize: 15, color: colour }}>
        {loading ? "Working..." : label}
      </InterSemiBold>
    </TouchableOpacity>
  );
}

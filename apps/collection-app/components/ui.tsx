import type { ReactNode } from "react";
import { ScrollView, TouchableOpacity, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InterBold, InterMedium, InterRegular, InterSemiBold } from "./Text";
import { COLORS, GUTTER, RADIUS, RADIUS_INNER, TYPE } from "@/constants/theme";

/**
 * The pieces every screen is built from.
 *
 * Before this existed each screen set its own padding, card border and font
 * size inline, and they had already drifted apart by the third screen. The
 * point of putting them here is not reuse for its own sake: it is that a
 * reader moving between screens should not have to notice they have moved.
 */

export type Tone = "plain" | "positive" | "caution" | "critical" | "brand";

const TONE_FG: Record<Tone, string> = {
  plain: COLORS.primaryText,
  positive: COLORS.positive,
  caution: COLORS.caution,
  critical: COLORS.critical,
  brand: COLORS.primary,
};

const TONE_BG: Record<Tone, string> = {
  plain: COLORS.cardBackground,
  positive: COLORS.positiveLight,
  caution: COLORS.cautionLight,
  critical: COLORS.criticalLight,
  brand: COLORS.primaryTint,
};

/** A scrolling page with the standard gutter. */
export function Screen({
  children,
  gap = 22,
  edges = ["bottom"],
}: {
  children: ReactNode;
  gap?: number;
  edges?: ("top" | "bottom")[];
}) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, paddingBottom: 44, gap }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The one large heading at the top of a page. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <InterBold style={{ ...TYPE.display, color: COLORS.primaryText }}>{title}</InterBold>
      {subtitle ? (
        <InterRegular style={{ ...TYPE.body, color: COLORS.secondaryText }}>{subtitle}</InterRegular>
      ) : null}
    </View>
  );
}

/** A titled band of content. */
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
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <InterSemiBold style={{ ...TYPE.title, color: COLORS.primaryText }}>{title}</InterSemiBold>
          {action}
        </View>
      ) : null}
      <View style={{ gap }}>{children}</View>
    </View>
  );
}

/** A bordered surface. */
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
        backgroundColor: COLORS.background,
        borderWidth: 1,
        borderColor: COLORS.borderColor,
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

/** A small coloured pill. Used for status, never for anything tappable. */
export function Badge({ label, tone = "plain" }: { label: string; tone?: Tone }) {
  return (
    <View
      style={{
        backgroundColor: TONE_BG[tone],
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        alignSelf: "flex-start",
      }}
    >
      <InterSemiBold style={{ ...TYPE.micro, color: TONE_FG[tone] }}>{label}</InterSemiBold>
    </View>
  );
}

/** One figure in a row of them. */
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
        backgroundColor: TONE_BG[tone],
        borderRadius: RADIUS_INNER,
        padding: 11,
        gap: 2,
      }}
    >
      <InterRegular style={{ ...TYPE.micro, color: COLORS.secondaryText }}>{label}</InterRegular>
      <InterSemiBold style={{ ...TYPE.heading, color: TONE_FG[tone] }}>{value}</InterSemiBold>
      {note ? (
        <InterRegular style={{ ...TYPE.micro, color: COLORS.mutedText }}>{note}</InterRegular>
      ) : null}
    </View>
  );
}

/** A row of stat tiles that wraps rather than squeezing. */
export function StatRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 8 }}>{children}</View>;
}

/** Label above value, for the inside of a card. */
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
      <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>{label}</InterRegular>
      <InterSemiBold style={{ ...TYPE.heading, color: TONE_FG[tone] }}>{value}</InterSemiBold>
      {note ? (
        <InterRegular style={{ ...TYPE.label, color: COLORS.mutedText }}>{note}</InterRegular>
      ) : null}
    </View>
  );
}

/** A horizontal rule inside a card. */
export function Divider() {
  return <View style={{ height: 1, backgroundColor: COLORS.borderColor }} />;
}

/** A progress bar. `tone` colours the fill. */
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
        backgroundColor: COLORS.cardBackground,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${clamped}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: tone === "plain" ? COLORS.mutedText : TONE_FG[tone],
        }}
      />
    </View>
  );
}

/** Initials in a tinted square, where a photo would eventually go. */
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
        backgroundColor: COLORS.primaryTint,
        borderWidth: 1,
        borderColor: COLORS.borderColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <InterBold style={{ fontSize: size * 0.34, color: COLORS.primary }}>{initials}</InterBold>
    </View>
  );
}

/** A tappable row with a chevron, for navigating into something. */
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
        borderColor: COLORS.borderColor,
        borderRadius: RADIUS,
        padding: 13,
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>{title}</InterSemiBold>
        {subtitle ? (
          <InterRegular style={{ ...TYPE.label, color: COLORS.secondaryText }}>
            {subtitle}
          </InterRegular>
        ) : null}
      </View>
      {right ?? <Chevron />}
    </TouchableOpacity>
  );
}

export function Chevron() {
  return <InterSemiBold style={{ fontSize: 17, color: COLORS.mutedText }}>›</InterSemiBold>;
}

/** An inset paragraph that needs to be read, not skimmed past. */
export function Note({ children, tone = "caution" }: { children: ReactNode; tone?: Tone }) {
  return (
    <View
      style={{
        backgroundColor: TONE_BG[tone],
        borderRadius: RADIUS_INNER,
        padding: 12,
      }}
    >
      <InterMedium style={{ ...TYPE.label, lineHeight: 17, color: TONE_FG[tone] }}>
        {children}
      </InterMedium>
    </View>
  );
}

/** Small print under a page. */
export function FinePrint({ children }: { children: ReactNode }) {
  return (
    <InterRegular
      style={{
        ...TYPE.label,
        lineHeight: 17,
        color: COLORS.mutedText,
        textAlign: "center",
      }}
    >
      {children}
    </InterRegular>
  );
}

/** Nothing here yet, and why. */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <View style={{ gap: 5, paddingVertical: 10, alignItems: "center" }}>
        <InterSemiBold style={{ ...TYPE.heading, color: COLORS.primaryText }}>{title}</InterSemiBold>
        <InterRegular
          style={{ ...TYPE.label, lineHeight: 17, color: COLORS.secondaryText, textAlign: "center" }}
        >
          {body}
        </InterRegular>
      </View>
    </Card>
  );
}

/** A two way choice, used for the directory's builder and manager tabs. */
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
        backgroundColor: COLORS.cardBackground,
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
              backgroundColor: on ? COLORS.background : "transparent",
            }}
          >
            <InterSemiBold
              style={{ ...TYPE.label, color: on ? COLORS.primaryText : COLORS.secondaryText }}
            >
              {o.label}
            </InterSemiBold>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

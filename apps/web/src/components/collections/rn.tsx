"use client";

/**
 * The handful of React Native building blocks the Collections screens use,
 * rendered as plain HTML. Collections was written against a tiny kit (View,
 * TextInput, TouchableOpacity, ActivityIndicator and its own ui.tsx), so a
 * faithful shim lets those screens move over unchanged instead of being
 * rewritten — and keeps them identical to the mobile behaviour they were
 * tested with. Only Collections uses this; the rest of the web app is
 * written for the web directly.
 */
import { createContext, forwardRef, useContext, type CSSProperties, type ReactNode } from "react";
import Spinner from "@/components/ui/Spinner";

type RNStyle = Record<string, unknown> | undefined | null | false;
export type StyleProp = RNStyle | RNStyle[];

const PX_KEYS = new Set(["lineHeight"]);

/** RN style objects → CSS: shorthand padding/margin axes, px line heights, flattened arrays. */
export function toCss(style: StyleProp, base?: CSSProperties): CSSProperties {
  const list = Array.isArray(style) ? style : [style];
  const out: Record<string, unknown> = { ...base };
  for (const s of list) {
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) {
      if (v == null) continue;
      switch (k) {
        case "paddingHorizontal":
          out.paddingLeft = v;
          out.paddingRight = v;
          break;
        case "paddingVertical":
          out.paddingTop = v;
          out.paddingBottom = v;
          break;
        case "marginHorizontal":
          out.marginLeft = v;
          out.marginRight = v;
          break;
        case "marginVertical":
          out.marginTop = v;
          out.marginBottom = v;
          break;
        case "transform":
          if (Array.isArray(v)) {
            out.transform = v
              .map((t) => Object.entries(t as Record<string, unknown>).map(([fn, val]) => `${fn}(${typeof val === "number" ? `${val}px` : val})`))
              .flat()
              .join(" ");
          }
          break;
        case "shadowColor":
        case "shadowOffset":
        case "shadowOpacity":
        case "shadowRadius":
        case "elevation":
        case "textAlignVertical":
        case "includeFontPadding":
          break;
        default:
          out[k] = PX_KEYS.has(k) && typeof v === "number" ? `${v}px` : v;
      }
    }
  }
  return out as CSSProperties;
}

// RN lays out every View as a column flexbox.
const VIEW_BASE: CSSProperties = { display: "flex", flexDirection: "column", position: "relative", minWidth: 0, boxSizing: "border-box" };

export function View({ style, children, className }: { style?: StyleProp; children?: ReactNode; className?: string; pointerEvents?: string }) {
  return (
    <div style={toCss(style, VIEW_BASE)} className={className}>
      {children}
    </div>
  );
}

export function TouchableOpacity({
  style,
  children,
  onPress,
  disabled,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
}: {
  style?: StyleProp;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  activeOpacity?: number;
  accessibilityRole?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; busy?: boolean };
  accessibilityLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      role={accessibilityRole === "tab" ? "tab" : undefined}
      aria-selected={accessibilityRole === "tab" ? !!accessibilityState?.selected : undefined}
      aria-busy={accessibilityState?.busy || undefined}
      aria-label={accessibilityLabel}
      className="text-left transition-opacity hover:opacity-90 disabled:cursor-not-allowed"
      style={toCss(style, { ...VIEW_BASE, background: "transparent", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" })}
    >
      {children}
    </button>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  {
    style?: StyleProp;
    value?: string;
    onChangeText?: (t: string) => void;
    placeholder?: string;
    placeholderTextColor?: string;
    keyboardType?: string;
    multiline?: boolean;
    numberOfLines?: number;
    editable?: boolean;
    secureTextEntry?: boolean;
    autoCapitalize?: string;
    autoCorrect?: boolean;
    maxLength?: number;
    accessibilityLabel?: string;
    onSubmitEditing?: () => void;
  }
>(function TextInput(
  { style, value, onChangeText, placeholder, keyboardType, multiline, numberOfLines, editable = true, secureTextEntry, autoCapitalize, autoCorrect, maxLength, accessibilityLabel, onSubmitEditing },
  ref
) {
  const css = toCss(style, { font: "inherit", outline: "none", boxSizing: "border-box", width: "100%" });
  const inputMode =
    keyboardType === "numeric" || keyboardType === "number-pad" ? "numeric" : keyboardType === "decimal-pad" ? "decimal" : keyboardType === "email-address" ? "email" : undefined;
  const common = {
    value: value ?? "",
    placeholder,
    disabled: !editable,
    maxLength,
    "aria-label": accessibilityLabel ?? placeholder,
    autoCapitalize: autoCapitalize === "none" ? "off" : autoCapitalize,
    spellCheck: autoCorrect === false ? false : undefined,
    style: css,
    className: "focus:ring-2 focus:ring-primary/20",
  };
  return multiline ? (
    <textarea ref={ref as React.Ref<HTMLTextAreaElement>} rows={numberOfLines ?? 4} onChange={(e) => onChangeText?.(e.target.value)} {...common} />
  ) : (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      type={secureTextEntry ? "password" : keyboardType === "email-address" ? "email" : "text"}
      inputMode={inputMode}
      onChange={(e) => onChangeText?.(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmitEditing?.();
      }}
      {...common}
    />
  );
});

export function ActivityIndicator({ size, style }: { size?: "small" | "large" | number; color?: string; style?: StyleProp }) {
  const px = size === "large" ? 32 : typeof size === "number" ? size : 18;
  return (
    <div style={toCss(style, { display: "flex", alignItems: "center", justifyContent: "center" })}>
      <Spinner size={px} />
    </div>
  );
}

/** Pull-to-refresh has no web gesture; screens get a refresh button instead. */
export function RefreshControl(_: { refreshing: boolean; onRefresh: () => void; tintColor?: string }) {
  return null;
}

// Text inside Text flows inline, as in React Native.
const InText = createContext(false);

function makeText(weight: number) {
  return function Text({ style, children, numberOfLines, className }: { style?: StyleProp; children?: ReactNode; numberOfLines?: number; className?: string }) {
    const nested = useContext(InText);
    const clamp: CSSProperties =
      numberOfLines != null ? { display: "-webkit-box", WebkitLineClamp: numberOfLines, WebkitBoxOrient: "vertical", overflow: "hidden" } : {};
    return (
      <span className={className} style={toCss(style, { display: nested ? "inline" : "block", fontWeight: weight, ...clamp })}>
        <InText.Provider value>{children}</InText.Provider>
      </span>
    );
  };
}

export const InterRegular = makeText(400);
export const InterMedium = makeText(500);
export const InterSemiBold = makeText(600);
export const InterBold = makeText(700);

import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { InterSemiBold } from "./Text";
import { COLORS, RADIUS } from "@/constants/theme";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "outline" | "quiet";
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
}

/**
 * The rental app's button, same padding and radius.
 *
 * `disabled` dims and stops the press rather than hiding the control: a
 * button that vanishes leaves someone wondering what they did wrong, where
 * one that greys out invites them to look for the reason.
 */
export default function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  full = true,
}: Props) {
  const inactive = disabled || loading;
  const background =
    variant === "primary" ? COLORS.primary : variant === "outline" ? "transparent" : COLORS.cardBackground;
  const textColor =
    variant === "primary" ? "#FFFFFF" : variant === "outline" ? COLORS.primary : COLORS.primaryText;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      activeOpacity={0.8}
      disabled={inactive}
      onPress={onPress}
      style={{
        backgroundColor: background,
        borderRadius: RADIUS,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor: COLORS.primary,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        width: full ? "100%" : undefined,
        opacity: inactive ? 0.5 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <InterSemiBold style={{ color: textColor, fontSize: 15 }}>{label}</InterSemiBold>
      )}
    </TouchableOpacity>
  );
}

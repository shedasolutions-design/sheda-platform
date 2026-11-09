import { TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { InterSemiBold } from "./Text";
import { COLORS, TYPE } from "@/constants/theme";
import { ROLE_LABEL, useRole, type Role } from "@/services/role";

/**
 * The buyer and builder switch, in the header of every screen.
 *
 * It lives in the header rather than in a settings page because its job
 * here is to be found: the whole product can be walked through from it
 * without four test accounts. Once sign in lands, the role follows the
 * connected account and this only stays visible for an account that is
 * genuinely both.
 *
 * Switching returns to the top of the new side rather than trying to find
 * the matching screen, because there usually is not one. A builder has no
 * holdings page and a buyer has nothing to sign off.
 */
const ORDER: Role[] = ["buyer", "builder"];

export default function RoleSwitch() {
  const { role, setRole } = useRole();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: COLORS.cardBackground,
        borderRadius: 999,
        padding: 2,
        marginRight: 4,
      }}
    >
      {ORDER.map((r) => {
        const on = r === role;
        return (
          <TouchableOpacity
            key={r}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Preview as ${ROLE_LABEL[r]}`}
            activeOpacity={0.85}
            onPress={() => {
              if (on) return;
              setRole(r);
              router.replace(r === "builder" ? "/raises" : "/");
            }}
            style={{
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: on ? COLORS.primary : "transparent",
            }}
          >
            <InterSemiBold
              style={{ ...TYPE.micro, color: on ? "#FFFFFF" : COLORS.secondaryText }}
            >
              {ROLE_LABEL[r]}
            </InterSemiBold>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

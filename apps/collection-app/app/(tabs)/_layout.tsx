import { Tabs } from "expo-router";
import AntDesign from "@expo/vector-icons/AntDesign";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Octicons from "@expo/vector-icons/Octicons";
import RoleSwitch from "@/components/RoleSwitch";
import { COLORS, TYPE } from "@/constants/theme";
import { useRole } from "@/services/role";

/**
 * The tab bar, which is a different tab bar for each role.
 *
 * Every route is declared here whatever the role, because a builder may
 * still open a project page and a buyer may still open a profile. What
 * changes is which of them get a tab: `href: null` keeps the route
 * reachable while taking it out of the bar.
 *
 * The alternative, one tab set with half the screens showing "nothing here
 * for you", is the version where neither side feels like the product was
 * built for them.
 */
export default function TabLayout() {
  const { role } = useRole();
  const buyer = role === "buyer";

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.primaryText,
        headerTitleStyle: { fontFamily: "Inter-SemiBold", fontSize: TYPE.heading.fontSize },
        headerShadowVisible: false,
        headerRight: () => <RoleSwitch />,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.mutedText,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.borderColor,
        },
        tabBarLabelStyle: { fontFamily: "Inter-Medium", fontSize: TYPE.micro.fontSize },
        sceneStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Invest",
          href: buyer ? "/" : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="office-building-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="holdings"
        options={{
          title: "Holdings",
          href: buyer ? "/holdings" : null,
          tabBarIcon: ({ color, size }) => <AntDesign name="pie-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="raises"
        options={{
          title: "Raises",
          href: buyer ? null : "/raises",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="crane" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Sign-offs",
          href: buyer ? null : "/approvals",
          tabBarIcon: ({ color, size }) => <Octicons name="checklist" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stake"
        options={{
          title: "Stake",
          href: buyer ? null : "/stake",
          tabBarIcon: ({ color, size }) => <AntDesign name="safety" size={size} color={color} />,
        }}
      />
      {/* The one tab both sides keep. A buyer uses it to check who they are
          backing; a builder uses it to see where they stand. */}
      <Tabs.Screen
        name="directory"
        options={{
          title: "Directory",
          tabBarIcon: ({ color, size }) => <Octicons name="trophy" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

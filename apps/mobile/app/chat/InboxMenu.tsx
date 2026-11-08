import { PROFILE, FLAG, LIST } from "@/assets/icons";
import { View, TouchableOpacity, Linking } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import Icon from "../../components/common/Icon";
import InterRegular from "../../components/Text/InterRegular";
import { router } from "expo-router";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { useState, useCallback } from "react";

interface InboxMenuProps {
  /** The ID of the other user in the chat (agent/seller or buyer) */
  receiverId?: string | number;
  /** The other party's display name (for confirmation dialogs) */
  agentName?: string;
  /** The property ID, if this chat is about a specific property */
  propertyId?: string | number;
  /** Callback to close the menu after an action */
  onClose?: () => void;
}

const InboxMenu: React.FC<InboxMenuProps> = ({
  receiverId,
  agentName,
  propertyId,
  onClose,
}) => {
  const { getAgentProfile } = useApi();
  const { isSeller } = useMode();
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic labels: sellers see "Buyer", buyers see "Seller"
  const otherPartyRole = isSeller ? "Buyer" : "Seller";
  const otherPartyLabel = agentName || `this ${otherPartyRole.toLowerCase()}`;

  // Opens the actual profile. This used to fetch their listings and jump to a
  // property details page instead — so "View Seller" showed a property, and a
  // counterparty with no listings (every buyer) got an error dialog rather
  // than a profile.
  const handleViewSeller = useCallback(() => {
    onClose?.();

    if (!receiverId) {
      Alert.alert("Error", `${otherPartyRole} information is not available.`);
      return;
    }

    router.push({
      pathname: "/user-profile",
      params: {
        userId: String(receiverId),
        name: otherPartyLabel,
      },
    });
  }, [receiverId, otherPartyLabel, otherPartyRole, onClose]);

  const handleShowListings = useCallback(async () => {
    onClose?.();

    if (!receiverId) {
      Alert.alert("Error", `${otherPartyRole} information is not available.`);
      return;
    }

    try {
      setIsLoading(true);
      const agentData = await getAgentProfile(Number(receiverId), { silent: true });

      if (agentData && agentData.listings && agentData.listings.length > 0) {
        // Navigate to the agent's first listing — the details page
        // already shows the agent profile card with all their listings
        // in the "Similar listings" section
        router.push({
          pathname: "/details/[id]",
          params: { id: agentData.listings[0].id.toString() },
        });
      } else {
        Alert.alert(
          "No Listings",
          `${otherPartyLabel} has no active listings at the moment.`
        );
      }
    } catch (err) {
      console.error("Failed to fetch listings:", err);
      Alert.alert("Error", `Could not load ${otherPartyRole.toLowerCase()} listings. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  }, [receiverId, agentName, getAgentProfile, onClose]);

  const handleReport = useCallback(() => {
    onClose?.();

    Alert.alert(
      `Report ${otherPartyRole}`,
      `Are you sure you want to report ${otherPartyLabel}? You can describe the issue via email to our support team.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report via Email",
          onPress: () => {
            const subject = encodeURIComponent(
              `Report: User ${receiverId || "unknown"} (${otherPartyLabel})`
            );
            const body = encodeURIComponent(
              `Hi Sheda Support,\n\nI would like to report the following user:\n\n` +
              `User ID: ${receiverId || "N/A"}\n` +
              `Name: ${otherPartyLabel}\n` +
              `Property ID: ${propertyId || "N/A"}\n\n` +
              `Reason for report:\n[Please describe the issue here]\n\n` +
              `Thank you.`
            );
            const mailUrl = `mailto:shedasolutions@gmail.com?subject=${subject}&body=${body}`;

            Linking.openURL(mailUrl).catch(() => {
              Alert.alert(
                "Email Not Available",
                "Could not open your email app. Please contact shedasolutions@gmail.com directly."
              );
            });

            // A mailto: link that has no registered handler (common on web —
            // no desktop mail client configured) doesn't reject the promise
            // above, it just silently does nothing, so the .catch() never
            // fires and the user gets no feedback either way. Always follow
            // up with the address so there's a manual path regardless of
            // whether a mail app actually opened.
            setTimeout(() => {
              Alert.alert(
                "Report Sent to Email App",
                `If your email app didn't open, please email shedasolutions@gmail.com directly and mention: ${otherPartyLabel} (User ID: ${receiverId || "N/A"}).`
              );
            }, 500);
          },
        },
      ]
    );
  }, [receiverId, otherPartyLabel, otherPartyRole, propertyId, onClose]);

  const menuItems: Array<{ icon: any; label: string; onPress: () => void; className?: string }> = [
    {
      icon: PROFILE,
      label: `View ${otherPartyRole}`,
      onPress: handleViewSeller,
    },
    {
      icon: LIST,
      label: `Show listings from this ${otherPartyRole.toLowerCase()}`,
      onPress: handleShowListings,
    },
    {
      icon: FLAG,
      label: `Report this ${otherPartyRole.toLowerCase()}`,
      onPress: handleReport,
    },
  ];

  return (
    <View className="w-fit border border-borderColor">
      {menuItems.map((item, index) => (
        <TouchableOpacity
          key={index}
          onPress={item.onPress}
          disabled={isLoading}
          className={`flex-row items-center border-b border-borderColor gap-2 py-3 px-[10] ${item.className || ""}`}
          style={isLoading ? { opacity: 0.5 } : undefined}
        >
          <Icon icon={item.icon} width={20} height={20} />
          <View>
            <InterRegular className={`text-sm/[150%] ${item.className || ""}`}>
              {item.label}
            </InterRegular>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default InboxMenu;
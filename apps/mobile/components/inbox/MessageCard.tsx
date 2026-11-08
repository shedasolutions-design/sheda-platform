import { View, Image, TouchableOpacity, Alert } from "react-native"
import InterSemiBold from "../Text/InterSemiBold"
import InterRegular from "../Text/InterRegular"
import { PROFILE } from "@/constants/images-icons"
import { router } from "expo-router"
import { useMode } from "@/contexts/ModeContext"

interface MessageCardProps {
  propertyTitle?: string
  lastMessage?: string
  time?: string
  /** The other person in this conversation — always shown, whatever mode we're in. */
  sellerName?: string
  sellerPhoto?: any
  propertyId?: string
  receiverId?: string
  unreadCount?: number
  /**
   * Which of your profiles this conversation belongs to. Undefined for
   * accounts with a single profile, where a chip would be noise on every row.
   */
  asProfile?: "buyer" | "seller" | null
}

const MessageCard = ({
  propertyTitle = "House title",
  lastMessage = "The buyer's last message shows here.....",
  time = "10:15",
  sellerName = "Seller name",
  sellerPhoto,
  propertyId = "1",
  receiverId,
  unreadCount = 0,
  asProfile,
}: MessageCardProps) => {
  const hasUnread = unreadCount > 0;
  const { mode, setModeExplicitly } = useMode();

  const openChat = () =>
    router.push({
      pathname: "/chat",
      params: {
        id: propertyId,
        // No isSeller param: the chat screen derives the user's role from
        // who owns the property in that conversation, which holds whatever
        // mode the app is in. Passing the mode here made a seller browsing
        // in buyer mode open their own listing as if they were the buyer.
        receiverId: receiverId,
        agentName: sellerName
      }
    });

  // Reading across profiles is safe; replying is not. A reply sent from the
  // wrong row reaches the counterparty as a stranger, so opening a thread
  // that belongs to the other profile asks before switching rather than
  // switching silently. Only on a genuine mismatch — switching costs a token
  // round trip, and most people only ever use one profile.
  const handlePress = () => {
    if (!asProfile || asProfile === mode) {
      openChat();
      return;
    }

    const target = asProfile === "seller" ? "Seller" : "Buyer";
    Alert.alert(
      `Switch to ${target}?`,
      `This conversation is on your ${asProfile} profile. Switch so your reply comes from the right account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Switch to ${target}`,
          onPress: async () => {
            try {
              await setModeExplicitly(asProfile);
              openChat();
            } catch {
              Alert.alert(
                "Couldn't switch",
                "Check your connection and try again."
              );
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      className="flex-row justify-between items-center border-borderColor border-b p-3"
    >
      <View className="flex-row gap-2 items-center flex-1 mr-2">
        <View className="justify-center items-center rounded-full overflow-hidden w-[38px] h-[38px] bg-gray-100">
          <Image source={sellerPhoto || PROFILE} style={{ width: 38, height: 38 }} />
        </View>

        {/* The person is the subject of the conversation, so they lead; the
            property is the context. This used to lead with the property and
            show the other person's name only in seller mode, so a buyer could
            not tell who any of their conversations were actually with. */}
        <View className="flex-1">
          <View className="flex-row gap-2 items-center m-1">
            <InterSemiBold className="text-sm/[150%]" numberOfLines={1}>{sellerName}</InterSemiBold>
            {/* Which hat you're wearing in this thread. The inbox now shows
                both profiles at once, so without this a seller enquiry and a
                viewing you booked as a buyer look identical. */}
            {asProfile && (
              <View
                className={`px-1.5 py-0.5 rounded ${asProfile === "seller" ? "bg-blue-50" : "bg-purple-50"}`}
              >
                <InterRegular
                  className={`text-[10px] ${asProfile === "seller" ? "text-blue-700" : "text-purple-700"}`}
                >
                  {asProfile === "seller" ? "As seller" : "As buyer"}
                </InterRegular>
              </View>
            )}
          </View>
          <InterRegular className="text-xs text-secondaryText" numberOfLines={1}>
            {propertyTitle}
          </InterRegular>
          <InterRegular className={`text-sm ${hasUnread ? 'text-primaryText' : 'text-secondaryText'}`} numberOfLines={1}>{lastMessage}</InterRegular>
        </View>
      </View>

      <View className="items-end gap-1">
        <InterRegular className="text-xs text-secondaryText">{time}</InterRegular>
        {hasUnread && (
          <View
            style={{
              backgroundColor: '#C1272D',
              borderRadius: 10,
              minWidth: 20,
              height: 20,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 5,
            }}
          >
            <InterRegular className="text-white text-[10px]" style={{ fontWeight: '700' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </InterRegular>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default MessageCard

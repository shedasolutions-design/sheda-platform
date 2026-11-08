import { View, ScrollView, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { useEffect, useState, useCallback } from "react";
import AntDesign from "@expo/vector-icons/AntDesign";
import MessageCard from "./MessageCard";
import { useApi } from "@/contexts/ApiContext";
import InterRegular from "@/components/Text/InterRegular";
import getFullImageUrl from "@/utilities/imageUrl";
import { parseOfferMessage, parseOfferResponseMessage } from "@/types/offer";
import { readCachedList, writeCachedList, LIST_CACHE_SCOPES } from "@/services/listCache";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface Conversation {
  other_user_id: number;
  other_user_name: string;
  other_user_avatar_url: string | null;
  other_user_fullname: string | null;
  last_message: string;
  last_message_timestamp: string;
  last_message_sender_id: number;
  unread_count: number;
  property_id: number;
  property_title: string;
  /** Only sent for accounts that have both profiles. */
  as_profile?: "buyer" | "seller" | null;
  /** Your own user id on this thread — differs between your two profiles. */
  my_user_id?: number | null;
}

interface MessagesProps {
  isSeller: boolean;
}

const Messages = ({ isSeller }: MessagesProps) => {
  const { getConversations, isLoading, error, user, conversationsVersion } = useApi();
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const sortConversations = (data: Conversation[]) =>
    [...data].sort((a, b) => {
      // Unread chats bubble to the top
      if ((b.unread_count || 0) !== (a.unread_count || 0)) {
        return (b.unread_count || 0) - (a.unread_count || 0);
      }
      // Then sort by most recent timestamp
      const timeA = a.last_message_timestamp ? new Date(a.last_message_timestamp).getTime() : 0;
      const timeB = b.last_message_timestamp ? new Date(b.last_message_timestamp).getTime() : 0;
      return timeB - timeA;
    });

  const fetchConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      if (Array.isArray(data)) {
        const sorted = sortConversations(data as Conversation[]);
        setConversations(sorted);
        writeCachedList(LIST_CACHE_SCOPES.conversations, user?.id, sorted);
      }
    } catch (e) {
      console.error("Failed to fetch conversations:", e);
    } finally {
      setLoaded(true);
    }
  }, [getConversations, user?.id]);

  // Show the last-known list immediately, then refresh behind it — this screen
  // used to start from an empty spinner on every single visit even though the
  // previous contents were still perfectly fine to display meanwhile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCachedList<Conversation>(
        LIST_CACHE_SCOPES.conversations,
        user?.id
      );
      // Don't clobber live data that beat the cache read back.
      if (!cancelled && cached && cached.length > 0) {
        setConversations((prev) => (prev.length > 0 ? prev : cached));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    fetchConversations();
    // Re-read when a chat is opened/marked read so unread badges here settle
    // without waiting for the user to pull-to-refresh.
  }, [fetchConversations, conversationsVersion]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes when the inbox is returned to — which matters here, since
  // new messages arrive while the user is elsewhere.
  usePullToRefresh(onRefresh);

  const getDisplayMessage = (message: string): string => {
    const offerData = parseOfferMessage(message);
    if (offerData) {
      return `Offer: ${offerData.offeredPrice.toFixed(2)} on "${offerData.propertyTitle}"`;
    }
    const responseData = parseOfferResponseMessage(message);
    if (responseData) {
      return responseData.status === 'accepted'
        ? `Offer accepted on "${responseData.propertyTitle}"`
        : `Offer rejected on "${responseData.propertyTitle}"`;
    }
    return message;
  };

  return (
    <View className="flex-1 px-4">
      <View className="border border-borderColor rounded-[12px] flex-row items-center h-[48px] my-[10px] px-3">
        <AntDesign name="search" size={20} color="#A0A0A0" />
        <TextInput
          placeholder="Search message"
          className="flex-1 ml-2 h-full text-sm text-secondaryText"
          placeholderTextColor="#A0A0A0"
        />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Only ever show the spinner when there is genuinely nothing to look
            at — with primed cache contents present, the refresh happens
            silently underneath instead of blanking the screen. */}
        {isLoading && !loaded && conversations.length === 0 ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#C1272D" />
            <InterRegular className="mt-2 text-secondaryText">Loading messages...</InterRegular>
          </View>
        ) : error && conversations.length === 0 ? (
          <View className="py-10 items-center">
            <InterRegular className="text-red-500 text-center">{error}</InterRegular>
          </View>
        ) : conversations.length === 0 ? (
          <View className="py-10 items-center">
            <InterRegular className="text-secondaryText text-center">No conversations yet</InterRegular>
          </View>
        ) : (
          <View className="pb-10">
            {/* Accounts for a badge that spans both profiles. Without this the
                total counts messages sent to a profile the reader isn't
                currently in, and there is no way to tell where the difference
                came from. Derived from the list already fetched, so it costs
                nothing. Hidden for single-profile accounts, where it would
                just restate the total. */}
            {(() => {
              const unreadByProfile = conversations.reduce(
                (acc, c) => {
                  if (c.as_profile && c.unread_count > 0) {
                    acc[c.as_profile] += c.unread_count;
                  }
                  return acc;
                },
                { buyer: 0, seller: 0 }
              );
              const total = unreadByProfile.buyer + unreadByProfile.seller;
              if (total === 0) return null;

              const parts = [
                unreadByProfile.seller > 0 && `${unreadByProfile.seller} as seller`,
                unreadByProfile.buyer > 0 && `${unreadByProfile.buyer} as buyer`,
              ].filter(Boolean);

              return (
                <View className="px-3 py-2">
                  <InterRegular className="text-xs text-secondaryText">
                    {total} unread · {parts.join(" · ")}
                  </InterRegular>
                </View>
              );
            })()}

            {conversations.map((convo, index) => {
              const photoUrl = convo.other_user_avatar_url
                ? getFullImageUrl(convo.other_user_avatar_url)
                : null;

              return (
                <MessageCard
                  // Profile is part of the identity of a conversation now that
                  // the list spans both. The same person about the same
                  // property can appear twice — once where you're the seller,
                  // once where you're the buyer — and those are genuinely
                  // different threads between different pairs of accounts.
                  key={`${convo.as_profile ?? "single"}-${convo.property_id}-${convo.other_user_id}`}
                  propertyTitle={convo.property_title || `Property ID: ${convo.property_id}`}
                  lastMessage={getDisplayMessage(convo.last_message)}
                  time={convo.last_message_timestamp
                    ? new Date(convo.last_message_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : ""}
                  sellerName={convo.other_user_fullname || convo.other_user_name || "User"}
                  sellerPhoto={photoUrl ? { uri: photoUrl } : null}
                  propertyId={convo.property_id?.toString() || ""}
                  receiverId={convo.other_user_id?.toString() || ""}
                  unreadCount={convo.unread_count || 0}
                  asProfile={convo.as_profile}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default Messages;

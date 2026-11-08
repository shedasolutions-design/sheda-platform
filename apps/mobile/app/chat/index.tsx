"use client"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import Icon from "@/components/common/Icon"
import { View, Image, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native"
import { MEDIAPLUS, TOGGLER } from "@/assets/icons"
import { APT, PROFILE } from "@/constants/images-icons"
import InterBold from "@/components/Text/InterBold"
import InterRegular from "@/components/Text/InterRegular"
import { useLocalSearchParams, router } from "expo-router"
import StyledTextInput from "@/components/input/textInput"
import BackBtn from "@/components/common/BackBtn"
import InboxMenu from "@/app/chat/InboxMenu"
import { useMode } from "@/contexts/ModeContext"
import { transactionsRouteFor } from "@/utilities/transactionsRoute"
import InterSemiBold from "@/components/Text/InterSemiBold"
import { useApi } from "@/contexts/ApiContext"
import totalPayment from "../../utilities/totalPayment"
import { ChatMessageSchema, PropertyShow, AgentFeed } from "@/services/api"
import getFullImageUrl from "@/utilities/imageUrl"
import { OfferMessage, parseOfferMessage, parseOfferResponseMessage } from "@/types/offer"
import OfferMessageCard from "@/components/chat/OfferMessageCard"
import OfferResponseCard from "@/components/chat/OfferResponseCard"
import PriceDisplay from "@/components/common/PriceDisplay"
import ProfileVisibilityCard from "@/components/common/ProfileVisibilityCard"
import { sanitizeAgentProfile, buildSafeProfile } from "@/utilities/profileSanitizer"

const Chat = () => {
  const [toggleMenu, setToggleMenu] = useState(false)
  // App-wide UI mode. Only governs which tabs exist (Activity vs History) —
  // NOT what this user's role is in this particular conversation. See
  // isSellerInThisChat below.
  const { isSeller: isSellerMode } = useMode()
  const { id, receiverId, agentName } = useLocalSearchParams()
  const propertyId = id as string

  const {
    getPropertyById,
    getAgentProfile,
    getMessageHistory,
    sendMessage,
    user,
    wsMessages,
    wsStatus,
    connectWebSocket,
    disconnectWebSocket,
    sendWsMessage,
    clearWsMessages,
    markMessagesAsRead
  } = useApi()

  const [property, setProperty] = useState<PropertyShow | null>(null)
  const [agent, setAgent] = useState<AgentFeed | null>(null)
  const [message, setMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [historyMessages, setHistoryMessages] = useState<ChatMessageSchema[]>([])

  /**
   * Am I the seller in THIS conversation? Determined by who owns the
   * property being discussed, not by which UI mode I happen to be browsing
   * in. If I listed this property I'm the seller here even while viewing the
   * app in buyer mode, and vice versa — previously this read the app mode, so
   * a seller browsing in buyer mode saw their own buyer labelled "Agent" and
   * got buyer-side wording on their own listing.
   *
   * Falls back to the UI mode only until the property loads, since there's
   * nothing better to go on for that first frame.
   */
  const isSellerInThisChat = useMemo(() => {
    if (property?.agent_id != null && user?.id != null) {
      return Number(property.agent_id) === Number(user.id);
    }
    return isSellerMode;
  }, [property?.agent_id, user?.id, isSellerMode]);

  // Build privacy-safe profile for the chat header
  const chatProfile = useMemo(() => {
    if (agent) {
      return sanitizeAgentProfile(agent, isSellerInThisChat ? "buyer" : "agent");
    }
    // Fallback when agent data hasn't loaded yet
    return buildSafeProfile({
      displayName: (agentName as string) || (isSellerInThisChat ? "Buyer" : "Agent"),
      isOnline: wsStatus === "connected",
      lastSeenLabel: wsStatus === "connected" ? "Online" : wsStatus === "connecting" ? "Connecting..." : "Offline",
      role: isSellerInThisChat ? "buyer" : "agent",
    });
  }, [agent, agentName, isSellerInThisChat, wsStatus]);

  const fetchProperty = useCallback(async () => {
    if (propertyId) {
      try {
        const data = await getPropertyById(Number(propertyId))
        setProperty(data)

        // Also fetch agent profile to get their image
        const agentId = data.agent_id || (data as any).userId
        if (agentId) {
          const agentData = await getAgentProfile(Number(agentId), { silent: true })
          setAgent(agentData)
        }
      } catch (err) {
        console.error("Failed to fetch property in chat:", err)
      }
    } else if (receiverId) {
      // If no propertyId, still try to fetch agent/other user profile
      try {
        const agentData = await getAgentProfile(Number(receiverId), { silent: true })
        setAgent(agentData)
      } catch (err) {
        console.error("Failed to fetch agent profile in chat:", err)
      }
    }
  }, [propertyId, receiverId, getPropertyById, getAgentProfile])

  const fetchMessages = useCallback(async () => {
    const rId = Number(receiverId)
    if (rId) {
      try {
        const history = await getMessageHistory(rId)
        if (history) {
          setHistoryMessages(history)
        }
      } catch (err) {
        console.error("Failed to fetch message history:", err)
      }
    }
  }, [receiverId, getMessageHistory])

  // Bid actions (accept/reject/cancel) live on the Ongoing card — the single
  // on-chain action surface for a bid. Chat only offers a way to jump there.
  // Which screen that is depends on the mode the user is in: Activity for a
  // seller, History for a buyer. This used to push History for everyone, and
  // since History has no tab in seller mode, a seller landed on its
  // "My Listings & Transactions" variant — a third copy of the list they
  // already had on Activity, reachable only from links like this one.
  //
  // This one correctly keys off the UI *mode*, not the per-conversation role:
  // it picks which tab to navigate to, and the tab layout only mounts Activity
  // in seller mode / History in buyer mode. Routing by conversation role would
  // push to a tab that doesn't exist for the current mode.
  const handleViewOfferInHistory = useCallback(() => {
    router.push(transactionsRouteFor(isSellerMode) as any)
  }, [isSellerMode])

  useEffect(() => {
    fetchProperty()
    fetchMessages()

    // Connect WebSocket when entering chat
    connectWebSocket()

    return () => {
      // Clear WebSocket messages when leaving chat to avoid leakage between chats
      clearWsMessages()
      // Optional: keep connection alive globally, but here we just clear the view state
    }
  }, [fetchProperty, fetchMessages, connectWebSocket, clearWsMessages])

  // Mark this conversation's messages as read on open. The backend has had
  // POST /api/v1/chat/mark-read/{sender_id} and the client wrapper all along,
  // but nothing ever called it — so unread_count never dropped and the Inbox
  // badge stayed lit even after the user had read everything.
  useEffect(() => {
    const rId = Number(receiverId)
    if (!rId || !user?.id) return
    markMessagesAsRead(rId).catch((err) =>
      console.warn("Failed to mark messages as read:", err)
    )
  }, [receiverId, user?.id, markMessagesAsRead])

  // Messages arriving while the user is sitting in the conversation are read
  // on arrival too, otherwise they'd silently re-light the badge.
  useEffect(() => {
    const rId = Number(receiverId)
    if (!rId || !user?.id || wsMessages.length === 0) return
    const incoming = wsMessages.some(
      (m) => Number(m.sender_id) === rId && Number(m.receiver_id) === Number(user.id)
    )
    if (!incoming) return
    markMessagesAsRead(rId).catch(() => { })
  }, [wsMessages, receiverId, user?.id, markMessagesAsRead])

  const handleSend = async () => {
    if (!message.trim() || !user) return

    const rId = Number(receiverId) || property?.agent_id
    if (!rId) return

    try {
      setIsSending(true)
      const currentMessage = message.trim()
      setMessage("") // Clear input immediately for better UX

      const messageData: ChatMessageSchema = {
        sender_id: user.id,
        receiver_id: rId,
        message: currentMessage,
        property_id: property?.id ? Number(property.id) : undefined
      }

      console.log(`📤 Chat: Sending message to ${rId}, wsStatus: ${wsStatus}`);
      console.log(`📤 Chat: Message data:`, messageData);

      // Use WebSocket for sending if connected
      let sent = false;
      if (wsStatus === "connected") {
        console.log(`📤 Chat: Attempting WebSocket send`);
        sent = sendWsMessage(messageData)
        console.log(`📤 Chat: WebSocket send result: ${sent}`);
      }

      if (!sent) {
        // Fallback to HTTP if WS is not ready or failed
        console.log(`📤 Chat: Using HTTP fallback`);
        await sendMessage(messageData)
        // Refresh history to show the sent message
        fetchMessages()
      }
    } catch (err) {
      console.error("Failed to send message:", err)
    } finally {
      setIsSending(false)
    }
  }

  // Combine history and real-time messages
  const allMessages = useMemo(() => {
    // Filter wsMessages to only show messages relevant to this conversation
    const currentReceiverId = Number(receiverId);
    const relevantWs = wsMessages.filter(m =>
      (m.sender_id === user?.id && m.receiver_id === currentReceiverId) ||
      (m.sender_id === currentReceiverId && m.receiver_id === user?.id)
    );

    // Merge and remove duplicates by sender/receiver/content — NOT timestamp.
    // The same message can come back from the history REST fetch and the WS
    // echo with slightly different timestamp serialization, which made
    // content-identical messages (e.g. offer cards) render twice.
    const combined = [...historyMessages, ...relevantWs];
    const uniqueMap = new Map();

    combined.forEach(m => {
      const key = `${m.sender_id}-${m.receiver_id}-${m.message}`;
      uniqueMap.set(key, m);
    });

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return timeA - timeB
    })
  }, [historyMessages, wsMessages, receiverId, user?.id])

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View className="flex-row justify-between items-center px-2 py-1 border-b border-borderColor">
          <View className="flex-row items-center" style={{ flex: 1 }}>
            <BackBtn className="h-[inherit] border-none w-fit" />

            <View style={{ flex: 1 }}>
              <ProfileVisibilityCard
                profile={chatProfile}
                variant="chat"
              />
            </View>
          </View>

          <TouchableOpacity onPress={() => setToggleMenu(!toggleMenu)} className="p-2 relative">
            <Icon icon={TOGGLER} width={8} height={16} />
          </TouchableOpacity>
        </View>

        {property && (
          <View className="px-5 bg-gray-50 flex-row gap-3 py-2.5 border-b border-borderColor">
            <Image
              source={property.images?.[0]?.image_url ? { uri: getFullImageUrl(property.images[0].image_url) } : APT}
              style={{ width: 40, height: 40, borderRadius: 4 }}
            />
            <View>
              <InterRegular className="text-sm font-medium">{property.title}</InterRegular>
              <PriceDisplay
                amountFiat={parseFloat(String(property.price).replace(/[^0-9.-]/g, "")) || 0}
                fiatCode={(property as any).price_currency || "NGN"}
                suffix={property.listing_type === "rent" ? "/year" : ""}
                size="sm"
                showUsd={false}
                color="#C1272D"
              />
            </View>
          </View>
        )}

        <ScrollView
          className="flex-1 p-4"
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ref={(ref) => {
            // Auto scroll to bottom
            setTimeout(() => ref?.scrollToEnd({ animated: true }), 100);
          }}
        >
          {allMessages.length === 0 ? (
            <View className="items-center mt-10">
              <InterRegular className="text-secondaryText italic text-center px-10">
                No messages yet. Send a message to start the conversation.
              </InterRegular>
            </View>
          ) : (
            allMessages.map((msg, index) => {
              const isMine = msg.sender_id === user?.id;

              console.log(`📨 Chat [${index}]: Message from ${msg.sender_id} to ${msg.receiver_id}:`, msg.message.substring(0, 100));

              // Check if message is an offer
              const offerData = parseOfferMessage(msg.message);
              console.log(`📨 Chat [${index}]: Parsed offer data:`, offerData);

              if (offerData) {
                return (
                  <View key={index} className="w-full mb-2" style={{ position: 'relative', zIndex: 1 }}>
                    <OfferMessageCard
                      offer={offerData}
                      isSeller={isSellerInThisChat}
                      onViewInHistory={handleViewOfferInHistory}
                    />
                  </View>
                );
              }

              // Check if message is an offer response
              const responseData = parseOfferResponseMessage(msg.message);
              if (responseData) {
                return (
                  <View key={index} className="w-full mb-2">
                    <OfferResponseCard response={responseData} isSeller={isSellerInThisChat} />
                  </View>
                );
              }

              // Regular message
              return (
                <View
                  key={index}
                  className={`max-w-[80%] mb-4 p-3 rounded-2xl ${isMine ? 'self-end bg-primary rounded-tr-none' : 'self-start bg-gray-100 rounded-tl-none'
                    }`}
                >
                  <InterRegular className={isMine ? 'text-white' : 'text-black'}>
                    {msg.message}
                  </InterRegular>
                  {msg.timestamp && (
                    <InterRegular className={`text-[10px] mt-1 text-right ${isMine ? 'text-white/70' : 'text-gray-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </InterRegular>
                  )}
                </View>
              )
            })
          )}
        </ScrollView>

        <View className="p-3 bg-white border-t border-borderColor">
          <View className="flex-row items-center gap-2">
            <TouchableOpacity className="p-2">
              <Icon icon={MEDIAPLUS} width={16} height={16} />
            </TouchableOpacity>

            <View className="flex-1">
              <StyledTextInput
                placeholder="Write a message..."
                value={message}
                onChangeText={setMessage}
                className="bg-gray-100 px-4 py-2.5 rounded-full text-sm"
              />
            </View>

            <TouchableOpacity
              onPress={handleSend}
              disabled={isSending || !message.trim()}
              className={`p-2 rounded-full ${message.trim() ? 'bg-primary' : 'bg-gray-200'}`}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <InterSemiBold className="text-white text-xs px-2">Send</InterSemiBold>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {toggleMenu && (
          <View className="absolute right-5 top-14 bg-white z-20 shadow-lg rounded-xl border border-borderColor overflow-hidden">
            <InboxMenu
              receiverId={receiverId as string}
              agentName={(agentName as string) || chatProfile.displayName}
              propertyId={propertyId}
              onClose={() => setToggleMenu(false)}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default Chat

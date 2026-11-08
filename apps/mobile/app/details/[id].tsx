import {
  View,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Dimensions,
  Linking,
  RefreshControl,
  Share,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import BackBtn from "@/components/common/BackBtn";
import { HouseCardProps, REVIEW } from "@/components/HouseCard/types";
import Favorite from "@/components/common/Favorite";
import InterMedium from "@/components/Text/InterMedium";
import { LOCATION, BED, BATH, MESSAGE, PHONE } from "@/assets/icons";
import Icon from "@/components/common/Icon";
import InterRegular from "@/components/Text/InterRegular";
import { StarRatingDisplay } from "react-native-star-rating-widget";
import Comments from "./Comments";
import StyledTextInput from "@/components/input/textInput";
import Button from "@/components/common/Button";
import HouseList from "@/components/HouseList";
import InterBold from "@/components/Text/InterBold";
import InterSemiBold from "@/components/Text/InterSemiBold";
import totalPayment from "@/utilities/totalPayment";
import { deviceHeight } from "@/constants/values";
import { AgentFeed, PropertyShow, RatingShow } from "@/services/api";
import DetailSkeleton from "@/components/ui/DetailSkeleton";
import getFullImageUrl from "@/utilities/imageUrl";
import FeedbackModal from "@/components/common/FeedbackModal";
import TokenSelectionModal from "@/components/common/TokenSelectionModal";
import nearContractService from "@/services/nearContract";
import { Action } from "@/types/contract";
import { nairaToUsd, nairaToStablecoinUnits, formatUsd, formatNaira, stablecoinUnitsToUsd, stablecoinUnitsToNaira } from "@/constants/exchangeRates";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import PriceDisplay from "@/components/common/PriceDisplay";
import { OfferMessage, OfferStatus } from "@/types/offer";
import { useTransactionToast } from "@/hooks/useTransactionToast";

import { PROFILE } from "@/constants/images-icons";
import type { TransactionFeedItem } from "@/services/api";
import ProfileVisibilityCard from "@/components/common/ProfileVisibilityCard";
import { sanitizeAgentProfile, buildSafeProfile } from "@/utilities/profileSanitizer";
import type { SafeUserProfile } from "@/types/profile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const DESC_TRUNCATE_LENGTH = 120;

/** Truncates description with a "Read more" toggle */
const DescriptionText = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > DESC_TRUNCATE_LENGTH;

  return (
    <View>
      <InterRegular className="text-secondaryText text-sm" style={{ lineHeight: 22 }}>
        {needsTruncation && !expanded
          ? text.slice(0, DESC_TRUNCATE_LENGTH).trimEnd() + "..."
          : text}
      </InterRegular>
      {needsTruncation && (
        <TouchableOpacity onPress={() => setExpanded(!expanded)} style={{ marginTop: 4 }}>
          <InterRegular className="text-primary text-xs">
            {expanded ? "Read less" : "Read more"}
          </InterRegular>
        </TouchableOpacity>
      )}
    </View>
  );
};

/** Returns true if a string looks like an email address */
const looksLikeEmail = (s?: string): boolean =>
  !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Pick the best display name from agent data, never showing a raw email */
const resolveAgentDisplayName = (agent: {
  fullname?: string | null;
  username?: string | null;
  agency_name?: string | null;
  email?: string | null;
}): string => {
  if (agent.fullname && !looksLikeEmail(agent.fullname)) return agent.fullname;
  if (agent.username && !looksLikeEmail(agent.username)) return agent.username;
  if (agent.agency_name && !looksLikeEmail(agent.agency_name)) return agent.agency_name;
  // Last resort: use the part before @ from their email
  if (agent.email && agent.email.includes('@')) return agent.email.split('@')[0];
  return "Agent";
};

const formatLastSeen = (dateString?: string) => {
  if (!dateString) return "Offline";
  try {
    const lastSeen = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - lastSeen.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

    if (diffInMins < 5) return "Active now";
    if (diffInMins < 60) return `${diffInMins}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return lastSeen.toLocaleDateString();
  } catch {
    return "Offline";
  }
};

// ── Agent cache helpers ──
const AGENT_CACHE_PREFIX = "agent_cache_";
const AGENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

const getCachedAgent = async (agentId: number): Promise<AgentFeed | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${AGENT_CACHE_PREFIX}${agentId}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > AGENT_CACHE_TTL_MS) return null; // expired
    return data as AgentFeed;
  } catch {
    return null;
  }
};

const setCachedAgent = async (agentId: number, data: AgentFeed) => {
  try {
    await AsyncStorage.setItem(
      `${AGENT_CACHE_PREFIX}${agentId}`,
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch {
    // non-critical
  }
};

const Details = () => {
  const { id } = useLocalSearchParams();
  const propertyId = String(id);
  const {
    getPropertyById,
    getAgentProfile,
    getProperties,
    getTransactions,
    properties,
    sendMessage,
    sendTransactionUpdate,
    user,
    isLoading,
    error,
    clearError
  } = useApi();
  const { getPropertyRatings } = useApi();
  const { walletState, getAuthorizedPrivateKey } = useWallet();
  const { ngnPerUsd } = useExchangeRates();
  const { run: runTransaction } = useTransactionToast();

  const [property, setProperty] = useState<HouseCardProps | null>(null);
  const [rawProperty, setRawProperty] = useState<PropertyShow | null>(null);
  const [agent, setAgent] = useState<AgentFeed | null>(null);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [offerPrice, setOfferPrice] = useState("");
  const [similarProperties, setSimilarProperties] = useState<PropertyShow[]>([]);
  const [isSendingOffer, setIsSendingOffer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  /** Synchronous double-submit guard for handlePlaceBid — see there. */
  const placeBidLatch = useRef(false);
  const [onChainPrice, setOnChainPrice] = useState<string | null>(null);
  // Security deposit the owner set on chain, atomic stablecoin units. A renter
  // should see what they will be asked for before they bid, not after.
  const [onChainDeposit, setOnChainDeposit] = useState<string | null>(null);
  const [hasBidOrPayment, setHasBidOrPayment] = useState(false);
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: "success" | "error" | "info" | "loading" | "warning";
    title: string;
    message: string;
    onAction?: () => void;
    actionLabel?: string;
    actionColor?: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  // Reviews state
  const [propertyReviews, setPropertyReviews] = useState<REVIEW[]>([]);
  const [avgRating, setAvgRating] = useState(0);

  /** Shared helper: apply agent data to local property state */
  const applyAgentData = useCallback((agentData: AgentFeed) => {
    setAgent(agentData);
    const agentPhoto = getFullImageUrl(agentData.avatar_url ?? undefined);
    const formattedLastSeen = formatLastSeen(agentData.last_seen ?? undefined);
    setProperty(prev => {
      if (!prev) return null;
      return {
        ...prev,
        seller: {
          name: resolveAgentDisplayName(agentData),
          phone: agentData.phone_number || "N/A",
          photo: agentPhoto ? { uri: agentPhoto } : PROFILE,
          rating: agentData.rating || 0,
          isActive: formattedLastSeen === "Active now",
          lastSeen: formattedLastSeen,
          reviews: [],
        },
      };
    });
  }, []);

  // Fetch property details
  const fetchDetails = useCallback(async (signal?: AbortSignal, forceRefresh = false) => {
    const numericId = Number(propertyId);
    console.log(`🔍 Details: Fetching property ${numericId}${forceRefresh ? ' (Forced)' : ''}`);

    if (!propertyId || isNaN(numericId)) return;

    try {
      // Clear any previous errors before starting
      clearError();

      const propertyData = await getPropertyById(numericId, { signal, forceRefresh } as any);
      if (signal?.aborted) return;

      if (propertyData) {
        console.log("✅ Details: Property data received");
        console.log("🔗 Details: blockchain_property_id =", propertyData.blockchain_property_id);
        setRawProperty(propertyData);

        // Extract all images
        const images = propertyData.images?.map(img => getFullImageUrl(img.image_url) || "") || [];
        setAllImages(images);

        // Transform for UI with fallback seller info
        const transformed: HouseCardProps = {
          id: propertyData.id?.toString() || propertyId,
          title: propertyData.title || "No Title",
          price: propertyData.price?.toString() || "0",
          type: propertyData.property_type || "Unknown Type",
          location: propertyData.location || "No location",
          bedrooms: propertyData.bedroom || 0,
          bathrooms: propertyData.bathroom || 0,
          mode: (propertyData.listing_type === "sale" ? "buy" : propertyData.listing_type) as "buy" | "rent",
          description: propertyData.description || "No description provided",
          extras: [
            propertyData.air_condition ? "Air Conditioning" : "",
            propertyData.pop_ceiling ? "POP Ceiling" : "",
            propertyData.furniture ? "Furniture" : "",
            propertyData.floor_tiles ? "Floor Tiles" : "",
            propertyData.running_water ? "Running Water" : "",
            propertyData.prepaid_meter ? "Prepaid Meter" : "",
            propertyData.wifi ? "WiFi" : "",
          ].filter(Boolean),
          image: images[0] || require("@/assets/images/apt-1.png"),
          seller: {
            name: "Loading...",
            phone: "",
            photo: PROFILE,
            rating: 0,
            isActive: false,
            reviews: [],
          },
          isFavorite: false,
        };
        setProperty(transformed);

        // Fetch agent profile and similar properties in parallel
        const agentId = propertyData.agent_id || (propertyData as any).userId || (propertyData as any).user_id || (propertyData as any).user?.id;
        console.log(`🔍 Details: Detected agentId ${agentId} from property data`);

        // Try cached agent first, then fetch fresh
        let cachedAgent: AgentFeed | null = null;
        if (agentId && agentId !== 0) {
          cachedAgent = await getCachedAgent(Number(agentId));
          if (cachedAgent) {
            console.log("✅ Details: Using cached agent data for", agentId);
            applyAgentData(cachedAgent);
          }
        }

        const agentPromise = (agentId && agentId !== 0)
          ? getAgentProfile(Number(agentId), { silent: true, signal, forceRefresh } as any)
          : Promise.resolve(null);

        const similarPromise = getProperties(20, 1, { silent: true, signal }).catch(err => {
          console.warn("⚠️ Details: Failed to fetch similar properties", err);
          return null;
        });

        try {
          const [agentData] = await Promise.all([agentPromise, similarPromise]);

          if (agentData) {
            console.log("✅ Details: Fresh agent data received");
            setAgent(agentData);
            applyAgentData(agentData);
            // Cache for next visit
            await setCachedAgent(Number(agentId), agentData);
          }
        } catch (parallelErr) {
          console.warn("⚠️ Details: Error in parallel data fetching:", parallelErr);
        }
      } else {
        console.error("❌ Details: No property data returned");
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error("❌ Details: Critical error in fetchDetails:", err);
      }
    }
  }, [propertyId, clearError, getPropertyById, getAgentProfile, getProperties, applyAgentData]);

  // Read the deposit straight from the contract rather than the backend copy:
  // the owner can change it with update_listing without the backend hearing.
  useEffect(() => {
    const onChainId = rawProperty?.blockchain_property_id;
    if (!onChainId) {
      setOnChainDeposit(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await nearContractService.getPropertyById(Number(onChainId));
        if (cancelled) return;
        const required = (res?.data as any)?.damage_deposit_required;
        setOnChainDeposit(required && required !== "0" ? required : null);
      } catch {
        if (!cancelled) setOnChainDeposit(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawProperty?.blockchain_property_id]);


  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDetails(undefined, true);
    setRefreshing(false);
  };

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes when the screen is returned to.
  usePullToRefresh(onRefresh);

  useEffect(() => {
    const controller = new AbortController();
    fetchDetails(controller.signal);
    return () => controller.abort();
  }, [fetchDetails]);

  // Force-refresh agent data when the screen regains focus (e.g. after a
  // profile edit), bypassing the 15-min cache so an updated name/avatar shows
  // immediately.
  //
  // `agent` must NOT be a dependency here. fetchDetails() ends by calling
  // setAgent() with a freshly-parsed object, so depending on it meant: focus →
  // fetch → new agent identity → new callback identity → useFocusEffect fires
  // again → fetch... a refetch loop that ran for as long as the screen stayed
  // focused. `hasLoadedRef` gives the "only after the first load" behaviour
  // the `if (agent)` check was reaching for, without feeding state back into
  // the dependency array.
  const hasLoadedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!propertyId) return;
      if (!hasLoadedRef.current) {
        // First focus — the mount effect below is already fetching.
        hasLoadedRef.current = true;
        return;
      }
      const controller = new AbortController();
      fetchDetails(controller.signal, true);
      return () => controller.abort();
    }, [propertyId, fetchDetails])
  );

  // Fetch real reviews from backend
  useEffect(() => {
    if (!rawProperty?.id) return;
    const fetchReviews = async () => {
      try {
        const ratings: RatingShow[] = await getPropertyRatings(rawProperty.id);
        if (ratings && ratings.length > 0) {
          const mapped: REVIEW[] = ratings.map((r) => ({
            id: String(r.id),
            name: `User ${r.rater_id}`,
            comment: r.comment || "No comment",
            date: r.created_at
              ? new Date(r.created_at).toLocaleDateString()
              : "Recently",
            rating: r.score,
          }));
          setPropertyReviews(mapped);
          const avg = ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;
          setAvgRating(Math.round(avg * 10) / 10);
        }
      } catch {
        // Silent fail — reviews are non-critical
      }
    };
    fetchReviews();
  }, [rawProperty?.id, getPropertyRatings]);

  // Filter similar properties
  useEffect(() => {
    if (rawProperty && properties.length > 0) {
      const filtered = properties
        .filter(p =>
          p && p.id && rawProperty.id && p.id !== rawProperty.id &&
          // Exclude unavailable properties from related section
          p.status !== "sold" && p.status !== "rented" &&
          (p.property_type === rawProperty.property_type ||
            (p.location && rawProperty.location && p.location.toLowerCase().includes(rawProperty.location.toLowerCase())))
        )
        .slice(0, 10);
      setSimilarProperties(filtered);
    }
  }, [rawProperty, properties]);

  // Check if current user has a bid or committed payment on this property
  useEffect(() => {
    const checkBidOrPayment = async () => {
      if (!walletState.account?.accountId || !propertyId) return;
      try {
        const txns = await getTransactions();
        // TransactionListResponse wraps data in .data
        const txList = (txns as any)?.data || txns || [];
        const match = Array.isArray(txList) && txList.some(
          (tx: any) =>
            String(tx.property_id) === String(propertyId) &&
            (tx.counterparty?.wallet_id === walletState.account?.accountId ||
             tx.bidder_id === walletState.account?.accountId)
        );
        setHasBidOrPayment(match);
      } catch {
        setHasBidOrPayment(false);
      }
    };
    checkBidOrPayment();
  }, [propertyId, walletState.account?.accountId, getTransactions]);

  /** Popup shown when user tries to contact without bid/payment */
  const showContactGatePopup = () => {
    setFeedback({
      visible: true,
      type: "info",
      title: "Contact Locked",
      message:
        "Place a bid or commit payment to contact the agent. This protects agents from spam and ensures only serious buyers can reach out.",
      actionLabel: "Got it",
      onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
    });
  };

  const handleSendMessage = () => {
    // Gate: must have bid or payment
    if (!hasBidOrPayment) {
      showContactGatePopup();
      return;
    }

    const receiverId = rawProperty?.agent_id || (rawProperty as any).userId;
    console.log(`💬 Details: Navigating to chat with receiver ${receiverId}`);

    if (!receiverId) {
      setFeedback({
        visible: true,
        type: "error",
        title: "Error",
        message: "Seller information not available to start chat",
        actionLabel: "Ok",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
      return;
    }

    router.push({
      pathname: "/chat",
      params: {
        id: propertyId,
        receiverId: receiverId.toString(),
        agentName: agent?.fullname || agent?.username || agent?.agency_name || property?.seller?.name || "Agent"
      }
    });
  };

  const handleCall = () => {
    // Gate: must have bid or payment
    if (!hasBidOrPayment) {
      showContactGatePopup();
      return;
    }

    const phoneNumber = agent?.phone_number || property?.seller?.phone;
    console.log(`📞 Details: Attempting to call ${phoneNumber}`);

    if (phoneNumber && phoneNumber !== "N/A" && phoneNumber.trim() !== "") {
      Linking.openURL(`tel:${phoneNumber}`);
    } else {
      setFeedback({
        visible: true,
        type: "info",
        title: "Contact Agent",
        message: "This agent hasn't provided a valid phone number. You can use the message button to reach them.",
        actionLabel: "Got it",
        onAction: () => setFeedback(prev => ({ ...prev, visible: false })),
      });
    }
  };

  const closeFeedback = () => {
    setFeedback(prev => ({ ...prev, visible: false }));
  };

  const handleSendOffer = async () => {
    if (!walletState.isConnected || !walletState.account?.accountId) {
      Alert.alert("Wallet Required", "Please connect your wallet to place a bid on the blockchain.");
      return;
    }

    // Check if property is minted on blockchain
    console.log("💰 SendOffer: blockchain_property_id =", rawProperty?.blockchain_property_id);
    if (!rawProperty?.blockchain_property_id) {
      console.log("💬 SendOffer: Property not on blockchain");

      // For non-blockchain properties, check if negotiable for message-based offer
      if (!rawProperty?.is_negotiable) {
        Alert.alert(
          "Not Available",
          "This property is not available for bidding. The owner has set a fixed price. Use the 'Buy Now' or 'Rent Now' button to proceed."
        );
        return;
      }

      // Message-based offer for negotiable non-blockchain properties
      if (!offerPrice) {
        Alert.alert("Error", "Please enter an offer amount");
        return;
      }

      const receiverId = rawProperty?.agent_id || (rawProperty as any).userId;
      if (!receiverId) {
        Alert.alert("Error", "Seller information not available");
        return;
      }

      try {
        setIsSendingOffer(true);
        const offerData: OfferMessage = {
          type: 'offer',
          offerId: `offer_${Date.now()}_${user?.id || 0}`,
          propertyId: Number(propertyId),
          propertyTitle: rawProperty?.title || 'Property',
          propertyImage: allImages[0] || undefined,
          offeredPrice: parseFloat(offerPrice),
          originalPrice: rawProperty?.price || 0,
          buyerId: user?.id || 0,
          buyerName: user?.fullname || user?.username || 'Buyer',
          sellerId: Number(receiverId),
          status: OfferStatus.PENDING,
          timestamp: new Date().toISOString(),
        };

        await sendMessage({
          receiver_id: Number(receiverId),
          message: JSON.stringify(offerData),
          property_id: Number(propertyId)
        });

        Alert.alert("Success", "Offer sent to the seller's inbox");
        setOfferPrice("");
      } catch (err: any) {
        console.error("❌ Details: Failed to send offer:", err);
        Alert.alert("Error", `Failed to send offer: ${err?.message || "Please try again later"}`);
      } finally {
        setIsSendingOffer(false);
      }
      return;
    }

    // === Blockchain property ===
    const isNegotiable = rawProperty?.is_negotiable === true;

    if (!isNegotiable) {
      // Non-negotiable: fetch on-chain price and use it directly
      console.log("🔗 SendOffer: Non-negotiable blockchain property, fetching on-chain price");
      try {
        setIsSendingOffer(true);
        await nearContractService.initialize("testnet");
        const onChainProp = await nearContractService.getPropertyById(Number(rawProperty.blockchain_property_id));
        if (!onChainProp.success || !onChainProp.data) {
          Alert.alert("Error", "Could not fetch on-chain property data. Please try again.");
          return;
        }
        const price = onChainProp.data.price;
        console.log("💰 On-chain price:", price);
        setOnChainPrice(price);
      } catch (err: any) {
        Alert.alert("Error", `Failed to fetch on-chain price: ${err?.message}`);
        return;
      } finally {
        setIsSendingOffer(false);
      }
    } else {
      // Negotiable: user must enter an offer amount
      if (!offerPrice) {
        Alert.alert("Error", "Please enter your bid amount in Naira");
        return;
      }
      setOnChainPrice(null); // clear any previous on-chain price
    }

    console.log("🔗 SendOffer: Showing token modal");
    setShowTokenModal(true);
  };

  // "Buy Now" / "Rent Now" — same on-chain bid pipeline as a negotiated
  // offer (the contract has no separate instant-purchase method; every
  // purchase is place_bid -> seller accept_bid_with_escrow), just always at
  // the listed price with no negotiation step. The seller still has to
  // accept, and the buyer can still cancel the pending bid to get their
  // committed funds back if the seller doesn't respond in time — both for
  // free, since this reuses the exact same bid/escrow/notification pipeline.
  const handleBuyNow = async () => {
    if (!walletState.isConnected || !walletState.account?.accountId) {
      Alert.alert("Wallet Required", "Please connect your wallet to complete this purchase.");
      return;
    }

    if (!rawProperty?.blockchain_property_id) {
      Alert.alert("Not Available", "This property isn't available for on-chain purchase yet.");
      return;
    }

    try {
      setIsSendingOffer(true);
      await nearContractService.initialize("testnet");
      const onChainProp = await nearContractService.getPropertyById(Number(rawProperty.blockchain_property_id));
      if (!onChainProp.success || !onChainProp.data) {
        Alert.alert("Error", "Could not fetch on-chain property data. Please try again.");
        return;
      }
      setOnChainPrice(onChainProp.data.price);
    } catch (err: any) {
      Alert.alert("Error", `Failed to fetch on-chain price: ${err?.message}`);
      return;
    } finally {
      setIsSendingOffer(false);
    }

    setShowTokenModal(true);
  };

  const handlePlaceBid = async (tokenContractId: string, amount: string, decimals: number) => {
    // Synchronous guard. setIsPlacingBid below is React state and does not take
    // effect until the next render, so it cannot stop a second invocation that
    // arrives in the same tick — and this call moves real funds.
    if (placeBidLatch.current) return;
    placeBidLatch.current = true;

    if (!walletState.account?.accountId || !rawProperty?.blockchain_property_id) {
      Alert.alert("Error", "Missing wallet or property information");
      placeBidLatch.current = false;
      return;
    }

    try {
      setIsPlacingBid(true);
      setShowTokenModal(false);

      // Initialize contract service
      await nearContractService.initialize("testnet");

      // Get private key for signing
      const privateKey = await getAuthorizedPrivateKey(walletState.account.accountId);
      if (!privateKey) {
        Alert.alert("Error", "Could not access wallet keys. Please reconnect your wallet.");
        return;
      }

      console.log(`🔗 Placing blockchain bid...`, {
        accountId: walletState.account.accountId,
        tokenContractId,
        propertyId: rawProperty.blockchain_property_id,
        amount,
      });

      // Determine action based on listing type
      const action = rawProperty.listing_type === "rent" ? Action.Lease : Action.Purchase;

      // Non-blocking toast (contexts/ToastContext.tsx) instead of a full-screen
      // modal — placeBid can take several seconds and previously showed
      // nothing at all during the wait (the token modal closed before this
      // call even started). Also posts to the notification inbox and, if the
      // user has navigated away by the time it resolves, a local OS
      // notification (services/localNotifications.ts).
      const result = await runTransaction({
        loadingMessage: "Placing your bid...",
        successMessage: "Bid placed successfully.",
        notification: {
          type: "bid_placed",
          title: "Bid Placed",
          message: `Your bid for "${rawProperty?.title || 'Property'}" has been placed successfully.`,
        },
        action: async () => {
          const bidResult = await nearContractService.placeBid(
            walletState.account!.accountId,
            privateKey,
            tokenContractId,
            Number(rawProperty.blockchain_property_id),
            amount,
            action
          );
          // placeBid resolves with { success: false, error } on a soft
          // failure rather than throwing — normalize to a thrown error so
          // the toast/notification correctly reflect failure instead of
          // reporting success for a bid that didn't actually go through.
          if (!bidResult.success) {
            throw new Error(bidResult.error || "Failed to place bid. Please try again.");
          }
          return bidResult;
        },
      }).catch((err: any) => {
        Alert.alert("Bid Failed", err?.message || "Failed to place bid. Please try again.");
        return null;
      });

      if (result) {
        setOfferPrice("");

        // Sync to backend so this shows up in the seller's Ongoing tab and
        // they get a push notification — without this, the bid is only
        // visible via the chat message below (see Sheda-Backend PR #14).
        if (result.data != null && rawProperty?.agent_id) {
          sendTransactionUpdate({
            transaction_id: String(result.data),
            event: "bid_placed",
            recipient_user_id: rawProperty.agent_id,
            property_id: Number(rawProperty.blockchain_property_id),
            message: `New bid received on "${rawProperty?.title || 'your property'}".`,
            metadata: {
              buyer_wallet_id: walletState.account.accountId,
              seller_wallet_id: rawProperty.blockchain_owner_id,
              bid_amount: amount,
              stablecoin_token: tokenContractId,
              // Backend's TransactionActionEnum is lowercase ("purchase"/"lease");
              // the on-chain Action enum is capitalized ("Purchase"/"Lease").
              action: action.toLowerCase(),
              tx_hash: result.transactionHash,
            },
          }).catch((err) =>
            console.warn("Failed to sync bid_placed to backend:", err)
          );
        }

        // Send a structured offer summary card to the seller's inbox (chat is
        // informational only — bid actions live in History > Ongoing)
        const receiverId = rawProperty?.agent_id || (rawProperty as any).userId || (rawProperty as any).user_id || (rawProperty as any).user?.id;
        console.log("📨 Bid message - receiverId:", receiverId, "agent_id:", rawProperty?.agent_id, "rawProperty keys:", Object.keys(rawProperty || {}));
        if (receiverId) {
          try {
            // offeredPrice should be the NAIRA amount the user bid,
            // NOT the USD/stablecoin amount, so the seller sees the correct price.
            const bidNairaAmount = onChainPrice
              ? stablecoinUnitsToNaira(parseInt(amount) || 0, ngnPerUsd || 1500)
              : (parseFloat(offerPrice.replace(/,/g, '')) || 0);

            const offerData: OfferMessage = {
              type: 'offer',
              offerId: `bid_${Date.now()}_${user?.id || 0}`,
              propertyId: Number(propertyId),
              propertyTitle: rawProperty?.title || 'Property',
              propertyImage: allImages?.[0] || undefined,
              offeredPrice: bidNairaAmount,
              originalPrice: rawProperty?.price || 0,
              buyerId: user?.id || 0,
              buyerName: user?.fullname || user?.username || 'Buyer',
              sellerId: Number(receiverId),
              status: OfferStatus.PENDING,
              bidId: result.data as number | undefined,
              blockchainPropertyId: Number(rawProperty?.blockchain_property_id) || undefined,
              timestamp: new Date().toISOString(),
            };

            await sendMessage({
              receiver_id: Number(receiverId),
              message: JSON.stringify(offerData),
              property_id: Number(propertyId)
            });
          } catch (msgErr) {
            console.warn("Failed to send notification message:", msgErr);
          }
        }
      }
      // else: runTransaction's .catch() above already showed the failure alert.
    } catch (err: any) {
      console.error("❌ Details: Failed to place blockchain bid:", err);
      Alert.alert("Error", `Failed to place bid: ${err?.message || "Please try again"}`);
    } finally {
      setIsPlacingBid(false);
      // Released only once the attempt has fully settled, so a genuine retry
      // after a failure still works while a double-tap during the attempt does
      // not.
      placeBidLatch.current = false;
    }
  };

  const openImageModal = (index: number) => {
    setCurrentImageIndex(index);
    setIsImageModalVisible(true);
  };

  if (isLoading && !property) {
    return <DetailSkeleton />;
  }

  if (error && !property) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
        <View className="flex-1 justify-center items-center p-5">
          <InterMedium className="text-primaryText text-lg text-center">
            {error}
          </InterMedium>
          <Button onPress={() => router.back()} className="mt-5 px-6">
            <InterRegular className="text-white">Go Back</InterRegular>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (!property) return null;

  return (
    <SafeAreaView style={{ flex: 1, height: deviceHeight, backgroundColor: 'white' }}>
      <ScrollView
        className="container flex-1 mx-auto max-w-2xl"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <TouchableOpacity activeOpacity={0.9} onPress={() => openImageModal(0)}>
          <ImageBackground
            source={typeof property.image === "string" ? { uri: property.image } : property.image}
            resizeMode="cover"
            style={{ width: "100%", height: 325 }}
          >
            <View className="p-4 flex-row justify-between items-center">
              <BackBtn className="bg-white" />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await Share.share({
                        message: `Check out "${property?.title}" on Sheda Solutions!\n\nsheda://details/${propertyId}`,
                        title: property?.title || "Property",
                      });
                    } catch { }
                  }}
                  className="bg-white rounded-full p-2 items-center justify-center"
                  style={{ width: 36, height: 36 }}
                >
                  <InterRegular className="text-sm">↗</InterRegular>
                </TouchableOpacity>
                <Favorite propertyId={Number(propertyId)} className="bg-white" />
              </View>
            </View>
            {allImages.length > 1 && (
              <View className="absolute bottom-4 right-4 bg-black/50 px-3 py-1 rounded-full">
                <InterRegular className="text-white text-xs">
                  1 of {allImages.length}
                </InterRegular>
              </View>
            )}
          </ImageBackground>
        </TouchableOpacity>

        <View className="p-5">
          <InterMedium className="text-base/5">{property.title}</InterMedium>
          <InterRegular className="text-xs text-secondaryText capitalize mb-1">{property.type}</InterRegular>
          <View className="flex-row gap-1 items-center mt-1">
            <Icon icon={LOCATION} width={10} height={12} className="text-secondaryText" />
            <InterRegular className="text-secondaryText text-sm/[150%]">{property.location}</InterRegular>
          </View>

          <View className="flex-row gap-2 items-center my-3">
            <View className="flex-row items-center justify-center p-2 gap-1 border border-secondaryText rounded-lg">
              <Icon icon={BED} width={17} height={8} />
              <InterRegular className="text-secondaryText text-xs/[150%]">{property.bedrooms} Bed</InterRegular>
            </View>
            <View className="flex-row items-center justify-center p-2 gap-1 border border-secondaryText rounded-lg">
              <Icon icon={BATH} width={17} height={8} />
              <InterRegular className="text-secondaryText text-xs/[150%]">{property.bathrooms} Bath</InterRegular>
            </View>
          </View>
        </View>

        {/* Agent / Seller Profile Card */}
        {(() => {
          // Build SafeUserProfile from agent or fallback seller data
          const safeProfile: SafeUserProfile = agent
            ? sanitizeAgentProfile(agent, "agent", propertyReviews.length)
            : buildSafeProfile({
              displayName: property.seller?.name,
              avatarUrl: typeof property.seller?.photo === 'object' && 'uri' in property.seller.photo ? property.seller.photo.uri : null,
              isOnline: property.seller?.isActive,
              lastSeenLabel: property.seller?.lastSeen,
              rating: property.seller?.rating,
              role: "agent",
            });

          const contactButtons = (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={handleSendMessage}
                style={{
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  borderRadius: 8,
                  padding: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: hasBidOrPayment ? 1 : 0.45,
                }}
                activeOpacity={0.7}
              >
                <Icon icon={MESSAGE} width={20} height={20} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCall}
                className="bg-primary"
                style={{
                  borderRadius: 8,
                  padding: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: hasBidOrPayment ? 1 : 0.45,
                }}
                activeOpacity={0.7}
              >
                <Icon icon={PHONE} width={20} height={20} className="text-white" />
              </TouchableOpacity>
            </View>
          );

          return (
            <>
              <ProfileVisibilityCard
                profile={safeProfile}
                variant="details"
                rightAction={contactButtons}
              />
              {/* Subtle hint when contact is locked */}
              {!hasBidOrPayment && (
                <View className="px-5 pb-2">
                  <InterRegular className="text-[10px] text-gray-400 text-right">
                    Place a bid to unlock contact
                  </InterRegular>
                </View>
              )}
            </>
          );
        })()}

        <View className="px-5 py-4 border-t border-borderColor">
          <InterSemiBold className="text-sm mb-2">Description</InterSemiBold>
          <DescriptionText text={property.description} />

          {property.extras?.length > 0 && (
            <View className="mt-4">
              <InterSemiBold className="text-sm mb-2">Extras</InterSemiBold>
              <View className="flex-row gap-2 mt-2 w-full flex-wrap">
                {property.extras.map((extra, index) => (
                  <InterRegular key={index} className="bg-gray-100 text-secondaryText px-3 py-1.5 rounded-lg text-xs">
                    {extra}
                  </InterRegular>
                ))}
              </View>
            </View>
          )}
        </View>

        <View className="px-5 py-4 border-t border-borderColor">
          <View className="flex-row justify-between items-center">
            <InterRegular className="text-sm/[150%]">Reviews ({propertyReviews.length})</InterRegular>
            <StarRatingDisplay rating={avgRating} starSize={15} />
          </View>
          <View className="py-2">
            <Comments reviews={propertyReviews} />
          </View>
        </View>

        <View className="px-5 py-4 border-t border-borderColor">
          {/* Show different UI based on property type, ownership, and availability */}
          {(() => {
            // Guard 1: Owner cannot transact on own listing
            // Check by ID match OR email match (handles buyer↔seller mode switch)
            const idMatch = !!(user?.id && rawProperty?.agent_id && user.id === rawProperty.agent_id);
            const emailMatch = !!(user?.email && agent?.email && user.email.toLowerCase() === agent.email.toLowerCase());
            const isOwner = idMatch || emailMatch;
            if (isOwner) {
              return (
                <View className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <InterMedium style={{ fontSize: 13, color: "#1E40AF", marginBottom: 4 }}>
                    This is your listing
                  </InterMedium>
                  <InterRegular style={{ fontSize: 12, color: "#3B82F6", lineHeight: 18 }}>
                    You cannot place bids or make payments on your own property. Manage this listing from your seller dashboard.
                  </InterRegular>
                </View>
              );
            }

            // Guard 2: Property is unavailable (sold/rented)
            const isUnavailable = rawProperty?.status === "sold" || rawProperty?.status === "rented";
            if (isUnavailable) {
              return (
                <View className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <InterMedium style={{ fontSize: 13, color: "#991B1B", marginBottom: 4 }}>
                    Property Unavailable
                  </InterMedium>
                  <InterRegular style={{ fontSize: 12, color: "#DC2626", lineHeight: 18 }}>
                    This property has been {rawProperty?.status === "sold" ? "sold" : "rented"} and is no longer available for transactions.
                  </InterRegular>
                </View>
              );
            }

            const isBlockchain = !!rawProperty?.blockchain_property_id;
            const isNegotiable = rawProperty?.is_negotiable === true;

            // Non-negotiable blockchain property — no offer input needed
            if (isBlockchain && !isNegotiable) {
              return (
                <>
                  <InterRegular className="text-sm/[150%]">Purchase / Rent</InterRegular>
                  <View className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <InterMedium className="text-green-800 text-xs mb-1">
                      Fixed Price
                    </InterMedium>
                    <InterRegular className="text-green-700 text-[11px] leading-4">
                      This property has a fixed price. Click below to purchase at the listed price.
                    </InterRegular>
                  </View>
                  <View className="mt-3">
                    <Button
                      onPress={handleSendOffer}
                      disabled={isSendingOffer || !walletState.isConnected}
                      className={`rounded-lg ${isSendingOffer || !walletState.isConnected ? 'opacity-50' : ''}`}
                    >
                      {isSendingOffer ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <InterRegular className="text-white">Pay Listed Price</InterRegular>
                      )}
                    </Button>
                  </View>
                </>
              );
            }

            // Non-negotiable non-blockchain — no bidding available
            if (!isBlockchain && !isNegotiable) {
              return (
                <>
                  <InterRegular className="text-sm/[150%]">Offers</InterRegular>
                  <View className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <InterMedium className="text-gray-700 text-xs mb-1">
                      Bidding Not Available
                    </InterMedium>
                    <InterRegular className="text-gray-600 text-[11px] leading-4">
                      This property has a fixed price and is not open for negotiation. Use the {rawProperty?.listing_type === 'rent' ? '"Rent Now"' : '"Buy Now"'} button below to proceed at the listed price.
                    </InterRegular>
                  </View>
                </>
              );
            }

            // Negotiable — show offer input
            return (
              <>
                <View className="flex-row items-center gap-2">
                  <InterRegular className="text-sm/[150%]">Make offer</InterRegular>
                  <View className="bg-blue-100 px-2 py-0.5 rounded">
                    <InterRegular className="text-[9px] text-blue-700">Negotiable</InterRegular>
                  </View>
                </View>

                {!walletState.isConnected && (
                  <View className="mt-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <InterSemiBold className="text-orange-800 text-xs mb-1">
                      Wallet Not Connected
                    </InterSemiBold>
                    <InterRegular className="text-orange-700 text-[11px] leading-4">
                      Connect your NEAR wallet to bid on this property.
                    </InterRegular>
                    <TouchableOpacity
                      onPress={() => router.push("/wallet-setup")}
                      className="mt-2"
                    >
                      <InterSemiBold className="text-primary text-xs">Connect Wallet →</InterSemiBold>
                    </TouchableOpacity>
                  </View>
                )}

                <View className="my-3">
                  <StyledTextInput
                    placeholder="Enter offer amount in Naira (e.g. 500000)"
                    keyboardType="numeric"
                    value={offerPrice}
                    onChangeText={setOfferPrice}
                    editable={walletState.isConnected}
                  />
                  {offerPrice ? (
                    <View className="mt-2 px-1">
                      <InterRegular className="text-xs text-secondaryText">
                        ≈ {formatUsd(nairaToUsd(parseFloat(offerPrice.replace(/,/g, '')) || 0, ngnPerUsd || 1500))} USD ({nairaToStablecoinUnits(parseFloat(offerPrice.replace(/,/g, '')) || 0, ngnPerUsd || 1500).toLocaleString()} stablecoin units)
                      </InterRegular>
                      <InterRegular className="text-[10px] text-gray-400 mt-0.5">
                        Rate: 1 USD = {(ngnPerUsd || 0).toLocaleString()} NGN
                      </InterRegular>
                    </View>
                  ) : null}
                </View>
                <Button
                  onPress={handleSendOffer}
                  disabled={isSendingOffer || !walletState.isConnected}
                  className={`rounded-lg ${isSendingOffer || !walletState.isConnected ? 'opacity-50' : ''}`}
                >
                  {isSendingOffer ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <InterRegular className="text-white">Send offer</InterRegular>
                  )}
                </Button>
              </>
            );
          })()}
        </View>

        <View className="px-5 py-4 border-t border-borderColor">
          <InterSemiBold className="text-sm mb-2">Similar listings</InterSemiBold>
          <View className="my-2">
            {similarProperties.length > 0 ? (
              <HouseList properties={similarProperties} />
            ) : (
              <InterRegular className="text-secondaryText text-xs italic">No similar listings found</InterRegular>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Image Modal */}
      <Modal visible={isImageModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsImageModalVisible(false)}>
        <View className="flex-1 bg-black/95 justify-center">
          <TouchableOpacity
            onPress={() => setIsImageModalVisible(false)}
            className="absolute top-12 right-6 z-20 p-2 bg-black/20 rounded-full"
          >
            <InterBold className="text-white text-xl">✕</InterBold>
          </TouchableOpacity>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              setCurrentImageIndex(Math.round(x / SCREEN_WIDTH));
            }}
            scrollEventThrottle={16}
          >
            {allImages.map((img, idx) => (
              <View key={idx} style={{ width: SCREEN_WIDTH, height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                <Image
                  source={{ uri: img }}
                  style={{ width: SCREEN_WIDTH, height: '80%' }}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>

          <View className="absolute bottom-12 w-full items-center">
            <View className="bg-black/50 px-4 py-2 rounded-full">
              <InterMedium className="text-white text-base">
                {currentImageIndex + 1} of {allImages.length}
              </InterMedium>
            </View>
          </View>
        </View>
      </Modal>

      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onAction={feedback.onAction}
        actionLabel={feedback.actionLabel}
        actionColor={feedback.actionColor}
        onClose={closeFeedback}
      />

      {/* Token Selection Modal for Blockchain Bidding */}
      <TokenSelectionModal
        visible={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onConfirm={handlePlaceBid}
        title={onChainPrice ? "Confirm Purchase" : "Place Blockchain Bid"}
        description={onChainPrice
          ? `Paying the exact listed price for "${rawProperty?.title}". Select a stablecoin to pay with.`
          : `You are placing a negotiable bid on "${rawProperty?.title}". Select a stablecoin to pay with.`
        }
        onChainAmount={onChainPrice || undefined}
        nairaAmount={onChainPrice ? undefined : (parseFloat(offerPrice.replace(/,/g, '')) || 0)}
        actionLabel={isPlacingBid ? "Processing..." : (onChainPrice ? "Confirm Payment" : "Place Bid")}
        isLoading={isPlacingBid}
      />

      {/* Bottom bar: hide for own listing or unavailable properties */}
      {!(
        (user?.id && rawProperty?.agent_id && user.id === rawProperty.agent_id) ||
        (user?.email && agent?.email && user.email.toLowerCase() === agent.email.toLowerCase())
      ) &&
        rawProperty?.status !== "sold" && rawProperty?.status !== "rented" && (
          <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-borderColor p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <InterMedium className="text-sm text-secondaryText">
                  {property.mode === "rent" ? "Rent" : "Buy"}
                </InterMedium>
                <PriceDisplay
                  amountFiat={parseFloat(String(property.price).replace(/[^0-9.-]/g, "")) || 0}
                  fiatCode={(property as any).priceCurrency || "NGN"}
                  suffix={property.mode === "rent" ? "/year" : ""}
                  size="md"
                />
                {property.mode === "rent" && onChainDeposit && (
                  <InterRegular style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    + ${(Number(onChainDeposit) / 1_000_000).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    refundable deposit
                  </InterRegular>
                )}
              </View>
              <Button
                onPress={handleBuyNow}
                disabled={!walletState.isConnected || isSendingOffer || isPlacingBid}
                className={`bg-primary py-3 px-6 rounded-lg ${!walletState.isConnected ? 'opacity-50' : ''}`}
              >
                <InterRegular className="text-white text-center">
                  {property.mode === "rent" ? "Rent Now" : "Buy Now"}
                </InterRegular>
              </Button>
            </View>
          </View>
        )}
    </SafeAreaView>
  );
};

export default Details;

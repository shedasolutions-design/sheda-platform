"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bath, BedDouble, ChevronLeft, ChevronRight, MapPin, MessageSquareText, Phone, Share2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import { ErrorState, LoadingState } from "@/components/ui/States";
import BackLink from "@/components/ui/BackLink";
import Favorite from "@/components/property/Favorite";
import PriceDisplay from "@/components/property/PriceDisplay";
import HouseCard from "@/components/property/HouseCard";
import Reviews from "@/components/property/Reviews";
import Stars from "@/components/common/Stars";
import ProfileVisibilityCard from "@/components/common/ProfileVisibilityCard";
import TokenSelectionModal from "@/components/common/TokenSelectionModal";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import nearContractService from "@/services/nearContract";
import type { AgentFeed, PropertyShow, RatingShow } from "@/services/api";
import { Action } from "@/types/contract";
import { OfferStatus, type OfferMessage } from "@/types/offer";
import type { REVIEW } from "@/types/ui";
import type { SafeUserProfile } from "@/types/profile";
import { formatUsd, nairaToStablecoinUnits, nairaToUsd, stablecoinUnitsToNaira } from "@/constants/exchangeRates";
import getFullImageUrl from "@/utilities/imageUrl";
import { adaptPropertyToHouse } from "@/utilities/adapter";
import { buildSafeProfile, sanitizeAgentProfile } from "@/utilities/profileSanitizer";
import AsyncStorage from "@/lib/storage";

const DESC_TRUNCATE = 220;

const looksLikeEmail = (s?: string | null) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** The best display name for an agent, never a raw email address. */
function agentName(a: AgentFeed): string {
  if (a.fullname && !looksLikeEmail(a.fullname)) return a.fullname;
  if (a.username && !looksLikeEmail(a.username)) return a.username;
  if (a.agency_name && !looksLikeEmail(a.agency_name)) return a.agency_name;
  if (a.email?.includes("@")) return a.email.split("@")[0];
  return "Agent";
}

// Agent profiles are cached for 15 minutes so repeat visits paint at once.
const AGENT_CACHE = "agent_cache_";
const AGENT_TTL = 15 * 60 * 1000;
async function cachedAgent(id: number): Promise<AgentFeed | null> {
  try {
    const raw = await AsyncStorage.getItem(AGENT_CACHE + id);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return Date.now() - ts > AGENT_TTL ? null : (data as AgentFeed);
  } catch {
    return null;
  }
}
async function cacheAgent(id: number, data: AgentFeed) {
  try {
    await AsyncStorage.setItem(AGENT_CACHE + id, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* non-critical */
  }
}

const EXTRAS: [string, string][] = [
  ["air_condition", "Air Conditioning"],
  ["pop_ceiling", "POP Ceiling"],
  ["furniture", "Furniture"],
  ["floor_tiles", "Floor Tiles"],
  ["running_water", "Running Water"],
  ["prepaid_meter", "Prepaid Meter"],
  ["wifi", "WiFi"],
];

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
}

export default function PropertyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const propertyId = String(id);
  const router = useRouter();
  const {
    getPropertyById,
    getAgentProfile,
    getProperties,
    getTransactions,
    getUserRatings,
    properties,
    sendMessage,
    sendTransactionUpdate,
    user,
    isLoading,
    error,
    clearError,
  } = useApi();
  const { walletState, getAuthorizedPrivateKey } = useWallet();
  const { ngnPerUsd } = useExchangeRates();
  const { run: runTransaction } = useTransactionToast();

  const [raw, setRaw] = useState<PropertyShow | null>(null);
  const [agent, setAgent] = useState<AgentFeed | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [offerPrice, setOfferPrice] = useState("");
  const [reviews, setReviews] = useState<REVIEW[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [hasBidOrPayment, setHasBidOrPayment] = useState(false);
  const [onChainPrice, setOnChainPrice] = useState<string | null>(null);
  const [onChainDeposit, setOnChainDeposit] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [isSendingOffer, setIsSendingOffer] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const placeBidLatch = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>({ visible: false, type: "info", title: "" });
  const notify = (type: FeedbackType, title: string, message?: string) =>
    setFeedback({ visible: true, type, title, message });

  // ── Load the property, its agent, and other listings for "similar" ──
  const load = useCallback(
    async (signal?: AbortSignal, forceRefresh = false) => {
      const numericId = Number(propertyId);
      if (!propertyId || Number.isNaN(numericId)) return;
      clearError();
      const data = await getPropertyById(numericId, { signal, forceRefresh } as any).catch(() => null);
      if (!data || signal?.aborted) return;
      setRaw(data);
      setImages((data.images ?? []).map((img) => getFullImageUrl(img.image_url) || "").filter(Boolean));

      const agentId = Number(data.agent_id || (data as any).user_id || (data as any).user?.id || 0);
      if (agentId) {
        const cached = await cachedAgent(agentId);
        if (cached) setAgent(cached);
      }
      const [fresh] = await Promise.all([
        agentId
          ? getAgentProfile(agentId, { silent: true, signal, forceRefresh } as any).catch(() => null)
          : Promise.resolve(null),
        getProperties(20, 1, { silent: true, signal } as any).catch(() => null),
      ]);
      if (fresh && !signal?.aborted) {
        setAgent(fresh);
        cacheAgent(agentId, fresh);
      }
    },
    [propertyId, clearError, getPropertyById, getAgentProfile, getProperties]
  );

  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load]);

  // The deposit is read from the contract, not the backend copy: the owner can
  // change it on chain without the backend hearing.
  useEffect(() => {
    const chainId = raw?.blockchain_property_id;
    if (!chainId) {
      setOnChainDeposit(null);
      return;
    }
    let cancelled = false;
    nearContractService
      .getPropertyById(Number(chainId))
      .then((res) => {
        const required = (res?.data as any)?.damage_deposit_required;
        if (!cancelled) setOnChainDeposit(required && required !== "0" ? required : null);
      })
      .catch(() => {
        if (!cancelled) setOnChainDeposit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [raw?.blockchain_property_id]);

  // Reviews are of the seller (ratings belong to an agent, not a listing).
  useEffect(() => {
    const sellerId = Number(raw?.agent_id || 0);
    if (!sellerId) return;
    getUserRatings(sellerId)
      .then((ratings: RatingShow[]) => {
        if (!ratings?.length) return;
        setReviews(
          ratings.map((r) => ({
            id: String(r.id),
            name: `User ${r.rater_id}`,
            comment: r.comment || "No comment",
            date: r.created_at ? new Date(r.created_at).toLocaleDateString() : "Recently",
            rating: r.score,
          }))
        );
        setAvgRating(Math.round((ratings.reduce((s, r) => s + r.score, 0) / ratings.length) * 10) / 10);
      })
      .catch(() => {});
  }, [raw?.agent_id, getUserRatings]);

  // Contact is unlocked once the viewer has a bid or payment on this property.
  useEffect(() => {
    const me = walletState.account?.accountId;
    if (!me || !propertyId) return;
    getTransactions()
      .then((res: any) => {
        const list = res?.data || res || [];
        setHasBidOrPayment(
          Array.isArray(list) &&
            list.some(
              (tx: any) =>
                String(tx.property_id) === propertyId &&
                (tx.counterparty?.wallet_id === me || tx.bidder_id === me)
            )
        );
      })
      .catch(() => setHasBidOrPayment(false));
  }, [propertyId, walletState.account?.accountId, getTransactions]);

  const similar = useMemo(() => {
    if (!raw) return [];
    return properties
      .filter(
        (p) =>
          p?.id &&
          p.id !== raw.id &&
          p.status !== "sold" &&
          p.status !== "rented" &&
          (p.property_type === raw.property_type ||
            (p.location && raw.location && p.location.toLowerCase().includes(raw.location.toLowerCase())))
      )
      .slice(0, 10);
  }, [raw, properties]);

  const profile: SafeUserProfile = agent
    ? sanitizeAgentProfile(agent, "agent", reviews.length)
    : buildSafeProfile({ displayName: "Loading…", role: "agent" });

  const isOwner =
    !!(user?.id && raw?.agent_id && user.id === raw.agent_id) ||
    !!(user?.email && agent?.email && user.email.toLowerCase() === agent.email.toLowerCase());
  const unavailable = raw?.status === "sold" || raw?.status === "rented";
  const isRent = raw?.listing_type === "rent";
  const isBlockchain = !!raw?.blockchain_property_id;
  const isNegotiable = raw?.is_negotiable === true;
  const offerNaira = parseFloat(offerPrice.replace(/,/g, "")) || 0;

  const lockedContact = () =>
    notify(
      "info",
      "Contact Locked",
      "Place a bid or commit payment to contact the agent. This protects agents from spam and ensures only serious buyers can reach out."
    );

  const handleMessage = () => {
    if (!hasBidOrPayment) return lockedContact();
    const receiverId = raw?.agent_id || (raw as any)?.userId;
    if (!receiverId) return notify("error", "Error", "Seller information not available to start chat");
    const name = agent ? agentName(agent) : "Agent";
    router.push(`/chat?id=${encodeURIComponent(propertyId)}&receiverId=${receiverId}&agentName=${encodeURIComponent(name)}`);
  };

  const handleCall = () => {
    if (!hasBidOrPayment) return lockedContact();
    const phone = agent?.phone_number?.trim();
    if (phone && phone !== "N/A") window.location.href = `tel:${phone}`;
    else
      notify(
        "info",
        "Contact Agent",
        "This agent hasn't provided a valid phone number. You can use the message button to reach them."
      );
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: raw?.title || "Property", url });
      else {
        await navigator.clipboard.writeText(url);
        notify("success", "Link copied", "The link to this property is on your clipboard.");
      }
    } catch {
      /* cancelled */
    }
  };

  const requireWallet = () => {
    if (walletState.isConnected && walletState.account?.accountId) return true;
    notify("info", "Wallet Required", "Set up or connect your wallet to place a bid on the blockchain.");
    return false;
  };

  /** Reads the exact listing price from the contract for fixed-price payments. */
  const loadOnChainPrice = async (): Promise<boolean> => {
    try {
      setIsSendingOffer(true);
      await nearContractService.initialize("testnet");
      const res = await nearContractService.getPropertyById(Number(raw!.blockchain_property_id));
      if (!res.success || !res.data) {
        notify("error", "Error", "Could not fetch on-chain property data. Please try again.");
        return false;
      }
      setOnChainPrice(res.data.price);
      return true;
    } catch (err: any) {
      notify("error", "Error", `Failed to fetch on-chain price: ${err?.message}`);
      return false;
    } finally {
      setIsSendingOffer(false);
    }
  };

  const handleSendOffer = async () => {
    if (!requireWallet() || !raw) return;

    // Off-chain listing: a negotiable one takes an offer through chat.
    if (!isBlockchain) {
      if (!isNegotiable) {
        return notify("info", "Not Available", `This property has a fixed price. Use "${isRent ? "Rent Now" : "Buy Now"}" to proceed.`);
      }
      if (!offerPrice) return notify("error", "Error", "Please enter an offer amount");
      const receiverId = raw.agent_id || (raw as any).userId;
      if (!receiverId) return notify("error", "Error", "Seller information not available");
      try {
        setIsSendingOffer(true);
        const offer: OfferMessage = {
          type: "offer",
          offerId: `offer_${Date.now()}_${user?.id || 0}`,
          propertyId: Number(propertyId),
          propertyTitle: raw.title || "Property",
          propertyImage: images[0] || undefined,
          offeredPrice: offerNaira,
          originalPrice: raw.price || 0,
          buyerId: user?.id || 0,
          buyerName: user?.fullname || user?.username || "Buyer",
          sellerId: Number(receiverId),
          status: OfferStatus.PENDING,
          timestamp: new Date().toISOString(),
        };
        await sendMessage({ receiver_id: Number(receiverId), message: JSON.stringify(offer), property_id: Number(propertyId) });
        notify("success", "Offer sent", "Your offer is in the seller's inbox.");
        setOfferPrice("");
      } catch (err: any) {
        notify("error", "Error", `Failed to send offer: ${err?.message || "Please try again later"}`);
      } finally {
        setIsSendingOffer(false);
      }
      return;
    }

    // On-chain listing.
    if (!isNegotiable) {
      if (!(await loadOnChainPrice())) return;
    } else {
      if (!offerPrice) return notify("error", "Error", "Please enter your bid amount in Naira");
      setOnChainPrice(null);
    }
    setShowTokenModal(true);
  };

  // Buy/Rent Now uses the same bid pipeline at the listed price: the contract
  // has no separate instant purchase. The seller still accepts, and the buyer
  // can still cancel a pending bid to recover the committed funds.
  const handleBuyNow = async () => {
    if (!requireWallet() || !raw) return;
    if (!isBlockchain) return notify("info", "Not Available", "This property isn't available for on-chain purchase yet.");
    if (await loadOnChainPrice()) setShowTokenModal(true);
  };

  const handlePlaceBid = async (tokenContractId: string, amount: string) => {
    // Synchronous guard: this moves real funds.
    if (placeBidLatch.current) return;
    placeBidLatch.current = true;
    const me = walletState.account?.accountId;
    if (!me || !raw?.blockchain_property_id) {
      placeBidLatch.current = false;
      return notify("error", "Error", "Missing wallet or property information");
    }
    try {
      setIsPlacingBid(true);
      setShowTokenModal(false);
      await nearContractService.initialize("testnet");
      const privateKey = await getAuthorizedPrivateKey(me);
      if (!privateKey) return notify("error", "Error", "Could not access wallet keys. Please reconnect your wallet.");
      const action = isRent ? Action.Lease : Action.Purchase;

      const result = await runTransaction({
        loadingMessage: "Placing your bid...",
        successMessage: "Bid placed successfully.",
        notification: {
          type: "bid_placed",
          title: "Bid Placed",
          message: `Your bid for "${raw.title || "Property"}" has been placed successfully.`,
        },
        action: async () => {
          const res = await nearContractService.placeBid(
            me,
            privateKey,
            tokenContractId,
            Number(raw.blockchain_property_id),
            amount,
            action
          );
          // placeBid reports soft failures as { success: false }; make them throw
          // so the toast does not announce a bid that never happened.
          if (!res.success) throw new Error(res.error || "Failed to place bid. Please try again.");
          return res;
        },
      }).catch((err: any) => {
        notify("error", "Bid Failed", err?.message || "Failed to place bid. Please try again.");
        return null;
      });
      if (!result) return;
      setOfferPrice("");
      setHasBidOrPayment(true);

      // Tell the backend, so the seller sees it in Ongoing and gets notified.
      if (result.data != null && raw.agent_id) {
        sendTransactionUpdate({
          transaction_id: String(result.data),
          event: "bid_placed",
          recipient_user_id: raw.agent_id,
          property_id: Number(raw.blockchain_property_id),
          message: `New bid received on "${raw.title || "your property"}".`,
          metadata: {
            buyer_wallet_id: me,
            seller_wallet_id: raw.blockchain_owner_id,
            bid_amount: amount,
            stablecoin_token: tokenContractId,
            action: action.toLowerCase(),
            tx_hash: result.transactionHash,
          },
        }).catch(() => {});
      }

      // And a summary card in the seller's inbox (actions live in History).
      const receiverId = raw.agent_id || (raw as any).userId || (raw as any).user_id;
      if (receiverId) {
        const bidNaira = onChainPrice ? stablecoinUnitsToNaira(parseInt(amount) || 0, ngnPerUsd || 1500) : offerNaira;
        const offer: OfferMessage = {
          type: "offer",
          offerId: `bid_${Date.now()}_${user?.id || 0}`,
          propertyId: Number(propertyId),
          propertyTitle: raw.title || "Property",
          propertyImage: images[0] || undefined,
          offeredPrice: bidNaira,
          originalPrice: raw.price || 0,
          buyerId: user?.id || 0,
          buyerName: user?.fullname || user?.username || "Buyer",
          sellerId: Number(receiverId),
          status: OfferStatus.PENDING,
          bidId: result.data as number | undefined,
          blockchainPropertyId: Number(raw.blockchain_property_id) || undefined,
          timestamp: new Date().toISOString(),
        };
        sendMessage({ receiver_id: Number(receiverId), message: JSON.stringify(offer), property_id: Number(propertyId) }).catch(() => {});
      }
    } catch (err: any) {
      notify("error", "Error", `Failed to place bid: ${err?.message || "Please try again"}`);
    } finally {
      setIsPlacingBid(false);
      placeBidLatch.current = false;
    }
  };

  // ── Render ──
  if (!raw) {
    if (error && !isLoading) {
      return (
        <div className="mx-auto max-w-3xl">
          <div className="p-4">
            <BackLink fallback="/home" />
          </div>
          <ErrorState message={error} onRetry={() => load(undefined, true)} />
        </div>
      );
    }
    return <LoadingState message="Loading property…" />;
  }

  const description = raw.description || "No description provided";
  const extras = EXTRAS.filter(([key]) => (raw as any)[key]).map(([, label]) => label);
  const hero = images[0] || "/images/apt-1.png";
  const house = adaptPropertyToHouse(raw);

  return (
    <div className="mx-auto max-w-3xl pb-32">
      {/* Gallery */}
      <div className="relative">
        <button type="button" onClick={() => setViewer(0)} className="block w-full" aria-label="View photos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt={raw.title || "Property"} className="h-[325px] w-full object-cover md:h-[420px] md:rounded-b-2xl" />
        </button>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <span className="rounded-full bg-white px-2">
            <BackLink fallback="/home" />
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={share} aria-label="Share" className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
              <Share2 size={16} />
            </button>
            <Favorite propertyId={Number(propertyId)} className="bg-white" />
          </div>
        </div>
        {images.length > 1 && (
          <span className="absolute bottom-4 right-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white">1 of {images.length}</span>
        )}
      </div>

      <section className="p-5">
        <h1 className="text-lg font-medium">{raw.title || "No Title"}</h1>
        <p className="text-xs capitalize text-secondaryText">{raw.property_type ? String(raw.property_type).replace(/_/g, " ") : "Unknown Type"}</p>
        <p className="mt-1 flex items-center gap-1 text-sm text-secondaryText">
          <MapPin size={13} /> {raw.location || "No location"}
        </p>
        <div className="my-3 flex gap-2 text-xs text-secondaryText">
          <span className="flex items-center gap-1 rounded-lg border border-secondaryText p-2">
            <BedDouble size={15} /> {raw.bedroom || 0} Bed
          </span>
          <span className="flex items-center gap-1 rounded-lg border border-secondaryText p-2">
            <Bath size={14} /> {raw.bathroom || 0} Bath
          </span>
        </div>
      </section>

      {/* Seller */}
      <ProfileVisibilityCard
        profile={profile}
        rightAction={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleMessage}
              aria-label="Message the agent"
              className={`rounded-lg border border-gray-200 p-2.5 hover:bg-cardBackground ${hasBidOrPayment ? "" : "opacity-45"}`}
            >
              <MessageSquareText size={20} />
            </button>
            <button
              type="button"
              onClick={handleCall}
              aria-label="Call the agent"
              className={`rounded-lg bg-primary p-2.5 text-white ${hasBidOrPayment ? "" : "opacity-45"}`}
            >
              <Phone size={20} />
            </button>
          </div>
        }
      />
      {!hasBidOrPayment && <p className="px-5 pb-2 text-right text-[10px] text-gray-400">Place a bid to unlock contact</p>}

      <section className="border-t border-borderColor px-5 py-4">
        <h2 className="mb-2 text-sm font-semibold">Description</h2>
        <p className="whitespace-pre-line text-sm leading-6 text-secondaryText">
          {description.length > DESC_TRUNCATE && !expanded ? `${description.slice(0, DESC_TRUNCATE).trimEnd()}...` : description}
        </p>
        {description.length > DESC_TRUNCATE && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-xs text-primary hover:underline">
            {expanded ? "Read less" : "Read more"}
          </button>
        )}
        {extras.length > 0 && (
          <>
            <h2 className="mb-2 mt-4 text-sm font-semibold">Extras</h2>
            <ul className="flex flex-wrap gap-2">
              {extras.map((e) => (
                <li key={e} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-secondaryText">
                  {e}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="border-t border-borderColor px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm">Seller reviews ({reviews.length})</h2>
          <Stars rating={avgRating} size={15} />
        </div>
        <Reviews reviews={reviews} />
      </section>

      {/* Offer / purchase */}
      <section className="border-t border-borderColor px-5 py-4">
        {isOwner ? (
          <Notice tone="blue" title="This is your listing">
            You cannot place bids or make payments on your own property. Manage this listing from your seller dashboard.
          </Notice>
        ) : unavailable ? (
          <Notice tone="red" title="Property Unavailable">
            This property has been {raw.status === "sold" ? "sold" : "rented"} and is no longer available for transactions.
          </Notice>
        ) : isBlockchain && !isNegotiable ? (
          <>
            <h2 className="text-sm">Purchase / Rent</h2>
            <Notice tone="green" title="Fixed Price">
              This property has a fixed price. Click below to pay the listed price.
            </Notice>
            <Button full className="mt-3" onClick={handleSendOffer} loading={isSendingOffer} disabled={!walletState.isConnected}>
              Pay Listed Price
            </Button>
          </>
        ) : !isNegotiable ? (
          <>
            <h2 className="text-sm">Offers</h2>
            <Notice tone="gray" title="Bidding Not Available">
              This property has a fixed price and is not open for negotiation. Use the {isRent ? '"Rent Now"' : '"Buy Now"'} button below
              to proceed at the listed price.
            </Notice>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h2 className="text-sm">Make offer</h2>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">Negotiable</span>
            </div>
            {!walletState.isConnected && (
              <Notice tone="orange" title="Wallet Not Connected">
                Connect your NEAR wallet to bid on this property.{" "}
                <Link href="/wallet-setup" className="font-semibold text-primary">
                  Connect Wallet →
                </Link>
              </Notice>
            )}
            <TextField
              className="my-3"
              inputMode="decimal"
              placeholder="Enter offer amount in Naira (e.g. 500000)"
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
              disabled={!walletState.isConnected}
              aria-label="Offer amount in Naira"
              hint={
                offerPrice
                  ? `≈ ${formatUsd(nairaToUsd(offerNaira, ngnPerUsd || 1500))} USD (${nairaToStablecoinUnits(
                      offerNaira,
                      ngnPerUsd || 1500
                    ).toLocaleString()} stablecoin units) · Rate: 1 USD = ${(ngnPerUsd || 0).toLocaleString()} NGN`
                  : undefined
              }
            />
            <Button full onClick={handleSendOffer} loading={isSendingOffer} disabled={!walletState.isConnected}>
              Send offer
            </Button>
          </>
        )}
      </section>

      <section className="border-t border-borderColor px-5 py-4">
        <h2 className="mb-3 text-sm font-semibold">Similar listings</h2>
        {similar.length > 0 ? (
          <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {similar.map((p) => (
              <li key={p.id} className="w-72 shrink-0 snap-start">
                <HouseCard house={adaptPropertyToHouse(p)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-secondaryText">No similar listings found</p>
        )}
      </section>

      {/* Price bar */}
      {!isOwner && !unavailable && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-borderColor bg-white p-4 md:bottom-0 md:left-60">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div>
              <p className="text-sm text-secondaryText">{isRent ? "Rent" : "Buy"}</p>
              <PriceDisplay
                amountFiat={parseFloat(String(raw.price ?? 0).replace(/[^0-9.-]/g, "")) || 0}
                fiatCode={house.priceCurrency || "NGN"}
                suffix={isRent ? "/year" : ""}
              />
              {isRent && onChainDeposit && (
                <p className="mt-0.5 text-xs text-gray-500">
                  + $
                  {(Number(onChainDeposit) / 1_000_000).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  refundable deposit
                </p>
              )}
            </div>
            <Button onClick={handleBuyNow} disabled={!walletState.isConnected || isSendingOffer || isPlacingBid}>
              {isRent ? "Rent Now" : "Buy Now"}
            </Button>
          </div>
        </div>
      )}

      {/* Photo viewer */}
      {viewer !== null && images.length > 0 && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label="Photos">
          <div className="flex justify-end p-4">
            <button type="button" onClick={() => setViewer(null)} aria-label="Close" className="rounded-full bg-white/10 p-2 text-white">
              <X size={22} />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[viewer]} alt="" className="max-h-[80vh] max-w-full object-contain" />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => setViewer((v) => ((v ?? 0) - 1 + images.length) % images.length)}
                  className="absolute left-3 rounded-full bg-white/10 p-2 text-white"
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setViewer((v) => ((v ?? 0) + 1) % images.length)}
                  className="absolute right-3 rounded-full bg-white/10 p-2 text-white"
                >
                  <ChevronRight />
                </button>
              </>
            )}
          </div>
          <p className="py-6 text-center text-white">
            {viewer + 1} of {images.length}
          </p>
        </div>
      )}

      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onClose={() => setFeedback((f) => ({ ...f, visible: false }))}
      />

      <TokenSelectionModal
        visible={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onConfirm={handlePlaceBid}
        title={onChainPrice ? "Confirm Purchase" : "Place Blockchain Bid"}
        description={
          onChainPrice
            ? `Paying the exact listed price for "${raw.title}". Select a stablecoin to pay with.`
            : `You are placing a negotiable bid on "${raw.title}". Select a stablecoin to pay with.`
        }
        onChainAmount={onChainPrice || undefined}
        nairaAmount={onChainPrice ? undefined : offerNaira}
        actionLabel={isPlacingBid ? "Processing..." : onChainPrice ? "Confirm Payment" : "Place Bid"}
        isLoading={isPlacingBid}
      />
    </div>
  );
}

const TONES = {
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  red: "border-red-200 bg-red-50 text-red-800",
  green: "border-green-200 bg-green-50 text-green-800",
  gray: "border-gray-200 bg-gray-50 text-gray-700",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
} as const;

function Notice({ tone, title, children }: { tone: keyof typeof TONES; title: string; children: React.ReactNode }) {
  return (
    <div className={`mt-2 rounded-lg border p-3 ${TONES[tone]}`}>
      <p className="mb-1 text-[13px] font-medium">{title}</p>
      <p className="text-xs leading-5 opacity-90">{children}</p>
    </div>
  );
}

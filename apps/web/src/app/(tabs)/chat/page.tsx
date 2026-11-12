"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Flag, List, MoreVertical, Send, User } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import BackLink from "@/components/ui/BackLink";
import Spinner from "@/components/ui/Spinner";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import ProfileVisibilityCard from "@/components/common/ProfileVisibilityCard";
import PriceDisplay from "@/components/property/PriceDisplay";
import { OfferMessageCard, OfferResponseCard } from "@/components/chat/OfferCards";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import type { AgentFeed, ChatMessageSchema, PropertyShow } from "@/services/api";
import { parseOfferMessage, parseOfferResponseMessage } from "@/types/offer";
import { buildSafeProfile, sanitizeAgentProfile } from "@/utilities/profileSanitizer";
import { transactionsRouteFor } from "@/utilities/transactionsRoute";
import getFullImageUrl from "@/utilities/imageUrl";
import { getQueryParam, toWebPath } from "@/lib/navigation";
import { SUPPORT_EMAIL } from "@/config/support";

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function Chat() {
  const router = useRouter();
  const { isSeller: isSellerMode } = useMode();
  const {
    getPropertyById,
    getAgentProfile,
    getMessageHistory,
    sendMessage,
    user,
    wsMessages,
    wsStatus,
    connectWebSocket,
    sendWsMessage,
    clearWsMessages,
    markMessagesAsRead,
    onlineUserIds,
    typingUntil,
    wsConnections,
    sendTyping,
    requestPresence,
  } = useApi();

  const [propertyId, setPropertyId] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [agentName, setAgentName] = useState("");
  useEffect(() => {
    setPropertyId(getQueryParam("id") ?? "");
    setReceiverId(getQueryParam("receiverId") ?? "");
    setAgentName(getQueryParam("agentName") ?? "");
  }, []);

  const [property, setProperty] = useState<PropertyShow | null>(null);
  const [agent, setAgent] = useState<AgentFeed | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ChatMessageSchema[]>([]);
  const [menu, setMenu] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ visible: false, type: "info", title: "" });
  const close = () => setFeedback((f) => ({ ...f, visible: false }));
  const bottom = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);

  // Seller here means "listed this property", not the mode the app is in.
  const isSellerHere = useMemo(
    () => (property?.agent_id != null && user?.id != null ? Number(property.agent_id) === Number(user.id) : isSellerMode),
    [property?.agent_id, user?.id, isSellerMode]
  );
  const otherRole = isSellerHere ? "Buyer" : "Seller";

  // The other person: who this thread is with.
  const partnerId = Number(receiverId) || Number(property?.agent_id) || 0;
  const partnerOnline = !!partnerId && onlineUserIds.includes(partnerId);

  // "typing..." lasts until the time the server last told us, so re-render
  // once a second while it is showing.
  const [now, setNow] = useState(() => Date.now());
  const partnerTyping = !!partnerId && (typingUntil[partnerId] ?? 0) > now;
  useEffect(() => {
    if (!partnerTyping) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [partnerTyping]);
  useEffect(() => {
    setNow(Date.now());
  }, [typingUntil]);

  // Ask whether they are online whenever the connection (re)opens.
  useEffect(() => {
    if (partnerId && wsStatus === "connected") requestPresence([partnerId]);
  }, [partnerId, wsStatus, wsConnections, requestPresence]);

  // Online and typing describe the other person (from the chat server), not
  // whether our own connection is up, which is what this used to show.
  const statusLabel = partnerTyping
    ? "typing..."
    : wsStatus !== "connected"
      ? wsStatus === "connecting" ? "Connecting..." : "Reconnecting..."
      : partnerOnline ? "Online" : "Offline";
  const profile = useMemo(() => {
    const base = agent
      ? sanitizeAgentProfile(agent, isSellerHere ? "buyer" : "agent")
      : buildSafeProfile({
          displayName: agentName || (isSellerHere ? "Buyer" : "Agent"),
          isOnline: partnerOnline,
          lastSeenLabel: statusLabel,
          role: isSellerHere ? "buyer" : "agent",
        });
    return { ...base, isOnline: partnerOnline, lastSeenLabel: statusLabel };
  }, [agent, agentName, isSellerHere, partnerOnline, statusLabel]);

  const loadContext = useCallback(async () => {
    try {
      if (propertyId) {
        const data = await getPropertyById(Number(propertyId));
        setProperty(data);
        const agentId = data.agent_id || (data as any).userId;
        if (agentId) setAgent(await getAgentProfile(Number(agentId), { silent: true }));
      } else if (receiverId) {
        setAgent(await getAgentProfile(Number(receiverId), { silent: true }));
      }
    } catch {
      /* header falls back to the name passed in */
    }
  }, [propertyId, receiverId, getPropertyById, getAgentProfile]);

  const loadHistory = useCallback(async () => {
    const rId = Number(receiverId);
    if (!rId) return;
    try {
      const h = await getMessageHistory(rId);
      if (h) setHistory(h);
    } catch {
      /* live messages still arrive */
    }
  }, [receiverId, getMessageHistory]);

  useEffect(() => {
    if (!receiverId && !propertyId) return;
    loadContext();
    loadHistory();
    connectWebSocket();
    return () => clearWsMessages();
  }, [receiverId, propertyId, loadContext, loadHistory, connectWebSocket, clearWsMessages]);

  // After a reconnect, fetch the thread again: anything sent while the
  // connection was down was never pushed to this tab.
  const seenConnections = useRef(wsConnections);
  useEffect(() => {
    if (wsConnections > seenConnections.current) {
      seenConnections.current = wsConnections;
      loadHistory();
    }
  }, [wsConnections, loadHistory]);

  // Opening the thread, and anything new arriving in it, marks it read.
  useEffect(() => {
    const rId = Number(receiverId);
    if (rId && user?.id) markMessagesAsRead(rId).catch(() => {});
  }, [receiverId, user?.id, markMessagesAsRead]);
  useEffect(() => {
    const rId = Number(receiverId);
    if (!rId || !user?.id) return;
    if (wsMessages.some((m) => Number(m.sender_id) === rId && Number(m.receiver_id) === Number(user.id))) {
      markMessagesAsRead(rId).catch(() => {});
    }
  }, [wsMessages, receiverId, user?.id, markMessagesAsRead]);

  const messages = useMemo(() => {
    const rId = Number(receiverId);
    const live = wsMessages.filter(
      (m) => (m.sender_id === user?.id && m.receiver_id === rId) || (m.sender_id === rId && m.receiver_id === user?.id)
    );
    const unique = new Map<string, ChatMessageSchema>();
    // Key by id when the server gave one; otherwise by sender, text and the
    // time to the nearest 10s. Keying on the text alone collapsed repeated
    // messages ("ok", "ok") into one.
    const keyOf = (m: ChatMessageSchema) =>
      (m as any).id != null
        ? `id:${(m as any).id}`
        : `${m.sender_id}-${m.receiver_id}-${m.message}-${Math.round(new Date(m.timestamp || 0).getTime() / 10000)}`;
    for (const m of [...history, ...live]) {
      const k = keyOf(m);
      // A live copy without an id duplicates a stored one with an id.
      const twin = [...unique.entries()].find(([key, v]) => key.startsWith("id:") !== k.startsWith("id:") && v.sender_id === m.sender_id && v.message === m.message && Math.abs(new Date(v.timestamp || 0).getTime() - new Date(m.timestamp || 0).getTime()) < 15000);
      if (twin) continue;
      unique.set(k, m);
    }
    return [...unique.values()].sort(
      (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
  }, [history, wsMessages, receiverId, user?.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !user) return;
    const rId = Number(receiverId) || property?.agent_id;
    if (!rId) return;
    const text = message.trim();
    setMessage("");
    setSending(true);
    try {
      const data: ChatMessageSchema = {
        sender_id: user.id,
        receiver_id: rId,
        message: text,
        property_id: property?.id ? Number(property.id) : undefined,
      };
      // Live socket when connected; HTTP otherwise.
      const sent = wsStatus === "connected" ? sendWsMessage(data) : false;
      if (!sent) {
        await sendMessage(data);
        loadHistory();
      }
    } catch {
      setMessage(text);
      setFeedback({ visible: true, type: "error", title: "Not sent", message: "Your message couldn't be sent. Please try again." });
    } finally {
      setSending(false);
    }
  };

  const historyHref = toWebPath(transactionsRouteFor(isSellerMode));
  const label = agentName || profile.displayName || `this ${otherRole.toLowerCase()}`;

  const showListings = async () => {
    setMenu(false);
    if (!receiverId) return;
    try {
      const a = await getAgentProfile(Number(receiverId), { silent: true });
      if (a?.listings?.length) router.push(`/details/${a.listings[0].id}`);
      else setFeedback({ visible: true, type: "info", title: "No Listings", message: `${label} has no active listings at the moment.` });
    } catch {
      setFeedback({ visible: true, type: "error", title: "Error", message: `Could not load ${otherRole.toLowerCase()} listings. Please try again.` });
    }
  };

  const report = () => {
    setMenu(false);
    setFeedback({
      visible: true,
      type: "warning",
      title: `Report ${otherRole}`,
      message: `Report ${label}? Your email app will open with the details filled in for our support team.`,
      actionLabel: "Report via Email",
      onAction: () => {
        close();
        const subject = encodeURIComponent(`Report: User ${receiverId || "unknown"} (${label})`);
        const body = encodeURIComponent(
          `Hi Sheda Support,\n\nI would like to report the following user:\n\nUser ID: ${receiverId || "N/A"}\nName: ${label}\nProperty ID: ${
            propertyId || "N/A"
          }\n\nReason for report:\n[Please describe the issue here]\n\nThank you.`
        );
        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
      },
    });
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col md:h-dvh">
      <header className="relative flex items-center border-b border-borderColor px-2 py-1">
        <BackLink fallback="/inbox" />
        <div className="min-w-0 flex-1">
          <ProfileVisibilityCard profile={profile} variant="chat" />
        </div>
        <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Conversation options" aria-expanded={menu} className="rounded-lg p-2 hover:bg-cardBackground">
          <MoreVertical size={20} />
        </button>
        {menu && (
          <div className="absolute right-3 top-14 z-20 overflow-hidden rounded-xl border border-borderColor bg-white shadow-lg">
            <Link
              href={`/user-profile?${new URLSearchParams({ userId: receiverId, name: label }).toString()}`}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-cardBackground"
            >
              <User size={18} /> View {otherRole}
            </Link>
            <button type="button" onClick={showListings} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-cardBackground">
              <List size={18} /> Show listings from this {otherRole.toLowerCase()}
            </button>
            <button type="button" onClick={report} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-700 hover:bg-cardBackground">
              <Flag size={18} /> Report this {otherRole.toLowerCase()}
            </button>
          </div>
        )}
      </header>

      {property && (
        <Link href={`/details/${property.id}`} className="flex items-center gap-3 border-b border-borderColor bg-gray-50 px-5 py-2.5 hover:bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={property.images?.[0]?.image_url ? getFullImageUrl(property.images[0].image_url) : "/images/apt-1.png"}
            alt=""
            className="h-11 w-11 rounded-lg object-cover"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{property.title}</span>
            <PriceDisplay
              amountFiat={parseFloat(String(property.price).replace(/[^0-9.-]/g, "")) || 0}
              fiatCode={(property as any).price_currency || "NGN"}
              suffix={property.listing_type === "rent" ? "/year" : ""}
              size="sm"
              showUsd={false}
            />
          </span>
        </Link>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <p className="mt-10 px-10 text-center italic text-secondaryText">No messages yet. Send a message to start the conversation.</p>
        ) : (
          messages.map((m, i) => {
            const offer = parseOfferMessage(m.message);
            if (offer) return <OfferMessageCard key={i} offer={offer} isSeller={isSellerHere} historyHref={historyHref} />;
            const response = parseOfferResponseMessage(m.message);
            if (response) return <OfferResponseCard key={i} response={response} isSeller={isSellerHere} />;
            const mine = m.sender_id === user?.id;
            return (
              <div key={i} className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-gray-100 text-black"}`}>
                  <p className="whitespace-pre-wrap break-words text-sm">{m.message}</p>
                  {m.timestamp && (
                    <p className={`mt-1 text-right text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-borderColor bg-white p-3">
        <label htmlFor="msg" className="sr-only">
          Message
        </label>
        <input
          id="msg"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            // Let them know, at most every 2.5s.
            const t = Date.now();
            if (partnerId && e.target.value && t - lastTypingSent.current > 2500) {
              lastTypingSent.current = t;
              sendTyping(partnerId);
            }
          }}
          placeholder="Write a message..."
          autoComplete="off"
          className="h-11 flex-1 rounded-xl border border-borderColor px-3 focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          aria-label="Send"
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-50"
        >
          {sending ? <Spinner size={18} className="text-white" /> : <Send size={18} />}
        </button>
      </form>

      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        actionLabel={feedback.actionLabel}
        onAction={feedback.onAction}
        onClose={close}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <AuthGuard requireAuth>
      <Chat />
    </AuthGuard>
  );
}

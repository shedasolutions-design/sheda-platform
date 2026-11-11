"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import FeedbackModal from "@/components/ui/FeedbackModal";
import Avatar from "@/components/common/Avatar";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { LIST_CACHE_SCOPES, readCachedList, writeCachedList } from "@/services/listCache";
import { parseOfferMessage, parseOfferResponseMessage } from "@/types/offer";

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
}

const order = (list: Conversation[]) =>
  [...list].sort(
    (a, b) =>
      (b.unread_count || 0) - (a.unread_count || 0) ||
      new Date(b.last_message_timestamp || 0).getTime() - new Date(a.last_message_timestamp || 0).getTime()
  );

/** Offer and response messages are JSON; show them as a sentence. */
function preview(message: string): string {
  const offer = parseOfferMessage(message);
  if (offer) return `Offer: ${offer.offeredPrice.toFixed(2)} on "${offer.propertyTitle}"`;
  const response = parseOfferResponseMessage(message);
  if (response) return `Offer ${response.status === "accepted" ? "accepted" : "rejected"} on "${response.propertyTitle}"`;
  return message;
}

function Inbox() {
  const router = useRouter();
  const { getConversations, isLoading, error, user, conversationsVersion } = useApi();
  const { mode, setModeExplicitly } = useMode();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [switchTo, setSwitchTo] = useState<Conversation | null>(null);

  // Paint the last list at once, then refresh underneath.
  useEffect(() => {
    let cancelled = false;
    readCachedList<Conversation>(LIST_CACHE_SCOPES.conversations, user?.id).then((cached) => {
      if (!cancelled && cached?.length) setConversations((prev) => (prev.length ? prev : cached));
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      if (Array.isArray(data)) {
        const sorted = order(data as Conversation[]);
        setConversations(sorted);
        writeCachedList(LIST_CACHE_SCOPES.conversations, user?.id, sorted);
      }
    } catch {
      /* shown below if nothing is cached */
    } finally {
      setLoaded(true);
    }
  }, [getConversations, user?.id]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, conversationsVersion]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      [c.other_user_fullname, c.other_user_name, c.property_title, preview(c.last_message)]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [conversations, query]);

  // Unread split by profile, for a badge that counts both.
  const unread = conversations.reduce(
    (acc, c) => {
      if (c.as_profile && c.unread_count > 0) acc[c.as_profile] += c.unread_count;
      return acc;
    },
    { buyer: 0, seller: 0 }
  );

  const chatHref = (c: Conversation) =>
    `/chat?${new URLSearchParams({
      id: String(c.property_id ?? ""),
      receiverId: String(c.other_user_id ?? ""),
      agentName: c.other_user_fullname || c.other_user_name || "User",
    }).toString()}`;

  // A thread on the other profile: switch first, so the reply comes from the right account.
  const open = (c: Conversation) => (!c.as_profile || c.as_profile === mode ? router.push(chatHref(c)) : setSwitchTo(c));

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-5">
      <h1 className="mb-3 text-lg font-semibold">Messages</h1>
      <label className="relative mb-3 block">
        <span className="sr-only">Search messages</span>
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A0A0]" />
        <input
          type="search"
          placeholder="Search message"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-xl border border-borderColor pl-10 pr-3 focus:border-primary focus:outline-none"
        />
      </label>

      {isLoading && !loaded && conversations.length === 0 ? (
        <LoadingState message="Loading messages..." />
      ) : error && conversations.length === 0 ? (
        <ErrorState message={error} onRetry={fetchConversations} />
      ) : shown.length === 0 ? (
        <EmptyState title={query ? "No matching conversations" : "No conversations yet"} />
      ) : (
        <>
          {unread.buyer + unread.seller > 0 && (
            <p className="px-1 pb-2 text-xs text-secondaryText">
              {unread.buyer + unread.seller} unread ·{" "}
              {[unread.seller > 0 && `${unread.seller} as seller`, unread.buyer > 0 && `${unread.buyer} as buyer`].filter(Boolean).join(" · ")}
            </p>
          )}
          <ul className="divide-y divide-borderColor/60">
            {shown.map((c) => {
              const name = c.other_user_fullname || c.other_user_name || "User";
              const hasUnread = c.unread_count > 0;
              return (
                <li key={`${c.as_profile ?? "single"}-${c.property_id}-${c.other_user_id}`}>
                  <button type="button" onClick={() => open(c)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-cardBackground">
                    <Avatar url={c.other_user_avatar_url} name={name} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{name}</span>
                        {c.as_profile && (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${c.as_profile === "seller" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                            {c.as_profile === "seller" ? "As seller" : "As buyer"}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-secondaryText">{c.property_title || `Property ID: ${c.property_id}`}</span>
                      <span className={`block truncate text-sm ${hasUnread ? "font-medium text-primaryText" : "text-secondaryText"}`}>{preview(c.last_message)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-secondaryText">
                        {c.last_message_timestamp
                          ? new Date(c.last_message_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : ""}
                      </span>
                      {hasUnread && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                          {c.unread_count > 99 ? "99+" : c.unread_count}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <FeedbackModal
        isVisible={!!switchTo}
        type="info"
        title={`Switch to ${switchTo?.as_profile === "seller" ? "Seller" : "Buyer"}?`}
        message={`This conversation is on your ${switchTo?.as_profile} profile. Switch so your reply comes from the right account.`}
        actionLabel={`Switch to ${switchTo?.as_profile === "seller" ? "Seller" : "Buyer"}`}
        onAction={async () => {
          const c = switchTo!;
          setSwitchTo(null);
          try {
            await setModeExplicitly(c.as_profile!);
            router.push(chatHref(c));
          } catch {
            /* stay; the mode toggle reports its own errors */
          }
        }}
        onClose={() => setSwitchTo(null)}
      />
    </div>
  );
}

export default function InboxPage() {
  return (
    <AuthGuard requireAuth>
      <Inbox />
    </AuthGuard>
  );
}

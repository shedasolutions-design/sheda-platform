"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, X } from "lucide-react";
import { useApi } from "@/contexts/ApiContext";
import { chatPreview } from "./dealUpdate";

interface Popup {
  key: number;
  senderId: number;
  senderName: string;
  propertyId?: number;
  text: string;
}

/**
 * A pop-up for a message that arrives while you are anywhere but that
 * conversation. Live messages only raised the Inbox badge, so a buyer could
 * miss the seller's reply for as long as they stayed on another page.
 */
export default function MessagePopup() {
  const router = useRouter();
  const { wsMessages, user } = useApi();
  const [popup, setPopup] = useState<Popup | null>(null);
  // The newest message already accounted for. Position alone won't do: the
  // list is capped at 200, so its length stops changing.
  const lastSeen = useRef<unknown>(undefined);
  const started = useRef(false);

  useEffect(() => {
    // Only messages that arrive from now on: what was already there when
    // this mounted must not pop up again.
    if (!started.current) {
      started.current = true;
      lastSeen.current = wsMessages[wsMessages.length - 1];
      return;
    }
    const from = lastSeen.current === undefined ? 0 : wsMessages.lastIndexOf(lastSeen.current as (typeof wsMessages)[number]) + 1;
    const fresh = wsMessages.slice(from);
    lastSeen.current = wsMessages[wsMessages.length - 1];
    const incoming = fresh.filter((m) => m.sender_id != null && m.sender_id !== user?.id);
    const last = incoming[incoming.length - 1];
    if (!last) return;

    // Already reading this conversation: the thread shows it.
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === "/chat" && params.get("receiverId") === String(last.sender_id)) return;

    setPopup({
      key: Date.now(),
      senderId: Number(last.sender_id),
      senderName: last.sender_name || "New message",
      propertyId: last.property_id,
      text: chatPreview(last.message),
    });
  }, [wsMessages, user?.id]);

  useEffect(() => {
    if (!popup) return;
    const t = setTimeout(() => setPopup(null), 7000);
    return () => clearTimeout(t);
  }, [popup]);

  if (!popup) return null;

  const open = () => {
    const query = new URLSearchParams({
      id: String(popup.propertyId ?? ""),
      receiverId: String(popup.senderId),
      agentName: popup.senderName,
    });
    setPopup(null);
    router.push(`/chat?${query.toString()}`);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-borderColor bg-white p-3 shadow-lg">
        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primaryLight text-primary">
            <MessageSquareText size={16} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-primaryText">{popup.senderName}</span>
            <span className="block truncate text-sm text-secondaryText">{popup.text}</span>
          </span>
        </button>
        <button type="button" aria-label="Dismiss" onClick={() => setPopup(null)} className="rounded-full p-1 text-secondaryText hover:bg-gray-100">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

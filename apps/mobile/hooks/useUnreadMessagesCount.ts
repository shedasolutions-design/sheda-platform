import { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "@/contexts/ApiContext";

const POLL_INTERVAL_MS = 45_000;

/**
 * Total unread message count across all conversations — backs the badge on
 * the Inbox tab, the same way NotificationContext's unreadCount backs the
 * notification bell. The backend already tracks unread state per
 * conversation (GET /api/v1/chat/conversations -> unread_count), so this
 * just sums it rather than re-deriving read/unread client-side.
 *
 * Refetches on a fallback interval, and immediately whenever a new
 * WebSocket message arrives — a real-time chat message won't wait 45s to
 * show up in the badge.
 */
export function useUnreadMessagesCount(): number {
  const { user, getConversations, wsMessages, conversationsVersion } = useApi();
  const [count, setCount] = useState(0);
  // Chat screens call clearWsMessages() on unmount (to avoid leaking one
  // conversation's live buffer into the next), which resets wsMessages back
  // to []. A length-comparison trigger would break across that reset — after
  // a clear, the array can sit below its old high-water mark for a while and
  // never fire again. React to the array *reference* changing instead
  // (mirrors NotificationContext's own wsMessages effect), and just skip the
  // very first run so it doesn't duplicate the mount-time refresh below.
  const isFirstWsRunRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getConversations();
      if (Array.isArray(data)) {
        const total = data.reduce(
          (sum: number, c: any) => sum + (c?.unread_count || 0),
          0
        );
        setCount(total);
      }
    } catch {
      // Non-fatal — badge just keeps its last known value.
    }
  }, [getConversations]);

  useEffect(() => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // conversationsVersion is bumped by markMessagesAsRead, so opening a chat
    // clears this badge immediately instead of after the next poll tick.
  }, [user?.id, refresh, conversationsVersion]);

  // Any WebSocket message activity (new message, or a conversation view
  // clearing its buffer) means conversations may have changed; re-sum
  // immediately rather than waiting for the next poll tick.
  useEffect(() => {
    if (isFirstWsRunRef.current) {
      isFirstWsRunRef.current = false;
      return;
    }
    refresh();
  }, [wsMessages, refresh]);

  return count;
}

export default useUnreadMessagesCount;

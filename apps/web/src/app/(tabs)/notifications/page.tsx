"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import { useMode } from "@/contexts/ModeContext";
import { NOTIFICATION_META, useNotifications, type AppNotification } from "@/contexts/NotificationContext";
import { isTransactionsRoute, transactionsRouteFor } from "@/utilities/transactionsRoute";
import { toWebPath } from "@/lib/navigation";

function timeAgo(dateStr: string): string {
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(dateStr).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Notifications() {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, refreshNotifications } = useNotifications();
  const { isSeller } = useMode();

  useEffect(() => {
    refreshNotifications().catch?.(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (n: AppNotification) => {
    markAsRead(n.id);
    if (!n.route) return;
    // "Your deals" means History for a buyer and Activities for a seller.
    const route = isTransactionsRoute(n.route) ? transactionsRouteFor(isSeller) : n.route;
    router.push(toWebPath(route, n.routeParams as Record<string, unknown> | undefined));
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          unreadCount > 0 ? (
            <button type="button" onClick={markAllAsRead} className="px-2 text-[13px] font-medium text-primary hover:underline">
              Mark all read
            </button>
          ) : undefined
        }
      />
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-4">
        {unreadCount > 0 && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-center text-xs font-medium text-red-800">
            You have {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </p>
        )}

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="mb-3 text-4xl" aria-hidden="true">
              🔔
            </span>
            <p className="font-semibold text-gray-700">No notifications yet</p>
            <p className="mt-1 max-w-xs text-[13px] text-gray-400">
              You&apos;ll see notifications here when there are updates on your bids, appointments, and transactions.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {notifications.map((n) => {
              const meta = NOTIFICATION_META[n.type];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className="relative flex w-full gap-3 rounded-xl border p-3.5 text-left transition hover:brightness-[0.98]"
                    style={{
                      backgroundColor: n.read ? "#FFFFFF" : meta?.bgColor,
                      borderColor: n.read ? "#F3F4F6" : meta?.bgColor,
                    }}
                  >
                    <span
                      className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-lg ${n.read ? "bg-gray-100" : "bg-white"}`}
                      aria-hidden="true"
                    >
                      {meta?.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-[13px] font-semibold ${n.read ? "text-gray-500" : "text-gray-800"}`}>{n.title}</span>
                        <span className="shrink-0 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                      </span>
                      <span className={`mt-0.5 line-clamp-2 block text-xs leading-[18px] ${n.read ? "text-gray-400" : "text-gray-600"}`}>
                        {n.message}
                      </span>
                    </span>
                    {!n.read && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {notifications.length > 5 && (
          <button type="button" onClick={clearAll} className="mx-auto mt-4 block py-3 text-[13px] text-gray-400 hover:text-gray-600">
            Clear all notifications
          </button>
        )}
      </div>
    </>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard requireAuth>
      <Notifications />
    </AuthGuard>
  );
}

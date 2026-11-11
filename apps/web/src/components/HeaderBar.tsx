"use client";

import Link from "next/link";
import { Bell, Search, SlidersHorizontal, User } from "lucide-react";
import { useApi } from "@/contexts/ApiContext";
import { useNotifications } from "@/contexts/NotificationContext";

const iconBtn =
  "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-borderColor hover:bg-cardBackground";

/** Profile, search, notifications and filters: the bar above the home feed. */
export default function HeaderBar() {
  const { searchQuery, setSearchQuery } = useApi();
  const { unreadCount } = useNotifications();

  return (
    <div className="flex h-12 items-center gap-2">
      <Link href="/profile" aria-label="Go to profile" className={iconBtn}>
        <User size={18} />
      </Link>
      <label className="relative h-full flex-1">
        <span className="sr-only">Search properties</span>
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondaryText" />
        <input
          type="search"
          placeholder="Search Property..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-full w-full rounded-lg border border-borderColor pl-10 pr-3 focus:border-primary focus:outline-none"
        />
      </label>
      <Link href="/notifications" aria-label="View notifications" className={iconBtn}>
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-primary px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>
      <Link href="/filter" aria-label="Filter properties" className={iconBtn}>
        <SlidersHorizontal size={16} />
      </Link>
    </div>
  );
}

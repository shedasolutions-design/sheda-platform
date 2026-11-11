"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Building2,
  ClipboardList,
  Heart,
  History,
  Home,
  ListPlus,
  MessageSquareText,
  Wallet,
} from "lucide-react";
import { useMode } from "@/contexts/ModeContext";
import useUnreadMessagesCount from "@/hooks/useUnreadMessagesCount";
import useUnattendedCount from "@/hooks/useUnattendedCount";
import BackupReminder from "./BackupReminder";

interface Tab {
  href: string;
  label: string;
  icon: typeof Home;
  badge?: number;
}

/**
 * The tab bar from the mobile app, as a sidebar on wide screens and a bottom
 * bar on narrow ones. Buyers and sellers see different tabs, exactly as on
 * mobile: Saved and History for buyers, Activities and List for sellers.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isSeller } = useMode();
  const unreadMessages = useUnreadMessagesCount();
  const unattended = useUnattendedCount();

  const tabs: Tab[] = [
    { href: "/home", label: "Home", icon: Home },
    ...(isSeller
      ? [
          { href: "/activity", label: "Activities", icon: ClipboardList, badge: unattended },
          { href: "/list", label: "List", icon: ListPlus },
        ]
      : [
          { href: "/saved", label: "Saved", icon: Heart },
          { href: "/history", label: "History", icon: History, badge: unattended },
        ]),
    { href: "/inbox", label: "Inbox", icon: MessageSquareText, badge: unreadMessages },
    { href: "/invest", label: "Invest", icon: Building2 },
    { href: "/wallet", label: "Portfolio", icon: Wallet },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar, md and up */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-borderColor/70 bg-white px-3 py-5 md:flex"
      >
        <Link href="/home" className="mb-8 px-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/sheda-logo.png" alt="Sheda" className="h-8 w-auto" />
        </Link>
        <ul className="flex flex-col gap-1">
          {tabs.map(({ href, label, icon: Icon, badge }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-manrope text-sm font-medium transition-colors ${
                    active ? "bg-active text-primary" : "text-primaryText hover:bg-cardBackground"
                  }`}
                >
                  <Icon size={20} />
                  <span className="flex-1">{label}</span>
                  {!!badge && badge > 0 && <Badge count={badge} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <BackupReminder />
        {children}
      </main>

      {/* Bottom bar, below md */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-[#e0e0e0] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex">
          {tabs.map(({ href, label, icon: Icon, badge }) => {
            const active = isActive(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 py-2 font-manrope text-[11px] font-medium ${
                    active ? "text-primary" : "text-primaryText"
                  }`}
                >
                  <span className="relative">
                    <Icon size={22} />
                    {!!badge && badge > 0 && (
                      <span className="absolute -right-2.5 -top-1.5">
                        <Badge count={badge} />
                      </span>
                    )}
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

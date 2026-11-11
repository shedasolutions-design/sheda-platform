"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, CalendarClock, HelpCircle, LogOut, MessageSquare, Settings } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import Avatar from "@/components/common/Avatar";
import MenuList, { type MenuItem } from "@/components/common/MenuList";
import { useMode } from "@/contexts/ModeContext";
import { useAuth } from "@/hooks/useShedaApi";
import { useApi } from "@/contexts/ApiContext";

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function Profile() {
  const { toggleMode, isSeller } = useMode();
  const { logout } = useAuth();
  const { user, getMe, isLoading } = useApi();
  const [feedback, setFeedback] = useState<Feedback>({ visible: false, type: "info", title: "" });
  const close = () => setFeedback((f) => ({ ...f, visible: false }));

  // Fresh profile each visit (a name or photo may have just changed).
  useEffect(() => {
    const c = new AbortController();
    getMe({ signal: c.signal, silent: true }).catch(() => {});
    return () => c.abort();
  }, [getMe]);

  const switchMode = () => {
    const target = isSeller ? "buyer" : "seller";
    setFeedback({
      visible: true,
      type: "warning",
      title: "Switch View",
      message: `Switch to the ${isSeller ? "buying" : "selling"} view?`,
      actionLabel: "Switch",
      onAction: async () => {
        setFeedback({ visible: true, type: "loading", title: "Switching Mode", message: "Please wait a moment..." });
        try {
          await toggleMode();
          setFeedback({ visible: true, type: "success", title: "Success", message: `Switched to ${target} view.` });
        } catch (error: any) {
          setFeedback({ visible: true, type: "error", title: "Error", message: error?.message || `Failed to switch to ${target} view.` });
        }
      },
    });
  };

  const confirmLogout = () =>
    setFeedback({
      visible: true,
      type: "warning",
      title: "Logout",
      message: "Are you sure you want to logout?",
      actionLabel: "Logout",
      onAction: async () => {
        setFeedback({ visible: true, type: "loading", title: "Logging out...", message: "Please wait while we log you out." });
        try {
          await logout({ loading: false });
          window.location.assign("/");
        } catch (error: any) {
          setFeedback({ visible: true, type: "error", title: "Error", message: error?.message || "Failed to logout. Please try again." });
        }
      },
    });

  const items: MenuItem[] = [
    { key: "settings", icon: Settings, label: "Settings", href: "/profile-setting" },
    ...(isSeller ? [{ key: "hours", icon: CalendarClock, label: "Viewing Hours", href: "/availability" }] : []),
    { key: "help", icon: HelpCircle, label: "Help", href: "/support" },
    { key: "feedback", icon: MessageSquare, label: "Feedback", href: "/support-feedback" },
    { key: "logout", icon: LogOut, label: "Logout", onClick: confirmLogout, chevron: false, danger: true },
  ];

  const name = user?.fullname || user?.username;
  return (
    <>
      <PageHeader title="My Profile" />
      <div className="mx-auto max-w-2xl pb-10">
        <div className="flex flex-col items-center px-5 py-6 text-center">
          <Avatar url={user?.avatar_url} name={name} />
          <div className="mt-4 flex items-center gap-1.5">
            <h2 className="text-xl font-semibold text-gray-900">{isLoading && !user ? "Loading..." : name || "Set your name"}</h2>
            {user?.verified && <BadgeCheck size={18} className="text-primary" aria-label="Verified" />}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${isSeller ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
              {isSeller ? "Selling" : "Buying"}
            </span>
            {user?.location && <span className="text-[13px] text-gray-500">{user.location}</span>}
          </div>
          <Link href="/personal-info" className="mt-2.5 rounded-2xl border border-gray-200 px-4 py-1.5 text-[13px] text-gray-700 hover:bg-cardBackground">
            Edit Profile
          </Link>
          <Button className="mt-4" onClick={switchMode} disabled={feedback.type === "loading"}>
            {isSeller ? "Switch to buying view" : "Switch to selling view"}
          </Button>
        </div>
        <MenuList items={items} />
      </div>

      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        actionLabel={feedback.actionLabel}
        onAction={feedback.onAction}
        onClose={close}
      />
    </>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard requireAuth>
      <Profile />
    </AuthGuard>
  );
}

"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import { useNotifications } from "@/contexts/NotificationContext";

type Key = "allowMessages" | "pushNotifications" | "emailNotifications" | "smsNotifications";

/**
 * Every switch here now does what it says. They used to be saved in this
 * browser only, and three of the four were read by nothing. Settings are kept
 * on the server, so they follow the person to every device.
 */
function NotificationSettings() {
  const { preferences, updatePreference, channels } = useNotifications();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const togglePush = async (on: boolean) => {
    if (!on) return updatePreference("pushNotifications", false);
    if (permission === "unsupported") return;
    // The browser has to agree before Sheda can show a notification.
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    updatePreference("pushNotifications", result === "granted");
  };

  const items: { id: Key; title: string; description: string; note?: string; disabled?: boolean; onChange?: (on: boolean) => void }[] = [
    {
      id: "allowMessages",
      title: "Message pop-ups",
      description: "Show a pop-up when a new chat message arrives while you are elsewhere in the app.",
    },
    {
      id: "pushNotifications",
      title: "Browser notifications",
      description:
        "Get a notification from your browser for new messages and deal updates while Sheda is open in another tab.",
      note:
        permission === "unsupported"
          ? "This browser does not support notifications."
          : permission === "denied"
            ? "Notifications are blocked for Sheda in your browser settings. Allow them there, then switch this on."
            : undefined,
      disabled: permission === "unsupported",
      onChange: togglePush,
    },
    {
      id: "emailNotifications",
      title: "Email notifications",
      description: "Get an email for each step of your deals: offers, viewings, agreements and payments.",
      note: channels.email ? undefined : "Email sending is not switched on for Sheda yet. Your choice is saved and applies once it is.",
    },
    {
      id: "smsNotifications",
      title: "SMS notifications",
      description: "Text messages for important deal alerts.",
      note: channels.sms ? undefined : "Not available yet.",
      disabled: !channels.sms,
    },
  ];

  return (
    <>
      <PageHeader title="Notification settings" fallback="/profile-setting" />
      <ul className="mx-auto max-w-2xl divide-y divide-borderColor/60 pt-3">
        {items.map((item) => {
          const on = !item.disabled && !!preferences[item.id];
          return (
            <li key={item.id}>
              <label
                className={`flex items-center justify-between gap-4 px-5 py-4 ${
                  item.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-cardBackground"
                }`}
              >
                <span>
                  <span className="block text-base">{item.title}</span>
                  <span className="mt-1 block text-xs text-secondaryText">{item.description}</span>
                  {item.note && <span className="mt-1 block text-xs text-amber-700">{item.note}</span>}
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={on}
                  disabled={item.disabled}
                  onChange={(e) => (item.onChange ? item.onChange(e.target.checked) : updatePreference(item.id, e.target.checked))}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
                    on ? "bg-primary" : "bg-[#E5E5E5]"
                  }`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function NotificationSettingsPage() {
  return (
    <AuthGuard requireAuth>
      <NotificationSettings />
    </AuthGuard>
  );
}

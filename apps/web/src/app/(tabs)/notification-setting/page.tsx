"use client";

import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import { useNotifications } from "@/contexts/NotificationContext";

const ITEMS = [
  { id: "allowMessages", title: "Allow Messages", description: "Receive in-app chat messages from buyers and sellers" },
  { id: "pushNotifications", title: "Push notifications", description: "Get notified about bids, payments, and transaction updates" },
  { id: "emailNotifications", title: "Email notifications", description: "Receive transaction summaries and updates via email" },
  { id: "smsNotifications", title: "SMS notifications", description: "Get critical alerts via text message" },
] as const;

function NotificationSettings() {
  const { preferences, updatePreference } = useNotifications();
  return (
    <>
      <PageHeader title="Notification settings" fallback="/profile-setting" />
      <ul className="mx-auto max-w-2xl divide-y divide-borderColor/60 pt-3">
        {ITEMS.map((item) => {
          const on = !!(preferences as any)[item.id];
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 hover:bg-cardBackground">
                <span>
                  <span className="block text-base">{item.title}</span>
                  <span className="mt-1 block text-xs text-secondaryText">{item.description}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={on}
                  onChange={(e) => updatePreference(item.id as any, e.target.checked)}
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

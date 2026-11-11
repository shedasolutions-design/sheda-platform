"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, KeyRound, Lock, Trash2, Unplug, User, Wallet } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import MenuList, { type MenuItem } from "@/components/common/MenuList";
import { useWallet } from "@/contexts/WalletContext";

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function Settings() {
  const { walletState, hasTransactionPin, promptTransactionPinSetup, promptTransactionPinChange, signOut: disconnectWallet } = useWallet();
  const accountId = walletState.account?.accountId;
  const [pinConfigured, setPinConfigured] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ visible: false, type: "info", title: "" });
  const close = () => setFeedback((f) => ({ ...f, visible: false }));
  const notify = (type: FeedbackType, title: string, message?: string) => setFeedback({ visible: true, type, title, message });

  const refreshPin = useCallback(() => {
    if (accountId) hasTransactionPin(accountId).then(setPinConfigured).catch(() => {});
  }, [accountId, hasTransactionPin]);
  useEffect(refreshPin, [refreshPin]);

  const handlePin = async () => {
    if (!accountId) return notify("info", "Wallet Required", "Connect a wallet to set up a transaction PIN.");
    const ok = pinConfigured ? await promptTransactionPinChange(accountId) : await promptTransactionPinSetup(accountId);
    if (ok) {
      notify("success", "Done", pinConfigured ? "Your transaction PIN was updated." : "Your transaction PIN is set up.");
      refreshPin();
    }
  };

  const handleDisconnect = () => {
    if (!walletState.isConnected) return notify("info", "No Wallet Connected", "There's no wallet connected to disconnect.");
    setFeedback({
      visible: true,
      type: "warning",
      title: "Disconnect Wallet",
      message: "This removes the wallet from this browser. You'll need to import it again (or create a new one) to reconnect.",
      actionLabel: "Disconnect",
      onAction: async () => {
        close();
        try {
          setDisconnecting(true);
          await disconnectWallet();
          notify("success", "Wallet Disconnected", "Your wallet has been disconnected from this browser.");
        } catch (err: any) {
          notify("error", "Error", err?.message || "Failed to disconnect wallet.");
        } finally {
          setDisconnecting(false);
        }
      },
    });
  };

  const items: MenuItem[] = [
    { key: "info", icon: User, label: "Profile Info", href: "/personal-info" },
    { key: "notifications", icon: Bell, label: "Notification settings", href: "/notification-setting" },
    { key: "recovery", icon: Wallet, label: "Wallet backup & recovery", href: "/wallet-recovery" },
    { key: "pin", icon: KeyRound, label: pinConfigured ? "Change transaction PIN" : "Set up transaction PIN", onClick: handlePin },
    { key: "password", icon: Lock, label: "Change password", href: "/change-password" },
    {
      key: "disconnect",
      icon: Unplug,
      label: disconnecting ? "Disconnecting..." : "Disconnect wallet",
      onClick: handleDisconnect,
      chevron: false,
      disabled: disconnecting,
    },
    { key: "delete", icon: Trash2, label: "Delete account", href: "/delete-account", danger: true },
  ];

  return (
    <>
      <PageHeader title="Settings" fallback="/profile" />
      <div className="mx-auto max-w-2xl pt-3">
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

export default function SettingsPage() {
  return (
    <AuthGuard requireAuth>
      <Settings />
    </AuthGuard>
  );
}

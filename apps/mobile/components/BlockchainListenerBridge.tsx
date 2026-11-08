/**
 * BlockchainListenerBridge
 *
 * A tiny component rendered inside BOTH WalletProvider and NotificationProvider
 * that wires the blockchain listener to the notification system.
 *
 * This exists because WalletProvider is nested inside NotificationProvider
 * (see app/_layout.tsx), so NotificationContext cannot directly access the
 * wallet state. This bridge component sits inside both providers and
 * connects them.
 */

import React from "react";
import { useWallet } from "../contexts/WalletContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useBlockchainListener } from "../hooks/useBlockchainListener";

export default function BlockchainListenerBridge(): null {
  const { walletState } = useWallet();
  const { addNotification, refreshNotifications } = useNotifications();

  const accountId = walletState.isConnected
    ? walletState.account?.accountId ?? null
    : null;

  useBlockchainListener({
    accountId,
    addNotification,
    refreshNotifications,
  });

  return null; // renders nothing
}

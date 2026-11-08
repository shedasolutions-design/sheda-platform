import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, ActivityIndicator } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import { router } from "expo-router";
import { useWallet } from "@/contexts/WalletContext";
import Button from "@/components/common/Button";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";

interface WalletDashboardProps {
  onSignOut?: () => void;
}

const WalletDashboard: React.FC<WalletDashboardProps> = ({ onSignOut }) => {
  const {
    walletState,
    getAccountBalance,
    sendTransaction,
    signOut,
    loading,
    readiness,
    hasLocalWallet,
    localWalletMetadata,
  } = useWallet();
  const [balance, setBalance] = useState<string>("0");
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("");
  // Distinct from context `loading`: this is specifically "the balance number
  // on screen is not trustworthy yet", which is what the skeleton reflects.
  const [balanceLoading, setBalanceLoading] = useState(true);
  // Per-action flags. Each gates only its own button, so a background refresh
  // can never make Send or Sign Out unclickable.
  const [sending, setSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (walletState.account?.accountId) {
      loadBalance();
    }
  }, [walletState.account]);

  const loadBalance = async () => {
    try {
      if (walletState.account?.accountId) {
        setBalanceLoading(true);
        const accountBalance = await getAccountBalance(
          walletState.account.accountId
        );
        setBalance(accountBalance);
      }
    } catch (error) {
      console.error("Failed to load balance:", error);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!receiverId.trim() || !amount.trim()) {
      Alert.alert("Error", "Please enter both receiver ID and amount");
      return;
    }

    if (!walletState.account?.accountId) {
      Alert.alert("Error", "No wallet connected");
      return;
    }

    try {
      setSending(true);
      const transactionHash = await sendTransaction(
        walletState.account.accountId,
        receiverId,
        amount
      );
      Alert.alert(
        "Transaction Successful!",
        `Transaction hash: ${transactionHash}`,
        [{ text: "OK", onPress: loadBalance }]
      );
      setReceiverId("");
      setAmount("");
    } catch (error) {
      Alert.alert("Error", "Failed to send transaction. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
      if (onSignOut) {
        onSignOut();
      }
    } catch (error) {
      Alert.alert("Error", "Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  };

  if (!walletState.isConnected || !walletState.account) {
    return (
      <View className="flex-1 justify-center items-center p-5">
        <InterSemiBold className="text-lg mb-2">
          No Wallet Connected
        </InterSemiBold>
        <InterRegular className="text-secondaryText text-center mb-4">
          {hasLocalWallet
            ? `Reconnecting to ${localWalletMetadata?.accountId}…`
            : "Please create or import a NEAR wallet to view your dashboard"}
        </InterRegular>
        <Button
          className="rounded-xl"
          onPress={() => router.push("/wallet-setup")}
        >
          <InterSemiBold className="text-white">Setup Wallet</InterSemiBold>
        </Button>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 p-5">
      <View className="bg-white rounded-lg p-5 mb-5 shadow-sm">
        <InterSemiBold className="text-lg mb-3">
          Wallet Information
        </InterSemiBold>

        <View className="mb-3">
          <InterRegular className="text-secondaryText text-sm">
            Account ID
          </InterRegular>
          <InterSemiBold className="text-base">
            {walletState.account.accountId}
          </InterSemiBold>
        </View>

        <View className="mb-3">
          <InterRegular className="text-secondaryText text-sm">
            Public Key
          </InterRegular>
          {walletState.account.publicKey ? (
            <InterSemiBold className="text-xs break-all">
              {walletState.account.publicKey}
            </InterSemiBold>
          ) : (
            <View className="h-4 w-48 bg-gray-200 rounded mt-1" />
          )}
        </View>

        <View className="mb-3">
          <InterRegular className="text-secondaryText text-sm">
            Balance
          </InterRegular>
          {/*
            Skeleton, not a zero. Rendering "0.00000 NEAR" while the balance is
            still in flight states something false about the user's funds; a
            placeholder bar says "not known yet", which is the truth.
          */}
          {balanceLoading ? (
            <View className="h-6 w-32 bg-gray-200 rounded mt-1" />
          ) : (
            <InterSemiBold className="text-lg text-green-600">
              {(parseFloat(balance) / 1e24).toFixed(5)} NEAR
            </InterSemiBold>
          )}
        </View>

        <Button
          className="rounded-xl border border-borderColor"
          color="transparent"
          onPress={loadBalance}
          disabled={balanceLoading}
        >
          <InterSemiBold className="text-primaryText">
            {balanceLoading ? "Refreshing..." : "Refresh Balance"}
          </InterSemiBold>
        </Button>
      </View>

      <View className="bg-white rounded-lg p-5 mb-5 shadow-sm">
        <InterSemiBold className="text-lg mb-3">Send Transaction</InterSemiBold>

        <View className="mb-3">
          <InterRegular className="text-secondaryText text-sm mb-1">
            Receiver Account ID
          </InterRegular>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            placeholder="Enter receiver account ID"
            value={receiverId}
            onChangeText={setReceiverId}
          />
        </View>

        <View className="mb-3">
          <InterRegular className="text-secondaryText text-sm mb-1">
            Amount (NEAR)
          </InterRegular>
          <TextInput
            className="border border-gray-300 rounded-lg p-3"
            placeholder="Enter amount in NEAR"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
        </View>

        <Button
          className="rounded-xl border border-borderColor"
          color="transparent"
          onPress={handleSendTransaction}
          disabled={sending || !receiverId.trim() || !amount.trim()}
        >
          <InterSemiBold className="text-primaryText">
            {sending ? "Sending..." : "Send Transaction"}
          </InterSemiBold>
        </Button>
      </View>

      <Button
        className="rounded-xl"
        onPress={handleSignOut}
        disabled={signingOut}
      >
        <InterSemiBold className="text-white">
          {signingOut ? "Signing Out..." : "Sign Out"}
        </InterSemiBold>
      </Button>
    </ScrollView>
  );
};

export default WalletDashboard;

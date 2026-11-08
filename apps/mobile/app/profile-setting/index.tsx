import React, { useEffect, useState, useCallback } from "react";
import { View, Text, SafeAreaView, TouchableOpacity } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import {
  PROFILE,
  NOTIFICATION,
  LOCK,
  BLACKBIN,
  CHEVRONRIGHT, WALLET,
} from "@/assets/icons";
import BackBtn from "@/components/common/BackBtn";
import Icon from "@/components/common/Icon";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import { router, useFocusEffect } from "expo-router";
import AuthGuard from "@/components/AuthGuard";
import { useWallet } from "@/contexts/WalletContext";

const ProfileSetting = () => {
  const { walletState, hasTransactionPin, promptTransactionPinSetup, promptTransactionPinChange, signOut: disconnectWallet } = useWallet();
  const accountId = walletState.account?.accountId;
  const [pinConfigured, setPinConfigured] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshPinState = useCallback(() => {
    if (accountId) {
      hasTransactionPin(accountId).then(setPinConfigured).catch(() => { });
    }
  }, [accountId, hasTransactionPin]);

  useFocusEffect(refreshPinState);

  const handleTransactionPin = async () => {
    if (!accountId) {
      Alert.alert("Wallet Required", "Connect a wallet to set up a transaction PIN.");
      return;
    }
    const success = pinConfigured
      ? await promptTransactionPinChange(accountId)
      : await promptTransactionPinSetup(accountId);
    if (success) {
      Alert.alert("Done", pinConfigured ? "Your transaction PIN was updated." : "Your transaction PIN is set up.");
      refreshPinState();
    }
  };

  const handleDisconnectWallet = () => {
    if (!walletState.isConnected) {
      Alert.alert("No Wallet Connected", "There's no wallet connected to disconnect.");
      return;
    }
    Alert.alert(
      "Disconnect Wallet",
      "This removes the wallet from this device. You'll need to import it again (or create a new one) to reconnect.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              setDisconnecting(true);
              await disconnectWallet();
              Alert.alert("Wallet Disconnected", "Your wallet has been disconnected from this device.");
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to disconnect wallet.");
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  const profileSettingList = [
    {
      id: 1,
      icon: PROFILE,
      title: "Profile Info",
      chevronRight: true,
      GOTO: () => {
        router.push('/personal-info')
      },
    },
    {
      id: 2,
      icon: NOTIFICATION,
      title: "Notification settings",
      chevronRight: true,
      GOTO: () => {
        router.push('/notification-setting')
      },
    },
    {
      id: 3,
      icon: WALLET,
      title: "Wallet recovery",
      chevronRight: true,
      GOTO: () => {
        router.push('/wallet-recovery')
      },
    },
    {
      id: 4,
      icon: LOCK,
      title: pinConfigured ? "Change transaction PIN" : "Set up transaction PIN",
      chevronRight: true,
      GOTO: handleTransactionPin,
    },
    {
      id: 5,
      icon: LOCK,
      title: "Change password",
      chevronRight: true,
      GOTO: () => {
        router.push('/change-password')
      },
    },
    {
      id: 6,
      icon: WALLET,
      title: disconnecting ? "Disconnecting..." : "Disconnect wallet",
      chevronRight: false,
      GOTO: handleDisconnectWallet,
    },
    {
      id: 7,
      icon: BLACKBIN,
      title: "Delete account",
      chevronRight: true,
      GOTO: () => {
        router.push('/delete-account')
      },
    },
  ];

  return (
    <AuthGuard>
      <SafeAreaView style={{ flex: 1 }}>
        <View
          className="container flex-1 mx-auto max-w-2xl"
          style={{ paddingVertical: 20 }}
        >
          <View className="flex-row items-center gap-4 ml-5">
            <BackBtn />
            <InterSemiBold className="text-lg/5">My Profile</InterSemiBold>
          </View>

          <View className="mt-3">
            {profileSettingList.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={item.GOTO}
                disabled={item.id === 6 && disconnecting}
                className="flex-row items-center justify-between px-5 py-5 border-b border-[#0000001A]"
              >
                <View className="flex-row items-center gap-3">
                  <Icon icon={item.icon} width={20} height={20} />
                  <InterRegular className="text-base/[150%]">
                    {item.title}
                  </InterRegular>
                </View>
                {item.chevronRight && (
                  <Icon icon={CHEVRONRIGHT} width={10} height={20} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
};

export default ProfileSetting;

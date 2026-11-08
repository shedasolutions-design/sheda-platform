import { useState } from "react";
import { View, ImageBackground, TouchableOpacity, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import Button from "@/components/common/Button";
import InterSemiBold from "@/components/Text/InterSemiBold";
import { HERO } from "@/constants/images-icons";
import InterRegular from "@/components/Text/InterRegular";
import { deviceHeight } from "@/constants/values";
import { useWallet } from "@/contexts/WalletContext";
import BackupPrompt from "@/components/BackupPrompt";

export default function WalletSetup() {
  const {
    loading,
    readiness,
    hasLocalWallet,
    localWalletMetadata,
    isCloudBackupAvailable,
  } = useWallet();
  const [showRestore, setShowRestore] = useState(false);

  // Navigation only — nothing here needs the wallet service to be warm, so
  // these must never wait on it. See the note on `loading` in WalletContext:
  // these three buttons used to carry disabled={loading}, which made them dead
  // for the length of a cold RPC probe.
  const handleCreateWallet = () => {
    router.push("/wallet-setup/create-wallet");
  };

  const handleImportWallet = () => {
    router.push("/wallet-setup/import-wallet");
  };


  const handleSkip = () => {
    router.replace("/(tabs)/home");
  };

  return (
    <View style={{ flex: 1, height: deviceHeight }}>
      <View className="h-[60%] w-full">
        <ImageBackground
          resizeMode="cover"
          source={HERO}
          style={{ width: "100%", height: "100%" }}
        />
      </View>

      <View className="flex-1 bg-background rounded-t-2xl lg:rounded-t-none -mt-5 lg:mt-none p-5">
        <View className="mt-5 flex items-center">
          <InterSemiBold className="text-xl mb-2">
            Set up your wallet
          </InterSemiBold>
          <InterRegular className="text-secondaryText text-sm text-center">
            Create a secure NEAR blockchain wallet linked to your
          </InterRegular>
          <InterRegular className="text-secondaryText text-sm text-center">
            Sheda account to manage assets and transactions.
          </InterRegular>
        </View>

        {/*
          Phase A result, painted from local storage with no network involved.
          This is the "found wallet on device" banner: it appears within
          milliseconds of launch, well before balances resolve.
        */}
        {hasLocalWallet && localWalletMetadata?.accountId && (
          <View className="mt-4 bg-[#ECFDF5] rounded-xl p-3 flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <InterSemiBold className="text-xs text-[#065F46]">
                Wallet found on this device
              </InterSemiBold>
              <InterRegular className="text-xs text-[#065F46]" numberOfLines={1}>
                {localWalletMetadata.accountId}
              </InterRegular>
            </View>
            {/* Readiness spinner — indicates progress, gates nothing. */}
            {loading && readiness !== "ready" && (
              <ActivityIndicator size="small" color="#065F46" />
            )}
          </View>
        )}

        <View className="mt-8">
          {/*
            No disabled={loading} on any of these. They are navigation actions
            and remain tappable from the first frame — see acceptance criterion
            1 (buttons clickable within 1s of launch on a slow network).
          */}
          <Button
            isFull={true}
            className="rounded-xl"
            onPress={handleCreateWallet}
          >
            <InterSemiBold className="text-background">
              Create new wallet
            </InterSemiBold>
          </Button>
          <Button
            isFull={true}
            color="transparent"
            onPress={handleImportWallet}
            className="rounded-xl border border-borderColor"
          >
            <InterSemiBold className="">
              Import existing wallet
            </InterSemiBold>
          </Button>

          {isCloudBackupAvailable && (
            <Button
              isFull={true}
              color="transparent"
              onPress={() => setShowRestore(true)}
              className="rounded-xl border border-borderColor"
            >
              <InterSemiBold className="">
                Restore from Google backup
              </InterSemiBold>
            </Button>
          )}


          <TouchableOpacity
            onPress={handleSkip}
            className="mt-6"
          >
            <InterRegular className="text-secondaryText underline text-center">
              Skip for now
            </InterRegular>
          </TouchableOpacity>
        </View>
      </View>

      <BackupPrompt
        visible={showRestore}
        mode="restore"
        onClose={() => setShowRestore(false)}
        onDone={() => router.replace("/(tabs)/home")}
      />
    </View>
  );
}

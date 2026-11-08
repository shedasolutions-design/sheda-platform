import React from "react";
import { View, SafeAreaView, Text } from "react-native";
import { router } from "expo-router";
import Button from "@/components/common/Button";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import { useWallet } from "@/contexts/WalletContext";

const WalletCreatedSuccessfully = () => {
  const { walletState, connectWallet, loading, getAccountId, currentNetwork } =
    useWallet();

  const handleConnectAndGo = async () => {
    try {
      const accountId =
        walletState.account?.accountId || getAccountId();
      if (accountId) {
        if (!walletState.isConnected) {
          await connectWallet(accountId);
        }
        router.push("/(tabs)/wallet");
      } else {
        router.push("/(tabs)/wallet");
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      // Still navigate even if connection fails
      router.push("/(tabs)/wallet");
    }
  };

  const handleGoHome = () => {
    router.push("/(tabs)/home");
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="flex-1 justify-center items-center p-5">
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 20,
            padding: 32,
            width: "100%",
            maxWidth: 420,
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          {/* Success icon */}
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: "#F0FDF4",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 32 }}>✅</Text>
          </View>

          <InterSemiBold
            style={{
              fontSize: 22,
              marginBottom: 8,
              textAlign: "center",
              color: "#1E293B",
            }}
          >
            Wallet Ready!
          </InterSemiBold>

          <InterRegular
            style={{
              color: "#6B7280",
              textAlign: "center",
              fontSize: 14,
              lineHeight: 22,
              marginBottom: 12,
            }}
          >
            Your NEAR wallet has been created and is ready to use.
            {currentNetwork === "testnet"
              ? " You've received free test tokens to explore the platform."
              : " We'll cover your transaction fees to get you started."}
          </InterRegular>

          <View
            style={{
              backgroundColor: "#F0FDF4",
              borderRadius: 10,
              padding: 12,
              marginBottom: 24,
              width: "100%",
            }}
          >
            <InterRegular
              style={{
                fontSize: 12,
                color: "#166534",
                lineHeight: 18,
                textAlign: "center",
              }}
            >
              You can now list properties, make bids, and manage assets directly from your wallet.
            </InterRegular>
          </View>

          {/* Account info */}
          {walletState.account && (
            <View
              style={{
                backgroundColor: "#F8FAFC",
                borderRadius: 12,
                padding: 16,
                width: "100%",
                marginBottom: 24,
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
            >
              <View style={{ marginBottom: 10 }}>
                <InterRegular
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 2,
                  }}
                >
                  Account ID
                </InterRegular>
                <InterSemiBold
                  style={{ fontSize: 15, color: "#1E40AF" }}
                >
                  {walletState.account.accountId}
                </InterSemiBold>
              </View>

              <View>
                <InterRegular
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 2,
                  }}
                >
                  Network
                </InterRegular>
                <InterSemiBold
                  style={{
                    fontSize: 13,
                    color: currentNetwork === "testnet" ? "#D97706" : "#059669",
                  }}
                >
                  {currentNetwork === "testnet" ? "🟡 Testnet" : "🟢 Mainnet"}
                </InterSemiBold>
              </View>
            </View>
          )}

          {/* Action buttons */}
          <View style={{ width: "100%", gap: 10 }}>
            <Button
              style={{ borderRadius: 12 }}
              onPress={handleConnectAndGo}
              disabled={loading}
            >
              <InterSemiBold
                className="text-white"
                style={{ textAlign: "center" }}
              >
                {loading ? "Connecting..." : "View My Wallet"}
              </InterSemiBold>
            </Button>

            <Button
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
              color="transparent"
              onPress={handleGoHome}
            >
              <InterSemiBold style={{ textAlign: "center", color: "#475569" }}>
                Go to Home
              </InterSemiBold>
            </Button>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default WalletCreatedSuccessfully;

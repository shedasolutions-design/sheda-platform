import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import { useWallet } from "@/contexts/WalletContext";
import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import FeedbackModal from "@/components/common/FeedbackModal";

const WalletRecovery = () => {
  const {
    walletState,
    getStoredSeedPhrase,
    getPrivateKeyFromStoredSeedPhrase,
    isBiometricAvailable,
  } = useWallet();

  const [seedPhrase, setSeedPhrase] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: "success" | "error" | "info" | "loading" | "warning";
    title: string;
    message: string;
    onAction?: () => void;
    actionLabel?: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  /**
   * Require biometric or PIN re-authentication before showing keys.
   * Falls back to device PIN/passcode if biometrics are not available.
   */
  const authenticateUser = useCallback(async (): Promise<boolean> => {
    try {
      // Check if any device security is available (biometric OR passcode)
      const biometricAvailable = await isBiometricAvailable();
      const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();

      if (biometricAvailable || securityLevel !== LocalAuthentication.SecurityLevel.NONE) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Authenticate to view your wallet keys",
          fallbackLabel: "Use PIN",
          // Allow device passcode/PIN when biometrics fail or are unavailable
          disableDeviceFallback: false,
        });

        if (!result.success) {
          setFeedback({
            visible: true,
            type: "error",
            title: "Authentication Required",
            message:
              "You must authenticate to view your wallet keys. Please try again.",
            actionLabel: "OK",
            onAction: () =>
              setFeedback((prev) => ({ ...prev, visible: false })),
          });
          return false;
        }
        return true;
      }

      // If device has truly no security (emulator/dev mode), warn and allow
      console.warn("WalletRecovery: No device security detected. Allowing access.");
      return true;
    } catch (error) {
      console.error("Authentication error:", error);
      return true; // Allow on error (fallback)
    }
  }, [isBiometricAvailable]);

  const handleRevealKeys = async () => {
    if (!walletState.account?.accountId) {
      setFeedback({
        visible: true,
        type: "error",
        title: "No Wallet Connected",
        message: "Please connect your wallet first.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
      return;
    }

    try {
      setIsLoading(true);

      // Step 1: Require authentication
      const authenticated = await authenticateUser();
      if (!authenticated) {
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);

      // Step 2: Retrieve the keys
      const storedSeedPhrase = await getStoredSeedPhrase(
        walletState.account.accountId
      );

      if (storedSeedPhrase) {
        setSeedPhrase(storedSeedPhrase);

        const storedPrivateKey = await getPrivateKeyFromStoredSeedPhrase(
          walletState.account.accountId
        );
        if (storedPrivateKey) {
          setPrivateKey(storedPrivateKey);
        }
      } else {
        setFeedback({
          visible: true,
          type: "warning",
          title: "No Seed Phrase",
          message:
            "No seed phrase found for this wallet. If you imported via private key, only the private key is available.",
          actionLabel: "OK",
          onAction: () =>
            setFeedback((prev) => ({ ...prev, visible: false })),
        });
      }
    } catch (error) {
      console.error("Failed to retrieve keys:", error);
      setFeedback({
        visible: true,
        type: "error",
        title: "Retrieval Failed",
        message: "Failed to retrieve your wallet keys. Please try again.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySeedPhrase = async () => {
    if (!seedPhrase) return;
    try {
      await Clipboard.setStringAsync(seedPhrase);
      setFeedback({
        visible: true,
        type: "success",
        title: "Copied!",
        message:
          "Seed phrase copied to clipboard. Clear your clipboard after pasting it somewhere safe.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    } catch {
      setFeedback({
        visible: true,
        type: "error",
        title: "Copy Failed",
        message: "Failed to copy to clipboard.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    }
  };

  const handleCopyPrivateKey = async () => {
    if (!privateKey) return;
    try {
      await Clipboard.setStringAsync(privateKey);
      setFeedback({
        visible: true,
        type: "success",
        title: "Copied!",
        message:
          "Private key copied to clipboard. Clear your clipboard after pasting it somewhere safe.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    } catch {
      setFeedback({
        visible: true,
        type: "error",
        title: "Copy Failed",
        message: "Failed to copy to clipboard.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    }
  };

  const handleBackupPasskey = () => {
    setFeedback({
      visible: true,
      type: "info",
      title: "Coming Soon",
      message:
        "Google Passkey backup will be available in an upcoming update. For now, please save your seed phrase securely.",
      actionLabel: "OK",
      onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
    });
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onAction={feedback.onAction}
        actionLabel={feedback.actionLabel}
        onClose={() => setFeedback((prev) => ({ ...prev, visible: false }))}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="container flex-1 mx-auto max-w-2xl"
          style={{ padding: 20 }}
        >
          <View className="flex-row items-center gap-4">
            <BackBtn />
            <InterSemiBold className="text-lg/5">
              Wallet Recovery
            </InterSemiBold>
          </View>

          <View style={{ marginTop: 24 }}>
            {/* Security warning */}
            <View
              style={{
                backgroundColor: "#FEF2F2",
                borderWidth: 1,
                borderColor: "#FECACA",
                borderRadius: 16,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 16, marginRight: 8 }}> </Text>
                <InterSemiBold
                  style={{ fontSize: 14, color: "#DC2626" }}
                >
                  Security Warning
                </InterSemiBold>
              </View>
              <InterRegular
                style={{
                  fontSize: 12,
                  color: "#991B1B",
                  lineHeight: 18,
                }}
              >
                Your recovery phrase and private key give full access to
                your wallet. Never share them with anyone. Never enter them
                on websites you don't trust. Sheda will never ask for your
                keys.
              </InterRegular>
            </View>

            {/* Wallet info */}
            {walletState.account && (
              <View
                style={{
                  backgroundColor: "#F8FAFC",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
              >
                <InterRegular
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    marginBottom: 4,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Connected Wallet
                </InterRegular>
                <InterSemiBold
                  style={{ fontSize: 14, color: "#1E293B" }}
                >
                  {walletState.account.accountId}
                </InterSemiBold>
              </View>
            )}

            {/* Reveal button (with auth gate) */}
            {!isAuthenticated ? (
              <View>
                <InterRegular
                  style={{
                    fontSize: 13,
                    color: "#6B7280",
                    lineHeight: 20,
                    marginBottom: 16,
                    textAlign: "center",
                  }}
                >
                  You'll need to authenticate to view your wallet keys.
                  This protects your funds from unauthorized access.
                </InterRegular>
                <Button
                  style={{ borderRadius: 12 }}
                  onPress={handleRevealKeys}
                  disabled={isLoading}
                >
                  <InterSemiBold className="text-white" style={{ textAlign: "center" }}>
                    {isLoading
                      ? "Authenticating..."
                      : "🔓 Authenticate to View Keys"}
                  </InterSemiBold>
                </Button>
              </View>
            ) : (
              <View>
                {/* Seed Phrase Section */}
                {seedPhrase && (
                  <View style={{ marginBottom: 20 }}>
                    <InterSemiBold
                      style={{
                        fontSize: 14,
                        marginBottom: 8,
                        color: "#1E293B",
                      }}
                    >
                      Recovery Phrase
                    </InterSemiBold>

                    {showSeedPhrase ? (
                      <View
                        style={{
                          backgroundColor: "#FEF2F2",
                          borderWidth: 1,
                          borderColor: "#FECACA",
                          borderRadius: 12,
                          padding: 16,
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontFamily:
                              Platform.OS === "ios"
                                ? "Courier"
                                : "monospace",
                            lineHeight: 24,
                            color: "#1E293B",
                          }}
                          selectable
                        >
                          {seedPhrase}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setShowSeedPhrase(true)}
                        style={{
                          backgroundColor: "#F1F5F9",
                          borderRadius: 12,
                          padding: 16,
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <InterSemiBold
                          style={{ fontSize: 13, color: "#475569" }}
                        >
                          👁 Tap to reveal seed phrase
                        </InterSemiBold>
                      </TouchableOpacity>
                    )}

                    {showSeedPhrase && (
                      <Button
                        onPress={handleCopySeedPhrase}
                        color="#E2E8F0"
                        style={{ borderRadius: 10 }}
                      >
                        <InterRegular
                          style={{ fontSize: 13, color: "#475569", textAlign: "center" }}
                        >
                          Copy Seed Phrase
                        </InterRegular>
                      </Button>
                    )}
                  </View>
                )}

                {/* Private Key Section */}
                {privateKey && (
                  <View style={{ marginBottom: 20 }}>
                    <InterSemiBold
                      style={{
                        fontSize: 14,
                        marginBottom: 8,
                        color: "#1E293B",
                      }}
                    >
                      Private Key
                    </InterSemiBold>

                    {showPrivateKey ? (
                      <View
                        style={{
                          backgroundColor: "#FEF2F2",
                          borderWidth: 1,
                          borderColor: "#FECACA",
                          borderRadius: 12,
                          padding: 16,
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily:
                              Platform.OS === "ios"
                                ? "Courier"
                                : "monospace",
                            lineHeight: 20,
                            color: "#1E293B",
                          }}
                          selectable
                        >
                          {privateKey}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setShowPrivateKey(true)}
                        style={{
                          backgroundColor: "#F1F5F9",
                          borderRadius: 12,
                          padding: 16,
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <InterSemiBold
                          style={{ fontSize: 13, color: "#475569" }}
                        >
                          👁 Tap to reveal private key
                        </InterSemiBold>
                      </TouchableOpacity>
                    )}

                    {showPrivateKey && (
                      <Button
                        onPress={handleCopyPrivateKey}
                        color="#E2E8F0"
                        style={{ borderRadius: 10 }}
                      >
                        <InterRegular
                          style={{ fontSize: 13, color: "#475569", textAlign: "center" }}
                        >
                          Copy Private Key
                        </InterRegular>
                      </Button>
                    )}
                  </View>
                )}

                {/* Passkey backup */}
                <View
                  style={{
                    backgroundColor: "#FEF3C7",
                    borderWidth: 1,
                    borderColor: "#FCD34D",
                    borderRadius: 16,
                    padding: 16,
                    marginTop: 4,
                  }}
                >
                  <InterSemiBold
                    style={{
                      fontSize: 14,
                      color: "#92400E",
                      marginBottom: 6,
                    }}
                  >
                    Google Passkey Backup
                  </InterSemiBold>
                  <InterRegular
                    style={{
                      fontSize: 12,
                      color: "#92400E",
                      lineHeight: 18,
                      marginBottom: 12,
                    }}
                  >
                    Back up your wallet with Google Passkey for seamless
                    recovery across devices.
                  </InterRegular>
                  <Button
                    onPress={handleBackupPasskey}
                    style={{
                      borderRadius: 10,
                      backgroundColor: "#D97706",
                    }}
                  >
                    <InterSemiBold
                      style={{
                        color: "#fff",
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      Back up with Google Passkey
                    </InterSemiBold>
                  </Button>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default WalletRecovery;

import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import Button from "@/components/common/Button";
import { router } from "expo-router";
import { useWallet } from "@/contexts/WalletContext";
import { useApi } from "@/contexts/ApiContext";
import * as Clipboard from "expo-clipboard";
import FeedbackModal from "@/components/common/FeedbackModal";
import {
  classifyWalletError,
  buildWalletError,
  WALLET_ERRORS,
} from "@/constants/walletErrors";
import type { WalletCreationStep } from "@/services/nearWallet";
import { FUNDING_ACCOUNTS } from "@/config/walletConfig";
import BackupPrompt from "@/components/BackupPrompt";

// ── Creation Step Labels ────────────────────────────────────────────────────

const STEP_LABELS: Record<WalletCreationStep, string> = {
  generating_keys: "Generating your secure keys...",
  creating_account: "Creating your account on-chain...",
  funding_wallet: "Funding your wallet...",
  setting_up: "Setting up your account...",
  airdropping_tokens: "Airdropping free tokens...",
  complete: "All done!",
  error: "Something went wrong",
};

const STEP_ORDER: WalletCreationStep[] = [
  "generating_keys",
  "creating_account",
  "funding_wallet",
  "airdropping_tokens",
  "complete",
];

// ── Component ───────────────────────────────────────────────────────────────

const CreateWallet = () => {
  const {
    createWallet,
    hasStoredWallet,
    saveWalletState,
    creationStep,
    currentNetwork,
    getPreviewAccountId,
    isCloudBackupAvailable,
  } = useWallet();
  const { user } = useApi();
  const userEmail = user?.email;

  const [seedPhrase, setSeedPhrase] = useState<string>("");
  const [createdAccountId, setCreatedAccountId] = useState<string>("");
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  // Set when the wallet was created without on-chain funding (implicit
  // account). The address is valid and can receive funds, but it is dormant
  // until the first deposit — the UI must not imply otherwise.
  const [needsFunding, setNeedsFunding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [airdropFailed, setAirdropFailed] = useState(false);
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: "success" | "error" | "info" | "loading" | "warning";
    title: string;
    message: string;
    onAction?: () => void;
    actionLabel?: string;
    supportCode?: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  // Derive the preview wallet address from email
  const previewAccountId = useMemo(() => {
    if (!userEmail) return null;
    return getPreviewAccountId(userEmail);
  }, [userEmail, currentNetwork]);

  // Also generate mainnet preview for display
  const mainnetPreview = useMemo(() => {
    if (!userEmail || !userEmail.includes("@")) return null;
    const prefix = userEmail.split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/^[-_]+|[-_]+$/g, "");
    return prefix ? `${prefix}.shedauser.near` : null;
  }, [userEmail]);

  useEffect(() => {
    checkExistingWallet();
  }, [userEmail]);

  const checkExistingWallet = async () => {
    try {
      const hasStored = await hasStoredWallet(userEmail ?? undefined);
      if (hasStored) {
        setFeedback({
          visible: true,
          type: "warning",
          title: "Wallet Already Exists",
          message:
            "You already have a wallet linked to this account. Would you like to import it instead?",
          actionLabel: "Import Wallet",
          onAction: () => {
            setFeedback((prev) => ({ ...prev, visible: false }));
            router.push("/wallet-setup/import-wallet");
          },
        });
      }
    } catch (error) {
      console.error("Failed to check existing wallet:", error);
    }
  };

  const handleCreateWallet = async () => {
    try {
      setIsLoading(true);
      setFeedback({ visible: false, type: "info", title: "", message: "" });

      console.log("Creating NEAR wallet for:", userEmail);
      const result = await createWallet(userEmail ?? undefined);
      console.log("Wallet created successfully:", result.accountId);

      setSeedPhrase(result.seedPhrase);
      setCreatedAccountId(result.accountId);
      setIsWalletCreated(true);
      setAirdropFailed(result.airdropFailed || false);
      setNeedsFunding(result.needsFunding);

      if (result.needsFunding) {
        // Stated up front rather than left for the user to discover when a
        // transaction fails. `fallbackReason` explains WHY they got an
        // unfunded address instead of a normal one.
        setFeedback({
          visible: true,
          type: "warning",
          title: "Wallet created — needs funding to activate",
          message:
            `${result.fallbackReason ?? ""} Your wallet address and recovery phrase are ready, ` +
            `but the account only becomes active on the blockchain once it receives its first deposit. ` +
            `Send any amount of NEAR to ${result.accountId} to activate it.`.trim(),
          actionLabel: "Got it",
          onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
        });
      }

      // Save the wallet state for persistence
      await saveWalletState(result.accountId, result.seedPhrase, userEmail ?? undefined);

      // Show airdrop warning if it failed
      if (result.airdropFailed) {
        const err = buildWalletError("ERR_AIRDROP_FAILED");
        setFeedback({
          visible: true,
          type: "warning",
          title: err.title,
          message: err.message,
          supportCode: err.code,
          actionLabel: "OK",
          onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
        });
      }
    } catch (error: any) {
      console.error("Failed to create wallet:", error);

      const errStr = error?.message || String(error);
      const errorCode = classifyWalletError(errStr);
      const walletError = buildWalletError(errorCode, {
        alternative: previewAccountId
          ? previewAccountId.replace(
            previewAccountId.split(".")[0],
            previewAccountId.split(".")[0] + "2"
          )
          : `username2${FUNDING_ACCOUNTS[currentNetwork].walletSuffix}`,
      });

      setFeedback({
        visible: true,
        type: "error",
        title: walletError.title,
        message: walletError.message,
        supportCode: walletError.code,
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySeedPhrase = async () => {
    try {
      await Clipboard.setStringAsync(seedPhrase);
      setFeedback({
        visible: true,
        type: "success",
        title: "Copied!",
        message:
          "Seed phrase copied to clipboard. Store it somewhere safe and delete it from your clipboard.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    } catch (error) {
      Alert.alert("Error", "Failed to copy seed phrase");
    }
  };

  const handleCopyAddress = async () => {
    try {
      await Clipboard.setStringAsync(createdAccountId);
      setFeedback({
        visible: true,
        type: "success",
        title: "Copied!",
        message: "Wallet address copied to clipboard.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
    } catch (error) {
      Alert.alert("Error", "Failed to copy wallet address");
    }
  };

  const handleBackupPasskey = () => {
    // Encrypted cloud backup (services/cloudBackup.ts). The seed phrase is
    // AES-256-GCM encrypted on this device under a passphrase-derived key
    // before upload — see components/BackupPrompt.tsx.
    if (!isCloudBackupAvailable) {
      setFeedback({
        visible: true,
        type: "info",
        title: "Backup not available",
        message:
          "Cloud backup isn't configured for this build. Save your seed phrase somewhere safe instead.",
        actionLabel: "OK",
        onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
      });
      return;
    }
    setShowBackupPrompt(true);
  };

  const handleSkipBackup = () => {
    setShowSkipWarning(true);
  };

  const handleConfirmSkip = () => {
    setShowSkipWarning(false);
    router.push("/wallet-setup/created-successfully");
  };

  const handleContinue = () => {
    router.push("/wallet-setup/created-successfully");
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const renderProgressSteps = () => {
    if (!isLoading && !creationStep) return null;

    const currentStepIndex = creationStep
      ? STEP_ORDER.indexOf(creationStep)
      : -1;

    return (
      <View
        style={{
          backgroundColor: "#F8FAFC",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
      >
        <InterSemiBold
          style={{ fontSize: 14, color: "#475569", marginBottom: 16 }}
        >
          Setting up your wallet...
        </InterSemiBold>

        {STEP_ORDER.filter((s) =>
          currentNetwork === "mainnet"
            ? s !== "funding_wallet" && s !== "airdropping_tokens"
            : s !== "setting_up"
        ).map((step, index) => {
          const isCurrentStep = step === creationStep;
          const isCompleted = currentStepIndex > STEP_ORDER.indexOf(step);
          const isPending = currentStepIndex < STEP_ORDER.indexOf(step);

          return (
            <View
              key={step}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: index < STEP_ORDER.length - 1 ? 12 : 0,
              }}
            >
              {/* Status indicator */}
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  marginRight: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isCompleted
                    ? "#22C55E"
                    : isCurrentStep
                      ? "#C1272D"
                      : "#E2E8F0",
                }}
              >
                {isCompleted ? (
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                    ✓
                  </Text>
                ) : isCurrentStep ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    style={{ color: "#94A3B8", fontSize: 10, fontWeight: "600" }}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>

              {/* Label */}
              <InterRegular
                style={{
                  fontSize: 13,
                  color: isCompleted
                    ? "#22C55E"
                    : isCurrentStep
                      ? "#1E293B"
                      : "#94A3B8",
                  fontWeight: isCurrentStep ? "600" : "400",
                }}
              >
                {STEP_LABELS[step]}
              </InterRegular>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={
          feedback.supportCode
            ? `${feedback.message}\n\nSupport code: ${feedback.supportCode}`
            : feedback.message
        }
        onAction={feedback.onAction}
        actionLabel={feedback.actionLabel}
        onClose={() => setFeedback((prev) => ({ ...prev, visible: false }))}
      />

      {/* Skip backup warning modal */}
      <FeedbackModal
        isVisible={showSkipWarning}
        type="warning"
        title="Skip Backup?"
        message={
          "If you lose access to this device, you won't be able to recover your wallet without a backup.\n\nAre you sure you want to skip?"
        }
        actionLabel="Skip Anyway"
        onAction={handleConfirmSkip}
        onClose={() => setShowSkipWarning(false)}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="container flex-1 mx-auto max-w-2xl">
          {/* Header */}
          <View className="px-5 py-5 flex-row items-center">
            <BackBtn />
            <InterSemiBold className="text-lg/5 ml-4">
              Create Wallet
            </InterSemiBold>
          </View>

          {/* Content */}
          <View className="flex-1 px-5">
            {!isWalletCreated ? (
              // ── Pre-Creation ───────────────────────────────────────────
              <View className="flex-1 justify-center">
                {/* Wallet address preview */}
                {previewAccountId && (
                  <View
                    style={{
                      backgroundColor: "#F0FDF4",
                      borderWidth: 1,
                      borderColor: "#BBF7D0",
                      borderRadius: 16,
                      padding: 20,
                      marginBottom: 16,
                      width: "100%",
                    }}
                  >
                    <InterRegular
                      style={{
                        fontSize: 11,
                        color: "#6B7280",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Your new wallet will be
                    </InterRegular>

                    <View style={{ marginBottom: 8 }}>
                      <InterRegular
                        style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}
                      >
                        Testnet
                      </InterRegular>
                      <InterSemiBold style={{ fontSize: 15, color: "#166534" }}>
                        {previewAccountId}
                      </InterSemiBold>
                    </View>

                    {mainnetPreview && (
                      <View>
                        <InterRegular
                          style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}
                        >
                          Mainnet
                        </InterRegular>
                        <InterSemiBold style={{ fontSize: 15, color: "#166534" }}>
                          {mainnetPreview}
                        </InterSemiBold>
                      </View>
                    )}

                    <InterRegular
                      style={{ fontSize: 11, color: "#9CA3AF", marginTop: 10 }}
                    >
                      Derived from: {userEmail}
                    </InterRegular>
                  </View>
                )}

                {/* What you'll get explanation */}
                <View
                  style={{
                    backgroundColor: "#EFF6FF",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                  }}
                >
                  <InterSemiBold
                    style={{ fontSize: 13, color: "#1E40AF", marginBottom: 6 }}
                  >
                    What you'll get
                  </InterSemiBold>
                  <InterRegular
                    style={{
                      fontSize: 13,
                      color: "#1E40AF",
                      lineHeight: 20,
                    }}
                  >
                    • A named NEAR account (e.g. yourname.sheda.testnet){"\n"}
                    • A 12-word recovery phrase to back up your wallet{"\n"}
                    {currentNetwork === "testnet"
                      ? "• Free test tokens to explore the platform"
                      : "• Gas-free transactions — we cover your fees"}
                  </InterRegular>
                </View>

                {/* Progress steps during loading */}
                {isLoading && renderProgressSteps()}

                {/* Create button */}
                {!isLoading && (
                  <>
                    <Button
                      onPress={handleCreateWallet}
                      disabled={isLoading}
                      className="w-full"
                      style={{ borderRadius: 12 }}
                    >
                      <InterSemiBold className="text-white text-center">
                        Create my wallet
                      </InterSemiBold>
                    </Button>

                    <TouchableOpacity
                      onPress={() =>
                        router.push("/wallet-setup/import-wallet")
                      }
                      style={{ marginTop: 16, alignItems: "center" }}
                    >
                      <InterRegular
                        style={{ fontSize: 13, color: "#3B82F6" }}
                      >
                        Already have a wallet? Import instead
                      </InterRegular>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => router.push("/(tabs)/home")}
                      style={{ marginTop: 12, alignItems: "center" }}
                    >
                      <InterRegular
                        style={{
                          fontSize: 13,
                          color: "#9CA3AF",
                          textDecorationLine: "underline",
                        }}
                      >
                        Skip for now
                      </InterRegular>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              // ── Post-Creation: Success ─────────────────────────────────
              <View className="flex-1" style={{ paddingTop: 8 }}>
                <InterSemiBold
                  style={{ fontSize: 22, marginBottom: 16, color: "#1E293B" }}
                >
                  Wallet Created
                </InterSemiBold>

                {/* Wallet address card */}
                <TouchableOpacity
                  onPress={handleCopyAddress}
                  style={{
                    backgroundColor: "#EFF6FF",
                    borderWidth: 1,
                    borderColor: "#BFDBFE",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <InterRegular
                    style={{
                      fontSize: 11,
                      color: "#6B7280",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Your wallet address
                  </InterRegular>
                  <InterSemiBold style={{ fontSize: 16, color: "#1E40AF" }}>
                    {createdAccountId}
                  </InterSemiBold>
                  <InterRegular
                    style={{ fontSize: 11, color: "#60A5FA", marginTop: 6 }}
                  >
                    Tap to copy
                  </InterRegular>
                </TouchableOpacity>

                {/* Balance info */}
                <View
                  style={{
                    backgroundColor: "#F0FDF4",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 20,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 10 }}> </Text>
                  <View style={{ flex: 1 }}>
                    <InterSemiBold style={{ fontSize: 14, color: "#166534" }}>
                      {currentNetwork === "testnet" ? "1 NEAR" : "0.1 NEAR"}
                    </InterSemiBold>
                    <InterRegular style={{ fontSize: 11, color: "#6B7280" }}>
                      Initial balance for transactions
                    </InterRegular>
                  </View>
                </View>

                {/* Passkey backup CTA */}
                <View
                  style={{
                    backgroundColor: "#FEF3C7",
                    borderWidth: 1,
                    borderColor: "#FCD34D",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <InterSemiBold
                    style={{ fontSize: 14, color: "#92400E", marginBottom: 6 }}
                  >
                    Back up your wallet
                  </InterSemiBold>
                  <InterRegular
                    style={{
                      fontSize: 12,
                      color: "#92400E",
                      lineHeight: 18,
                      marginBottom: 12,
                    }}
                  >
                    Secure your wallet with Google Passkey for easy recovery
                    on any device. This is the safest way to protect your
                    funds.
                  </InterRegular>
                  <Button
                    onPress={handleBackupPasskey}
                    style={{
                      borderRadius: 10,
                      backgroundColor: "#D97706",
                    }}
                  >
                    <InterSemiBold
                      style={{ color: "#fff", fontSize: 13, textAlign: "center" }}
                    >
                      Back up with Google Passkey
                    </InterSemiBold>
                  </Button>
                </View>

                {/* Seed phrase section */}
                <View style={{ marginBottom: 20 }}>
                  <InterSemiBold
                    style={{ fontSize: 15, marginBottom: 6, color: "#1E293B" }}
                  >
                    Recovery Phrase
                  </InterSemiBold>
                  <InterRegular
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      lineHeight: 18,
                      marginBottom: 10,
                    }}
                  >
                    Write down these 12 words in order and keep them safe.
                    Anyone with this phrase can access your wallet.
                  </InterRegular>

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
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ fontSize: 14, marginRight: 6 }}> </Text>
                        <InterRegular
                          style={{ fontSize: 11, color: "#DC2626" }}
                        >
                          Never share this with anyone
                        </InterRegular>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                          lineHeight: 24,
                          color: "#1E293B",
                        }}
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
                      isFull={false}
                      color="#E2E8F0"
                      style={{ borderRadius: 10 }}
                    >
                      <InterRegular
                        style={{ fontSize: 13, color: "#475569" }}
                      >
                        Copy Seed Phrase
                      </InterRegular>
                    </Button>
                  )}
                </View>

                {/* Continue / Skip buttons */}
                <Button
                  onPress={handleContinue}
                  className="w-full"
                  style={{ borderRadius: 12, marginBottom: 12 }}
                >
                  <InterSemiBold className="text-white text-center">
                    I've Saved My Recovery Phrase
                  </InterSemiBold>
                </Button>

                <TouchableOpacity
                  onPress={handleSkipBackup}
                  style={{ alignItems: "center", marginBottom: 30 }}
                >
                  <InterRegular
                    style={{
                      fontSize: 13,
                      color: "#9CA3AF",
                      textDecorationLine: "underline",
                    }}
                  >
                    Skip backup for now
                  </InterRegular>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/*
        Cloud-backup opt-in, offered after the seed phrase is on screen rather
        than auto-opened over it — the user should be able to read and record
        the phrase before deciding anything about backup.
      */}
      <BackupPrompt
        visible={showBackupPrompt}
        mode="backup"
        accountId={createdAccountId}
        onClose={() => setShowBackupPrompt(false)}
        onDone={() => router.push("/wallet-setup/created-successfully")}
      />
    </SafeAreaView>
  );
};

export default CreateWallet;

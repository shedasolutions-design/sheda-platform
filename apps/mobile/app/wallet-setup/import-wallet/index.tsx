import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import { router } from "expo-router";
import { useWallet } from "@/contexts/WalletContext";
import BackupPrompt from "@/components/BackupPrompt";
import { useApi } from "@/contexts/ApiContext";
import FeedbackModal from "@/components/common/FeedbackModal";
import {
  classifyWalletError,
  buildWalletError,
} from "@/constants/walletErrors";
import { FUNDING_ACCOUNTS } from "@/config/walletConfig";

type ImportMethod = "seedPhrase" | "privateKey";

const ImportWallet = () => {
  const [importMethod, setImportMethod] = useState<ImportMethod>("seedPhrase");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [importedAccountId, setImportedAccountId] = useState<string>("");
  const {
    importWallet,
    importWalletByPrivateKey,
    isCloudBackupAvailable,
    currentNetwork,
    getPreviewAccountId,
  } = useWallet();
  const { user } = useApi();
  const userEmail = user?.email;

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

  // Derive the expected account ID from user email
  const expectedAccountId = useMemo(() => {
    if (!userEmail) return null;
    return getPreviewAccountId(userEmail);
  }, [userEmail, currentNetwork]);

  const handleImportWallet = async () => {
    // ── Client-side validation (instant, no RPC needed) ─────────────────
    if (importMethod === "seedPhrase") {
      const trimmed = seedPhrase.trim();
      if (!trimmed) {
        setFeedback({
          visible: true,
          type: "error",
          title: "Missing Seed Phrase",
          message:
            "Please enter your 12 or 24 word seed phrase to import your wallet.",
          actionLabel: "OK",
          onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
        });
        return;
      }

      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length !== 12 && words.length !== 24) {
        setFeedback({
          visible: true,
          type: "error",
          title: "Invalid Seed Phrase",
          message: `Your seed phrase has ${words.length} word${words.length !== 1 ? "s" : ""}. It should be exactly 12 or 24 words separated by spaces.`,
          actionLabel: "OK",
          onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
        });
        return;
      }

      // Check for non-alphabetic characters (seed phrases are lowercase alpha only)
      const invalidWords = words.filter((w) => !/^[a-z]+$/.test(w));
      if (invalidWords.length > 0) {
        setFeedback({
          visible: true,
          type: "error",
          title: "Invalid Seed Phrase",
          message: `Seed phrase words should only contain lowercase letters. Please check: "${invalidWords.slice(0, 3).join('", "')}"${invalidWords.length > 3 ? ` and ${invalidWords.length - 3} more` : ""}.`,
          actionLabel: "OK",
          onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
        });
        return;
      }
    }

    if (importMethod === "privateKey") {
      const trimmed = privateKey.trim();
      if (!trimmed) {
        setFeedback({
          visible: true,
          type: "error",
          title: "Missing Private Key",
          message:
            'Please enter your private key (ed25519:...) to import your wallet.',
          actionLabel: "OK",
          onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
        });
        return;
      }

      if (!trimmed.startsWith("ed25519:") || trimmed.length < 40) {
        setFeedback({
          visible: true,
          type: "error",
          title: "Invalid Private Key Format",
          message:
            'Your private key should start with "ed25519:" followed by a long base58-encoded string. Please double-check what you pasted.',
          actionLabel: "OK",
          onAction: () => setFeedback((prev) => ({ ...prev, visible: false })),
        });
        return;
      }
    }

    // Validate that the imported key must match the user's Sheda wallet
    const targetAccountId = accountId.trim() || undefined;
    if (targetAccountId && expectedAccountId) {
      // If user entered a custom account ID, warn if it doesn't match expected
      if (targetAccountId !== expectedAccountId) {
        setFeedback({
          visible: true,
          type: "warning",
          title: "Account Mismatch",
          message: `You can only import the wallet tied to your Sheda account: ${expectedAccountId}. The account ID you entered doesn't match.`,
          supportCode: "ERR_IMPORT_MISMATCH",
          actionLabel: "Use Correct Address",
          onAction: () => {
            setAccountId(expectedAccountId);
            setFeedback((prev) => ({ ...prev, visible: false }));
          },
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setFeedback({
        visible: true,
        type: "loading",
        title: "Importing Wallet",
        message:
          importMethod === "seedPhrase"
            ? "Verifying your seed phrase and connecting to the blockchain..."
            : "Verifying your private key and connecting to the blockchain...",
      });

      let wallet;
      if (importMethod === "seedPhrase") {
        wallet = await importWallet(
          seedPhrase.trim(),
          targetAccountId
        );
      } else {
        wallet = await importWalletByPrivateKey(
          privateKey.trim(),
          targetAccountId
        );
      }

      setFeedback({
        visible: true,
        type: "success",
        title: "Wallet Imported",
        message: `Your wallet ${wallet.accountId} has been imported successfully.`,
        actionLabel: "Continue",
        onAction: () => {
          setFeedback((prev) => ({ ...prev, visible: false }));
          // Offer encrypted cloud backup right after a successful import —
          // this is the moment the key material is known to be on the device
          // and the user is already thinking about not losing it.
          if (isCloudBackupAvailable) {
            setImportedAccountId(wallet.accountId);
            setShowBackupPrompt(true);
          } else {
            router.push("/wallet-setup/created-successfully");
          }
        },
      });
    } catch (err: any) {
      const errStr = err?.message || String(err);
      const errorCode = classifyWalletError(errStr);
      const walletError = buildWalletError(errorCode, {
        expected:
          expectedAccountId ||
          `yourusername${FUNDING_ACCOUNTS[currentNetwork].walletSuffix}`,
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
      setIsSubmitting(false);
    }
  };

  // Deliberately NOT wired to WalletContext's `loading` — that flag also
  // covers the background wallet-restore effect that runs on every app
  // open/account switch, which made this button show "Importing..." before
  // the user had typed anything or pressed anything on this screen.
  const isLoading = isSubmitting || feedback.type === "loading";

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
            <InterSemiBold className="text-lg/5">Import Wallet</InterSemiBold>
          </View>

          <View className="mt-8">
            {/* Info box */}
            <View
              style={{
                backgroundColor: "#EFF6FF",
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <InterRegular
                style={{ fontSize: 12, color: "#1E40AF", lineHeight: 18 }}
              >
                Import the wallet originally created for your Sheda account.
                {expectedAccountId
                  ? ` Your expected wallet address is ${expectedAccountId}.`
                  : ""}
              </InterRegular>
            </View>

            {/* Import method toggle */}
            <View
              style={{
                flexDirection: "row",
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <TouchableOpacity
                onPress={() => setImportMethod("seedPhrase")}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor:
                    importMethod === "seedPhrase" ? "#C1272D" : "transparent",
                }}
              >
                <InterSemiBold
                  style={{
                    fontSize: 13,
                    color:
                      importMethod === "seedPhrase" ? "#FFFFFF" : "#6B7280",
                  }}
                >
                  Seed Phrase
                </InterSemiBold>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setImportMethod("privateKey")}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor:
                    importMethod === "privateKey" ? "#C1272D" : "transparent",
                }}
              >
                <InterSemiBold
                  style={{
                    fontSize: 13,
                    color:
                      importMethod === "privateKey" ? "#FFFFFF" : "#6B7280",
                  }}
                >
                  Private Key
                </InterSemiBold>
              </TouchableOpacity>
            </View>

            {/* Seed Phrase input */}
            {importMethod === "seedPhrase" && (
              <View style={{ marginBottom: 16 }}>
                <InterSemiBold style={{ fontSize: 13, marginBottom: 6 }}>
                  Seed Phrase
                </InterSemiBold>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    minHeight: 100,
                  }}
                >
                  <TextInput
                    placeholder="Enter your 12-word seed phrase separated by spaces..."
                    multiline
                    value={seedPhrase}
                    onChangeText={setSeedPhrase}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      padding: 14,
                      fontSize: 14,
                      lineHeight: 22,
                      color: "#1E293B",
                      fontFamily:
                        Platform.OS === "ios" ? "Courier" : "monospace",
                    }}
                  />
                </View>
              </View>
            )}

            {/* Private Key input */}
            {importMethod === "privateKey" && (
              <View style={{ marginBottom: 16 }}>
                <InterSemiBold style={{ fontSize: 13, marginBottom: 6 }}>
                  Private Key
                </InterSemiBold>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    minHeight: 100,
                  }}
                >
                  <TextInput
                    placeholder="Enter your private key (ed25519:...)"
                    multiline
                    value={privateKey}
                    onChangeText={setPrivateKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      padding: 14,
                      fontSize: 14,
                      lineHeight: 22,
                      color: "#1E293B",
                      fontFamily:
                        Platform.OS === "ios" ? "Courier" : "monospace",
                    }}
                  />
                </View>
                <InterRegular
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    marginTop: 6,
                  }}
                >
                  Your private key starts with "ed25519:" followed by a long
                  string
                </InterRegular>
              </View>
            )}

            {/* Account ID */}
            <View style={{ marginBottom: 24 }}>
              <InterSemiBold style={{ fontSize: 13, marginBottom: 6 }}>
                Account ID
              </InterSemiBold>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                }}
              >
                <TextInput
                  placeholder={
                    expectedAccountId || `yourusername${FUNDING_ACCOUNTS[currentNetwork].walletSuffix}`
                  }
                  value={accountId}
                  onChangeText={setAccountId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    padding: 14,
                    fontSize: 14,
                    color: "#1E293B",
                  }}
                />
              </View>
              <InterRegular
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  marginTop: 6,
                }}
              >
                {expectedAccountId
                  ? `Leave empty to use ${expectedAccountId}`
                  : `Enter your account ID (e.g., yourusername${FUNDING_ACCOUNTS[currentNetwork].walletSuffix})`}
              </InterRegular>
            </View>

            {/* Import button */}
            <Button
              style={{ borderRadius: 12 }}
              onPress={handleImportWallet}
              disabled={isLoading}
            >
              <InterSemiBold className="text-white" style={{ textAlign: "center" }}>
                {isLoading ? "Importing..." : "Import Wallet"}
              </InterSemiBold>
            </Button>
          </View>
        </View>
      </ScrollView>

      <BackupPrompt
        visible={showBackupPrompt}
        mode="backup"
        accountId={importedAccountId}
        onClose={() => {
          setShowBackupPrompt(false);
          router.push("/wallet-setup/created-successfully");
        }}
        onDone={() => router.push("/wallet-setup/created-successfully")}
      />
    </SafeAreaView>
  );
};

export default ImportWallet;

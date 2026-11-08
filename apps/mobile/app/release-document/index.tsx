import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import {
  View,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import { router, useLocalSearchParams } from "expo-router";
import Icon from "@/components/common/Icon";
import { LOCATION } from "@/assets/icons";
import Button from "@/components/common/Button";
import { useState, useEffect } from "react";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import nearContractService from "@/services/nearContract";
import { TransactionPhase } from "@/types/transaction";
import * as ImagePicker from "expo-image-picker";
import { useTransactionToast } from "@/hooks/useTransactionToast";

const ReleaseDocument = () => {
  const {
    id,
    bidId,
    blockchainPropertyId,
    buyerAccountId,
    propertyTitle,
  } = useLocalSearchParams();

  const { getPropertyById, uploadTransactionDocuments, sendTransactionNotification, getUserByWallet } = useApi();
  const { walletState, getAuthorizedPrivateKey, currentNetwork } = useWallet();
  const { run: runTransaction } = useTransactionToast();

  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [documentDescription, setDocumentDescription] = useState("");
  const [documentImages, setDocumentImages] = useState<string[]>([]);

  // Fetch property details from backend
  useEffect(() => {
    const fetchProperty = async () => {
      if (id) {
        try {
          const prop = await getPropertyById(Number(id), { silent: true });
          setProperty(prop);
        } catch {
          console.warn("ReleaseDocument: Could not fetch property");
        }
      }
      setLoading(false);
    };
    fetchProperty();
  }, [id, getPropertyById]);

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission needed", "Please grant camera roll permissions to upload document images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5,
      });

      if (!result.canceled) {
        const uris = result.assets.map((asset) => asset.uri);
        setDocumentImages((prev) => [...prev, ...uris].slice(0, 5));
      }
    } catch (err) {
      console.error("Image picker error:", err);
    }
  };

  const removeImage = (index: number) => {
    setDocumentImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMintAndTransfer = async () => {
    if (!walletState.account?.accountId) {
      Alert.alert("Error", "Wallet not connected.");
      return;
    }

    if (!documentDescription.trim() && documentImages.length === 0) {
      Alert.alert(
        "Missing Information",
        "Please add a description or upload agreement images before releasing documents."
      );
      return;
    }

    const buyerId = buyerAccountId as string;
    if (!buyerId) {
      Alert.alert("Error", "Buyer account information is missing.");
      return;
    }

    Alert.alert(
      "Confirm Document Release",
      `This will mint the agreement documents as an NFT and transfer it to the buyer (${buyerId}). This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mint & Release",
          onPress: async () => {
            try {
              setMinting(true);

              const privateKey = await getAuthorizedPrivateKey(
                walletState.account!.accountId
              );
              if (!privateKey) {
                Alert.alert("Error", "Could not access wallet keys.");
                return;
              }

              await nearContractService.initialize(currentNetwork);

              // Step 1: Upload images to backend for persistent URLs
              let mediaUri = "https://placeholder.co/400x300?text=Agreement+Document";
              if (documentImages.length > 0) {
                try {
                  const uploadResult = await uploadTransactionDocuments(
                    Number(bidId),
                    documentImages.map((uri) => ({ uri })),
                    documentDescription.trim() || undefined
                  );
                  if (uploadResult?.uploaded_urls?.length > 0) {
                    mediaUri = uploadResult.uploaded_urls[0];
                    console.log("✅ Documents uploaded to backend:", uploadResult.uploaded_urls);
                  }
                } catch (uploadErr) {
                  console.warn("Backend upload failed, using local URI as fallback:", uploadErr);
                  mediaUri = documentImages[0];
                }
              }

              // Step 2: Confirm document release on-chain
              // On-chain: confirm_document_release(bid_id, property_id, document_image_uri, document_description)
              // The contract stores the document_image_uri and document_description on the Bid struct directly.
              const numBidId = Number(bidId);
              const numPropertyId = Number(blockchainPropertyId);
              const docDescription = documentDescription.trim() || `Agreement for ${propertyTitle || property?.title || 'Property'}`;

              const confirmResult = await runTransaction({
                loadingMessage: "Releasing documents...",
                successMessage: "Agreement documents have been submitted on-chain successfully.",
                notification: {
                  type: "docs_released",
                  title: "Documents Released",
                  message: `Agreement documents for "${propertyTitle || property?.title || 'Property'}" have been released to the buyer.`,
                },
                action: async () => {
                  const releaseResult = await nearContractService.confirmDocumentRelease(
                    walletState.account!.accountId,
                    privateKey,
                    {
                      bid_id: numBidId,
                      property_id: numPropertyId,
                      document_image_uri: mediaUri,
                      document_description: docDescription,
                    }
                  );
                  if (!releaseResult.success) {
                    throw new Error(releaseResult.error || "Failed to release documents on-chain. Please try again.");
                  }
                  return releaseResult;
                },
              }).catch((err: any) => {
                Alert.alert("Document Release Failed", err?.message || "Failed to release documents on-chain. Please try again.");
                return null;
              });

              if (!confirmResult) return;

              console.log("✅ Document released on-chain, tx:", confirmResult.transactionHash);

              // Step 3: Send notification to buyer
              // property.agent_id is the SELLER (the person performing this
              // action) — the buyer's user id has to be resolved from their
              // wallet id separately, otherwise this notifies the seller
              // about their own action instead of telling the buyer.
              try {
                const buyerInfo = await getUserByWallet(buyerId);
                if (buyerInfo?.id) {
                  await sendTransactionNotification({
                    transaction_id: `bid_${numBidId}`,
                    event: "docs_released",
                    recipient_user_id: buyerInfo.id,
                    property_id: numPropertyId,
                    metadata: {
                      propertyTitle: propertyTitle || property?.title,
                      transactionHash: confirmResult.transactionHash,
                      mediaUri,
                    },
                  });
                } else {
                  console.warn("Could not resolve buyer's user id from wallet — skipping docs_released notification");
                }
              } catch {
                console.warn("Failed to send doc_released notification");
              }

              // Toast + notification inbox entry already confirm success
              // non-blockingly (runTransaction above) — no need for a
              // blocking "OK" alert on top of it.
              router.back();
            } catch (err: any) {
              console.error("ReleaseDocument error:", err);
              Alert.alert(
                "Error",
                err.message || "An unexpected error occurred. Please try again."
              );
            } finally {
              setMinting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#C1272D" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1">
      <ScrollView
        className="container flex-1 mx-auto max-w-2xl px-5 py-5"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row gap-4 items-center mb-7">
          <BackBtn />
          <InterSemiBold className="text-base/5">Release Documents</InterSemiBold>
        </View>

        {/* Property Info */}
        <View className="border-b border-borderColor pb-4">
          {property?.images?.[0]?.image_url ? (
            <View className="h-[160px] w-full rounded-lg overflow-hidden">
              <Image
                source={{ uri: property.images[0].image_url }}
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          ) : (
            <View className="h-[160px] w-full rounded-lg overflow-hidden bg-gray-200 justify-center items-center">
              <InterRegular className="text-gray-500">No image available</InterRegular>
            </View>
          )}

          <View className="my-3">
            <InterMedium className="text-lg/5 mt-2">
              {propertyTitle || property?.title || "Property"}
            </InterMedium>
            {(property?.location) && (
              <View className="flex-row items-center gap-1 mt-1">
                <Icon icon={LOCATION} width={12} height={16} />
                <InterRegular className="text-sm/5 text-secondaryText mt-1">
                  {property.location}
                </InterRegular>
              </View>
            )}
          </View>

          {/* Buyer Info */}
          <View className="mt-1 p-3 bg-blue-50 rounded-lg">
            <InterMedium className="text-xs text-blue-800 mb-1">
              📤 Sending to Buyer
            </InterMedium>
            <InterRegular className="text-[11px] text-blue-700">
              {buyerAccountId || "Unknown"}
            </InterRegular>
          </View>
        </View>

        {/* Agreement Description */}
        <View className="mt-4">
          <InterMedium className="text-sm mb-2">Agreement Description</InterMedium>
          <TextInput
            placeholder="Describe the agreement terms, conditions, and any important details..."
            multiline
            numberOfLines={5}
            value={documentDescription}
            onChangeText={setDocumentDescription}
            style={{
              borderWidth: 1,
              borderColor: "#E5E5E5",
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
              minHeight: 120,
              textAlignVertical: "top",
              backgroundColor: "#FAFAFA",
            }}
          />
        </View>

        {/* Document Images */}
        <View className="mt-4">
          <InterMedium className="text-sm mb-2">
            Agreement Documents / Images
          </InterMedium>
          <InterRegular className="text-xs text-secondaryText mb-3">
            Upload images of signed agreements, property documents, or any other relevant files.
            These will be minted as an NFT.
          </InterRegular>

          {/* Image previews */}
          {documentImages.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-3">
              {documentImages.map((uri, index) => (
                <View key={index} className="relative">
                  <Image
                    source={{ uri }}
                    style={{ width: 80, height: 80, borderRadius: 8 }}
                  />
                  <TouchableOpacity
                    onPress={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 rounded-full w-5 h-5 items-center justify-center"
                  >
                    <InterRegular className="text-white text-[10px]">✕</InterRegular>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {documentImages.length < 5 && (
            <TouchableOpacity
              onPress={pickImage}
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 items-center"
            >
              <InterRegular className="text-2xl text-gray-400 mb-1"> </InterRegular>
              <InterMedium className="text-sm text-primary">
                Upload Images
              </InterMedium>
              <InterRegular className="text-[10px] text-gray-400 mt-1">
                {documentImages.length}/5 images added
              </InterRegular>
            </TouchableOpacity>
          )}
        </View>

        {/* Disclaimer */}
        <View className="p-3 bg-amber-50 mt-6 rounded-lg border border-amber-200">
          <InterMedium className="text-xs text-amber-800 mb-1">
            Important
          </InterMedium>
          <InterRegular className="text-[11px] text-amber-700 leading-4">
            By pressing "Mint & Release", you confirm to mint the agreement
            documents as an NFT on the blockchain and transfer them to the buyer.
            This action is permanent and cannot be reversed.
          </InterRegular>
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View className="absolute bottom-0 left-0 right-0 mx-auto max-w-2xl py-5 px-5 bg-white border-t border-borderColor">
        <Button
          onPress={handleMintAndTransfer}
          className="rounded-lg bg-primary"
          disabled={minting}
        >
          {minting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="white" />
              <InterSemiBold className="text-base/5 text-white">
                Minting & Transferring...
              </InterSemiBold>
            </View>
          ) : (
            <InterSemiBold className="text-base/5 text-white">
              Mint & Release Documents
            </InterSemiBold>
          )}
        </Button>
      </View>
    </SafeAreaView>
  );
};

export default ReleaseDocument;

import { View, ScrollView, Image } from "react-native"
import Button from "../common/Button"
import InterSemiBold from "../Text/InterSemiBold"
import InterRegular from "../Text/InterRegular"
import { theme } from "../../styles/theme"
import totalPayment from "@/utilities/totalPayment"

interface AuthorizeListingFormProps {
  formData: any
  onAuthorize: () => void
  onCancel: () => void
  onUpdate: (data: any) => void
  blockchainPropertyId?: string | number | null
  transactionHash?: string | null
}

export function AuthorizeListingForm({
  formData,
  onAuthorize,
  onCancel,
  onUpdate,
  blockchainPropertyId,
  transactionHash,
}: AuthorizeListingFormProps) {

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <InterSemiBold style={{ fontSize: 20, color: theme.colors.text, marginBottom: 30 }}>
            Authorize listing
          </InterSemiBold>

          {/* Property Image */}
          <View
            style={{
              width: "100%",
              height: 200,
              backgroundColor: "#F5F5F5",
              borderRadius: 12,
              marginBottom: 20,
              overflow: "hidden",
            }}
          >
            <Image
              source={
                formData.photos && formData.photos.length > 0
                  ? { uri: formData.photos[0] }
                  : require("../../assets/images/apt-1.png")
              }
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          </View>

          {/* Property Details */}
          <InterSemiBold style={{ fontSize: 18, color: theme.colors.text, marginBottom: 8 }}>
            {formData.title || formData.propertyType || "Property"}
          </InterSemiBold>

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#E5E5E5",
                marginRight: 8,
              }}
            />
            <InterRegular style={{ fontSize: 14, color: theme.colors.secondaryText }}>{formData.location}</InterRegular>
          </View>

          {/* Description */}
          <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>Description</InterSemiBold>
          <InterRegular
            style={{
              fontSize: 14,
              color: theme.colors.secondaryText,
              lineHeight: 20,
              marginBottom: 20,
            }}
          >
            {formData.description || "No description provided"}
          </InterRegular>

          {/* Price Details */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: 15,
              borderBottomWidth: 1,
              borderBottomColor: "#E5E5E5",
            }}
          >
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text }}>Price</InterSemiBold>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text }}>₦{totalPayment(formData.price || "0")}</InterSemiBold>
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: 15,
              borderBottomWidth: 1,
              borderBottomColor: "#E5E5E5",
              marginBottom: 20,
            }}
          >
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text }}>Negotiable</InterSemiBold>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text }}>{formData.isNegotiable ? "Yes" : "No"}</InterSemiBold>
          </View>

          {/* Blockchain Verification Status */}
          <View style={{ marginBottom: 30 }}>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 12 }}>
              Blockchain Verification
            </InterSemiBold>
            <View
              style={{
                padding: 12,
                backgroundColor: "#E8F5E8",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#4CAF50",
              }}
            >
              <InterSemiBold style={{ fontSize: 14, color: "#2E7D32", marginBottom: 4 }}>
                ✅ NFT Minted Successfully
              </InterSemiBold>
              {blockchainPropertyId && (
                <InterRegular style={{ fontSize: 12, color: "#388E3C", marginBottom: 2 }}>
                  Blockchain Property ID: #{String(blockchainPropertyId)}
                </InterRegular>
              )}
              {transactionHash && (
                <InterRegular style={{ fontSize: 11, color: "#66BB6A" }} numberOfLines={1}>
                  Tx: {transactionHash}
                </InterRegular>
              )}
              <InterRegular style={{ fontSize: 12, color: "#388E3C", marginTop: 4 }}>
                Your property is registered on the NEAR blockchain. Authorize below to publish it on the marketplace.
              </InterRegular>
            </View>
          </View>

          {/* Document Upload (Optional) */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 30,
            }}
          >
            <View>
              <InterSemiBold style={{ fontSize: 16, color: theme.colors.text }}>Documents</InterSemiBold>
              <InterRegular style={{ fontSize: 12, color: theme.colors.secondaryText, marginTop: 4 }}>
                (Optional - upload after listing)
              </InterRegular>
            </View>
            <InterRegular
              style={{
                fontSize: 14,
                color: (formData.documentsUploaded ?? false) ? "#4CAF50" : theme.colors.secondaryText,
              }}
            >
              {(formData.documentsUploaded ?? false) ? "✓ Uploaded" : "Pending"}
            </InterRegular>
          </View>

          {!(formData.documentsUploaded ?? false) && (
            <View style={{ marginBottom: 40, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#F5F5F5", borderRadius: 8 }}>
              <InterRegular
                style={{
                  fontSize: 13,
                  color: theme.colors.secondaryText,
                  lineHeight: 18,
                }}
              >
                You can upload property documents (C of O, lease agreements, etc.) after creating your listing. It's optional but helps verify ownership.
              </InterRegular>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 15,
        }}
      >
        <Button
          onPress={onCancel}
          style={{
            flex: 1,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: "#E5E5E5",
            paddingVertical: 16,
            borderRadius: 8,
          }}
        >
          <InterSemiBold style={{ color: theme.colors.text, fontSize: 16 }}>Cancel</InterSemiBold>
        </Button>
        <Button
          onPress={onAuthorize}
          style={{
            flex: 1,
            backgroundColor: theme.colors.primary,
            paddingVertical: 16,
            borderRadius: 8,
          }}
        >
          <InterSemiBold className="text-white text-[16px]">
            Authorize & Publish
          </InterSemiBold>
        </Button>
      </View>
    </View>
  )
}

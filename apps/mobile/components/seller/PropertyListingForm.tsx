"use client"

import type React from "react"
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native"
import Alert from "@/utilities/alertPolyfill";
import { useState, useEffect } from "react"
import { router } from "expo-router"
import BackBtn from "../common/BackBtn"
import InterSemiBold from "../Text/InterSemiBold"
import InterMedium from "../Text/InterMedium"
import InterRegular from "../Text/InterRegular"
import Button from "../common/Button"
import SelectInput from "../input/selectInput"
import Checkbox from "../input/checkbox"
import StyledTextInput from "../input/textInput"
import PhotoUpload from "./PhotoUpload"
import ProgressBar from "./ProgressBar"
import Icon from "../common/Icon"
import { SUCCESSFUL } from "@/assets/icons"
import { useProperties } from "@/hooks/useShedaApi"
import { useNearContract } from "@/hooks/useNearContract"
import { useWallet } from "@/contexts/WalletContext"
import { allNigeriaLocations } from "@/constants/locations"
import LocationPicker from "../input/LocationPicker"
import FiatCurrencyPicker from "../input/FiatCurrencyPicker"
import { useCurrency } from "@/contexts/CurrencyContext"
import { SUPPORTED_FIATS } from "@/services/priceOracle"
import { getPropertyTypeOptions, PROPERTY_TYPES } from "@/constants/propertyTypes"
import { SELLER_TRANSACTIONS_ROUTE } from "@/utilities/transactionsRoute"
import { useApi } from "@/contexts/ApiContext"
import { WEEKDAY_NAMES, minutesToLabel, timeToMinutes } from "@/utilities/availability"

/** Hour options for the viewing-hours step, shared shape with app/availability. */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  label: minutesToLabel(h * 60),
  value: `${String(h).padStart(2, "0")}:00`,
}))

interface PropertyData {
  propertyType: string
  status: string
  location: string
  furnishing: string
  bedrooms: number
  bathrooms: number
  extras: string[]
  photos: string[]
  description: string
  price: string
  priceCurrency: string
  isNegotiable: boolean
  rentPerYear: string
  damages: string
}

interface PropertyListingFormProps {
  onSubmit?: (propertyData: any) => Promise<void>;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

const PropertyListingForm: React.FC<PropertyListingFormProps> = ({
  onSubmit,
  isSubmitting: externalIsSubmitting,
  submitButtonText = "Confirm and list"
}) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [propertyData, setPropertyData] = useState<PropertyData>({
    propertyType: "",
    status: "",
    location: "",
    furnishing: "",
    bedrooms: 1,
    bathrooms: 1,
    extras: [],
    photos: [],
    description: "",
    price: "",
    priceCurrency: "NGN",
    isNegotiable: false,
    rentPerYear: "",
    damages: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mintingStatus, setMintingStatus] = useState<string>("")

  // ── Viewing hours ────────────────────────────────────────────────────────
  // Availability is stored per AGENT (agent_availability has no property_id),
  // so this is the seller's schedule across every listing — not this one
  // property's. That's why the step only appears when they have none yet:
  // re-asking on each listing would imply per-property hours and, with no
  // delete endpoint on the backend, every duplicate window would be permanent.
  const { getSchedule, schedule, createAvailableTime } = useApi()
  const [needsViewingHours, setNeedsViewingHours] = useState(false)
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [viewingStart, setViewingStart] = useState("09:00")
  const [viewingEnd, setViewingEnd] = useState("17:00")

  useEffect(() => {
    let cancelled = false
    getSchedule()
      .then(() => {
        if (!cancelled) setNeedsViewingHours((schedule?.length ?? 0) === 0)
      })
      .catch(() => {
        // Can't tell — don't inject an extra step on a failed read.
        if (!cancelled) setNeedsViewingHours(false)
      })
    return () => {
      cancelled = true
    }
    // Intentionally mount-only: this decides whether the flow has an extra
    // step, which must not change under the user mid-listing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  /**
   * Persist the chosen windows. Best-effort by design: the property is
   * already listed by this point, so a failure here must not read as the
   * listing having failed — it just leaves the seller to set hours from
   * Profile > Viewing Hours.
   */
  const saveViewingHours = async (): Promise<void> => {
    if (selectedDays.length === 0) return

    const start = timeToMinutes(viewingStart)
    const end = timeToMinutes(viewingEnd)
    if (start == null || end == null || end <= start) return

    await Promise.all(
      selectedDays.map((weekday) =>
        createAvailableTime({
          weekday,
          start_time: viewingStart,
          end_time: viewingEnd,
        }).catch((err) => {
          console.warn(`Failed to save viewing hours for ${weekday}:`, err)
        })
      )
    )
  }

  // Hooks
  const { listProperty, updateProperty, isLoading: apiLoading } = useProperties()
  const { mintProperty, loading: contractLoading } = useNearContract()
  const { walletState } = useWallet()
  const { fiatToUsd } = useCurrency()

  const propertyTypes = getPropertyTypeOptions()

  const statusOptions = [
    { label: "For rent", value: "rent" },
    { label: "For sale", value: "sale" },
  ]

  const furnishingOptions = [
    { label: "Furnished", value: "furnished" },
    { label: "Unfurnished", value: "unfurnished" },
    { label: "Semi-furnished", value: "semi-furnished" },
  ]

  const bedroomOptions = [
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4+", value: 4 },
  ]

  const bathroomOptions = [
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4+", value: 4 },
  ]

  const extrasOptions = [
    "Air conditioner",
    "Pop Ceiling",
    "Floor Tiles",
    "Running water",
    "Furniture",
    "Prepaid meter",
    "Wi-Fi",
  ]

  /** Last step before submitting: 5 when the viewing-hours step is shown, else 4. */
  const finalStep = needsViewingHours ? 5 : 4

  const handleNext = () => {
    if (currentStep === finalStep) {
      handleSubmit()
    } else if (currentStep === 4 && needsViewingHours) {
      setCurrentStep(5)
    } else if (currentStep < 8) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleExtraChange = (extra: string, checked: boolean) => {
    if (checked) {
      setPropertyData({ ...propertyData, extras: [...propertyData.extras, extra] })
    } else {
      setPropertyData({ ...propertyData, extras: propertyData.extras.filter((e) => e !== extra) })
    }
  }

  const handleSubmit = async () => {
    try {
      // Validate that we have required data
      if (!propertyData.propertyType || !propertyData.status || !propertyData.location) {
        Alert.alert("Error", "Please fill in all required property details");
        return;
      }

      if (propertyData.photos.length < 4) {
        Alert.alert("Error", "Please upload at least 4 photos");
        return;
      }

      if (!propertyData.price && !propertyData.rentPerYear) {
        Alert.alert("Error", "Please set a price");
        return;
      }

      const backendPropertyData = {
        property_type: (PROPERTY_TYPES as readonly string[]).includes(
          propertyData.propertyType?.toLowerCase()
        )
          ? propertyData.propertyType.toLowerCase() as any
          : "apartment" as any,
        title: `${propertyData.propertyType} in ${propertyData.location}`,
        listing_type: propertyData.status as any,
        status: "available" as const,
        is_active: true,
        location: propertyData.location,
        furnished: propertyData.furnishing === "furnished",
        bedroom: propertyData.bedrooms,
        bathroom: propertyData.bathrooms,
        air_condition: propertyData.extras.includes("Air conditioner"),
        pop_ceiling: propertyData.extras.includes("Pop Ceiling"),
        floor_tiles: propertyData.extras.includes("Floor Tiles"),
        running_water: propertyData.extras.includes("Running water"),
        furniture: propertyData.extras.includes("Furniture"),
        prepaid_meter: propertyData.extras.includes("Prepaid meter"),
        wifi: propertyData.extras.includes("Wi-Fi"),
        description: propertyData.description,
        price: parseFloat(propertyData.price || propertyData.rentPerYear),
        price_currency: propertyData.priceCurrency,
        is_negotiable: propertyData.isNegotiable,
        images: propertyData.photos.map(url => ({ image_url: url, is_primary: false })), // Format as PropertyImage[]
      }

      // Mark first image as primary if exists
      if (backendPropertyData.images.length > 0) {
        backendPropertyData.images[0].is_primary = true;
      }

      console.log("🚀 Sending property data to backend:", JSON.stringify(backendPropertyData, null, 2));

      const createdProperty = await listProperty(backendPropertyData)
      console.log("✅ Property created in backend", createdProperty)

      // Step 2: Mint NFT if wallet is connected
      if (walletState.isConnected) {
        setMintingStatus("Minting property NFT on blockchain...")

        try {
          // Convert price to USDC format (6 decimals)
          const priceInNGN = parseFloat(propertyData.price || propertyData.rentPerYear)
          const priceInUSDC = priceInNGN / 400 // Assuming 1 USD = 400 NGN
          const contractPrice = (priceInUSDC * 1_000_000).toString()

          // Same basis as the price above, so the two figures the tenant sees
          // are denominated identically. Rentals only — the contract refuses a
          // deposit on a sale listing.
          const depositEntered = parseFloat(propertyData.damages.replace(/[^0-9.-]/g, "")) || 0
          const contractDeposit =
            propertyData.status === "rent" && depositEntered > 0
              ? Math.round((depositEntered / 400) * 1_000_000).toString()
              : null

          const result = await mintProperty({
            title: `${propertyData.propertyType} in ${propertyData.location}`,
            description: propertyData.description || "Property listing",
            media_uri: propertyData.photos[0] || "ipfs://default",
            price: contractPrice,
            is_for_sale: propertyData.status === "sale",
            // Days, the unit the contract stores. 365 rather than "12 months",
            // which the chain would have taken as 360 days.
            lease_duration_days: propertyData.status === "rent" ? 365 : null,
            damage_deposit_required: contractDeposit,
          })

          if (result.success && createdProperty?.id) {
            console.log("✅ NFT minted successfully:", result.data)

            // Step 3: Update backend with blockchain data
            try {
              await updateProperty(createdProperty.id, {
                blockchain_property_id: result.data != null ? String(result.data) : undefined,
                transaction_hash: result.transactionHash,
                is_nft_minted: true,
                blockchain_owner_id: walletState.account?.accountId,
              })
              console.log("✅ Backend updated with blockchain data")
            } catch (updateError) {
              console.warn("⚠️ Failed to update backend with blockchain data:", updateError)
            }

            setMintingStatus("Property NFT minted successfully!")
          } else {
            console.warn("⚠️ NFT minting failed:", result.error)
            Alert.alert(
              "Partial Success",
              "Property created in backend, but NFT minting failed. You can mint the NFT later from property details.",
              [{ text: "OK" }]
            )
          }
        } catch (nftError) {
          console.error("NFT minting error:", nftError)
          Alert.alert(
            "Partial Success",
            "Property created successfully, but blockchain minting encountered an error."
          )
        }
      } else {
        console.log("ℹ️ Wallet not connected, skipping NFT minting")
      }

      // Publish the seller's viewing hours (if they set any on step 5) only
      // after the listing itself is safely created — this is additive and
      // best-effort, so it can never turn a successful listing into an error.
      if (needsViewingHours) {
        setMintingStatus("Saving your viewing hours...")
        await saveViewingHours()
      }

      // Navigate to success screen
      setCurrentStep(8)
    } catch (error: any) {
      console.error("Property creation error:", error)
      Alert.alert("Error", error.message || "Failed to create property. Please try again.")
    } finally {
      setIsSubmitting(false)
      setMintingStatus("")
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Landing page
        return (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}
            >
              <InterSemiBold className="text-lg">List a property</InterSemiBold>
              {/* Only a seller reaches the listing form (the List tab is
                  seller-gated), so their transactions are on Activity —
                  History has no tab in seller mode and only rendered a
                  duplicate of the same list. */}
              <TouchableOpacity onPress={() => router.push(SELLER_TRANSACTIONS_ROUTE as any)}>
                <InterRegular className="text-primary">Activity</InterRegular>
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 32 }}>
              <InterRegular className="text-base mb-6">Property listing made easy in 4 easy steps.</InterRegular>

              <View>
                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: "#C1272D",
                      borderRadius: 12,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 16,
                      marginTop: 4,
                    }}
                  >
                    <InterRegular className="text-white text-xs">1</InterRegular>
                  </View>
                  <View style={{ flex: 1 }}>
                    <InterSemiBold className="text-base mb-1">Describe your property</InterSemiBold>
                    <InterRegular className="text-secondaryText text-sm">
                      Fill in the necessary information that best describes your property
                    </InterRegular>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: "#C1272D",
                      borderRadius: 12,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 16,
                      marginTop: 4,
                    }}
                  >
                    <InterRegular className="text-white text-xs">2</InterRegular>
                  </View>
                  <View style={{ flex: 1 }}>
                    <InterSemiBold className="text-base mb-1">Add extras</InterSemiBold>
                    <InterRegular className="text-secondaryText text-sm">
                      Tick the amenities that make your property standout amidst others
                    </InterRegular>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: "#C1272D",
                      borderRadius: 12,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 16,
                      marginTop: 4,
                    }}
                  >
                    <InterRegular className="text-white text-xs">3</InterRegular>
                  </View>
                  <View style={{ flex: 1 }}>
                    <InterSemiBold className="text-base mb-1">Upload quality photos</InterSemiBold>
                    <InterRegular className="text-secondaryText text-sm">
                      Add photos/videos of your properties, showing the selling point, and include a short concise
                      description.
                    </InterRegular>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: "#C1272D",
                      borderRadius: 12,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 16,
                      marginTop: 4,
                    }}
                  >
                    <InterRegular className="text-white text-xs">4</InterRegular>
                  </View>
                  <View style={{ flex: 1 }}>
                    <InterSemiBold className="text-base mb-1">Set your price and list</InterSemiBold>
                    <InterRegular className="text-secondaryText text-sm">
                      Here, you set the cost price of your property and you proceed to approve your listing request.
                    </InterRegular>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ marginTop: 32 }}>
              <Button className="rounded-lg" onPress={handleNext}>
                <InterSemiBold className="text-white">Get started</InterSemiBold>
              </Button>
            </View>
          </View>
        )

      case 1: // Property details
        return (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <SelectInput
              label="Property type"
              options={propertyTypes}
              value={propertyData.propertyType}
              onValueChange={(value) => setPropertyData({ ...propertyData, propertyType: value as string })}
              placeholder="Apartment"
            />
            <SelectInput
              label="Status"
              options={statusOptions}
              value={propertyData.status}
              onValueChange={(value) => setPropertyData({ ...propertyData, status: value as string })}
              placeholder="For rent"
            />
            <LocationPicker
              label="Location"
              value={propertyData.location}
              onValueChange={(value) => setPropertyData({ ...propertyData, location: value as string })}
              placeholder="Search or type a location"
            />
            <SelectInput
              label="Furnishing"
              options={furnishingOptions}
              value={propertyData.furnishing}
              onValueChange={(value) => setPropertyData({ ...propertyData, furnishing: value as string })}
              placeholder="Unfurnished"
            />
            <SelectInput
              label="Bedrooms"
              options={bedroomOptions}
              value={propertyData.bedrooms}
              onValueChange={(value) => setPropertyData({ ...propertyData, bedrooms: value as number })}
            />
            <SelectInput
              label="Bathrooms"
              options={bathroomOptions}
              value={propertyData.bathrooms}
              onValueChange={(value) => setPropertyData({ ...propertyData, bathrooms: value as number })}
            />
          </View>
        )

      case 2: // Property extras
        return (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <InterRegular className="text-base mb-4">Property extras</InterRegular>
            {extrasOptions.map((extra) => (
              <Checkbox
                key={extra}
                label={extra}
                value={propertyData.extras.includes(extra)}
                onChange={(checked) => handleExtraChange(extra, checked)}
              />
            ))}
          </View>
        )

      case 3: // Photos
        return (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <PhotoUpload
              photos={propertyData.photos}
              onPhotosChange={(photos) => setPropertyData({ ...propertyData, photos })}
              onUploadStarted={setIsUploading}
            />
          </View>
        )

      case 4: // Description and price
        const priceNum = parseFloat(propertyData.price.replace(/[^0-9.-]/g, "")) || 0;
        const selectedFiat = SUPPORTED_FIATS.find(f => f.code === propertyData.priceCurrency);
        const usdEquiv = priceNum > 0 ? fiatToUsd(priceNum, propertyData.priceCurrency) : 0;
        const depositNum = parseFloat(propertyData.damages.replace(/[^0-9.-]/g, "")) || 0;
        const depositUsd = depositNum > 0 ? fiatToUsd(depositNum, propertyData.priceCurrency) : 0;
        return (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <View style={{ marginBottom: 16 }}>
              <InterRegular className="text-base mb-2">Add a description</InterRegular>
              <StyledTextInput
                placeholder="Your description goes here..."
                multiline
                numberOfLines={6}
                value={propertyData.description}
                onChangeText={(text) => setPropertyData({ ...propertyData, description: text })}
                style={{ height: 120, textAlignVertical: "top" }}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <InterSemiBold className="text-base mb-2">Set Price</InterSemiBold>
              <View style={{
                flexDirection: "row",
                borderWidth: 1,
                borderColor: "#e0e0e0",
                borderRadius: 8,
                overflow: "hidden",
                alignItems: "stretch",
              }}>
                {/* Currency prefix button */}
                <FiatCurrencyPicker
                  value={propertyData.priceCurrency}
                  onValueChange={(code) => setPropertyData({ ...propertyData, priceCurrency: code })}
                  compact
                />
                {/* Price input */}
                <View style={{ flex: 1 }}>
                  <StyledTextInput
                    placeholder="500,000"
                    value={propertyData.price}
                    onChangeText={(text) => setPropertyData({ ...propertyData, price: text })}
                    keyboardType="numeric"
                    style={{
                      borderWidth: 0,
                      borderRadius: 0,
                      paddingHorizontal: 12,
                      height: 48,
                      fontSize: 16,
                    }}
                  />
                </View>
              </View>

              {/* USD equivalent */}
              {priceNum > 0 && (
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 8,
                  paddingHorizontal: 4,
                  gap: 6,
                }}>
                  <InterRegular style={{ fontSize: 13, color: "#666" }}>
                    ≈ ${usdEquiv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </InterRegular>
                  <View style={{
                    backgroundColor: "#EBF5FF",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 4,
                  }}>
                    <InterRegular style={{ fontSize: 11, color: "#2563EB" }}>
                      Sent to blockchain as stablecoin
                    </InterRegular>
                  </View>
                </View>
              )}
            </View>

            {/* Security deposit — rentals only. A sale has no tenant to collect
                one from and the contract refuses it outright. */}
            {propertyData.status === "rent" && (
              <View style={{ marginBottom: 16 }}>
                <InterSemiBold className="text-base mb-1">
                  Security deposit{" "}
                  <InterRegular style={{ fontSize: 13, color: "#9CA3AF" }}>(optional)</InterRegular>
                </InterSemiBold>
                <InterRegular style={{ fontSize: 13, color: "#6B7280", marginBottom: 8, lineHeight: 18 }}>
                  Held against damage for the length of the tenancy. Your tenant
                  pays it with the rent and gets it back automatically when the
                  lease ends — unless you raise a claim within 7 days.
                </InterRegular>
                <View style={{
                  flexDirection: "row",
                  borderWidth: 1,
                  borderColor: "#e0e0e0",
                  borderRadius: 8,
                  overflow: "hidden",
                  alignItems: "stretch",
                }}>
                  <FiatCurrencyPicker
                    value={propertyData.priceCurrency}
                    onValueChange={(code) => setPropertyData({ ...propertyData, priceCurrency: code })}
                    compact
                  />
                  <View style={{ flex: 1 }}>
                    <StyledTextInput
                      placeholder="Leave blank for none"
                      value={propertyData.damages}
                      onChangeText={(text) => setPropertyData({ ...propertyData, damages: text })}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 0,
                        borderRadius: 0,
                        paddingHorizontal: 12,
                        height: 48,
                        fontSize: 16,
                      }}
                    />
                  </View>
                </View>

                {depositNum > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, paddingHorizontal: 4, gap: 6 }}>
                    <InterRegular style={{ fontSize: 13, color: "#666" }}>
                      ≈ ${depositUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </InterRegular>
                    <View style={{ backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                      <InterRegular style={{ fontSize: 11, color: "#047857" }}>
                        Held in escrow, not paid to you
                      </InterRegular>
                    </View>
                  </View>
                )}
              </View>
            )}

            <Checkbox
              label="Is this price negotiable?"
              value={propertyData.isNegotiable}
              onChange={(checked) => setPropertyData({ ...propertyData, isNegotiable: checked })}
            />
          </View>
        )

      case 5: // Viewing hours — only reached when the seller has none yet
        return (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <View style={{ marginBottom: 16 }}>
              <InterSemiBold className="text-lg mb-1">When can buyers view?</InterSemiBold>
              <InterRegular className="text-secondaryText text-sm">
                Buyers can only book an inspection during the hours you publish.
                Without these, they'll be told to message you instead.
              </InterRegular>
            </View>

            <View
              style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: "#EFF6FF",
                borderWidth: 1,
                borderColor: "#BFDBFE",
                marginBottom: 20,
              }}
            >
              <InterRegular style={{ fontSize: 12, color: "#1E40AF" }}>
                These hours apply to all of your listings, not just this one.
                You can change them any time from Profile → Viewing Hours.
              </InterRegular>
            </View>

            <InterMedium className="text-sm mb-2">Available days</InterMedium>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {WEEKDAY_NAMES.map((day) => {
                const isSelected = selectedDays.includes(day)
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => toggleDay(day)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: isSelected ? "#C1272D" : "#E5E7EB",
                      backgroundColor: isSelected ? "#FEF2F2" : "#FFFFFF",
                    }}
                  >
                    <InterRegular
                      style={{
                        fontSize: 13,
                        color: isSelected ? "#C1272D" : "#4B5563",
                        fontWeight: isSelected ? "600" : "400",
                      }}
                    >
                      {day.charAt(0) + day.slice(1, 3).toLowerCase()}
                    </InterRegular>
                  </TouchableOpacity>
                )
              })}
            </View>

            <SelectInput
              label="From"
              options={HOUR_OPTIONS}
              value={viewingStart}
              onValueChange={(v: string | number) => setViewingStart(String(v))}
            />
            <SelectInput
              label="Until"
              options={HOUR_OPTIONS}
              value={viewingEnd}
              onValueChange={(v: string | number) => setViewingEnd(String(v))}
            />

            <InterRegular className="text-secondaryText" style={{ fontSize: 12, marginTop: 4 }}>
              The end time itself isn't bookable — 9:00 AM to 5:00 PM offers
              slots from 9 through 4.
            </InterRegular>

            {selectedDays.length === 0 && (
              <InterRegular style={{ fontSize: 12, color: "#B45309", marginTop: 12 }}>
                No days selected — you can skip this and set your hours later,
                but buyers won't be able to book a viewing until you do.
              </InterRegular>
            )}
          </View>
        )

      case 8: // Success
        return (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 }}>
            <View
              style={{
                width: 96,
                height: 96,
                backgroundColor: "#E8F5E8",
                borderRadius: 48,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <Icon icon={SUCCESSFUL} width={35} height={35} />
            </View>

            <InterSemiBold className="text-lg mb-2 text-center">Listing successful</InterSemiBold>
            <InterRegular className="text-secondaryText text-center mb-2" style={{ paddingHorizontal: 16 }}>
              Your property has been successfully listed on our marketplace{walletState.isConnected && " and minted as an NFT"}!
            </InterRegular>
            {walletState.isConnected && (
              <InterRegular className="text-primary text-center mb-8" style={{ paddingHorizontal: 16, fontSize: 12 }}>
                ✓ Property ownership verified on NEAR blockchain
              </InterRegular>
            )}
            <InterRegular className="text-secondaryText text-center mb-8" style={{ paddingHorizontal: 16 }}>
              You will get notified whenever you have a potential buyer. Cheers!
            </InterRegular>

            <Button className="rounded-lg w-full" onPress={() => router.push("/(tabs)/home")}>
              <InterSemiBold className="text-white">Go to homepage</InterSemiBold>
            </Button>
          </View>
        )

      default:
        return (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <InterRegular className="text-secondaryText">Loading...</InterRegular>
          </View>
        )
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {currentStep > 0 && currentStep < 8 && (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, paddingHorizontal: 16 }}>
          <BackBtn />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <InterSemiBold className="text-lg">List a property</InterSemiBold>
          </View>
        </View>
      )}

      {currentStep > 0 && currentStep <= finalStep && (
        <View style={{ paddingHorizontal: 16 }}>
          <ProgressBar currentStep={currentStep} totalSteps={finalStep} />
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
      >
        {renderStepContent()}
      </ScrollView>

      {currentStep > 0 && currentStep <= finalStep && (
        <View style={{ marginTop: 24, paddingHorizontal: 16, paddingBottom: 16 }}>
          <Button className="rounded-lg" onPress={handleNext} disabled={isSubmitting || isUploading}>
            {isSubmitting && currentStep === finalStep ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color="#fff" size="small" />
                <InterSemiBold className="text-white">{mintingStatus || "Processing..."}</InterSemiBold>
              </View>
            ) : (
              <InterSemiBold className="text-white">
                {currentStep === finalStep
                  ? "Confirm and list"
                  : currentStep === 4
                    ? "Next: viewing hours"
                    : "Next"}
              </InterSemiBold>
            )}
          </Button>
        </View>
      )}
    </View>
  )
}

export default PropertyListingForm

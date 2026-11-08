"use client"
import { useMemo } from "react"
import { View, ScrollView } from "react-native"
import BackBtn from "../common/BackBtn"
import Button from "../common/Button"
import InterSemiBold from "../Text/InterSemiBold"
import InterRegular from "../Text/InterRegular"
import SelectInput from "../input/selectInput"
import LocationPicker from "../input/LocationPicker"
import StyledTextInput from "../input/textInput"
import { ProgressIndicator } from "./ProgressIndicator"
import { theme } from "../../styles/theme"
import { getPropertyTypeOptions, isLandType, isShortletType, isHousingType } from "@/constants/propertyTypes"

interface PropertyDescriptionFormProps {
  formData: any
  onNext: () => void
  onBack: () => void
  onUpdate: (data: any) => void
}

export function PropertyDescriptionForm({ formData, onNext, onBack, onUpdate }: PropertyDescriptionFormProps) {
  const propertyTypes = getPropertyTypeOptions()

  const statusOptions = [
    { label: "For rent", value: "For rent" },
    { label: "For sale", value: "For sale" },
  ]

  const furnishingOptions = [
    { label: "Unfurnished", value: "unfurnished" },
    { label: "Semi-furnished", value: "semi-furnished" },
    { label: "Fully furnished", value: "furnished" },
  ]

  const bedroomOptions = [
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "4", value: "4" },
    { label: "5+", value: "5+" },
  ]

  const bathroomOptions = [
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "4", value: "4" },
    { label: "5+", value: "5+" },
  ]

  const plotTypeOptions = [
    { label: "Residential", value: "residential" },
    { label: "Commercial", value: "commercial" },
    { label: "Mixed-use", value: "mixed-use" },
    { label: "Agricultural", value: "agricultural" },
  ]

  // ── Derived booleans (single source of truth) ──
  const pType = (formData.propertyType || "").toLowerCase()
  const isLand = isLandType(pType)
  const isShortlet = isShortletType(pType)
  const isHousing = isHousingType(pType)

  // Validation: force Shortlet defaults
  const handlePropertyTypeChange = (value: string | number) => {
    const strValue = String(value)
    const updates: Record<string, any> = { propertyType: strValue }
    const lower = strValue.toLowerCase()

    if (lower === "land") {
      // Clear housing fields — they're irrelevant for land
      updates.bedrooms = "0"
      updates.bathrooms = "0"
      updates.furnishing = "unfurnished"
    } else if (lower === "shortlet") {
      // Shortlets are always furnished by default
      if (!formData.furnishing || formData.furnishing === "unfurnished") {
        updates.furnishing = "furnished"
      }
    }

    if (lower === "land") {
      // Land defaults
      if (!formData.landSize) updates.landSize = ""
      if (!formData.plotType) updates.plotType = "residential"
    }

    onUpdate(updates)
  }

  const handleNext = () => {
    onNext()
  }

  // Validation
  const canProceed = useMemo(() => {
    if (!formData.title || formData.title.trim().length < 3) return false
    if (!formData.location) return false
    if (isLand) {
      // Land-specific: need landSize > 0
      const size = parseFloat(formData.landSize || "0")
      if (isNaN(size) || size <= 0) return false
    }
    return true
  }, [formData.title, formData.location, formData.landSize, isLand])

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
          <BackBtn onPress={onBack} />
          <View style={{ marginLeft: 15 }}>
            <InterSemiBold style={{ fontSize: 18, color: theme.colors.text }}>List a property</InterSemiBold>
          </View>
        </View>

        {/* Progress Indicator */}
        <ProgressIndicator currentStep={1} totalSteps={4} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          {/* Property Title */}
          <View style={{ marginBottom: 20 }}>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
              Property title
            </InterSemiBold>
            <StyledTextInput
              value={formData.title}
              onChangeText={(value) => onUpdate({ title: value })}
              placeholder="e.g. Modern 3 Bedroom Apartment"
            />
          </View>

          {/* Property Type */}
          <View style={{ marginBottom: 20 }}>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
              Property type
            </InterSemiBold>
            <SelectInput
              value={formData.propertyType}
              options={propertyTypes}
              onValueChange={handlePropertyTypeChange}
              placeholder="Select property type"
            />
          </View>

          {/* Status (Sale / Rent) — Single source of truth */}
          <View style={{ marginBottom: 20 }}>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>Status</InterSemiBold>
            <SelectInput
              value={formData.status}
              options={statusOptions}
              onValueChange={(value) => onUpdate({ status: value })}
              placeholder="Select status"
            />
          </View>

          {/* Location */}
          <View style={{ marginBottom: 20 }}>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>Location</InterSemiBold>
            <LocationPicker
              value={formData.location}
              onValueChange={(value) => onUpdate({ location: value })}
              placeholder="Search or type a location"
            />
          </View>

          {/* ═══════════════════════════════════════════════════════════
              HOUSING-ONLY FIELDS (Apartment / Shared Apartment / Shortlet)
              ═══════════════════════════════════════════════════════════ */}
          {isHousing && (
            <>
              {/* Furnishing */}
              <View style={{ marginBottom: 20 }}>
                <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
                  Furnishing
                </InterSemiBold>
                <SelectInput
                  value={formData.furnishing}
                  options={furnishingOptions}
                  onValueChange={(value) => onUpdate({ furnishing: value })}
                  placeholder="Select furnishing"
                />
                {isShortlet && (
                  <InterRegular
                    style={{ fontSize: 12, color: "#999", marginTop: 4, paddingLeft: 2 }}
                  >
                    Shortlets are typically fully furnished
                  </InterRegular>
                )}
              </View>

              {/* Bedrooms */}
              <View style={{ marginBottom: 20 }}>
                <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
                  Bedrooms
                </InterSemiBold>
                <SelectInput
                  value={formData.bedrooms}
                  options={bedroomOptions}
                  onValueChange={(value) => onUpdate({ bedrooms: value })}
                  placeholder="Select bedrooms"
                />
              </View>

              {/* Bathrooms */}
              <View style={{ marginBottom: 20 }}>
                <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
                  Bathrooms
                </InterSemiBold>
                <SelectInput
                  value={formData.bathrooms}
                  options={bathroomOptions}
                  onValueChange={(value) => onUpdate({ bathrooms: value })}
                  placeholder="Select bathrooms"
                />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
              LAND-ONLY FIELDS
              ═══════════════════════════════════════════════════════════ */}
          {isLand && (
            <>
              {/* Land Size */}
              <View style={{ marginBottom: 20 }}>
                <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
                  Land Size (sqm)
                </InterSemiBold>
                <StyledTextInput
                  value={formData.landSize || ""}
                  onChangeText={(value) => onUpdate({ landSize: value })}
                  placeholder="e.g. 600"
                  keyboardType="numeric"
                />
              </View>

              {/* Plot Type */}
              <View style={{ marginBottom: 20 }}>
                <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
                  Plot Type
                </InterSemiBold>
                <SelectInput
                  value={formData.plotType || "residential"}
                  options={plotTypeOptions}
                  onValueChange={(value) => onUpdate({ plotType: value })}
                  placeholder="Select plot type"
                />
              </View>
            </>
          )}

          {/* Spacer */}
          <View style={{ height: 20 }} />
        </View>
      </ScrollView>

      {/* Next Button */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 30 }}>
        <Button
          onPress={handleNext}
          disabled={!canProceed}
          style={{
            backgroundColor: canProceed ? theme.colors.primary : "#ccc",
            paddingVertical: 16,
            borderRadius: 8,
            opacity: canProceed ? 1 : 0.6,
          }}
        >
          <InterSemiBold className="text-white text-[16px]">Next</InterSemiBold>
        </Button>
      </View>
    </View>
  )
}

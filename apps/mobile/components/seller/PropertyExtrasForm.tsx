import { useMemo } from "react"
import { View, ScrollView } from "react-native"
import BackBtn from "../common/BackBtn"
import Button from "../common/Button"
import InterSemiBold from "../Text/InterSemiBold"
import InterRegular from "../Text/InterRegular"
import CheckBox from "../input/checkbox"
import { ProgressIndicator } from "./ProgressIndicator"
import { theme } from "../../styles/theme"
import { isLandType } from "@/constants/propertyTypes"

interface PropertyExtrasFormProps {
  formData: any
  onNext: () => void
  onBack: () => void
  onUpdate: (data: any) => void
}

// Housing extras (apartment, shortlet, shared apartment)
const HOUSING_EXTRAS = [
  "Air conditioner",
  "Pop Ceiling",
  "Floor Tiles",
  "Running water",
  "Furniture",
  "Prepaid meter",
  "Wi-Fi",
]

// Land extras
const LAND_EXTRAS = [
  "Perimeter fencing",
  "Road access",
  "Running water",
  "Electricity access",
  "Survey plan available",
  "C of O available",
]

export function PropertyExtrasForm({ formData, onNext, onBack, onUpdate }: PropertyExtrasFormProps) {
  const isLand = isLandType(formData.propertyType || "")
  const extras = isLand ? LAND_EXTRAS : HOUSING_EXTRAS

  const handleExtraToggle = (extra: string) => {
    const currentExtras = formData.extras || []
    const updatedExtras = currentExtras.includes(extra)
      ? currentExtras.filter((item: string) => item !== extra)
      : [...currentExtras, extra]

    onUpdate({ extras: updatedExtras })
  }

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
        <ProgressIndicator currentStep={2} totalSteps={4} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
            {isLand ? "Land features" : "Property extras"}
          </InterSemiBold>
          <InterRegular style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>
            {isLand
              ? "Select the features that apply to this land"
              : "Select the extras available in this property"}
          </InterRegular>

          {extras.map((extra, index) => (
            <View key={extra} style={{ marginBottom: 25 }}>
              <CheckBox
                label={extra}
                value={formData.extras?.includes(extra) || false}
                onChange={() => handleExtraToggle(extra)}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Next Button */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 30 }}>
        <Button
          onPress={onNext}
          style={{
            backgroundColor: theme.colors.primary,
            paddingVertical: 16,
            borderRadius: 8,
          }}
        >
          <InterSemiBold className="text-white text-[16px]">Next</InterSemiBold>
        </Button>
      </View>
    </View>
  )
}

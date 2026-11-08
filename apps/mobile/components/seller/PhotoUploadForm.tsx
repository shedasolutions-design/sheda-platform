import { View, ScrollView } from "react-native"
import BackBtn from "../common/BackBtn"
import Button from "../common/Button"
import InterSemiBold from "../Text/InterSemiBold"
import PhotoUpload from "./PhotoUpload"
import { ProgressIndicator } from "./ProgressIndicator"
import { theme } from "../../styles/theme"

interface PhotoUploadFormProps {
  formData: any
  onNext: () => void
  onBack: () => void
  onUpdate: (data: any) => void
}

export function PhotoUploadForm({ formData, onNext, onBack, onUpdate }: PhotoUploadFormProps) {
  const handlePhotosChange = (photos: string[]) => {
    onUpdate({ photos })
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
        <ProgressIndicator currentStep={3} totalSteps={4} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <PhotoUpload
            photos={formData.photos || []}
            onPhotosChange={handlePhotosChange}
          />
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

import { View, ImageBackground, ScrollView, TouchableOpacity } from "react-native";
import { Link, router } from "expo-router";
import Button from "@/components/common/Button";
import InterSemiBold from "@/components/Text/InterSemiBold";
import { HERO } from "@/constants/images-icons";
import InterRegular from "@/components/Text/InterRegular";
import { AuthDebug } from "@/components/AuthDebug";

export default function Onboarding() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 6, width: "100%" }}>
        <ImageBackground
          resizeMode="cover"
          source={HERO}
          style={{ width: "100%", height: "100%" }}
        />
      </View>

      <View
        style={{
          flex: 4,
          backgroundColor: "#F9FAFB",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          marginTop: -20,
          padding: 20,
        }}
      >
        <View className="mt-5 flex items-center">
          <InterSemiBold className="text-xl mb-2">
            Welcome to advanced real estate
          </InterSemiBold>
          <InterRegular className="text-secondaryText text-sm">
            Sheda solutions makes your real
          </InterRegular>
          <InterRegular className="text-secondaryText text-sm">
            estate operations very easy and stress-free.
          </InterRegular>
        </View>

        <View className="mt-8">
          <Button
            isFull={true}
            className="rounded-xl"
            onPress={() => router.push("/(auth)/login")}
          >
            <InterSemiBold className="text-background">Sign in</InterSemiBold>
          </Button>
          <Button
            isFull={true}
            color="transparent"
            onPress={() => router.push("/(auth)/signup")}
            className="rounded-xl border border-borderColor"
          >
            <InterSemiBold className="">Create account</InterSemiBold>
          </Button>

          <TouchableOpacity
            onPress={() => router.push("/(tabs)/home")}
            className="text-center mt-6"
          >
            <InterRegular className="text-secondaryText underline">Skip for now</InterRegular>
          </TouchableOpacity>
        </View>

        {/* Debug Panel — only in dev */}
        {__DEV__ && <AuthDebug />}
      </View>
    </View>
  );
}

import { View, SafeAreaView } from "react-native"
import { deviceHeight } from "@/constants/values"
import SellerActivities from "@/components/seller/SellerActivities"
import InterSemiBold from "@/components/Text/InterSemiBold"
import { useMode } from "@/contexts/ModeContext"
import { useEffect } from "react"
import { router } from "expo-router"

import AuthGuard from "@/components/AuthGuard"

// Seller-only counterpart to app/(tabs)/saved — split into its own route so the
// seller "Activities" dashboard (revenue, properties, transaction history) can
// be worked on independently of the buyer "Saved Properties" screen instead of
// branching inside one shared file.
const Activity = () => {
  const { isSeller, isLoading } = useMode()

  useEffect(() => {
    if (!isLoading && !isSeller) {
      router.replace("/(tabs)/saved")
    }
  }, [isLoading, isSeller])

  return (
    <AuthGuard requireAuth={true}>
      <SafeAreaView style={{ flex: 1 }}>
        <View className="container mx-auto max-w-2xl" style={{ padding: 20, height: deviceHeight }}>
          <View className="mb-4">
            <InterSemiBold className="text-lg/5">Activities</InterSemiBold>
          </View>

          <SellerActivities />
        </View>
      </SafeAreaView>
    </AuthGuard>
  )
}

export default Activity

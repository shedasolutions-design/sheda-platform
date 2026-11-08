import { View, SafeAreaView, ScrollView, RefreshControl } from "react-native"
import HeaderBar from "@/components/HeaderBar"
import { deviceHeight } from "@/constants/values"
import SavedList from "@/components/SavedList"
import InterSemiBold from "@/components/Text/InterSemiBold"
import { useMode } from "@/contexts/ModeContext"
import { useEffect, useState } from "react"
import { useApi } from "@/contexts/ApiContext"
import { router } from "expo-router"

import AuthGuard from "@/components/AuthGuard"
import { usePullToRefresh } from "@/hooks/usePullToRefresh"

// Buyer-only. Seller mode has its own route at app/(tabs)/activity — see that
// file for the "Activities" dashboard this used to render inline here.
const Saved = () => {
  const { isSeller, isLoading } = useMode()
  const { getProperties } = useApi()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!isLoading && isSeller) {
      router.replace("/(tabs)/activity")
    }
  }, [isLoading, isSeller])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await getProperties(50, 1)
    } catch (error) {
      console.error("Saved refresh error:", error)
    } finally {
      setRefreshing(false)
    }
  }

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes when the tab is returned to.
  usePullToRefresh(onRefresh)

  return (
    <AuthGuard requireAuth={true}>
      <SafeAreaView style={{ flex: 1 }}>
        <View className="container mx-auto max-w-2xl" style={{ padding: 20, height: deviceHeight }}>
          {/* Header */}
          <View className="mb-4">
            <InterSemiBold className="text-lg/5">Saved Properties</InterSemiBold>
          </View>

          <HeaderBar />
          <ScrollView
            horizontal={false}
            className="mt-2 flex-1"
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <SavedList scrollEnabled={false} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </AuthGuard>
  )
}

export default Saved

import { View, ScrollView, SafeAreaView, Dimensions } from "react-native";
import { deviceHeight } from "@/constants/values";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const DetailSkeleton = () => (
  <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
    <ScrollView
      className="container flex-1 mx-auto max-w-2xl"
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header Image Skeleton */}
      <View 
        className="bg-gray-200 animate-pulse" 
        style={{ width: "100%", height: 325 }} 
      />

      <View className="p-5 space-y-4">
        {/* Title and Category */}
        <View className="space-y-2">
          <View className="h-6 bg-gray-200 rounded-md w-3/4 animate-pulse" />
          <View className="h-4 bg-gray-200 rounded-md w-1/4 animate-pulse" />
        </View>

        {/* Location */}
        <View className="flex-row items-center gap-2">
          <View className="h-4 w-4 bg-gray-200 rounded-full animate-pulse" />
          <View className="h-4 bg-gray-200 rounded-md w-1/2 animate-pulse" />
        </View>
        
        {/* Badges (Beds/Baths) */}
        <View className="flex-row gap-2 my-2">
          <View className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse" />
          <View className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse" />
        </View>
      </View>

      {/* Seller Section */}
      <View className="border-t border-borderColor px-5 py-4">
        <View className="flex-row justify-between items-center">
          <View className="flex-row gap-3 items-center">
            <View className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
            <View className="space-y-1">
              <View className="h-4 bg-gray-200 rounded-md w-32 animate-pulse" />
              <View className="h-3 bg-gray-200 rounded-md w-20 animate-pulse" />
            </View>
          </View>
          <View className="flex-row gap-2">
            <View className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse" />
            <View className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse" />
          </View>
        </View>
      </View>

      {/* Description */}
      <View className="px-5 py-4 border-t border-borderColor space-y-3">
        <View className="h-5 bg-gray-200 rounded-md w-32 animate-pulse" />
        <View className="space-y-2">
          <View className="h-4 bg-gray-200 rounded-md w-full animate-pulse" />
          <View className="h-4 bg-gray-200 rounded-md w-full animate-pulse" />
          <View className="h-4 bg-gray-200 rounded-md w-2/3 animate-pulse" />
        </View>
      </View>

      {/* Extras */}
      <View className="px-5 py-4 space-y-3">
        <View className="h-5 bg-gray-200 rounded-md w-24 animate-pulse" />
        <View className="flex-row flex-wrap gap-2">
          {[1, 2, 3, 4].map(i => (
            <View key={i} className="h-8 w-28 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </View>
      </View>
    </ScrollView>

    {/* Bottom Bar */}
    <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-borderColor p-4">
      <View className="flex-row items-center justify-between">
        <View className="space-y-1">
          <View className="h-4 bg-gray-200 rounded-md w-16 animate-pulse" />
          <View className="h-6 bg-gray-200 rounded-md w-32 animate-pulse" />
        </View>
        <View className="h-12 w-32 bg-gray-200 rounded-lg animate-pulse" />
      </View>
    </View>
  </SafeAreaView>
);

export default DetailSkeleton;

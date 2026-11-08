import { View } from "react-native";

const LoadingSkeleton = () => (
  <View className="flex-row flex-wrap gap-3 px-2">
    {[1, 2, 3].map((i) => (
      <View
        key={i}
        className="w-full lg:w-[49%] bg-gray-100 rounded-2xl overflow-hidden"
        style={{ height: 320 }}
      >
        <View className="h-48 bg-gray-200 animate-pulse" />
        <View className="p-4 space-y-3">
          <View className="h-5 bg-gray-200 rounded w-3/4 animate-pulse" />
          <View className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
          <View className="h-8 bg-gray-200 rounded-full w-28 animate-pulse" />
        </View>
      </View>
    ))}
  </View>
);

export default LoadingSkeleton;
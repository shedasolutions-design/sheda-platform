import React from "react";
import { View, Dimensions } from "react-native";

const deviceWidth = Dimensions.get("window").width;

const CarouselSkeleton = () => {
  return (
    <View className="w-full max-w-2xl mx-auto justify-center items-center">
      <View
        style={{
          width: deviceWidth - 40,
          height: 155,
        }}
        className="bg-gray-200 rounded-lg overflow-hidden relative animate-pulse"
      >
        {/* Darker overlay at bottom similar to real card */}
        <View className="absolute inset-x-0 bottom-0 h-1/2 bg-gray-300/30" />

        <View className="absolute inset-0 px-3">
          {/* Price Tag Skeleton */}
          <View className="flex items-end mt-3">
            <View className="bg-gray-300 h-8 w-24 rounded-lg animate-pulse" />
          </View>

          <View className="mt-11">
            {/* Title Skeleton */}
            <View className="h-6 w-3/4 bg-gray-300 rounded mb-3 animate-pulse" />

            {/* Icons Skeleton */}
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center pr-3 border-r border-gray-300">
                <View className="h-4 w-4 bg-gray-300 rounded mr-1" />
                <View className="h-3 w-16 bg-gray-300 rounded" />
              </View>

              <View className="flex-row items-center pr-3 border-r border-gray-300">
                <View className="h-4 w-4 bg-gray-300 rounded mr-1" />
                <View className="h-3 w-12 bg-gray-300 rounded" />
              </View>

              <View className="flex-row items-center pr-3">
                <View className="h-4 w-4 bg-gray-300 rounded mr-1" />
                <View className="h-3 w-12 bg-gray-300 rounded" />
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default CarouselSkeleton;

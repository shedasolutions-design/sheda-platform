//carousel package documentation at https://rn-carousel.dev/usage

import * as React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Text, View, Dimensions, Image, ImageSourcePropType } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import Carousel, {
  ICarouselInstance,
  Pagination,
} from "react-native-reanimated-carousel";
import InterBold from "../Text/InterBold";

const deviceWidth = Dimensions.get("window").width; // Get device width

// Placeholder promo content for the Featured slot — not tied to live listings.
// Swap this out (or feed it from real data) once we're ready to feature
// specific properties or run paid ads here.
interface FeaturedSlide {
  id: string;
  title: string;
  subtitle: string;
  image: ImageSourcePropType;
}

const FEATURED_SLIDES: FeaturedSlide[] = [
  {
    id: "verified-properties",
    title: "Verified Properties, Nationwide",
    subtitle: "Every listing checked before it goes live",
    image: require("@/assets/images/apt-1.png"),
  },
  {
    id: "escrow-protection",
    title: "Blockchain-Secured Escrow",
    subtitle: "Your funds stay protected until the deal is done",
    image: require("@/assets/images/apt-2.png"),
  },
  {
    id: "list-with-sheda",
    title: "List Your Property in Minutes",
    subtitle: "Reach thousands of buyers and renters on Sheda",
    image: require("@/assets/images/hero.png"),
  },
];

export default function FeaturedCarousel() {
  const ref = React.useRef<ICarouselInstance>(null);
  const progress = useSharedValue(0);

  // Handle pagination dot press
  const onPressPagination = (index: number) => {
    ref.current?.scrollTo({
      index, // Scroll directly to the clicked index
      animated: true,
    });
  };

  return (
    <GestureHandlerRootView style={{}}>
      <View className=" w-full max-w-2xl mx-auto justify-center items-center">
        <Carousel
          ref={ref}
          width={deviceWidth - 40} // Match the width to the design (with padding)
          height={155}
          style={{
            justifyContent: "center",
            alignContent: "center",
            maxWidth: 630,
            borderRadius: 8,
          }}
          loop={FEATURED_SLIDES.length > 1}
          data={FEATURED_SLIDES}
          onProgressChange={(_, absoluteProgress) => {
            progress.value = absoluteProgress; // Update progress for pagination
          }}
          renderItem={({ item }) => (
            <View className="h-full w-full max-w-[630] mx-auto rounded-lg box-border relative overflow-hidden">
              <Image
                source={item.image}
                resizeMode="cover"
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 8,
                }}
              />
              <View className="absolute inset-0 bg-black/40 rounded-lg" />

              <View className="absolute inset-0 px-3 justify-end pb-4">
                <InterBold className="text-white text-base">{item.title}</InterBold>
                <Text className="text-[#FFFFFFCC] text-xs mt-1">
                  {item.subtitle}
                </Text>
              </View>
            </View>
          )}
        />

        {FEATURED_SLIDES.length > 1 && (
          <View style={{ marginTop: 10 }}>
            <Pagination.Basic
              progress={progress}
              data={FEATURED_SLIDES}
              dotStyle={{
                backgroundColor: "rgba(0,0,0,0.1)",
                borderRadius: 9999,
                width: 8,
                height: 8,
              }}
              activeDotStyle={{
                backgroundColor: "#C1272D",
                borderRadius: 9999,
                width: 8,
                height: 8,
              }}
              containerStyle={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 4,
              }}
              onPress={onPressPagination}
            />
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

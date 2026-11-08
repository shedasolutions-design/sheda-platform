import { View, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FilterInputs, { FilterValues } from "./FilterInput";
import Button from "@/components/common/Button";
import InterRegular from "@/components/Text/InterRegular";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import { useApi } from "@/contexts/ApiContext";
import { router } from "expo-router";
import { useCallback } from "react";

// Capitalised because React's rules are enforced by naming: lint cannot tell
// a lowercase `filter` is a component, so every hook inside it read as a hook
// called from a plain function — three errors that hid whether the rules were
// actually being followed here.
const Filter = () => {
  const { setSelectedCategory, setActiveFilters } = useApi();

  const handleSubmit = useCallback(
    (filters: FilterValues) => {
      // Everything the screen collects is applied now.
      //
      // It used to compute a filtered list from these and throw it away,
      // keeping only the property type as a category chip. A person could set
      // a price range, bedrooms, bathrooms, a location and seven extras, and
      // every one of them did nothing — the results came back unchanged,
      // which reads as "nothing matches" rather than "that was ignored".
      setActiveFilters(filters);

      // The chip still follows the property type, so the home screen's own
      // category row agrees with what was just filtered on. It also covers
      // the seven types the backend has no column for — those are matched on
      // the listing title, which is all the chip ever did for them.
      if (filters.propertyType) {
        const typeToCategory: Record<string, string> = {
          apartment: "Apartments",
          land: "Land",
          shortlet: "Shortlets",
          "shared apartment": "Shared Apartments",
          bungalow: "Bungalows",
          duplex: "Duplexes",
          "luxury villa": "Luxury Villas",
          townhouse: "Townhouses",
          waterfront: "Waterfront Properties",
          "new development": "New Developments",
          "affordable home": "Affordable Homes",
        };
        setSelectedCategory(
          typeToCategory[filters.propertyType.toLowerCase()] || "All"
        );
      } else {
        setSelectedCategory("All");
      }

      router.back();
    },
    [setActiveFilters, setSelectedCategory]
  );

  const handleReset = useCallback(() => {
    // Clear the filters too, or Reset only drops the chip and leaves the
    // price range and the rest quietly narrowing everything.
    setActiveFilters(null);
    setSelectedCategory("All");
    router.back();
  }, [setActiveFilters, setSelectedCategory]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        className="container flex-1 mx-auto max-w-2xl py-5"
        style={{ padding: 20 }}
      >
        <View className="flex-row items-center gap-4">
          <BackBtn />
          <InterSemiBold className="text-lg/5">Filter</InterSemiBold>
        </View>

        <View className="my-6">
          <FilterInputs onSubmit={handleSubmit} />

          <View className="flex-row gap-3 mt-6">
            <View className="flex-1">
              <Button
                onPress={handleReset}
                className="rounded-lg py-4"
                color="#F3F4F6"
              >
                <InterRegular className="text-gray-700 text-center">
                  Reset
                </InterRegular>
              </Button>
            </View>
            <View className="flex-1">
              <Button
                onPress={() =>
                  handleSubmit({
                    location: "",
                    propertyType: "",
                    listingType: "",
                    sortBy: "",
                    bedrooms: 0,
                    bathrooms: 0,
                    minPrice: 0,
                    maxPrice: Infinity,
                    furnished: false,
                    extras: {
                      airConditioner: false,
                      popCeiling: false,
                      floorTiles: false,
                      runningWater: false,
                      furniture: false,
                      prepaidMeter: false,
                      wifi: false,
                      negotiable: false,
                    },
                  })
                }
                className="rounded-lg bg-primary py-4"
              >
                <InterRegular className="text-white text-center">
                  Apply Filters
                </InterRegular>
              </Button>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Filter;

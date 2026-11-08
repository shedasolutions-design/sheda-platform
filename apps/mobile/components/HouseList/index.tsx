import { View, RefreshControl, ScrollView } from "react-native";
import { useEffect, useState } from "react";
import { useApi } from "@/contexts/ApiContext";
import HouseCard from "../HouseCard";
import { HouseCardProps } from "../HouseCard/types";
import LoadingSkeleton from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import { PropertyShow } from "@/services/api";
import { adaptPropertyToHouse } from "@/utilities/adapter";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface HouseListProps {
  properties?: PropertyShow[];
  scrollEnabled?: boolean;
}

const HouseList = ({ properties: propProperties, scrollEnabled }: HouseListProps) => {
  const {
    properties: contextProperties,
    getProperties,
    isLoading = false,
    error,
    isInitializing,
    selectedCategory,
    searchQuery,
    user,
  } = useApi();
  const [refreshing, setRefreshing] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);

  // Determine if we should enable scrolling
  // Default to true if not provided, but always false if propProperties is provided (for Details page)
  const shouldScroll = scrollEnabled !== undefined ? scrollEnabled : !propProperties;

  const loadProperties = async () => {
    if (!propProperties) {
      await getProperties(20, 1);
      setHasAttempted(true);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProperties();
    setRefreshing(false);
  };

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes when the screen is returned to.
  usePullToRefresh(onRefresh);

  useEffect(() => {
    if (isInitializing || propProperties) return;

    const controller = new AbortController();
    const fetch = async () => {
      await getProperties(20, 1, { signal: controller.signal });
      setHasAttempted(true);
    };

    fetch();

    return () => controller.abort();
  }, [getProperties, isInitializing, propProperties]);

  const displayProperties = propProperties || contextProperties;

  // Filter out unavailable (sold/rented) properties from home feed
  // Own listings remain visible — transaction guards on details/summary pages prevent self-bidding/payment
  const availableProperties = displayProperties.filter((property: PropertyShow) => {
    if (!property) return false;
    // When showing context properties (home feed), hide unavailable properties
    if (!propProperties) {
      if (property.status === "sold" || property.status === "rented") return false;
    }
    return true;
  });

  const filteredProperties = availableProperties.filter((property: PropertyShow) => {
    if (!property) return false;

    // Only apply category and search filters if we're using context properties
    if (!propProperties) {
      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const titleMatch = property.title?.toLowerCase().includes(searchLower);
        const locationMatch = property.location?.toLowerCase().includes(searchLower);
        const typeMatch = property.property_type?.toLowerCase().includes(searchLower);

        if (!titleMatch && !locationMatch && !typeMatch) return false;
      }

      if (selectedCategory === "All") return true;

      // Map categories to property_type
      const categoryLower = selectedCategory.toLowerCase();
      const typeLower = property.property_type?.toLowerCase().replace("_", " ");

      // Direct matches
      if (categoryLower === "apartments" && typeLower === "apartment") return true;
      if (categoryLower === "land" && typeLower === "land") return true;
      if (categoryLower === "shortlets" && typeLower === "shortlet") return true;
      if (categoryLower === "shared apartments" && typeLower === "shared apartment") return true;

      // Plural/Singular fuzzy matches
      let categorySingular = categoryLower;
      if (categoryLower.endsWith("ies")) {
        categorySingular = categoryLower.slice(0, -3) + "y";
      } else if (categoryLower.endsWith("es") && categoryLower !== "houses") {
        categorySingular = categoryLower.slice(0, -2);
      } else if (categoryLower.endsWith("s")) {
        categorySingular = categoryLower.slice(0, -1);
      }

      if (typeLower === categorySingular) return true;
      if (typeLower === categoryLower) return true;

      // Search in title if no direct type match for more generic categories
      if (property.title?.toLowerCase().includes(categorySingular)) return true;
      if (property.title?.toLowerCase().includes(categoryLower)) return true;

      // If we're here, it means we're on the home screen and a category was selected but didn't match
      return false;
    }

    return true;
  });

  const content = (
    <>
      {(isLoading || isInitializing) && !refreshing && !propProperties && contextProperties.length === 0 ? (
        <LoadingSkeleton />
      ) : error && hasAttempted && !propProperties && contextProperties.length === 0 ? (
        <ErrorState message={error} onRetry={onRefresh} />
      ) : (propProperties ? filteredProperties.length === 0 : hasAttempted && filteredProperties.length === 0) ? (
        <EmptyState onRefresh={onRefresh} />
      ) : filteredProperties && filteredProperties.length > 0 ? (
        <View className={`flex-row flex-wrap gap-3 ${propProperties ? '' : 'px-2 pb-6'}`}>
          {filteredProperties.map((property: PropertyShow, index: number) => (
            <Animated.View
              key={property.id}
              className={propProperties ? "w-full" : "w-full lg:w-[49%]"}
              entering={FadeInDown.delay(index * 100).duration(500)}
              layout={LinearTransition}
            >
              <HouseCard house={adaptPropertyToHouse(property)} />
            </Animated.View>
          ))}
        </View>
      ) : null}
    </>
  );

  if (!shouldScroll) {
    return content;
  }

  return (
    <ScrollView
      className="flex-1"
      refreshControl={
        propProperties ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {content}
    </ScrollView>
  );
};

export default HouseList;
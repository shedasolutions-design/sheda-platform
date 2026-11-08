import { Text, View, ScrollView, RefreshControl } from "react-native";
import { useEffect, useState, useMemo } from "react";
import { useApi } from "@/contexts/ApiContext";
import HouseCard from "../HouseCard";
import { HouseCardProps } from "../HouseCard/types";
import Button from "../common/Button";
import InterSemiBold from "../Text/InterSemiBold";
import InterRegular from "../Text/InterRegular";
import { adaptPropertyToHouse } from "@/utilities/adapter";
import LoadingSkeleton from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface SavedListProps {
  scrollEnabled?: boolean;
}

const SavedList = ({ scrollEnabled = true }: SavedListProps) => {
  const { properties, getProperties, isLoading, error, favorites, searchQuery } = useApi();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Load properties if not already loaded
    if (properties.length === 0) {
      getProperties(50, 1);
    }
  }, [getProperties, properties.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await getProperties(50, 1);
    setRefreshing(false);
  };

  // RefreshControl does nothing on web; this restores the pull gesture and
  // also refreshes when the screen is returned to.
  usePullToRefresh(onRefresh);

  const favoriteProperties = useMemo(() => {
    return properties.filter(p => {
      if (!p || !favorites.includes(p.id)) return false;
      
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const titleMatch = p.title?.toLowerCase().includes(searchLower);
        const locationMatch = p.location?.toLowerCase().includes(searchLower);
        const typeMatch = p.property_type?.toLowerCase().includes(searchLower);
        
        if (!titleMatch && !locationMatch && !typeMatch) return false;
      }
      
      return true;
    });
  }, [properties, favorites, searchQuery]);

  const content = (
    <View className="flex-row flex-wrap gap-3 px-2 pb-6">
      {favoriteProperties.map((house: any, index) => (
        <Animated.View 
          key={house.id} 
          className="w-full lg:w-[49%]"
          entering={FadeInDown.delay(index * 100).duration(500)}
          layout={LinearTransition}
        >
          <HouseCard house={adaptPropertyToHouse(house)} />
        </Animated.View>
      ))}
    </View>
  );

  if (isLoading && !refreshing && properties.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error && properties.length === 0) {
    return <ErrorState message={error} onRetry={onRefresh} />;
  }

  if (favoriteProperties.length === 0) {
    return (
      <EmptyState 
        onRefresh={onRefresh} 
        title="No Saved Properties" 
        message={searchQuery ? "No saved properties match your search." : "You haven't saved any properties yet. Tap the heart icon on any property to save it."}
      />
    );
  }

  if (!scrollEnabled) {
    return content;
  }

  return (
    <ScrollView 
      className="flex-1"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {content}
    </ScrollView>
  );
};
export default SavedList;

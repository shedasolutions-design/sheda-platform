import FeaturedCarousel from "@/components/Carousel";
import HeaderBar from "@/components/HeaderBar";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import InterBold from "@/components/Text/InterBold";
import InterRegular from "@/components/Text/InterRegular";
import {
  View,
  SafeAreaView,
  RefreshControl,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useFocusEffect, router } from "expo-router";
import { useApi } from "@/contexts/ApiContext";
import CategoryList from "@/components/CategoryList";
import { deviceHeight } from "@/constants/values";
import HouseCard from "@/components/HouseCard";
import Animated, { FadeInDown } from "react-native-reanimated";
import ErrorState from "@/components/ui/ErrorState";
import { PropertySkeletonList } from "@/components/common/PropertySkeleton";
import { PropertyShow } from "@/services/api";
import { HouseProps } from "@/types";
import { adaptPropertyToHouse } from "@/utilities/adapter";
import { usePropertySearch } from "@/hooks/usePropertySearch";
import { matchesCategory } from "@/utilities/propertyCategories";

const PAGE_SIZE = 20;

const Home = () => {
  const { getProperties, error, clearError, properties, selectedCategory, searchQuery, activeFilters, user } = useApi();
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Auto-fetch on first mount
  useEffect(() => {
    if (properties.length === 0) {
      getProperties(PAGE_SIZE, 1).catch(() => setHasError(true));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent background refresh when tab is revisited
  useFocusEffect(
    useCallback(() => {
      if (properties.length > 0) {
        getProperties(PAGE_SIZE, 1, { silent: true } as any).catch(() => { });
      }
    }, [getProperties])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setHasError(false);
    clearError();
    try {
      await getProperties(PAGE_SIZE, 1);
      setPage(1);
      setHasMore(true);
    } catch (err) {
      console.error("Home refresh error:", err);
      setHasError(true);
    } finally {
      setRefreshing(false);
    }
  }, [getProperties, clearError]);

  // Restores pull-to-refresh on web and refreshes when the tab is returned to.
  const webRefresh = usePullToRefresh(onRefresh);

  const handleRetry = useCallback(() => {
    setHasError(false);
    clearError();
    onRefresh();
  }, [clearError, onRefresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const prevLength = properties.length;
      const nextPage = page + 1;
      await getProperties(PAGE_SIZE, nextPage);
      if (properties.length - prevLength < PAGE_SIZE) {
        setHasMore(false);
      }
      setPage(nextPage);
    } catch {
      // Silently fail — user can pull to refresh
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, getProperties, properties.length]);

  // Filter out unavailable properties
  const availableProperties = useMemo(
    () =>
      properties.filter(
        (p) => p.status !== "sold" && p.status !== "rented"
      ),
    [properties]
  );

  // Sort by user's profile location first (nearby properties bubble to top)
  const sortedByLocation = useMemo(() => {
    const userLocation = user?.location?.toLowerCase()?.trim();
    if (!userLocation) return availableProperties;

    // Split into nearby and others
    const nearby: PropertyShow[] = [];
    const others: PropertyShow[] = [];

    for (const property of availableProperties) {
      const propLocation = property.location?.toLowerCase()?.trim() || "";
      // Check if the property location contains the user's location or vice versa
      if (
        propLocation.includes(userLocation) ||
        userLocation.includes(propLocation) ||
        // Also match on city/state portions
        propLocation.split(",").some((part) => userLocation.includes(part.trim())) ||
        userLocation.split(",").some((part) => propLocation.includes(part.trim()))
      ) {
        nearby.push(property);
      } else {
        others.push(property);
      }
    }

    return [...nearby, ...others];
  }, [availableProperties, user?.location]);

  // Search the whole marketplace, not just the page that happens to be loaded.
  //
  // The local filtering below only ever saw the first twenty rows of the feed,
  // so a property that existed but sat further down was indistinguishable from
  // one that was never listed.
  const search = usePropertySearch(searchQuery, selectedCategory, activeFilters);

  // Apply category and search filters
  const filteredProperties = useMemo(() => {
    let filtered = sortedByLocation;

    // Apply search query filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter((property) => {
        const titleMatch = property.title?.toLowerCase().includes(searchLower);
        const locationMatch = property.location?.toLowerCase().includes(searchLower);
        const typeMatch = property.property_type?.toLowerCase().includes(searchLower);
        const descMatch = property.description?.toLowerCase().includes(searchLower);
        return titleMatch || locationMatch || typeMatch || descMatch;
      });
    }

    // Apply category filter — shared with the backend-results path below, so
    // a chip narrows the same way whichever list is on screen.
    if (selectedCategory && selectedCategory !== "All") {
      filtered = filtered.filter((property) => matchesCategory(property, selectedCategory));
    }

    return filtered;
  }, [sortedByLocation, selectedCategory, searchQuery]);

  // Backend results when the search reached it; the locally filtered list
  // otherwise. A failed request falls back rather than showing an error —
  // narrowing what is already on screen is far better than an empty page with
  // a complaint on it.
  const displayedProperties = useMemo(() => {
    if (!search.active || search.failed) return filteredProperties;
    // Only four of the twelve chips map to a backend property_type, so the
    // others cannot be filtered server-side — narrow the results here too,
    // or selecting one of those seven would appear to do nothing.
    return search.results.filter((property) => matchesCategory(property, selectedCategory));
  }, [search.active, search.failed, search.results, filteredProperties, selectedCategory]);

  // Stable header/footer using useMemo to avoid re-mount on every render
  const listHeader = useMemo(
    () => (
      <>
        <Animated.View className="mb-3" entering={FadeInDown.delay(200).duration(600)}>
          <InterBold className="text-base mb-1">Featured</InterBold>
          <FeaturedCarousel />
        </Animated.View>

        <Animated.View className="mb-2" entering={FadeInDown.delay(400).duration(600)}>
          <View className="flex-row justify-between items-center mb-1">
            <InterBold className="text-base mb-2">Categories</InterBold>
            <TouchableOpacity
              onPress={() => router.push("/see-all" as any)}
            >
              <InterRegular className="text-base text-primary">See All</InterRegular>
            </TouchableOpacity>
          </View>
          <CategoryList />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600).duration(600)}>
          <View className="flex-row justify-between items-center mb-1">
            <InterBold className="text-base mb-2">Nearby Properties</InterBold>
          </View>
        </Animated.View>
      </>
    ),
    [] // static — doesn't depend on changing state
  );

  // Dynamic parts that depend on state go into the renderItem / ListFooter
  const listEmpty = useMemo(() => {
    if (properties.length === 0 && !hasError) {
      return <PropertySkeletonList count={3} />;
    }
    if (search.active && search.loading) {
      return <PropertySkeletonList count={3} />;
    }
    if (displayedProperties.length === 0) {
      return (
        <View className="py-10 items-center">
          <InterRegular className="text-secondaryText text-sm text-center">
            {search.active
              ? `No properties match "${searchQuery}"${selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}`
              : `No properties found${selectedCategory !== "All" ? ` in "${selectedCategory}"` : ""}`}
          </InterRegular>
        </View>
      );
    }
    return null;
  }, [properties.length, hasError, displayedProperties.length, selectedCategory, search.active, search.loading, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: PropertyShow }) => {
      const transformed = adaptPropertyToHouse(item);
      return (
        <View className="mb-3">
          <HouseCard house={transformed} />
        </View>
      );
    },
    []
  );

  const keyExtractor = useCallback((item: PropertyShow) => String(item.id), []);

  const listFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color="#C1272D" />
        </View>
      );
    }
    if (!search.active && !hasMore && displayedProperties.length > 0) {
      return (
        <View className="py-4 items-center">
          <InterRegular className="text-secondaryText text-xs">
            You've seen all properties
          </InterRegular>
        </View>
      );
    }
    return null;
  }, [loadingMore, hasMore, displayedProperties.length, search.active]);

  // Error state — no data loaded.
  //
  // Below every hook on purpose. Returning here early meant the five hooks
  // that follow ran on some renders and not others, and React counts hooks
  // per render: the moment this state cleared — an offline launch followed by
  // a successful pull-to-refresh, which is the ordinary way to reach it — the
  // next render asked for five hooks that had not existed before and React
  // threw rather than recovering.
  if (hasError && properties.length === 0 && !refreshing) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View
          className="container mx-auto max-w-2xl"
          style={{ padding: 20, height: deviceHeight }}
        >
          <HeaderBar />
          <ErrorState
            message={error || "Failed to load properties"}
            onRetry={handleRetry}
            type="network"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View
        className="container mx-auto max-w-2xl"
        style={{ paddingHorizontal: 20, paddingTop: 20, flex: 1 }}
      >
        <HeaderBar />

        <FlatList
          data={displayedProperties}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={listEmpty}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          // RefreshControl is inert on web (react-native-web renders it as a
          // bare View and drops onRefresh), so the gesture comes from
          // usePullToRefresh instead. onScroll is how it knows the list is at
          // the top and a downward drag is a pull rather than a scroll.
          onScroll={webRefresh.onScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      </View>
    </SafeAreaView>
  );
};

export default Home;

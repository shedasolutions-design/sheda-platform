"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HeaderBar from "@/components/HeaderBar";
import FeaturedCarousel from "@/components/property/FeaturedCarousel";
import CategoryList from "@/components/property/CategoryList";
import HouseCard, { PropertySkeletonList } from "@/components/property/HouseCard";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ButtonLink } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useApi } from "@/contexts/ApiContext";
import type { PropertyShow } from "@/services/api";
import { adaptPropertyToHouse } from "@/utilities/adapter";
import { usePropertySearch } from "@/hooks/usePropertySearch";
import { matchesCategory } from "@/utilities/propertyCategories";

const PAGE_SIZE = 20;

export default function HomePage() {
  const {
    getProperties,
    error,
    clearError,
    properties,
    selectedCategory,
    searchQuery,
    activeFilters,
    user,
    isAuthenticated,
    isLoading,
  } = useApi();
  const [hasError, setHasError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // First visit loads; returning to the tab refreshes quietly in the background.
  useEffect(() => {
    if (properties.length === 0) {
      getProperties(PAGE_SIZE, 1).catch(() => setHasError(true));
    } else {
      getProperties(PAGE_SIZE, 1, { silent: true } as any).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(async () => {
    setHasError(false);
    clearError();
    try {
      await getProperties(PAGE_SIZE, 1);
      setPage(1);
      setHasMore(true);
    } catch {
      setHasError(true);
    }
  }, [getProperties, clearError]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const before = properties.length;
      const next = page + 1;
      await getProperties(PAGE_SIZE, next);
      if (properties.length - before < PAGE_SIZE) setHasMore(false);
      setPage(next);
    } catch {
      // A failed page leaves the list as it was; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, getProperties, properties.length]);

  const available = useMemo(
    () => properties.filter((p) => p.status !== "sold" && p.status !== "rented"),
    [properties]
  );

  // Properties near the user's saved location first.
  const sortedByLocation = useMemo(() => {
    const here = user?.location?.toLowerCase()?.trim();
    if (!here) return available;
    const nearby: PropertyShow[] = [];
    const others: PropertyShow[] = [];
    for (const p of available) {
      const loc = p.location?.toLowerCase()?.trim() || "";
      const close =
        loc.includes(here) ||
        here.includes(loc) ||
        loc.split(",").some((part) => here.includes(part.trim())) ||
        here.split(",").some((part) => loc.includes(part.trim()));
      (close ? nearby : others).push(p);
    }
    return [...nearby, ...others];
  }, [available, user?.location]);

  // Server-side search when a query or filter is active; local filtering as a fallback.
  const search = usePropertySearch(searchQuery, selectedCategory, activeFilters);

  const filtered = useMemo(() => {
    let list = sortedByLocation;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q) ||
          p.property_type?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }
    if (selectedCategory && selectedCategory !== "All") {
      list = list.filter((p) => matchesCategory(p, selectedCategory));
    }
    return list;
  }, [sortedByLocation, selectedCategory, searchQuery]);

  const displayed = useMemo(() => {
    if (!search.active || search.failed) return filtered;
    return search.results.filter((p) => matchesCategory(p, selectedCategory));
  }, [search.active, search.failed, search.results, filtered, selectedCategory]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || search.active) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, search.active]);

  // The backend only lists properties to signed-in users. Say so, rather than
  // leaving loading placeholders up forever.
  if (!isAuthenticated && properties.length === 0 && !isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-5 pt-5">
        <HeaderBar />
        <EmptyState
          title="Sign in to browse properties"
          message="Listings are shown to signed-in members so every viewing, offer and payment is tied to a verified account."
          action={
            <div className="flex gap-3">
              <ButtonLink href="/login?next=/home">Sign in</ButtonLink>
              <ButtonLink href="/signup" variant="outline">
                Create account
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  if ((hasError || (error && !isLoading)) && properties.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-5 pt-5">
        <HeaderBar />
        <ErrorState message={error || "Failed to load properties"} onRetry={retry} />
      </div>
    );
  }

  const loadingFirst = (properties.length === 0 && !hasError) || (search.active && search.loading);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-5">
      <HeaderBar />

      <section className="mb-3 mt-5">
        <h2 className="mb-1 text-base font-bold">Featured</h2>
        <FeaturedCarousel />
      </section>

      <section className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold">Categories</h2>
          <Link href="/see-all" className="text-primary hover:underline">
            See All
          </Link>
        </div>
        <CategoryList />
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">Nearby Properties</h2>
        {loadingFirst ? (
          <PropertySkeletonList count={3} />
        ) : displayed.length === 0 ? (
          <p className="py-10 text-center text-sm text-secondaryText">
            {search.active
              ? `No properties match "${searchQuery}"${selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}`
              : `No properties found${selectedCategory !== "All" ? ` in "${selectedCategory}"` : ""}`}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {displayed.map((p) => (
              <li key={p.id}>
                <HouseCard house={adaptPropertyToHouse(p)} />
              </li>
            ))}
          </ul>
        )}

        <div ref={sentinel} />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Spinner size={20} />
          </div>
        )}
        {!search.active && !hasMore && displayed.length > 0 && (
          <p className="py-4 text-center text-xs text-secondaryText">You&apos;ve seen all properties</p>
        )}
      </section>
    </div>
  );
}

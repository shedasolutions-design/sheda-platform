"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import HeaderBar from "@/components/HeaderBar";
import HouseCard, { PropertySkeletonList } from "@/components/property/HouseCard";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { adaptPropertyToHouse } from "@/utilities/adapter";

function SavedList() {
  const { properties, getProperties, isLoading, error, favorites, searchQuery } = useApi();

  useEffect(() => {
    if (properties.length === 0) getProperties(50, 1);
  }, [getProperties, properties.length]);

  const saved = useMemo(() => {
    const q = searchQuery?.toLowerCase();
    return properties.filter((p) => {
      if (!p || !favorites.includes(p.id)) return false;
      if (!q) return true;
      return (
        p.title?.toLowerCase().includes(q) ||
        p.location?.toLowerCase().includes(q) ||
        p.property_type?.toLowerCase().includes(q)
      );
    });
  }, [properties, favorites, searchQuery]);

  if (isLoading && properties.length === 0) return <PropertySkeletonList count={2} />;
  if (error && properties.length === 0) {
    return <ErrorState message={error} onRetry={() => getProperties(50, 1)} />;
  }
  if (saved.length === 0) {
    return (
      <EmptyState
        icon={<Heart size={40} />}
        title="No Saved Properties"
        message={
          searchQuery
            ? "No saved properties match your search."
            : "You haven't saved any properties yet. Click the heart on any property to save it."
        }
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {saved.map((p) => (
        <li key={p.id}>
          <HouseCard house={adaptPropertyToHouse(p)} />
        </li>
      ))}
    </ul>
  );
}

export default function SavedPage() {
  const router = useRouter();
  const { isSeller, isLoading } = useMode();

  // Saved is a buyer tab; sellers land on their activity instead.
  useEffect(() => {
    if (!isLoading && isSeller) router.replace("/activity");
  }, [isLoading, isSeller, router]);

  return (
    <AuthGuard requireAuth>
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-5">
        <h1 className="mb-4 text-lg font-semibold">Saved Properties</h1>
        <HeaderBar />
        <div className="mt-5">
          <SavedList />
        </div>
      </div>
    </AuthGuard>
  );
}

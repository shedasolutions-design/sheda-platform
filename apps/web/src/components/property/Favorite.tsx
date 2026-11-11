"use client";

import { Heart } from "lucide-react";
import { useApi } from "@/contexts/ApiContext";

/** Heart toggle for saving a property. Works inside a clickable card. */
export default function Favorite({
  propertyId,
  className = "",
}: {
  propertyId: number;
  className?: string;
}) {
  const { favorites, toggleFavorite } = useApi();
  const saved = favorites.includes(propertyId);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save property"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(propertyId);
      }}
      className={`flex h-12 w-12 items-center justify-center rounded-xl border border-borderColor hover:bg-cardBackground ${className}`}
    >
      <Heart size={16} className={saved ? "fill-primary text-primary" : "text-primaryText"} />
    </button>
  );
}

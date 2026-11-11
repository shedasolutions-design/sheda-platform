import { PropertyShow } from "@/services/api";
import { HouseProps } from "@/types";
import getFullImageUrl from "./imageUrl";

export const adaptPropertyToHouse = (property: PropertyShow): HouseProps => {
  const primaryImage = property.images && property.images.length > 0
    ? (property.images.find(img => img.is_primary)?.image_url || property.images[0].image_url)
    : undefined;

  return {
    id: property.id?.toString() || "",
    title: property.title || "No Title",
    price: property.price?.toString() || "0",
    type: property.property_type,
    location: property.location,
    bedrooms: property.bedroom || 0,
    bathrooms: property.bathroom || 0,
    mode: property.listing_type === "sale" ? "buy" : "rent",
    description: property.description,
    extras: [
      property.furnished ? "Furnished" : null,
      property.air_condition ? "Air Condition" : null,
      property.pop_ceiling ? "POP Ceiling" : null,
      property.wifi ? "WiFi" : null,
    ].filter(Boolean) as string[],
    image: primaryImage
      ? { uri: getFullImageUrl(primaryImage) }
      : { uri: "/images/apt-1.png" },
    isFavorite: false,
    status: property.status as "sold" | "rented" | "available" | undefined,
    agentId: property.agent_id,
    isUnavailable: property.status === "sold" || property.status === "rented",
  };
};

import { API_BASE_URL } from "@/services/api";

/**
 * Ensures an image URL is a full URL.
 * If it's a relative path, it prepends the API_BASE_URL.
 */
export const getFullImageUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  // Remove leading slash if present to avoid double slashes
  const cleanUrl = url.startsWith("/") ? url.slice(1) : url;
  return `${API_BASE_URL}/${cleanUrl}`;
};

/**
 * Like getFullImageUrl but appends a cache-buster parameter (?t=<timestamp>)
 * to force React Native's Image component to re-fetch after an upload.
 *
 * Usage:
 *   <Image source={{ uri: getCacheBustedImageUrl(user.avatar_url) }} />
 */
export const getCacheBustedImageUrl = (url?: string): string | undefined => {
  const fullUrl = getFullImageUrl(url);
  if (!fullUrl) return undefined;
  // If the URL already has a cache-buster, return as-is
  if (fullUrl.includes("?t=")) return fullUrl;
  return `${fullUrl}?t=${Date.now()}`;
};

export default getFullImageUrl;

import type { ReactNode } from "react";
import { Bath, BedDouble, MapPin } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import getFullImageUrl from "@/utilities/imageUrl";

/** The image source shape the carried-over card logic builds. */
export function dealImage(source: unknown): string {
  const uri =
    typeof source === "object" && source && "uri" in source ? String((source as { uri: string }).uri) : "/images/apt-1.png";
  return uri.startsWith("/images/") ? uri : getFullImageUrl(uri) || "/images/apt-1.png";
}

export function DealCard({ children }: { children: ReactNode }) {
  return <article className="w-full overflow-hidden rounded-lg border border-borderColor/60 bg-white">{children}</article>;
}

export function DealMedia({
  src,
  alt,
  onOpen,
  badges,
}: {
  src: string;
  alt: string;
  onOpen: () => void;
  badges: ReactNode;
}) {
  return (
    <button type="button" onClick={onOpen} className="relative block w-full text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-[175px] w-full object-cover" />
      {badges}
    </button>
  );
}

export function Badge({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${className}`} style={style}>
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge className={role === "seller" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}>
      {role === "seller" ? "Selling" : "Buying"}
    </Badge>
  );
}

export function DealFacts({
  title,
  location,
  bedrooms,
  bathrooms,
}: {
  title: string;
  location: string;
  bedrooms: number;
  bathrooms: number;
}) {
  return (
    <>
      <h3 className="truncate text-sm font-medium">{title}</h3>
      <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-[#878787BF]">
        <li className="flex items-center gap-1">
          <MapPin size={12} /> {location}
        </li>
        {bedrooms > 0 && (
          <li className="flex items-center gap-1">
            <BedDouble size={14} /> {bedrooms} Bed
          </li>
        )}
        {bathrooms > 0 && (
          <li className="flex items-center gap-1">
            <Bath size={13} /> {bathrooms} Bath
          </li>
        )}
      </ul>
    </>
  );
}

/** The row of actions at the bottom of a deal card. */
export function DealActions({ loading, children }: { loading?: boolean; children: ReactNode }) {
  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 border-t border-borderColor py-3 text-sm text-secondaryText">
        <Spinner size={18} /> Processing...
      </p>
    );
  }
  return <div className="flex divide-x divide-borderColor border-t border-borderColor">{children}</div>;
}

export function DealAction({
  onClick,
  color,
  disabled,
  children,
}: {
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 truncate px-2 py-3 text-sm hover:bg-cardBackground disabled:opacity-40"
      style={{ color: color || "#878787" }}
    >
      {children}
    </button>
  );
}

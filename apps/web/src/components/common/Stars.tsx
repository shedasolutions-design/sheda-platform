import { Star } from "lucide-react";

/** Read-only star rating, with half stars. */
export default function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const clamped = Math.max(0, Math.min(5, rating || 0));
  return (
    <span className="inline-flex items-center" role="img" aria-label={`${clamped.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-gray-300" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="fill-amber-400 text-amber-400" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

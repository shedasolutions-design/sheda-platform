import type { REVIEW } from "@/types/ui";
import Stars from "@/components/common/Stars";

/** Reviews of a property, newest as given. */
export default function Reviews({ reviews }: { reviews: REVIEW[] }) {
  if (reviews.length === 0) {
    return <p className="text-xs italic text-secondaryText">No reviews yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-lg bg-cardBackground p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{r.name}</p>
            {typeof r.rating === "number" && <Stars rating={r.rating} size={12} />}
          </div>
          <p className="mt-1 text-sm text-secondaryText">{r.comment}</p>
          <p className="mt-1 text-[11px] text-gray-400">{r.date}</p>
        </li>
      ))}
    </ul>
  );
}

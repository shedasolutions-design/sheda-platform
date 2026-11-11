"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import { useApi } from "@/contexts/ApiContext";
import { useNotifications } from "@/contexts/NotificationContext";

const MOOD = ["Pick a star to rate", "We're sorry to hear that", "We're sorry to hear that", "It was okay", "Good experience", "Excellent!"];

/**
 * Rate the seller of a deal, 1 to 5 stars with an optional comment.
 *
 * Ratings belong to a seller (the backend stores them against an agent). The
 * mobile modal sent the property's on-chain id as the person to rate, which
 * would have landed on whichever account happened to have that number.
 */
export default function RatingModal({
  visible,
  onClose,
  sellerId,
  propertyTitle,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  /** The seller's backend user id (property.agent_id). */
  sellerId?: number | null;
  propertyTitle: string;
  onSubmitted?: () => void;
}) {
  const { createRating } = useApi();
  const { addNotification } = useNotifications();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setStars(0);
    setComment("");
    setError(null);
    setDone(false);
    onClose();
  };

  const submit = async () => {
    if (!sellerId) return setError("We couldn't identify the seller for this deal.");
    if (stars === 0) return setError("Please select at least 1 star.");
    setError(null);
    setSubmitting(true);
    try {
      await createRating({ ratee_id: sellerId, score: stars, comment: comment.trim() || undefined });
      addNotification("general", "Review Submitted", `Your ${stars}-star review for "${propertyTitle}" has been submitted.`);
      setDone(true);
      onSubmitted?.();
    } catch (err: any) {
      setError(err?.message || "Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hover || stars;
  return (
    <Modal open={visible} onClose={close} title="Rate the seller">
      {done ? (
        <div className="text-center">
          <p className="mb-1 font-semibold">Thank you!</p>
          <p className="mb-5 text-sm text-secondaryText">Your review has been submitted.</p>
          <Button full onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-4 line-clamp-2 text-sm text-secondaryText">{propertyTitle}</p>
          <div className="mb-1 flex justify-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setStars(n)}
                onMouseEnter={() => setHover(n)}
                className="p-1"
              >
                <Star size={36} className={n <= shown ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
              </button>
            ))}
          </div>
          <p className="mb-4 text-center text-xs text-secondaryText">{MOOD[shown]}</p>
          <label htmlFor="review" className="sr-only">
            Review
          </label>
          <textarea
            id="review"
            rows={4}
            maxLength={500}
            placeholder="Write a review (optional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={inputClass}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button full className="mt-4" onClick={submit} loading={submitting}>
            Submit Review
          </Button>
        </>
      )}
    </Modal>
  );
}

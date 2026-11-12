"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import PhotoUpload from "./PhotoUpload";
import { StepFrame } from "./ListingParts";
import type { FormUpdate, PropertyFormState } from "./listingForm";

/** At least this many, as the mobile app required and the page says. */
const MIN_PHOTOS = 4;

/** Step 3: photos. Next waits for uploads to finish and needs MIN_PHOTOS. */
export function PhotoUploadForm({
  formData,
  onNext,
  onBack,
  onUpdate,
}: {
  formData: PropertyFormState;
  onNext: () => void;
  onBack: () => void;
  onUpdate: FormUpdate;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <StepFrame
      title="List a property"
      onBack={onBack}
      step={3}
      footer={
        <Button full onClick={onNext} disabled={busy || formData.photos.length < MIN_PHOTOS}>
          {busy
            ? "Uploading…"
            : formData.photos.length < MIN_PHOTOS
              ? `Add ${MIN_PHOTOS - formData.photos.length} more photo${MIN_PHOTOS - formData.photos.length === 1 ? "" : "s"}`
              : "Next"}
        </Button>
      }
    >
      <p className="mb-1">Add at least {MIN_PHOTOS} photos</p>
      <p className="mb-4 text-xs text-secondaryText">You can select several at once (up to 10). The first photo is the cover.</p>
      <PhotoUpload photos={formData.photos} onPhotosChange={(photos) => onUpdate({ photos })} onUploadStarted={setBusy} />
    </StepFrame>
  );
}

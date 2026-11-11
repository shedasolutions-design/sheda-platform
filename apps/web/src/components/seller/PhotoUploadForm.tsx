"use client";

import { useRef, useState } from "react";
/* eslint-disable @next/next/no-img-element -- uploaded photos come from arbitrary hosts */
import { Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useApi } from "@/contexts/ApiContext";
import { fileToAsset } from "@/lib/files";
import { StepFrame } from "./ListingParts";
import type { FormUpdate, PropertyFormState } from "./listingForm";

const MAX_PHOTOS = 10;
const RECOMMENDED = 4;

/** Pulls a usable file URL out of the several shapes the API returns. */
const fileUrlOf = (uploaded: unknown): string | undefined => {
  if (typeof uploaded === "string") return uploaded;
  const u = uploaded as { file_url?: string; data?: { file_url?: string } } | null;
  return u?.file_url ?? u?.data?.file_url;
};

/**
 * Step 3: photos. Several can be picked at once; they upload one after
 * another so the first stays the cover, and whatever succeeds is kept even
 * when some fail.
 */
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
  const { uploadFile } = useApi();
  const photos = formData.photos;
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceSlot = useRef<number | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = batch !== null;

  const pick = (slot?: number) => {
    replaceSlot.current = slot ?? null;
    if (inputRef.current) {
      inputRef.current.multiple = slot == null;
      inputRef.current.value = "";
      inputRef.current.click();
    }
  };

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const slot = replaceSlot.current;
    const room = slot != null ? 1 : MAX_PHOTOS - photos.length;
    const files = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room);
    if (files.length === 0) {
      setError(room <= 0 ? `You can upload up to ${MAX_PHOTOS} photos.` : "Please choose image files.");
      return;
    }
    const skipped = list.length - files.length;

    setBatch({ done: 0, total: files.length });
    const uploaded: string[] = [];
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const asset = fileToAsset(files[i]);
      try {
        const url = fileUrlOf(await uploadFile("property", asset));
        if (!url) throw new Error("No file URL returned");
        uploaded.push(url);
      } catch {
        failed.push(files[i].name);
      } finally {
        URL.revokeObjectURL(asset.uri);
        setBatch({ done: i + 1, total: files.length });
      }
    }
    setBatch(null);

    if (uploaded.length) {
      if (slot != null) {
        const next = [...photos];
        next[slot] = uploaded[0];
        onUpdate({ photos: next });
      } else {
        onUpdate({ photos: [...photos, ...uploaded].slice(0, MAX_PHOTOS) });
      }
    }
    const notes: string[] = [];
    if (failed.length)
      notes.push(
        uploaded.length
          ? `${uploaded.length} uploaded. These didn't: ${failed.join(", ")}. You can add them again.`
          : "None of the photos could be uploaded. Please check your connection and try again."
      );
    if (skipped > 0) notes.push(`${skipped} file(s) were skipped: only images, up to ${MAX_PHOTOS} in total.`);
    if (notes.length) setError(notes.join(" "));
  };

  const slots = Math.max(RECOMMENDED, photos.length + (photos.length < MAX_PHOTOS ? 1 : 0));

  return (
    <StepFrame
      title="List a property"
      onBack={onBack}
      step={3}
      footer={
        <Button full onClick={onNext} disabled={busy || photos.length === 0}>
          {busy ? "Uploading…" : "Next"}
        </Button>
      }
    >
      <p className="mb-1">Add at least {RECOMMENDED} photos</p>
      <p className="mb-4 text-xs text-secondaryText">
        You can select several at once (up to {MAX_PHOTOS}). The first photo is the cover.
      </p>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFiles(e.target.files)} />

      {batch && (
        <p className="mb-3 flex items-center gap-2 text-sm text-secondaryText" aria-live="polite">
          <Spinner size={16} /> Uploading {batch.done} of {batch.total}…
        </p>
      )}
      {error && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: slots }, (_, i) => {
          const src = photos[i];
          return (
            <li key={i} className="relative aspect-square">
              <button
                type="button"
                disabled={busy}
                onClick={() => pick(src ? i : undefined)}
                aria-label={src ? `Replace photo ${i + 1}` : "Add photos"}
                className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-borderColor bg-cardBackground hover:border-primary disabled:opacity-60"
              >
                {src ? <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" /> : <Plus className="text-primary" size={28} />}
              </button>
              {src && (
                <>
                  {i === 0 && <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Cover</span>}
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    disabled={busy}
                    onClick={() => onUpdate({ photos: photos.filter((_, j) => j !== i) })}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </StepFrame>
  );
}

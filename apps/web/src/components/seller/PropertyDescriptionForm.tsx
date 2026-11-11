"use client";

import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import SelectField from "@/components/ui/SelectField";
import LocationField from "@/components/ui/LocationField";
import { StepFrame } from "./ListingParts";
import { LISTABLE_TYPES, isLandForm, type FormUpdate, type PropertyFormState } from "./listingForm";

const STATUS = [
  { label: "For rent", value: "For rent" },
  { label: "For sale", value: "For sale" },
];
const FURNISHING = [
  { label: "Unfurnished", value: "unfurnished" },
  { label: "Semi-furnished", value: "semi-furnished" },
  { label: "Fully furnished", value: "furnished" },
];
const ROOMS = ["1", "2", "3", "4", "5"].map((n) => ({ label: n === "5" ? "5+" : n, value: n }));
const PLOT = [
  { label: "Residential", value: "residential" },
  { label: "Commercial", value: "commercial" },
  { label: "Mixed-use", value: "mixed-use" },
  { label: "Agricultural", value: "agricultural" },
];

/** Step 1: what the property is, where, and whether it is for rent or sale. */
export function PropertyDescriptionForm({
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
  const isLand = isLandForm(formData);
  const isShortlet = formData.propertyType === "shortlet";

  const changeType = (value: string) => {
    const updates: Partial<PropertyFormState> = { propertyType: value };
    if (value === "land") {
      // Rooms and furnishing mean nothing for land.
      updates.bedrooms = "0";
      updates.bathrooms = "0";
      updates.furnishing = "unfurnished";
      if (!formData.plotType) updates.plotType = "residential";
    } else {
      // Coming back from land, the zeroed rooms would read as "none".
      if (formData.bedrooms === "0") updates.bedrooms = "1";
      if (formData.bathrooms === "0") updates.bathrooms = "1";
      if (value === "shortlet" && formData.furnishing === "unfurnished") updates.furnishing = "furnished";
    }
    onUpdate(updates);
  };

  const landSize = parseFloat(formData.landSize || "0");
  const titleOk = formData.title.trim().length >= 3;
  const canProceed = titleOk && !!formData.location.trim() && (!isLand || (landSize > 0 && !isNaN(landSize)));

  return (
    <StepFrame
      title="List a property"
      onBack={onBack}
      step={1}
      footer={
        <Button full onClick={onNext} disabled={!canProceed}>
          Next
        </Button>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canProceed) onNext();
        }}
      >
        <TextField
          label="Property title"
          value={formData.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="e.g. Modern 3 Bedroom Apartment"
          hint={formData.title && !titleOk ? "At least 3 characters." : undefined}
          maxLength={120}
        />
        <SelectField label="Property type" options={LISTABLE_TYPES} value={formData.propertyType} onValueChange={changeType} />
        <SelectField label="Status" options={STATUS} value={formData.status} onValueChange={(v) => onUpdate({ status: v })} />
        <LocationField value={formData.location} onChange={(v) => onUpdate({ location: v })} placeholder="Search or type a location" />

        {!isLand && (
          <>
            <div>
              <SelectField
                label="Furnishing"
                options={FURNISHING}
                value={formData.furnishing}
                onValueChange={(v) => onUpdate({ furnishing: v })}
              />
              {isShortlet && <p className="mt-1 text-xs text-secondaryText">Shortlets are typically fully furnished.</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectField label="Bedrooms" options={ROOMS} value={formData.bedrooms} onValueChange={(v) => onUpdate({ bedrooms: v })} />
              <SelectField label="Bathrooms" options={ROOMS} value={formData.bathrooms} onValueChange={(v) => onUpdate({ bathrooms: v })} />
            </div>
          </>
        )}

        {isLand && (
          <>
            <TextField
              label="Land size (sqm)"
              inputMode="decimal"
              value={formData.landSize}
              onChange={(e) => onUpdate({ landSize: e.target.value.replace(/[^0-9.]/g, "") })}
              placeholder="e.g. 600"
            />
            <SelectField label="Plot type" options={PLOT} value={formData.plotType} onValueChange={(v) => onUpdate({ plotType: v })} />
          </>
        )}
        <button type="submit" hidden />
      </form>
    </StepFrame>
  );
}

"use client";

import Button from "@/components/ui/Button";
import { CheckRow, StepFrame } from "./ListingParts";
import { isLandForm, type FormUpdate, type PropertyFormState } from "./listingForm";

// The housing names must match what the listing payload looks for.
const HOUSING_EXTRAS = ["Air conditioner", "Pop Ceiling", "Floor Tiles", "Running water", "Furniture", "Prepaid meter", "Wi-Fi"];
const LAND_EXTRAS = ["Perimeter fencing", "Road access", "Running water", "Electricity access", "Survey plan available", "C of O available"];

/** Step 2: amenities, or land features. */
export function PropertyExtrasForm({
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
  const extras = isLand ? LAND_EXTRAS : HOUSING_EXTRAS;
  const toggle = (extra: string) =>
    onUpdate({
      extras: formData.extras.includes(extra) ? formData.extras.filter((e) => e !== extra) : [...formData.extras, extra],
    });

  return (
    <StepFrame
      title="List a property"
      onBack={onBack}
      step={2}
      footer={
        <Button full onClick={onNext}>
          Next
        </Button>
      }
    >
      <fieldset>
        <legend className="mb-1 font-semibold">{isLand ? "Land features" : "Property extras"}</legend>
        <p className="mb-5 text-sm text-secondaryText">
          {isLand ? "Select the features that apply to this land" : "Select the extras available in this property"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {extras.map((extra) => (
            <CheckRow key={extra} label={extra} checked={formData.extras.includes(extra)} onChange={() => toggle(extra)} />
          ))}
        </div>
      </fieldset>
    </StepFrame>
  );
}

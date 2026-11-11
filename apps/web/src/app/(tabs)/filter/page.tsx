"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import SelectField from "@/components/ui/SelectField";
import LocationField from "@/components/ui/LocationField";
import { useApi } from "@/contexts/ApiContext";
import { getPropertyTypeOptions, isLandType, isShortletType } from "@/constants/propertyTypes";
import type { FilterValues } from "@/utilities/searchFilters";

type Extras = FilterValues["extras"];
type FieldSet = {
  bedrooms: boolean;
  bathrooms: boolean;
  listingType: boolean;
  furnished: boolean;
} & Record<Exclude<keyof Extras, "negotiable">, boolean>;

const ALL: FieldSet = {
  bedrooms: true, bathrooms: true, listingType: true, furnished: true,
  airConditioner: true, popCeiling: true, floorTiles: true, runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
};

/** Which fields make sense for each property type (land has no bedrooms ...). */
const FIELDS: Record<string, FieldSet> = {
  apartment: ALL,
  bungalow: ALL,
  duplex: ALL,
  "luxury villa": ALL,
  townhouse: ALL,
  waterfront: ALL,
  "shared apartment": { ...ALL, popCeiling: false },
  "new development": { ...ALL, furnished: false, airConditioner: false, popCeiling: false, furniture: false, wifi: false },
  "affordable home": { ...ALL, wifi: false },
  land: {
    bedrooms: false, bathrooms: false, listingType: false, furnished: false,
    airConditioner: false, popCeiling: false, floorTiles: false, runningWater: false, furniture: false, prepaidMeter: false, wifi: false,
  },
  shortlet: { ...ALL, listingType: false, popCeiling: false, floorTiles: false, prepaidMeter: false },
};

const TYPE_TO_CATEGORY: Record<string, string> = {
  apartment: "Apartments",
  land: "Land",
  shortlet: "Shortlets",
  "shared apartment": "Shared Apartments",
  bungalow: "Bungalows",
  duplex: "Duplexes",
  "luxury villa": "Luxury Villas",
  townhouse: "Townhouses",
  waterfront: "Waterfront Properties",
  "new development": "New Developments",
  "affordable home": "Affordable Homes",
};

const AMENITIES: [Exclude<keyof Extras, "negotiable">, string][] = [
  ["airConditioner", "Air Conditioner"],
  ["popCeiling", "Pop Ceiling"],
  ["floorTiles", "Floor Tiles"],
  ["runningWater", "Running Water"],
  ["furniture", "Furniture"],
  ["prepaidMeter", "Prepaid Meter"],
  ["wifi", "WiFi"],
];

const NO_EXTRAS: Extras = {
  airConditioner: false, popCeiling: false, floorTiles: false, runningWater: false,
  furniture: false, prepaidMeter: false, wifi: false, negotiable: false,
};

/**
 * Search filters. On mobile, Apply sent a hard-coded empty filter rather
 * than the form's values, so choosing filters changed nothing; here Apply
 * submits what was chosen.
 */
export default function FilterPage() {
  const router = useRouter();
  const { setSelectedCategory, setActiveFilters } = useApi();
  const [location, setLocation] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [listingType, setListingType] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [bedrooms, setBedrooms] = useState(0);
  const [bathrooms, setBathrooms] = useState(0);
  const [furnished, setFurnished] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [extras, setExtras] = useState<Extras>(NO_EXTRAS);

  const fields = useMemo(() => FIELDS[propertyType.toLowerCase()] || ALL, [propertyType]);
  const land = isLandType(propertyType);
  const shortlet = isShortletType(propertyType);
  const anyAmenity = AMENITIES.some(([k]) => fields[k]);
  const back = () => (window.history.length > 1 ? router.back() : router.replace("/home"));

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    const filters: FilterValues = {
      location: location.trim(),
      propertyType,
      listingType: fields.listingType ? listingType : "",
      sortBy,
      bedrooms: fields.bedrooms ? bedrooms : 0,
      bathrooms: fields.bathrooms ? bathrooms : 0,
      minPrice: parseFloat(minPrice.replace(/,/g, "")) || 0,
      maxPrice: parseFloat(maxPrice.replace(/,/g, "")) || Infinity,
      furnished: fields.furnished ? furnished : false,
      extras: {
        ...Object.fromEntries(AMENITIES.map(([k]) => [k, fields[k] || (land && k === "runningWater") ? extras[k] : false])),
        negotiable: extras.negotiable,
      } as Extras,
    };
    setActiveFilters(filters);
    setSelectedCategory(propertyType ? TYPE_TO_CATEGORY[propertyType.toLowerCase()] || "All" : "All");
    back();
  };

  const reset = () => {
    setActiveFilters(null);
    setSelectedCategory("All");
    back();
  };

  const num = (opts: [string, number][]) => opts.map(([label, value]) => ({ label, value }));
  const toggle = (k: keyof Extras) => setExtras((x) => ({ ...x, [k]: !x[k] }));

  return (
    <>
      <PageHeader title="Filter" />
      <form onSubmit={apply} className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-16 pt-5">
        <LocationField value={location} onChange={setLocation} placeholder="Search location" />
        <SelectField label="Property Type" options={getPropertyTypeOptions(true)} value={propertyType} onValueChange={setPropertyType} />
        {fields.listingType && (
          <SelectField
            label="Listing Type"
            options={[
              { label: "All", value: "" },
              { label: "For Sale", value: "sale" },
              { label: "For Rent", value: "rent" },
            ]}
            value={listingType}
            onValueChange={setListingType}
          />
        )}
        {land && <p className="-mt-2 text-xs italic text-secondaryText">Land listings are for sale only</p>}
        {shortlet && <p className="-mt-2 text-xs italic text-secondaryText">Shortlets are short-term rental stays</p>}
        <div className="grid grid-cols-2 gap-3">
          {fields.bedrooms && (
            <SelectField
              label="Bedrooms"
              options={num([["Any", 0], ["1", 1], ["2", 2], ["3", 3], ["4", 4], ["5+", 5]])}
              value={bedrooms}
              onValueChange={(v) => setBedrooms(Number(v))}
            />
          )}
          {fields.bathrooms && (
            <SelectField
              label="Bathrooms"
              options={num([["Any", 0], ["1", 1], ["2", 2], ["3", 3], ["4+", 4]])}
              value={bathrooms}
              onValueChange={(v) => setBathrooms(Number(v))}
            />
          )}
        </div>
        <SelectField
          label="Sort By"
          placeholder="Choose an order"
          options={[
            { label: "Price: Low to High", value: "price-asc" },
            { label: "Price: High to Low", value: "price-desc" },
            { label: "Newest", value: "newest" },
          ]}
          value={sortBy}
          onValueChange={setSortBy}
        />
        <fieldset>
          <legend className="mb-1 text-sm">{land ? "Price range (per plot)" : "Price range"}</legend>
          <div className="grid grid-cols-2 gap-3">
            <TextField inputMode="numeric" placeholder="Min 20,000" aria-label="Minimum price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
            <TextField inputMode="numeric" placeholder="Max 10,000,000" aria-label="Maximum price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </div>
        </fieldset>
        {fields.furnished && <Check label="Furnished Only" checked={furnished} onChange={() => setFurnished((f) => !f)} />}
        {anyAmenity && (
          <fieldset>
            <legend className="mb-2 text-sm text-secondaryText">Features &amp; Amenities</legend>
            <div className="grid grid-cols-2 gap-2">
              {AMENITIES.filter(([k]) => fields[k]).map(([k, label]) => (
                <Check key={k} label={label} checked={extras[k]} onChange={() => toggle(k)} />
              ))}
            </div>
          </fieldset>
        )}
        {land && (
          <fieldset>
            <legend className="mb-2 text-sm text-secondaryText">Land Features</legend>
            <Check label="Running Water Access" checked={extras.runningWater} onChange={() => toggle("runningWater")} />
          </fieldset>
        )}
        <Check label="Negotiable Price" checked={extras.negotiable} onChange={() => toggle("negotiable")} />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
          <Button type="submit">Apply Filters</Button>
        </div>
      </form>
    </>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}

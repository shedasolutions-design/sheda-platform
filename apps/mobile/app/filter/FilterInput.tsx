import { useState, useMemo } from "react";
import { View } from "react-native";
import SelectInput from "@/components/input/selectInput";
import LocationPicker from "@/components/input/LocationPicker";
import StyledTextInput from "@/components/input/textInput";
import InterMedium from "@/components/Text/InterMedium";
import Checkbox from "@/components/input/checkbox"
import { getPropertyTypeOptions, isLandType, isShortletType, isHousingType } from "@/constants/propertyTypes";

interface SelectOption {
  label: string;
  value: string | number;
}

export interface FilterValues {
  location: string;
  propertyType: string;
  listingType: string;
  sortBy: string;
  bedrooms: number;
  bathrooms: number;
  minPrice: number;
  maxPrice: number;
  furnished: boolean;
  extras: {
    airConditioner: boolean;
    popCeiling: boolean;
    floorTiles: boolean;
    runningWater: boolean;
    furniture: boolean;
    prepaidMeter: boolean;
    wifi: boolean;
    negotiable: boolean;
  };
}

interface FilterInputsProps {
  onSubmit: (filters: FilterValues) => void;
  className?: string;
}

// Define which fields are relevant for each property type
type FieldSet = {
  bedrooms: boolean;
  bathrooms: boolean;
  listingType: boolean;
  furnished: boolean;
  airConditioner: boolean;
  popCeiling: boolean;
  floorTiles: boolean;
  runningWater: boolean;
  furniture: boolean;
  prepaidMeter: boolean;
  wifi: boolean;
};

const FIELD_CONFIG: Record<string, FieldSet> = {
  // Residential types — full features
  apartment: {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: true, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
  },
  "shared apartment": {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: false, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
  },
  bungalow: {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: true, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
  },
  duplex: {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: true, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
  },
  "luxury villa": {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: true, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
  },
  townhouse: {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: true, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
  },
  waterfront: {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: true, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
  },
  "new development": {
    bedrooms: true, bathrooms: true, listingType: true, furnished: false,
    airConditioner: false, popCeiling: false, floorTiles: true,
    runningWater: true, furniture: false, prepaidMeter: true, wifi: false,
  },
  "affordable home": {
    bedrooms: true, bathrooms: true, listingType: true, furnished: true,
    airConditioner: true, popCeiling: true, floorTiles: true,
    runningWater: true, furniture: true, prepaidMeter: true, wifi: false,
  },
  // Land — no rooms, no interior features
  land: {
    bedrooms: false, bathrooms: false, listingType: false, furnished: false,
    airConditioner: false, popCeiling: false, floorTiles: false,
    runningWater: false, furniture: false, prepaidMeter: false, wifi: false,
  },
  // Shortlet — temporary stay, show comfort features
  shortlet: {
    bedrooms: true, bathrooms: true, listingType: false, furnished: true,
    airConditioner: true, popCeiling: false, floorTiles: false,
    runningWater: true, furniture: true, prepaidMeter: false, wifi: true,
  },
};

// Default: show all fields if type is empty or "All Types"
const ALL_FIELDS: FieldSet = {
  bedrooms: true, bathrooms: true, listingType: true, furnished: true,
  airConditioner: true, popCeiling: true, floorTiles: true,
  runningWater: true, furniture: true, prepaidMeter: true, wifi: true,
};

const FilterInputs: React.FC<FilterInputsProps> = ({
  onSubmit,
  className = "",
}) => {
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedPropertyType, setSelectedPropertyType] = useState<string>("");
  const [selectedListingType, setSelectedListingType] = useState<string>("");
  const [selectedSortBy, setSelectedSortBy] = useState<string>("");
  const [selectedBed, setSelectedBed] = useState<number>(0);
  const [selectedBath, setSelectedBath] = useState<number>(0);
  const [isFurnished, setIsFurnished] = useState<boolean>(false);

  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");

  const [extras, setExtras] = useState({
    airConditioner: false,
    popCeiling: false,
    floorTiles: false,
    runningWater: false,
    furniture: false,
    prepaidMeter: false,
    wifi: false,
    negotiable: false,
  });

  // Determine which fields to show based on selected property type
  const fields = useMemo<FieldSet>(() => {
    if (!selectedPropertyType) return ALL_FIELDS;
    return FIELD_CONFIG[selectedPropertyType.toLowerCase()] || ALL_FIELDS;
  }, [selectedPropertyType]);

  const isLand = isLandType(selectedPropertyType);
  const isShortlet = isShortletType(selectedPropertyType);

  // Check if any amenity is visible
  const hasAnyAmenity = fields.airConditioner || fields.popCeiling || fields.floorTiles ||
    fields.runningWater || fields.furniture || fields.prepaidMeter || fields.wifi;

  const propertyTypeOptions = getPropertyTypeOptions(true);

  const listingTypeOptions: SelectOption[] = [
    { label: "All", value: "" },
    { label: "For Sale", value: "sale" },
    { label: "For Rent", value: "rent" },
  ];

  const sortByOptions: SelectOption[] = [
    { label: "Price: Low to High", value: "price-asc" },
    { label: "Price: High to Low", value: "price-desc" },
    { label: "Newest", value: "newest" },
  ];

  const bedroomOptions: SelectOption[] = [
    { label: "Any", value: 0 },
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4", value: 4 },
    { label: "5+", value: 5 },
  ];

  const bathroomOptions: SelectOption[] = [
    { label: "Any", value: 0 },
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4+", value: 4 },
  ];

  const handleExtraChange = (key: keyof typeof extras, value: boolean) => {
    setExtras((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    onSubmit({
      location: selectedLocation,
      propertyType: selectedPropertyType,
      listingType: selectedListingType,
      sortBy: selectedSortBy,
      bedrooms: fields.bedrooms ? selectedBed : 0,
      bathrooms: fields.bathrooms ? selectedBath : 0,
      minPrice: parseFloat(minPrice) || 0,
      maxPrice: parseFloat(maxPrice) || Infinity,
      furnished: fields.furnished ? isFurnished : false,
      extras: {
        airConditioner: fields.airConditioner ? extras.airConditioner : false,
        popCeiling: fields.popCeiling ? extras.popCeiling : false,
        floorTiles: fields.floorTiles ? extras.floorTiles : false,
        runningWater: fields.runningWater ? extras.runningWater : false,
        furniture: fields.furniture ? extras.furniture : false,
        prepaidMeter: fields.prepaidMeter ? extras.prepaidMeter : false,
        wifi: fields.wifi ? extras.wifi : false,
        negotiable: extras.negotiable,
      },
    });
  };

  return (
    <View className={`w-full ${className}`}>
      {/* Always visible: Location */}
      <LocationPicker
        label="Location"
        value={selectedLocation}
        onValueChange={(value) => setSelectedLocation(value as string)}
        placeholder="Search location"
      />

      {/* Always visible: Property Type */}
      <SelectInput
        label="Property Type"
        options={propertyTypeOptions}
        value={selectedPropertyType}
        onValueChange={(value) => setSelectedPropertyType(value as string)}
      />

      {/* Listing Type — not for land or shortlet */}
      {fields.listingType && (
        <SelectInput
          label="Listing Type"
          options={listingTypeOptions}
          value={selectedListingType}
          onValueChange={(value) => setSelectedListingType(value as string)}
        />
      )}

      {/* Land-specific: sale only hint */}
      {isLand && (
        <View className="mt-1 mb-2">
          <InterMedium className="text-xs text-secondaryText italic">
            Land listings are for sale only
          </InterMedium>
        </View>
      )}

      {/* Shortlet-specific hint */}
      {isShortlet && (
        <View className="mt-1 mb-2">
          <InterMedium className="text-xs text-secondaryText italic">
            Shortlets are short-term rental stays
          </InterMedium>
        </View>
      )}

      {/* Bedrooms — not for land */}
      {fields.bedrooms && (
        <SelectInput
          label="Bedrooms"
          options={bedroomOptions}
          value={selectedBed}
          onValueChange={(value) => setSelectedBed(value as number)}
        />
      )}

      {/* Bathrooms — not for land */}
      {fields.bathrooms && (
        <SelectInput
          label="Bathrooms"
          options={bathroomOptions}
          value={selectedBath}
          onValueChange={(value) => setSelectedBath(value as number)}
        />
      )}

      {/* Always visible: Sort By */}
      <SelectInput
        label="Sort By"
        options={sortByOptions}
        value={selectedSortBy}
        onValueChange={(value) => setSelectedSortBy(value as string)}
      />

      {/* Always visible: Price Range */}
      <View className="mt-1">
        <InterMedium className="text-sm text-secondaryText mb-2">
          {isLand ? "Price range (per plot)" : "Price range"}
        </InterMedium>
        <View className="gap-3 flex-row">
          <View className="w-[49%]">
            <StyledTextInput
              placeholder="Min 20,000"
              value={minPrice}
              onChangeText={setMinPrice}
              keyboardType="numeric"
            />
          </View>
          <View className="w-[49%]">
            <StyledTextInput
              placeholder="Max 10,000,000"
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      {/* Furnished — only for property types that can be furnished */}
      {fields.furnished && (
        <View className="mt-4">
          <Checkbox
            label="Furnished Only"
            value={isFurnished}
            onChange={(value) => setIsFurnished(value)}
          />
        </View>
      )}

      {/* Features & Amenities — conditional per property type */}
      {hasAnyAmenity && (
        <View className="mt-4">
          <InterMedium className="text-sm text-secondaryText mb-2">Features & Amenities</InterMedium>
          {fields.airConditioner && (
            <Checkbox
              label="Air Conditioner"
              value={extras.airConditioner}
              onChange={(value) => handleExtraChange("airConditioner", value)}
            />
          )}
          {fields.popCeiling && (
            <Checkbox
              label="Pop Ceiling"
              value={extras.popCeiling}
              onChange={(value) => handleExtraChange("popCeiling", value)}
            />
          )}
          {fields.floorTiles && (
            <Checkbox
              label="Floor Tiles"
              value={extras.floorTiles}
              onChange={(value) => handleExtraChange("floorTiles", value)}
            />
          )}
          {fields.runningWater && (
            <Checkbox
              label="Running Water"
              value={extras.runningWater}
              onChange={(value) => handleExtraChange("runningWater", value)}
            />
          )}
          {fields.furniture && (
            <Checkbox
              label="Furniture"
              value={extras.furniture}
              onChange={(value) => handleExtraChange("furniture", value)}
            />
          )}
          {fields.prepaidMeter && (
            <Checkbox
              label="Prepaid Meter"
              value={extras.prepaidMeter}
              onChange={(value) => handleExtraChange("prepaidMeter", value)}
            />
          )}
          {fields.wifi && (
            <Checkbox
              label="WiFi"
              value={extras.wifi}
              onChange={(value) => handleExtraChange("wifi", value)}
            />
          )}
        </View>
      )}

      {/* Land-specific features */}
      {isLand && (
        <View className="mt-4">
          <InterMedium className="text-sm text-secondaryText mb-2">Land Features</InterMedium>
          <Checkbox
            label="Running Water Access"
            value={extras.runningWater}
            onChange={(value) => handleExtraChange("runningWater", value)}
          />
        </View>
      )}

      {/* Always visible: Negotiable */}
      <View className="mt-4">
        <Checkbox
          label="Negotiable Price"
          value={extras.negotiable}
          onChange={(value) => handleExtraChange("negotiable", value)}
        />
      </View>
    </View>
  );
};

export default FilterInputs;

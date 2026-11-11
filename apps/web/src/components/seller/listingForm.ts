import { getPropertyTypeOptions } from "@/constants/propertyTypes";

/** The listing wizard's single form state, shared by every step. */
export interface PropertyFormState {
  title: string;
  /** One of LISTABLE_TYPES' values. */
  propertyType: string;
  /** "For rent" | "For sale" — set on step 1 only. */
  status: string;
  location: string;
  furnishing: string;
  bedrooms: string;
  bathrooms: string;
  landSize: string;
  plotType: string;
  extras: string[];
  photos: string[];
  description: string;
  price: string;
  isNegotiable: boolean;
  listingCurrency: string;
  rentDurationValue: number | null;
  rentDurationUnit: string | null;
  /** The term in days, the unit the contract stores. */
  rentDurationDays: number | null;
  rentDurationPreset: string;
  /** Security deposit in the listing currency; empty means none. Rentals only. */
  damageDeposit: string;
}

export type FormUpdate = (data: Partial<PropertyFormState>) => void;

/** Every property type the app offers; the backend stores them all. */
export const LISTABLE_TYPES = getPropertyTypeOptions();

/** "luxury villa" → "luxury_villa", the backend's spelling. */
export const toBackendType = (t: string) => t.trim().toLowerCase().replace(/\s+/g, "_");

export const createInitialFormState = (currency: string): PropertyFormState => ({
  title: "",
  propertyType: "apartment",
  status: "For rent",
  location: "",
  furnishing: "unfurnished",
  bedrooms: "1",
  bathrooms: "1",
  landSize: "",
  plotType: "residential",
  extras: [],
  photos: [],
  description: "",
  price: "",
  isNegotiable: false,
  listingCurrency: currency,
  rentDurationValue: null,
  rentDurationUnit: null,
  rentDurationDays: null,
  rentDurationPreset: "month",
  damageDeposit: "",
});

export const isRentStatus = (status: string) => status === "rent" || status === "For rent";
export const isLandForm = (f: PropertyFormState) => f.propertyType.toLowerCase() === "land";

/** Digits and one decimal point only, for price-like fields. */
export const numericOnly = (v: string) => v.replace(/[^0-9.,]/g, "");

// @ts-nocheck — Test file
//
// Search has to reach the backend, because the home screen's own filtering
// only ever saw the twenty rows already loaded. A property that existed but
// sat further down the feed was indistinguishable from one that was never
// listed, and the bigger the marketplace got, the smaller the fraction anyone
// could find.
import { categoryToPropertyType, matchesCategory } from "@/utilities/propertyCategories";

describe("category to backend property_type", () => {
  it("maps every category the UI offers", () => {
    // These four are the whole of constants/categories-mock.ts, and the values
    // are PropertyTypeEnum on the backend. A typo here silently returns an
    // empty result rather than failing, so it is worth pinning.
    expect(categoryToPropertyType("Apartments")).toBe("apartment");
    expect(categoryToPropertyType("Land")).toBe("land");
    expect(categoryToPropertyType("Shortlets")).toBe("shortlet");
    expect(categoryToPropertyType("Shared Apartments")).toBe("shared_apartment");
  });

  it("treats 'All' as no filter at all", () => {
    // Not as a property_type called "all", which would match nothing.
    expect(categoryToPropertyType("All")).toBeUndefined();
  });

  it("treats absent or unknown categories as no filter", () => {
    expect(categoryToPropertyType(undefined)).toBeUndefined();
    expect(categoryToPropertyType(null)).toBeUndefined();
    expect(categoryToPropertyType("Mansions")).toBeUndefined();
  });
});

describe("category chips narrow results", () => {
  const prop = (over = {}) => ({ property_type: "apartment", title: "Nice place", ...over });

  it("matches the four chips that have a backend type", () => {
    expect(matchesCategory(prop({ property_type: "apartment" }), "Apartments")).toBe(true);
    expect(matchesCategory(prop({ property_type: "land" }), "Land")).toBe(true);
    expect(matchesCategory(prop({ property_type: "shortlet" }), "Shortlets")).toBe(true);
    expect(matchesCategory(prop({ property_type: "shared_apartment" }), "Shared Apartments")).toBe(true);
  });

  it("still matches the seven chips that have no backend type, via the title", () => {
    // These have no PropertyTypeEnum value, so the title is all there is. If
    // this stopped working, seven of the twelve chips would silently show
    // nothing — and an empty page reads as "no properties", not "broken chip".
    for (const [chip, title] of [
      ["Bungalows", "Spacious Bungalow in Lekki"],
      ["Duplexes", "Modern Duplex with pool"],
      ["Luxury Villas", "Luxury Villa, oceanfront"],
      ["Townhouses", "Townhouse near the park"],
      ["Waterfront Properties", "Waterfront Property, Banana Island"],
      ["New Developments", "New Development, phase 2"],
      ["Affordable Homes", "Affordable Home for first buyers"],
    ]) {
      expect(matchesCategory(prop({ property_type: "apartment", title }), chip)).toBe(true);
    }
  });

  it("excludes a property that matches neither type nor title", () => {
    expect(matchesCategory(prop({ property_type: "land", title: "Empty plot" }), "Duplexes")).toBe(false);
  });

  it("lets everything through for 'All' and for no chip", () => {
    expect(matchesCategory(prop({ property_type: "land" }), "All")).toBe(true);
    expect(matchesCategory(prop({ property_type: "land" }), undefined)).toBe(true);
  });

  it("copes with a property missing a type or title", () => {
    expect(matchesCategory({}, "Apartments")).toBe(false);
    expect(matchesCategory({}, "All")).toBe(true);
  });
});

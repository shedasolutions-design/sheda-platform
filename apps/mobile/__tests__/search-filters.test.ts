// @ts-nocheck — Test file
//
// The filter screen used to compute a filtered list and throw it away,
// applying only the property type as a category chip. A person could set a
// price range, bedrooms, bathrooms, a location and seven extras and every one
// of them did nothing — the results came back unchanged, which reads as
// "nothing matches" rather than "that filter was ignored".
import { filtersToSearchParams, hasActiveFilters } from "@/utilities/searchFilters";

/** The screen's resting state: everything present, nothing narrowed. */
const EMPTY = {
  location: "",
  propertyType: "",
  listingType: "",
  sortBy: "",
  bedrooms: 0,
  bathrooms: 0,
  minPrice: 0,
  maxPrice: 0,
  furnished: false,
  extras: {
    airConditioner: false,
    popCeiling: false,
    floorTiles: false,
    runningWater: false,
    furniture: false,
    prepaidMeter: false,
    wifi: false,
    negotiable: false,
  },
};

describe("an untouched filter screen", () => {
  it("asks for no search at all", () => {
    // Otherwise opening the filter screen and closing it would replace the
    // feed with a search for everything.
    expect(filtersToSearchParams(EMPTY)).toBeNull();
    expect(hasActiveFilters(EMPTY)).toBe(false);
  });

  it("still searches when there is a typed query", () => {
    expect(filtersToSearchParams(EMPTY, "lekki")).toEqual({ query: "lekki" });
  });

  it("handles no filters at all", () => {
    expect(filtersToSearchParams(null)).toBeNull();
    expect(filtersToSearchParams(undefined, "  ")).toBeNull();
  });
});

describe("filters reach the backend", () => {
  it("sends a price range", () => {
    const p = filtersToSearchParams({ ...EMPTY, minPrice: 500, maxPrice: 5000 });
    expect(p).toMatchObject({ min_price: 500, max_price: 5000 });
  });

  it("sends bedrooms and bathrooms as minimums", () => {
    const p = filtersToSearchParams({ ...EMPTY, bedrooms: 3, bathrooms: 2 });
    expect(p).toMatchObject({ min_bedroom: 3, min_bathroom: 2 });
  });

  it("treats zero bedrooms as Any, not as a filter", () => {
    const p = filtersToSearchParams({ ...EMPTY, bedrooms: 0, minPrice: 1 });
    expect(p).not.toHaveProperty("min_bedroom");
  });

  it("sends location and listing type", () => {
    const p = filtersToSearchParams({ ...EMPTY, location: " Lekki ", listingType: "Rent" });
    expect(p).toMatchObject({ location: "Lekki", listing_type: "rent" });
  });

  it("maps the extras onto the backend's amenity names", () => {
    const p = filtersToSearchParams({
      ...EMPTY,
      extras: { ...EMPTY.extras, airConditioner: true, wifi: true, prepaidMeter: true },
    });
    expect(p.amenities.sort()).toEqual(["air_condition", "prepaid_meter", "wifi"]);
  });

  it("does not send negotiable as an amenity", () => {
    // It is `is_negotiable` on the property, not an amenity column, and the
    // endpoint has no filter for it — sending it would be silently dropped.
    const p = filtersToSearchParams({
      ...EMPTY,
      extras: { ...EMPTY.extras, negotiable: true },
    });
    expect(p).toBeNull();
  });

  it("maps the sort options", () => {
    expect(filtersToSearchParams({ ...EMPTY, sortBy: "price-asc" }).sort).toBe("price_asc");
    expect(filtersToSearchParams({ ...EMPTY, sortBy: "price-desc" }).sort).toBe("price_desc");
    expect(filtersToSearchParams({ ...EMPTY, sortBy: "newest" }).sort).toBe("created_desc");
  });
});

describe("property type", () => {
  it("sends the four types the backend stores", () => {
    for (const [input, expected] of [
      ["apartment", "apartment"],
      ["Land", "land"],
      ["shortlet", "shortlet"],
      ["shared apartment", "shared_apartment"],
    ]) {
      expect(filtersToSearchParams({ ...EMPTY, propertyType: input }).property_type).toBe(expected);
    }
  });

  it("does not send a type the backend has no column for", () => {
    // Bungalows, Duplexes and the rest exist only as chips. Filtering on them
    // server-side would match nothing and empty the page; the home screen
    // matches those on the listing title instead.
    const p = filtersToSearchParams({ ...EMPTY, propertyType: "Bungalow", minPrice: 1 });
    expect(p).not.toHaveProperty("property_type");
    expect(p.min_price).toBe(1);
  });
});

describe("filtering without typing anything", () => {
  it("searches with a wildcard query so filters alone work", () => {
    // The endpoint requires a query; "*" is its own "match any text".
    const p = filtersToSearchParams({ ...EMPTY, minPrice: 100 });
    expect(p.query).toBe("*");
  });

  it("prefers the typed query over the wildcard", () => {
    const p = filtersToSearchParams({ ...EMPTY, minPrice: 100 }, "duplex");
    expect(p).toMatchObject({ query: "duplex", min_price: 100 });
  });
});

describe("unticked boxes do not narrow", () => {
  it("omits furnished when it is false", () => {
    // Sending furnished=false would exclude every property whose column was
    // never set, which is not what leaving a box unticked means.
    const p = filtersToSearchParams({ ...EMPTY, furnished: false, minPrice: 1 });
    expect(p).not.toHaveProperty("furnished");
  });

  it("sends furnished when it is ticked", () => {
    expect(filtersToSearchParams({ ...EMPTY, furnished: true }).furnished).toBe(true);
  });
});

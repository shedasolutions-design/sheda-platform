import { useEffect, useRef, useState } from "react";
import api, { PropertyShow } from "@/services/api";
import { categoryToPropertyType } from "@/utilities/propertyCategories";
import { filtersToSearchParams, type FilterValues } from "@/utilities/searchFilters";

/**
 * Searching the whole marketplace rather than the page that happens to be
 * loaded.
 *
 * The home screen filtered the properties already in memory, which is the
 * first twenty rows of the feed. So a search for a property that existed but
 * sat on page three returned nothing, indistinguishable from a search for
 * something that was never listed — and the more properties the marketplace
 * held, the smaller the fraction anyone could actually find.
 *
 * The backend searches the database, so this asks it. Client-side filtering
 * stays as the fallback: if the request fails, narrowing what is already on
 * screen is far better than showing an error where results should be.
 */

/** Long enough not to fire on every keystroke, short enough to feel immediate. */
const DEBOUNCE_MS = 350;
const PAGE_SIZE = 50;

export interface PropertySearchState {
  /** True while a backend search is driving what is shown. */
  active: boolean;
  loading: boolean;
  /** Set when the request failed — the caller should fall back to local filtering. */
  failed: boolean;
  results: PropertyShow[];
  total: number;
}

export function usePropertySearch(
  query: string | undefined,
  category?: string | null,
  filters?: Partial<FilterValues> | null
): PropertySearchState {
  const trimmed = (query ?? "").trim();
  const propertyType = categoryToPropertyType(category);

  // Filters are a reason to search on their own — someone can set a price
  // range without typing anything. `filtersToSearchParams` returns null when
  // nothing is actually narrowed, which is what keeps an untouched filter
  // screen from replacing the ordinary feed with a search for everything.
  const params = filtersToSearchParams(filters, trimmed);
  // The effect compares this by value: the filter object is rebuilt on every
  // render, so depending on it directly would search on a loop.
  const paramsKey = params ? JSON.stringify(params) : "";

  const [state, setState] = useState<PropertySearchState>({
    active: false,
    loading: false,
    failed: false,
    results: [],
    total: 0,
  });

  // Identifies the most recent request, so a slow earlier one cannot overwrite
  // a later result — the classic way a search box ends up showing the answer
  // to a query the person has already finished typing past.
  const latest = useRef(0);

  useEffect(() => {
    if (!paramsKey) {
      latest.current += 1; // cancel anything in flight
      setState({ active: false, loading: false, failed: false, results: [], total: 0 });
      return;
    }

    const ticket = ++latest.current;
    setState((s) => ({ ...s, active: true, loading: true, failed: false }));

    const timer = setTimeout(async () => {
      try {
        const res = await api.searchProperties({
          ...(JSON.parse(paramsKey) as ReturnType<typeof filtersToSearchParams> & object),
          // The category chip narrows on top of the filter screen's own type,
          // and is the more recent of the two when both are set.
          ...(propertyType ? { property_type: propertyType } : {}),
          limit: PAGE_SIZE,
        });
        if (ticket !== latest.current) return;

        // A backend that predates the search rework answers with a `results`
        // key and index fragments rather than `data` and whole properties.
        // Reading `data` off that yields undefined, which would render as
        // "nothing matched" — a confident wrong answer. Treat a response
        // without the expected array as a failure so the caller falls back to
        // filtering what is already on screen.
        const payload = res.ok ? res.data : undefined;
        const rows = Array.isArray(payload?.data) ? payload.data.filter(Boolean) : null;

        if (rows) {
          setState({
            active: true,
            loading: false,
            failed: false,
            results: rows,
            total: payload?.total ?? rows.length,
          });
        } else {
          setState({ active: true, loading: false, failed: true, results: [], total: 0 });
        }
      } catch {
        if (ticket !== latest.current) return;
        setState({ active: true, loading: false, failed: true, results: [], total: 0 });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [paramsKey, propertyType]);

  return state;
}

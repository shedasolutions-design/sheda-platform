import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface PropertyItem {
    id: number;
    title: string;
    price: number;
    location: string;
    property_type: string;
    listing_type: string;
    status: string;
    images?: { image_url: string; is_primary: boolean }[];
    [key: string]: any;
}

interface PropertiesState {
    items: PropertyItem[];
    cursor: number;
    hasMore: boolean;
    filters: {
        category?: string;
        location?: string;
        minPrice?: number;
        maxPrice?: number;
        listingType?: "rent" | "sale";
    };
}

const initialState: PropertiesState = {
    items: [],
    cursor: 1,
    hasMore: true,
    filters: {},
};

const propertiesSlice = createSlice({
    name: "properties",
    initialState,
    reducers: {
        setProperties(state, action: PayloadAction<PropertyItem[]>) {
            state.items = action.payload;
            state.cursor = 1;
        },
        appendProperties(state, action: PayloadAction<PropertyItem[]>) {
            // Deduplicate by id
            const existingIds = new Set(state.items.map((p) => p.id));
            const newItems = action.payload.filter((p) => !existingIds.has(p.id));
            state.items.push(...newItems);
            state.cursor += 1;
        },
        setHasMore(state, action: PayloadAction<boolean>) {
            state.hasMore = action.payload;
        },
        setFilters(
            state,
            action: PayloadAction<Partial<PropertiesState["filters"]>>
        ) {
            state.filters = { ...state.filters, ...action.payload };
        },
        clearProperties(state) {
            state.items = [];
            state.cursor = 1;
            state.hasMore = true;
            state.filters = {};
        },
    },
});

export const {
    setProperties,
    appendProperties,
    setHasMore,
    setFilters,
    clearProperties,
} = propertiesSlice.actions;
export default propertiesSlice.reducer;

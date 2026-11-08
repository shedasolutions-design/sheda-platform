import {
    timeToMinutes,
    minutesToValue,
    minutesToLabel,
    weekdayForDateString,
    availableWeekdays,
    slotsForWeekday,
    type AvailabilityWindow,
} from "../utilities/availability";

// Locks the contract the booking screen has to honour: the backend only
// accepts a requested_time inside a matching, un-booked AgentAvailability
// window (start <= t < end), and 404s otherwise. Offering a time outside one
// is the bug these tests exist to prevent regressing.

describe("timeToMinutes", () => {
    it("parses HH:MM and HH:MM:SS", () => {
        expect(timeToMinutes("09:00")).toBe(540);
        expect(timeToMinutes("09:00:00")).toBe(540);
        expect(timeToMinutes("17:30")).toBe(1050);
        expect(timeToMinutes("00:00")).toBe(0);
    });

    it("returns null for missing or malformed values", () => {
        expect(timeToMinutes(undefined)).toBeNull();
        expect(timeToMinutes(null)).toBeNull();
        expect(timeToMinutes("")).toBeNull();
        expect(timeToMinutes("not-a-time")).toBeNull();
        expect(timeToMinutes("99:00")).toBeNull();
    });
});

describe("minutesToValue / minutesToLabel", () => {
    it("formats a backend-shaped time value", () => {
        expect(minutesToValue(540)).toBe("09:00:00");
        expect(minutesToValue(0)).toBe("00:00:00");
        expect(minutesToValue(1050)).toBe("17:30:00");
    });

    it("formats a human 12-hour label, including the noon/midnight edges", () => {
        expect(minutesToLabel(540)).toBe("9:00 AM");
        expect(minutesToLabel(720)).toBe("12:00 PM");
        expect(minutesToLabel(0)).toBe("12:00 AM");
        expect(minutesToLabel(1050)).toBe("5:30 PM");
    });
});

describe("weekdayForDateString", () => {
    it("returns the LOCAL weekday, not the UTC one", () => {
        // 2026-08-04 is a Tuesday. Parsing as UTC would roll back to Monday
        // for anyone west of UTC and match the wrong day's availability.
        expect(weekdayForDateString("2026-08-04")).toBe("TUESDAY");
        expect(weekdayForDateString("2026-08-05")).toBe("WEDNESDAY");
        expect(weekdayForDateString("2026-08-09")).toBe("SUNDAY");
    });

    it("returns null for malformed input", () => {
        expect(weekdayForDateString("")).toBeNull();
        expect(weekdayForDateString("04-08-2026")).toBeNull();
    });
});

describe("availableWeekdays", () => {
    const windows: AvailabilityWindow[] = [
        { weekday: "MONDAY", start_time: "09:00", end_time: "12:00" },
        { weekday: "tuesday", start_time: "09:00", end_time: "12:00" },
        { weekday: "FRIDAY", start_time: "09:00", end_time: "12:00", is_booked: true },
    ];

    it("normalises case and excludes already-booked windows", () => {
        const days = availableWeekdays(windows);
        expect(days.has("MONDAY")).toBe(true);
        expect(days.has("TUESDAY")).toBe(true);
        expect(days.has("FRIDAY")).toBe(false);
    });

    it("is empty when the seller published nothing", () => {
        expect(availableWeekdays([]).size).toBe(0);
    });
});

describe("slotsForWeekday", () => {
    it("treats end_time as exclusive, matching the backend comparison", () => {
        const slots = slotsForWeekday(
            [{ weekday: "TUESDAY", start_time: "09:00", end_time: "12:00" }],
            "TUESDAY"
        );
        expect(slots.map((s) => s.value)).toEqual([
            "09:00:00",
            "10:00:00",
            "11:00:00",
        ]);
        // 12:00 would be rejected by the backend (end_time > requested fails).
        expect(slots.some((s) => s.value === "12:00:00")).toBe(false);
    });

    it("only returns slots for the requested weekday", () => {
        const windows: AvailabilityWindow[] = [
            { weekday: "MONDAY", start_time: "09:00", end_time: "11:00" },
            { weekday: "TUESDAY", start_time: "14:00", end_time: "16:00" },
        ];
        expect(slotsForWeekday(windows, "TUESDAY").map((s) => s.value)).toEqual([
            "14:00:00",
            "15:00:00",
        ]);
    });

    it("skips booked windows entirely", () => {
        const windows: AvailabilityWindow[] = [
            { weekday: "TUESDAY", start_time: "09:00", end_time: "11:00", is_booked: true },
        ];
        expect(slotsForWeekday(windows, "TUESDAY")).toEqual([]);
    });

    it("merges overlapping windows without emitting duplicates, sorted", () => {
        const windows: AvailabilityWindow[] = [
            { weekday: "TUESDAY", start_time: "13:00", end_time: "15:00" },
            { weekday: "TUESDAY", start_time: "09:00", end_time: "11:00" },
            { weekday: "TUESDAY", start_time: "10:00", end_time: "12:00" },
        ];
        expect(slotsForWeekday(windows, "TUESDAY").map((s) => s.value)).toEqual([
            "09:00:00",
            "10:00:00",
            "11:00:00",
            "13:00:00",
            "14:00:00",
        ]);
    });

    it("ignores malformed or inverted windows instead of throwing", () => {
        const windows: AvailabilityWindow[] = [
            { weekday: "TUESDAY", start_time: "bad", end_time: "12:00" },
            { weekday: "TUESDAY", start_time: "15:00", end_time: "13:00" },
            { weekday: "TUESDAY", start_time: "09:00", end_time: "09:00" },
        ];
        expect(slotsForWeekday(windows, "TUESDAY")).toEqual([]);
    });

    it("matches weekday case-insensitively", () => {
        const windows: AvailabilityWindow[] = [
            { weekday: "tuesday", start_time: "09:00", end_time: "10:00" },
        ];
        expect(slotsForWeekday(windows, "TUESDAY")).toHaveLength(1);
    });
});

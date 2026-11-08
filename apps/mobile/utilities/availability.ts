/**
 * Turning a seller's published availability into bookable appointment slots.
 *
 * The backend (run_book_appointment, app/services/listing.py) accepts a
 * requested_time only when it falls inside a matching AgentAvailability row:
 *
 *     agent_id == agent
 *     weekday  == requested_time.strftime("%A").upper()
 *     start_time <= requested_time < end_time      (end is EXCLUSIVE)
 *     is_booked == False
 *
 * ...and otherwise returns 404 "Requested time is unavailable. Please
 * negotiate a new time." The booking screen used to offer a fixed
 * 9am/11am/1pm/3pm/5pm list regardless of what the seller had actually
 * configured, so any seller whose hours didn't happen to cover those exact
 * times produced that 404 on every attempt. These helpers exist so the UI can
 * only ever offer times the backend will really accept.
 */

export interface AvailabilityWindow {
    weekday: string;
    start_time: string;
    end_time: string;
    is_booked?: boolean;
}

export interface TimeSlot {
    label: string;
    value: string;
}

/** Index matches JS Date#getDay(); values match the backend's WeekDayEnum. */
export const WEEKDAY_NAMES = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
] as const;

/** "09:00" / "09:00:00" -> minutes since midnight; null when unparseable. */
export function timeToMinutes(value?: string | null): number | null {
    if (!value) return null;
    const parts = String(value).split(":");
    const h = Number(parts[0]);
    const m = Number(parts[1] ?? 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
}

export function minutesToValue(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function minutesToLabel(mins: number): string {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const suffix = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Weekday name for a "YYYY-MM-DD" string.
 *
 * Parsed as LOCAL midnight on purpose: passing the bare string to `new Date()`
 * parses it as UTC, which lands on the previous day for anyone west of UTC and
 * would match the request against the wrong day's availability.
 */
export function weekdayForDateString(dateString: string): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    if (!match) return null;
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    return WEEKDAY_NAMES[date.getDay()];
}

/** Uppercase weekday names the seller has at least one un-booked window on. */
export function availableWeekdays(windows: AvailabilityWindow[]): Set<string> {
    const days = new Set<string>();
    for (const w of windows) {
        if (w.is_booked) continue;
        if (!w.weekday) continue;
        days.add(String(w.weekday).toUpperCase());
    }
    return days;
}

/**
 * Expand a seller's windows for one weekday into hourly bookable slots.
 * `end_time` is exclusive, matching the backend's comparison, so a
 * 09:00-12:00 window yields 9, 10 and 11 — never 12.
 */
export function slotsForWeekday(
    windows: AvailabilityWindow[],
    weekday: string,
    stepMinutes: number = 60
): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const seen = new Set<string>();
    const target = String(weekday).toUpperCase();

    for (const w of windows) {
        if (String(w.weekday).toUpperCase() !== target) continue;
        if (w.is_booked) continue;

        const start = timeToMinutes(w.start_time);
        const end = timeToMinutes(w.end_time);
        if (start == null || end == null || end <= start) continue;

        for (let t = start; t < end; t += stepMinutes) {
            const value = minutesToValue(t);
            if (seen.has(value)) continue;
            seen.add(value);
            slots.push({ label: minutesToLabel(t), value });
        }
    }

    return slots.sort((a, b) => a.value.localeCompare(b.value));
}

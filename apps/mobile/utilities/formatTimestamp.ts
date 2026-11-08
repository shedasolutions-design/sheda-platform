/**
 * Timestamp formatting for on-chain activity.
 *
 * Every transaction the wallet shows comes with a real block timestamp, so
 * these all take milliseconds. `normalizeTimestamp` exists because the same
 * value reaches the UI from three sources with three magnitudes: NEAR
 * contracts emit nanoseconds, the indexer converts to milliseconds, and older
 * cached entries only kept a date string.
 */

/** Coerce a NEAR nanosecond / millisecond / second timestamp to milliseconds. */
export function normalizeTimestamp(value?: number | string | null): number | null {
    if (value == null) return null;

    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }

    if (!Number.isFinite(value) || value <= 0) return null;

    // ns (1e18-ish) → ms, s (1e9-ish) → ms, ms passes through.
    if (value > 1e15) return Math.floor(value / 1_000_000);
    if (value < 1e11) return Math.floor(value * 1000);
    return Math.floor(value);
}

/**
 * "just now" / "12m ago" / "3h ago" / "Yesterday" / "12 Mar" / "12 Mar 2025".
 * Anything older than a week gets a real date — "48d ago" isn't useful.
 */
export function formatRelativeTime(value?: number | string | null): string {
    const ms = normalizeTimestamp(value);
    if (ms == null) return "";

    const diff = Date.now() - ms;
    if (diff < 0) return formatShortDate(ms);

    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;

    return formatShortDate(ms);
}

/** "12 Mar" for the current year, "12 Mar 2025" otherwise. */
export function formatShortDate(value?: number | string | null): string {
    const ms = normalizeTimestamp(value);
    if (ms == null) return "";

    const date = new Date(ms);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        ...(sameYear ? {} : { year: "numeric" }),
    });
}

/**
 * One-line label for a list row: "3h ago • 12 Mar, 14:03" while the relative
 * form is still useful, and just the exact date-time once it isn't. Users need
 * both — "when roughly" at a glance and "exactly when" to reconcile against an
 * explorer — without the row repeating the same date twice.
 */
export function formatTimestampLabel(value?: number | string | null): string {
    const ms = normalizeTimestamp(value);
    if (ms == null) return "";

    const exact = formatDateTime(ms);
    const relative = formatRelativeTime(ms);
    const isFuzzy = relative.endsWith("ago") || relative === "Just now" || relative === "Yesterday";

    return isFuzzy ? `${relative} • ${exact}` : exact;
}

/** Full local date + time, e.g. "12 Mar 2026, 14:03". Used in detail views. */
export function formatDateTime(value?: number | string | null): string {
    const ms = normalizeTimestamp(value);
    if (ms == null) return "";

    const date = new Date(ms);
    return `${date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    })}, ${date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    })}`;
}

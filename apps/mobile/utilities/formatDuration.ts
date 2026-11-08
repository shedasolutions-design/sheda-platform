/**
 * Human-friendly duration formatting for lease countdowns/elapsed-time
 * displays — picks the coarsest unit that fits (minutes/hours/days/weeks/
 * months/years) instead of always showing months, so a 3-day-old bid
 * doesn't read as "0 months" and a 2-year lease doesn't read as "24 months".
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
// Matches the 30.44-day average month already used elsewhere in this
// codebase (hooks/useTransactions.ts) for the on-chain contract's own
// "30 days per month" lease-duration math.
const MONTH_MS = 30.44 * DAY_MS;
const YEAR_MS = 365.25 * DAY_MS;

function pluralize(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Absolute duration as a string, e.g. "3 days", "2 weeks 4 days",
 * "1 year 2 months". Caller decides "in X" / "X ago" framing.
 */
export function formatDuration(ms: number): string {
  const abs = Math.max(0, Math.round(ms));

  if (abs < HOUR_MS) {
    const minutes = Math.max(1, Math.round(abs / MINUTE_MS));
    return pluralize(minutes, "minute");
  }
  if (abs < DAY_MS) {
    const hours = Math.round(abs / HOUR_MS);
    return pluralize(hours, "hour");
  }
  if (abs < WEEK_MS) {
    const days = Math.round(abs / DAY_MS);
    return pluralize(days, "day");
  }
  if (abs < MONTH_MS) {
    const weeks = Math.floor(abs / WEEK_MS);
    const days = Math.round((abs - weeks * WEEK_MS) / DAY_MS);
    return days > 0
      ? `${pluralize(weeks, "week")} ${pluralize(days, "day")}`
      : pluralize(weeks, "week");
  }
  if (abs < YEAR_MS) {
    const months = Math.floor(abs / MONTH_MS);
    const remainderDays = Math.round(abs - months * MONTH_MS);
    const weeks = Math.floor(remainderDays / WEEK_MS);
    return weeks > 0
      ? `${pluralize(months, "month")} ${pluralize(weeks, "week")}`
      : pluralize(months, "month");
  }
  const years = Math.floor(abs / YEAR_MS);
  const remainderMonths = Math.round((abs - years * YEAR_MS) / MONTH_MS);
  return remainderMonths > 0
    ? `${pluralize(years, "year")} ${pluralize(remainderMonths, "month")}`
    : pluralize(years, "year");
}

export type CountdownUrgency = "normal" | "warning" | "danger" | "expired";

export interface CountdownResult {
  label: string;
  urgency: CountdownUrgency;
}

/** "3 weeks 2 days left" / "Expired", with an urgency bucket for styling. */
export function formatCountdown(
  targetMs?: number,
  nowMs: number = Date.now()
): CountdownResult {
  if (!targetMs) return { label: "No expiration set", urgency: "normal" };

  const diff = targetMs - nowMs;
  if (diff <= 0) return { label: "Expired", urgency: "expired" };

  const days = diff / DAY_MS;
  let urgency: CountdownUrgency = "normal";
  if (days <= 7) urgency = "danger";
  else if (days <= 30) urgency = "warning";

  return { label: `${formatDuration(diff)} left`, urgency };
}

/** "3 days ago" / "Expired today", for events already in the past. */
export function formatElapsed(sinceMs?: number, nowMs: number = Date.now()): string {
  if (!sinceMs) return "Agreement ended";
  const diff = nowMs - sinceMs;
  if (diff < DAY_MS) return "Expired today";
  return `Expired ${formatDuration(diff)} ago`;
}

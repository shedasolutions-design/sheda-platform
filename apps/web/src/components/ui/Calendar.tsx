"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** "YYYY-MM-DD" in local time, matching react-native-calendars' dateString. */
export const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A month calendar for picking one day. Days before `minDate`, and days for
 * which `isDisabled` returns true, cannot be picked.
 */
export default function Calendar({
  value,
  onChange,
  minDate,
  isDisabled,
}: {
  value: string;
  onChange: (dateString: string) => void;
  minDate?: string;
  isDisabled?: (date: Date) => boolean;
}) {
  const start = value ? new Date(`${value}T00:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= count; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    return cells;
  }, [month]);

  const today = toDateString(new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const atMin = minDate ? toDateString(new Date(month.getFullYear(), month.getMonth(), 0)) < minDate : false;

  return (
    <div className="rounded-xl border border-borderColor p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atMin}
          aria-label="Previous month"
          className="rounded-lg p-1.5 text-primary hover:bg-cardBackground disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="font-semibold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-lg p-1.5 text-primary hover:bg-cardBackground">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-[#1F2A44]">
        {WEEK.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {days.map((d, i) => {
          if (!d) return <span key={i} />;
          const ds = toDateString(d);
          const disabled = (minDate && ds < minDate) || isDisabled?.(d);
          const selected = ds === value;
          return (
            <button
              key={i}
              type="button"
              disabled={!!disabled}
              onClick={() => onChange(ds)}
              aria-pressed={selected}
              aria-label={d.toDateString()}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full ${
                selected
                  ? "bg-primary text-white"
                  : disabled
                    ? "text-gray-300"
                    : ds === today
                      ? "font-semibold text-primary hover:bg-active"
                      : "text-[#2d4150] hover:bg-active"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

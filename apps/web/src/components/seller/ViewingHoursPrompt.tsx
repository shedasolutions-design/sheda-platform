"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import AsyncStorage from "@/lib/storage";
import { WEEKDAY_NAMES, minutesToLabel, timeToMinutes } from "@/utilities/availability";

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  label: minutesToLabel(h * 60),
  value: `${String(h).padStart(2, "0")}:00`,
}));
const WEEKDAYS = WEEKDAY_NAMES.filter((d) => d !== "SATURDAY" && d !== "SUNDAY");

/** Screens that own the whole page, or already are the hours editor. */
const SKIP_ON = ["wallet-setup", "wallet-recovery", "availability", "/list", "/login", "/signup", "/otp"];
const dismissedKey = (userId: string | number) => `@sheda_viewing_hours_prompt_dismissed:${userId}`;

/**
 * Asks a new seller, once, when buyers may come to view — the moment they
 * become a seller, rather than only when they first list. Optional: "Skip"
 * is remembered for this account, and hours can be set later from Profile →
 * Viewing Hours or during the first listing.
 *
 * Mounted at the root so it covers every way of becoming a seller: picking
 * Seller on the chooser after signing up, or switching on the profile page.
 */
export default function ViewingHoursPrompt() {
  const { isAuthenticated, user, getSchedule, createAvailableTime } = useApi();
  const { isSeller, isLoading } = useMode();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>(WEEKDAYS);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id;
  const onSkippedPage = SKIP_ON.some((p) => pathname.includes(p));

  useEffect(() => {
    if (!isAuthenticated || isLoading || !isSeller || userId == null || onSkippedPage) return;
    const key = `${userId}`;
    if (checkedFor === key) return;
    let cancelled = false;
    (async () => {
      setCheckedFor(key);
      try {
        if (await AsyncStorage.getItem(dismissedKey(userId))) return;
        const schedule = await getSchedule();
        if (!cancelled && schedule.length === 0) setOpen(true);
      } catch {
        // Not knowing is treated as "has hours": never nag on a failed read.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, isSeller, userId, onSkippedPage, checkedFor, getSchedule]);

  // Leaving seller mode or signing out hides it.
  const show = open && isSeller && isAuthenticated;

  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const badRange = s == null || e == null || e <= s;

  const skip = async () => {
    setOpen(false);
    if (userId != null) await AsyncStorage.setItem(dismissedKey(userId), "1").catch(() => {});
  };

  const save = async () => {
    if (days.length === 0 || badRange) return;
    setSaving(true);
    setError(null);
    const results = await Promise.allSettled(
      days.map((weekday) => createAvailableTime({ weekday, start_time: start, end_time: end }))
    );
    setSaving(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === days.length) {
      setError("Couldn't save your hours. Check your connection and try again.");
      return;
    }
    await getSchedule().catch(() => {});
    setOpen(false);
    if (failed > 0) {
      // Saved some: the rest can be added from Viewing Hours.
      console.warn(`${failed} viewing-hour window(s) failed to save`);
    }
  };

  if (!show) return null;

  return (
    <Modal open={show} onClose={saving ? undefined : skip} title="When can buyers view your properties?">
      <p className="mb-4 text-sm leading-5 text-secondaryText">
        Buyers can only book an inspection during the hours you publish. These apply to all your listings, and you can change them any time
        from Profile → Viewing Hours.
      </p>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium">Available days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_NAMES.map((day) => {
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => setDays((prev) => (on ? prev.filter((d) => d !== day) : [...prev, day]))}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary text-white" : "border-borderColor hover:bg-cardBackground"}`}
              >
                {day.charAt(0) + day.slice(1, 3).toLowerCase()}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mb-2 grid grid-cols-2 gap-3">
        <SelectField label="From" options={HOURS} value={start} onValueChange={setStart} />
        <SelectField label="Until" options={HOURS} value={end} onValueChange={setEnd} />
      </div>
      {badRange && <p className="text-xs text-red-600">The end time must be after the start time.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <Button full onClick={save} loading={saving} disabled={days.length === 0 || badRange}>
          Save hours
        </Button>
        <Button full variant="outline" onClick={skip} disabled={saving}>
          Skip for now
        </Button>
      </div>
    </Modal>
  );
}

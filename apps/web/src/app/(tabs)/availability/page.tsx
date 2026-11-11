"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";
import Spinner from "@/components/ui/Spinner";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import AuthGuard from "@/components/auth/AuthGuard";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import type { AvailabilityShow } from "@/services/api";
import { WEEKDAY_NAMES, minutesToLabel, timeToMinutes } from "@/utilities/availability";

/**
 * Seller's viewing hours. Buyers can book a viewing only inside a published
 * window (the backend rejects anything else), so without hours a seller's
 * listings cannot be booked at all.
 */

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  label: minutesToLabel(h * 60),
  value: `${String(h).padStart(2, "0")}:00`,
}));
const DAYS = WEEKDAY_NAMES.map((d) => ({ label: d.charAt(0) + d.slice(1).toLowerCase(), value: d }));
const fmt = (v: string) => {
  const m = timeToMinutes(v);
  return m == null ? v : minutesToLabel(m);
};
const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase();

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function Availability() {
  const router = useRouter();
  const { isSeller, isLoading: modeLoading } = useMode();
  const { getSchedule, createAvailableTime, updateSchedule, deleteSchedule, schedule } = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekday, setWeekday] = useState<string>(WEEKDAY_NAMES[1]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ visible: false, type: "info", title: "" });
  const close = () => setFeedback((f) => ({ ...f, visible: false }));
  const notify = (type: FeedbackType, title: string, message?: string) => setFeedback({ visible: true, type, title, message });

  useEffect(() => {
    if (!modeLoading && !isSeller) router.replace("/home");
  }, [isSeller, modeLoading, router]);

  const load = useCallback(async () => {
    try {
      await getSchedule();
    } catch {
      /* shown as empty */
    } finally {
      setLoading(false);
    }
  }, [getSchedule]);
  useEffect(() => {
    if (isSeller) load();
  }, [isSeller, load]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, AvailabilityShow[]>();
    for (const item of schedule || []) {
      const key = String(item.weekday).toUpperCase();
      byDay.set(key, [...(byDay.get(key) || []), item]);
    }
    return WEEKDAY_NAMES.map((day) => ({
      day,
      windows: (byDay.get(day) || []).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    })).filter((g) => g.windows.length > 0);
  }, [schedule]);

  const reset = () => {
    setEditingId(null);
    setWeekday(WEEKDAY_NAMES[1]);
    setStart("09:00");
    setEnd("17:00");
  };

  const save = async () => {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    if (s == null || e == null) return notify("error", "Invalid Time", "Please choose a valid start and end time.");
    if (e <= s) return notify("error", "Invalid Range", "The end time must be later than the start time.");
    setSaving(true);
    try {
      const payload = { weekday, start_time: start, end_time: end };
      if (editingId != null) await updateSchedule(editingId, payload);
      else await createAvailableTime(payload);
      await getSchedule();
      const wasEditing = editingId != null;
      reset();
      notify("success", "Saved", wasEditing ? "Your viewing hours have been updated." : "Buyers can now book viewings during this window.");
    } catch (err: any) {
      notify(
        "error",
        "Save Failed",
        err?.message && !/^request failed$/i.test(err.message) ? err.message : "Could not save your viewing hours. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = (item: AvailabilityShow) => {
    setFeedback({
      visible: true,
      type: "warning",
      title: "Remove Window",
      message: `Remove ${dayLabel(String(item.weekday))} ${fmt(String(item.start_time))} – ${fmt(
        String(item.end_time)
      )}? Buyers will no longer be able to book viewings during this time.`,
      actionLabel: "Remove",
      onAction: async () => {
        close();
        try {
          await deleteSchedule(item.id);
          if (editingId === item.id) reset();
          await getSchedule();
        } catch (err: any) {
          const raw = String(err?.message ?? "");
          notify(
            "error",
            "Could Not Remove",
            /^not found$/i.test(raw.trim())
              ? "Removing viewing hours isn't available on the server yet. You can still shorten this window by editing it."
              : raw && !/^request failed$/i.test(raw)
                ? raw
                : "Could not remove this window. Please try again."
          );
        }
      },
    });
  };

  const edit = (item: AvailabilityShow) => {
    setEditingId(item.id);
    setWeekday(String(item.weekday).toUpperCase());
    setStart(String(item.start_time).slice(0, 5));
    setEnd(String(item.end_time).slice(0, 5));
  };

  if (!isSeller) return null;

  return (
    <>
      <PageHeader title="Viewing Hours" fallback="/activity" />
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-4">
        <p className="mb-4 text-sm text-secondaryText">
          Buyers can only book viewings inside the hours you publish here. If you haven&apos;t set any, they&apos;ll be asked to message
          you instead.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : grouped.length === 0 ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-1 text-sm font-medium text-amber-900">No viewing hours set</p>
            <p className="text-sm text-amber-700">Add at least one window below so buyers can book a viewing on your listings.</p>
          </div>
        ) : (
          <div className="mb-5">
            <h2 className="mb-2 text-sm font-medium">Your Current Hours</h2>
            {grouped.map(({ day, windows }) => (
              <div key={day} className="mb-2 rounded-xl border border-borderColor p-3">
                <p className="mb-1 text-sm font-medium">{dayLabel(day)}</p>
                {windows.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1">
                    <span className="flex items-center gap-2 text-sm text-secondaryText">
                      {fmt(String(w.start_time))} – {fmt(String(w.end_time))}
                      {w.is_booked && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">Booked</span>}
                    </span>
                    <span className="flex gap-4 text-sm">
                      <button type="button" onClick={() => edit(w)} className="text-primary hover:underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => remove(w)} className="text-red-800 hover:underline">
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-borderColor p-4">
          <h2 className="mb-3 text-sm font-medium">{editingId != null ? "Edit Window" : "Add a Window"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Day" options={DAYS} value={weekday} onValueChange={setWeekday} />
            <SelectField label="From" options={HOURS} value={start} onValueChange={setStart} />
            <SelectField label="Until" options={HOURS} value={end} onValueChange={setEnd} />
          </div>
          <div className="mt-4 flex gap-3">
            <Button onClick={save} loading={saving}>
              {editingId != null ? "Save Changes" : "Add Window"}
            </Button>
            {editingId != null && (
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        actionLabel={feedback.actionLabel}
        onAction={feedback.onAction}
        onClose={close}
      />
    </>
  );
}

export default function AvailabilityPage() {
  return (
    <AuthGuard requireAuth>
      <Availability />
    </AuthGuard>
  );
}

import {
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Alert from "@/utilities/alertPolyfill";
import { useState, useEffect, useCallback, useMemo } from "react";
import BackBtn from "@/components/common/BackBtn";
import Button from "@/components/common/Button";
import SelectInput from "@/components/input/selectInput";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import AuthGuard from "@/components/AuthGuard";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { router } from "expo-router";
import {
  WEEKDAY_NAMES,
  timeToMinutes,
  minutesToLabel,
} from "@/utilities/availability";
import type { AvailabilityShow } from "@/services/api";

/**
 * Seller-facing viewing-hours manager.
 *
 * Buyers can only book a slot that falls inside one of these windows — the
 * backend's run_book_appointment rejects anything else with 404 "Requested
 * time is unavailable" — so without a way to publish hours, a seller's
 * listings were effectively unbookable. That was the gap: the backend has had
 * create/get/update endpoints all along with no UI in front of them.
 */

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  label: minutesToLabel(h * 60),
  value: `${String(h).padStart(2, "0")}:00`,
}));

const WEEKDAY_OPTIONS = WEEKDAY_NAMES.map((d) => ({
  label: d.charAt(0) + d.slice(1).toLowerCase(),
  value: d,
}));

/** "09:00:00" | "09:00" -> "9:00 AM" for display. */
function formatTime(value: string): string {
  const mins = timeToMinutes(value);
  return mins == null ? value : minutesToLabel(mins);
}

const Availability = () => {
  const { isSeller } = useMode();
  const { getSchedule, createAvailableTime, updateSchedule, deleteSchedule, schedule } = useApi();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekday, setWeekday] = useState<string>(WEEKDAY_NAMES[1]); // Monday
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [editingId, setEditingId] = useState<number | null>(null);

  // get-schedule/me is agent-only on the backend (ActiveAgent), so this screen
  // is meaningless — and will 403/404 — in buyer mode.
  useEffect(() => {
    if (!isSeller) {
      router.replace("/(tabs)/home");
    }
  }, [isSeller]);

  const load = useCallback(async () => {
    try {
      await getSchedule();
    } catch (err) {
      console.warn("Failed to load schedule:", err);
    } finally {
      setLoading(false);
    }
  }, [getSchedule]);

  useEffect(() => {
    if (isSeller) load();
  }, [isSeller, load]);

  /** Existing windows grouped by day, in week order, each sorted by start. */
  const grouped = useMemo(() => {
    const byDay = new Map<string, AvailabilityShow[]>();
    for (const item of schedule || []) {
      const key = String(item.weekday).toUpperCase();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(item);
    }
    return WEEKDAY_NAMES.map((day) => ({
      day,
      windows: (byDay.get(day) || []).sort((a, b) =>
        String(a.start_time).localeCompare(String(b.start_time))
      ),
    })).filter((g) => g.windows.length > 0);
  }, [schedule]);

  const resetForm = () => {
    setEditingId(null);
    setWeekday(WEEKDAY_NAMES[1]);
    setStartTime("09:00");
    setEndTime("17:00");
  };

  const handleSave = async () => {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    if (start == null || end == null) {
      Alert.alert("Invalid Time", "Please choose a valid start and end time.");
      return;
    }
    if (end <= start) {
      Alert.alert(
        "Invalid Range",
        "The end time must be later than the start time."
      );
      return;
    }

    // The backend treats end_time as exclusive, so a 9-10 window offers only
    // the 9am slot. Warn rather than block — a single-hour window is valid.
    setSaving(true);
    try {
      const payload = {
        weekday,
        start_time: startTime,
        end_time: endTime,
      };

      if (editingId != null) {
        await updateSchedule(editingId, payload);
      } else {
        await createAvailableTime(payload);
      }

      await getSchedule();
      resetForm();
      Alert.alert(
        "Saved",
        editingId != null
          ? "Your viewing hours have been updated."
          : "Buyers can now book viewings during this window."
      );
    } catch (err: any) {
      const detail =
        err?.message && !/^request failed$/i.test(err.message)
          ? err.message
          : "Could not save your viewing hours. Please try again.";
      Alert.alert("Save Failed", detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: AvailabilityShow) => {
    const range = `${formatTime(String(item.start_time))} – ${formatTime(String(item.end_time))}`;
    const dayLabel =
      String(item.weekday).charAt(0) + String(item.weekday).slice(1).toLowerCase();

    Alert.alert(
      "Remove Window",
      `Remove ${dayLabel} ${range}? Buyers will no longer be able to book viewings during this time.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSchedule(item.id);
              // If the removed window was loaded into the form, clear it so
              // the seller isn't left editing something that no longer exists.
              if (editingId === item.id) resetForm();
              await getSchedule();
            } catch (err: any) {
              const raw = String(err?.message ?? "");

              // The delete endpoint (Sheda-Backend PR #21) may not be live on
              // the deployed API yet, in which case the route itself is
              // missing and FastAPI answers a bare "Not Found" — which reads
              // as "your window is gone" rather than "this feature isn't
              // deployed". Name the real situation instead.
              const routeMissing = /^not found$/i.test(raw.trim());

              // A 409 means the slot has a booked viewing; that detail tells
              // the seller exactly what to do next, so pass it through.
              const detail = routeMissing
                ? "Removing viewing hours isn't available on the server yet. You can still shorten this window by editing it."
                : raw && !/^request failed$/i.test(raw)
                  ? raw
                  : "Could not remove this window. Please try again.";

              Alert.alert("Could Not Remove", detail);
            }
          },
        },
      ]
    );
  };

  const startEditing = (item: AvailabilityShow) => {
    setEditingId(item.id);
    setWeekday(String(item.weekday).toUpperCase());
    // Trim any seconds the backend sends back so it matches an option value.
    setStartTime(String(item.start_time).slice(0, 5));
    setEndTime(String(item.end_time).slice(0, 5));
  };

  if (!isSeller) return null;

  return (
    <AuthGuard requireAuth={true}>
      <SafeAreaView style={{ flex: 1 }}>
        <View className="container flex-1 mx-auto max-w-2xl" style={{ padding: 20 }}>
          <View className="flex-row items-center gap-4">
            <BackBtn />
            <InterSemiBold className="text-lg/5">Viewing Hours</InterSemiBold>
          </View>

          <ScrollView
            className="mt-4"
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <InterRegular className="text-sm text-secondaryText mb-4">
              Buyers can only book viewings inside the hours you publish here.
              If you haven't set any, they'll be asked to message you instead.
            </InterRegular>

            {/* Existing windows */}
            {loading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color="#C1272D" />
              </View>
            ) : grouped.length === 0 ? (
              <View
                className="p-4 rounded-lg mb-5"
                style={{ backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" }}
              >
                <InterMedium className="text-sm mb-1" style={{ color: "#92400E" }}>
                  No viewing hours set
                </InterMedium>
                <InterRegular className="text-sm" style={{ color: "#B45309" }}>
                  Add at least one window below so buyers can book a viewing on
                  your listings.
                </InterRegular>
              </View>
            ) : (
              <View className="mb-5">
                <InterMedium className="text-sm mb-2">Your Current Hours</InterMedium>
                {grouped.map(({ day, windows }) => (
                  <View
                    key={day}
                    className="mb-2 p-3 rounded-lg"
                    style={{ backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" }}
                  >
                    <InterMedium className="text-sm mb-1">
                      {day.charAt(0) + day.slice(1).toLowerCase()}
                    </InterMedium>
                    {windows.map((w) => (
                      <View
                        key={w.id}
                        className="flex-row justify-between items-center py-1"
                      >
                        <View className="flex-row items-center gap-2">
                          <InterRegular className="text-sm text-secondaryText">
                            {formatTime(String(w.start_time))} – {formatTime(String(w.end_time))}
                          </InterRegular>
                          {w.is_booked && (
                            <View
                              className="px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "#E0F2FE" }}
                            >
                              <InterRegular style={{ fontSize: 10, color: "#0369A1" }}>
                                Booked
                              </InterRegular>
                            </View>
                          )}
                        </View>
                        <View className="flex-row items-center gap-4">
                          <TouchableOpacity onPress={() => startEditing(w)}>
                            <InterRegular className="text-sm text-primary">Edit</InterRegular>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDelete(w)}>
                            <InterRegular className="text-sm" style={{ color: "#991B1B" }}>
                              Remove
                            </InterRegular>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Add / edit form */}
            <View
              className="p-4 rounded-lg"
              style={{ borderWidth: 1, borderColor: "#E5E7EB" }}
            >
              <InterMedium className="text-sm mb-3">
                {editingId != null ? "Edit Window" : "Add a Window"}
              </InterMedium>

              <SelectInput
                label="Day"
                options={WEEKDAY_OPTIONS}
                value={weekday}
                onValueChange={(v: string | number) => setWeekday(String(v))}
              />
              <SelectInput
                label="From"
                options={HOUR_OPTIONS}
                value={startTime}
                onValueChange={(v: string | number) => setStartTime(String(v))}
              />
              <SelectInput
                label="Until"
                options={HOUR_OPTIONS}
                value={endTime}
                onValueChange={(v: string | number) => setEndTime(String(v))}
              />

              <InterRegular className="text-xs text-secondaryText mt-1 mb-3">
                The end time is not itself bookable — 9:00 AM to 12:00 PM offers
                the 9, 10 and 11 o'clock slots.
              </InterRegular>

              <Button
                onPress={handleSave}
                disabled={saving}
                className="rounded-lg"
                style={{ opacity: saving ? 0.6 : 1 }}
              >
                <InterRegular className="text-white">
                  {saving
                    ? "Saving..."
                    : editingId != null
                      ? "Update Window"
                      : "Add Window"}
                </InterRegular>
              </Button>

              {editingId != null && (
                <TouchableOpacity className="mt-3 items-center" onPress={resetForm}>
                  <InterRegular className="text-sm text-secondaryText">
                    Cancel edit
                  </InterRegular>
                </TouchableOpacity>
              )}
            </View>

            <InterRegular className="text-xs text-secondaryText mt-4">
              A window with a booked viewing can't be removed until that
              appointment is cancelled.
            </InterRegular>
          </ScrollView>
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
};

export default Availability;

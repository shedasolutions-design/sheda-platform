import { SafeAreaView, View, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import BackBtn from "@/components/common/BackBtn";
import Button from "@/components/common/Button";
import { Calendar } from "react-native-calendars";
import { useState, useEffect, useCallback, useMemo } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useApi } from "@/contexts/ApiContext";
import { useTransactions } from "@/hooks/useTransactions";
import { TransactionPhase } from "@/types/transaction";
import { useNotifications } from "@/contexts/NotificationContext";
import { useMode } from "@/contexts/ModeContext";
import type { AvailabilityShow } from "@/services/api";
import {
  WEEKDAY_NAMES,
  availableWeekdays as computeAvailableWeekdays,
  slotsForWeekday,
  weekdayForDateString,
  type AvailabilityWindow,
} from "@/utilities/availability";

interface DATE {
  dateString: string;
  day: number;
  month: number;
  timestamp: number;
  year: number;
}

const BookAppointment = () => {
  const { id, bidId, blockchainPropertyId, sellerId, propertyTitle } =
    useLocalSearchParams();
  const propertyId = id;
  const { bookAppointment, getAgentProfile, sendTransactionUpdate, user } = useApi();
  const { updatePhase } = useTransactions();
  const { addNotification } = useNotifications();
  const { isSeller, toggleMode } = useMode();

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [isBooking, setIsBooking] = useState(false);
  const [availabilities, setAvailabilities] = useState<AvailabilityShow[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(true);

  // Prevent selecting past dates
  const today = new Date().toISOString().split("T")[0];

  // Load the SELLER's availability. This used to call getSchedule(), which
  // hits /api/v1/user/get-schedule/me — the *current* user's own schedule, and
  // an agent-only endpoint, so for a buyer it 404'd and returned nothing
  // useful for booking with someone else anyway.
  useEffect(() => {
    let cancelled = false;
    const agentId = sellerId ? Number(sellerId) : null;

    if (!agentId) {
      setLoadingAvailability(false);
      return;
    }

    (async () => {
      try {
        const agent = await getAgentProfile(agentId, { silent: true });
        if (!cancelled) {
          setAvailabilities(agent?.availabilities ?? []);
        }
      } catch (err) {
        console.warn("Failed to load seller availability:", err);
        if (!cancelled) setAvailabilities([]);
      } finally {
        if (!cancelled) setLoadingAvailability(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sellerId, getAgentProfile]);

  const windows = availabilities as unknown as AvailabilityWindow[];

  /** Uppercase weekday names the seller has at least one free window on. */
  const availableWeekdays = useMemo(
    () => computeAvailableWeekdays(windows),
    [windows]
  );

  const selectedWeekday = useMemo(
    () => (selectedDay ? weekdayForDateString(selectedDay) : null),
    [selectedDay]
  );

  const timeSlots = useMemo(() => {
    if (!selectedWeekday) return [];
    return slotsForWeekday(windows, selectedWeekday);
  }, [windows, selectedWeekday]);

  /** Grey out days the seller has no availability on, so they can't be picked. */
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    if (availableWeekdays.size > 0) {
      const cursor = new Date();
      // Mark ~120 days ahead; the calendar only shows a month at a time.
      for (let i = 0; i < 120; i++) {
        const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + i);
        const weekday = WEEKDAY_NAMES[date.getDay()];
        if (!availableWeekdays.has(weekday)) {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          marks[key] = { disabled: true, disableTouchEvent: true };
        }
      }
    }

    if (selectedDay) {
      marks[selectedDay] = { selected: true, selectedColor: "#C1272D" };
    }
    return marks;
  }, [availableWeekdays, selectedDay]);

  const hasNoAvailability = !loadingAvailability && availabilities.length === 0;

  /**
   * Perform the booking itself. Split out from handleBooking so the
   * "switch to buying view first" path can reuse it after toggling mode,
   * instead of duplicating the whole request + notify + navigate sequence.
   */
  const submitBooking = useCallback(async (agentId: number) => {
    try {
      const appointmentData = {
        agent_id: agentId,
        property_id: Number(propertyId),
        requested_time: `${selectedDay}T${selectedTime}`,
      };

      await bookAppointment(appointmentData);

      // ── Tell the backend, so the SELLER can see this ──────────────────
      //
      // This is the step that makes a booking visible to the other side, and
      // it is easy to mistake for cosmetic. The seller's Accept / Reject
      // buttons are gated on phase === APPOINTMENT_BOOKED, which is derived
      // from the backend's appointment_status, which is only ever set by this
      // event. updatePhase() below does NOT persist anything — it edits local
      // React state, so it makes the buyer's own screen look right and tells
      // the seller nothing.
      //
      // It used to be fire-and-forget: a failure logged a console warning
      // while the buyer was told "Appointment booked successfully!". The
      // appointment really did exist, so nothing looked wrong to them — but
      // the seller had no accept/reject controls and no way to discover the
      // request at all. Awaited now, and a failure is reported, because a
      // booking the seller cannot see has not really been made.
      let sellerNotified = false;

      if (bidId && blockchainPropertyId) {
        try {
          await sendTransactionUpdate({
            transaction_id: String(bidId),
            event: "appointment_booked",
            recipient_user_id: agentId,
            property_id: Number(blockchainPropertyId),
            message: `A viewing has been requested for "${propertyTitle || "your property"}".`,
            metadata: {},
          });
          sellerNotified = true;
        } catch (err) {
          console.warn("Failed to sync appointment_booked to backend:", err);
        }

        // Local-only, and deliberately after the network call: it exists to
        // move the buyer's own card immediately, not to record anything.
        try {
          await updatePhase(
            Number(bidId),
            Number(blockchainPropertyId),
            TransactionPhase.APPOINTMENT_BOOKED
          );
        } catch (phaseErr) {
          console.warn("Failed to update local transaction phase:", phaseErr);
        }
      } else {
        // Reaching here means the screen was opened without bid context, so
        // there is no transaction to attach the booking to and the seller's
        // deal card can never show it. Worth saying out loud rather than
        // silently booking something invisible.
        console.warn(
          "book-appointment: opened without bidId/blockchainPropertyId — the seller will not see this booking on their deal card."
        );
      }

      addNotification(
        "appointment_booked",
        "Appointment Booked",
        `Your appointment for "${propertyTitle || "Property"}" has been sent to the seller for confirmation.`
      );

      if (!sellerNotified) {
        Alert.alert(
          "Booked, but the seller may not have been notified",
          "Your appointment was saved, but we couldn't reach the seller's deal feed. Message them in chat to confirm the time, or try booking again from your Activity tab.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/activities") }]
        );
        return;
      }

      Alert.alert("Success", "Appointment booked successfully!", [
        {
          text: "OK",
          onPress: () => {
            router.push({
              pathname: "/appointment-booked",
              params: {
                selectedDate: selectedDay,
                selectedTime: selectedTime,
                id: propertyId as string,
                propertyTitle: (propertyTitle as string) || "Property",
              },
            });
          },
        },
      ]);
    } catch (error: any) {
      // Surface what the backend actually said (apiCall already unwraps
      // FastAPI's `detail`, e.g. "Requested time is unavailable. Please
      // negotiate a new time.") instead of a generic message that gave the
      // user nothing to act on.
      const detail = error?.message && !/^request failed$/i.test(error.message)
        ? error.message
        : "Failed to book appointment. Please try again.";
      Alert.alert("Could Not Book Appointment", detail);
    }
  }, [
    selectedDay,
    selectedTime,
    propertyId,
    bidId,
    blockchainPropertyId,
    bookAppointment,
    updatePhase,
    sendTransactionUpdate,
    addNotification,
    propertyTitle,
  ]);

  const handleBooking = useCallback(async () => {
    if (!selectedDay) {
      Alert.alert("Select Date", "Please select a date for the appointment.");
      return;
    }
    if (!selectedTime) {
      Alert.alert("Select Time", "Please select a time slot for the appointment.");
      return;
    }

    const agentId = sellerId ? Number(sellerId) : null;
    if (!agentId) {
      Alert.alert("Error", "Seller information is missing. Please go back and try again.");
      return;
    }

    // POST /user/book-appointment resolves the caller through
    // ActiveVerifiedClient, and that lookup filters on
    // BaseUser.account_type == "client" (app/services/auth.py get_user). While
    // the account is in selling mode its account_type is "agent", so the query
    // matches nothing and the backend answers 404 "User not found" — the
    // account is fine, it just is not a client right now. Booking is inherently
    // a buyer action, so offer to switch rather than letting that surface as a
    // baffling "user not found" against the user own account.
    if (isSeller || user?.account_type === "agent") {
      Alert.alert(
        "Switch to Buying View?",
        "Booking a viewing is a buyer action, and your account is currently in selling mode. Switch to buying view to continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Switch and Book",
            onPress: async () => {
              setIsBooking(true);
              try {
                // toggleMode updates both the UI mode and the backend
                // account_type, keeping the two in sync — switching only the
                // account_type would leave the app showing seller tabs.
                await toggleMode();
                await submitBooking(agentId);
              } catch (err: any) {
                Alert.alert(
                  "Could Not Switch",
                  err?.message ||
                  "Could not switch to buying view. Please switch from your profile and try again."
                );
              } finally {
                setIsBooking(false);
              }
            },
          },
        ]
      );
      return;
    }

    setIsBooking(true);
    try {
      await submitBooking(agentId);
    } finally {
      setIsBooking(false);
    }
  }, [
    selectedDay,
    selectedTime,
    sellerId,
    isSeller,
    user?.account_type,
    toggleMode,
    submitBooking,
  ]);

  return (
    <SafeAreaView
      className="container flex-1 max-w-2xl mx-auto"
      style={{ padding: 20 }}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row gap-4 items-center">
          <BackBtn />
          <InterSemiBold className="text-base/5">
            Book Appointment
          </InterSemiBold>
        </View>

        {propertyTitle ? (
          <View className="mt-3 px-1">
            <InterRegular className="text-sm text-secondaryText">
              Schedule a viewing for "{propertyTitle}"
            </InterRegular>
          </View>
        ) : null}

        {loadingAvailability ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color="#C1272D" />
            <InterRegular className="mt-2 text-sm text-secondaryText">
              Loading the seller's available times...
            </InterRegular>
          </View>
        ) : hasNoAvailability ? (
          <View
            className="mt-6 p-4 rounded-lg"
            style={{ backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" }}
          >
            <InterSemiBold className="text-sm mb-1" style={{ color: "#92400E" }}>
              No Viewing Times Available
            </InterSemiBold>
            <InterRegular className="text-sm" style={{ color: "#B45309" }}>
              This seller hasn't published any viewing availability yet, so an
              appointment can't be booked automatically. Message them in the
              chat to arrange a time directly.
            </InterRegular>
          </View>
        ) : (
          <>
            {/* Calendar */}
            <View className="mt-5">
              <InterSemiBold className="text-sm mb-2">Select a Date</InterSemiBold>
              <InterRegular className="text-xs text-secondaryText mb-2">
                Only days the seller is available can be selected.
              </InterRegular>
              <Calendar
                onDayPress={(day: DATE) => {
                  setSelectedDay(day.dateString);
                  // Slots differ per weekday — a time picked for the previous
                  // day may not exist on the new one.
                  setSelectedTime("");
                }}
                minDate={today}
                theme={{
                  backgroundColor: "#ffffff",
                  calendarBackground: "transparent",
                  textSectionTitleColor: "#1F2A44",
                  selectedDayBackgroundColor: "#C1272D",
                  selectedDayTextColor: "#ffffff",
                  todayTextColor: "#C1272D",
                  dayTextColor: "#2d4150",
                  textDisabledColor: "#D1D5DB",
                  arrowColor: "#C1272D",
                }}
                markedDates={markedDates}
              />
            </View>

            {/* Time Slots */}
            <View className="mt-6">
              <InterSemiBold className="text-sm mb-3">
                Select a Time Slot
              </InterSemiBold>

              {!selectedDay ? (
                <InterRegular className="text-sm text-secondaryText">
                  Pick a date to see the seller's available times.
                </InterRegular>
              ) : timeSlots.length === 0 ? (
                <InterRegular className="text-sm text-secondaryText">
                  The seller has no free times on this day. Please choose another date.
                </InterRegular>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {timeSlots.map((slot) => {
                    const isSelected = selectedTime === slot.value;
                    return (
                      <TouchableOpacity
                        key={slot.value}
                        onPress={() => setSelectedTime(slot.value)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          borderWidth: 1.5,
                          borderColor: isSelected ? "#C1272D" : "#E5E7EB",
                          backgroundColor: isSelected ? "#FEF2F2" : "#FFFFFF",
                        }}
                      >
                        <InterRegular
                          style={{
                            fontSize: 13,
                            color: isSelected ? "#C1272D" : "#4B5563",
                            fontWeight: isSelected ? "600" : "400",
                          }}
                        >
                          {slot.label}
                        </InterRegular>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Selection Summary */}
            {selectedDay && selectedTime ? (
              <View
                className="mt-6 p-4 rounded-lg"
                style={{ backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" }}
              >
                <InterSemiBold className="text-sm mb-1">
                  Appointment Summary
                </InterSemiBold>
                <InterRegular className="text-sm text-secondaryText">
                  📅 {new Date(selectedDay).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </InterRegular>
                <InterRegular className="text-sm text-secondaryText mt-1">
                  🕐 {timeSlots.find((s) => s.value === selectedTime)?.label}
                </InterRegular>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Bottom Button */}
      {!hasNoAvailability && !loadingAvailability && (
        <View className="absolute bottom-0 left-0 right-0 mx-auto max-w-2xl py-5 px-5">
          <Button
            onPress={handleBooking}
            className="bg-primary py-4 rounded-lg"
            disabled={isBooking || !selectedDay || !selectedTime}
            style={{
              opacity: !selectedDay || !selectedTime ? 0.5 : 1,
            }}
          >
            <InterRegular className="text-base/5 text-white">
              {isBooking ? "Booking..." : "Book Appointment"}
            </InterRegular>
          </Button>
        </View>
      )}
    </SafeAreaView>
  );
};

export default BookAppointment;

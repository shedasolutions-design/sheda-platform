"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Calendar, { toDateString } from "@/components/ui/Calendar";
import Spinner from "@/components/ui/Spinner";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import AuthGuard from "@/components/auth/AuthGuard";
import { useApi } from "@/contexts/ApiContext";
import { useTransactions } from "@/hooks/useTransactions";
import { useNotifications } from "@/contexts/NotificationContext";
import { useMode } from "@/contexts/ModeContext";
import { TransactionPhase } from "@/types/transaction";
import type { AvailabilityShow } from "@/services/api";
import {
  WEEKDAY_NAMES,
  availableWeekdays as computeAvailableWeekdays,
  slotsForWeekday,
  weekdayForDateString,
  type AvailabilityWindow,
} from "@/utilities/availability";
import { getQueryParam } from "@/lib/navigation";

interface Params {
  id: string | null;
  bidId: string | null;
  blockchainPropertyId: string | null;
  sellerId: string | null;
  propertyTitle: string | null;
}

interface Feedback {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}

function BookAppointment() {
  const router = useRouter();
  const [p, setP] = useState<Params>({ id: null, bidId: null, blockchainPropertyId: null, sellerId: null, propertyTitle: null });
  useEffect(() => {
    setP({
      id: getQueryParam("id"),
      bidId: getQueryParam("bidId"),
      blockchainPropertyId: getQueryParam("blockchainPropertyId"),
      sellerId: getQueryParam("sellerId"),
      propertyTitle: getQueryParam("propertyTitle"),
    });
  }, []);

  const { bookAppointment, getAgentProfile, sendTransactionUpdate, user } = useApi();
  const { updatePhase } = useTransactions();
  const { addNotification } = useNotifications();
  const { isSeller, toggleMode } = useMode();

  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [booking, setBooking] = useState(false);
  const [availabilities, setAvailabilities] = useState<AvailabilityShow[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>({ visible: false, type: "info", title: "" });
  const close = () => setFeedback((f) => ({ ...f, visible: false }));
  const notify = (type: FeedbackType, title: string, message?: string) =>
    setFeedback({ visible: true, type, title, message, onClose: close });

  // The seller's published viewing windows decide which days and times exist.
  useEffect(() => {
    const agentId = p.sellerId ? Number(p.sellerId) : null;
    if (!agentId) {
      if (p.sellerId === null && p.id === null) return; // params not read yet
      setLoadingAvailability(false);
      return;
    }
    let cancelled = false;
    getAgentProfile(agentId, { silent: true })
      .then((agent) => !cancelled && setAvailabilities(agent?.availabilities ?? []))
      .catch(() => !cancelled && setAvailabilities([]))
      .finally(() => !cancelled && setLoadingAvailability(false));
    return () => {
      cancelled = true;
    };
  }, [p.sellerId, p.id, getAgentProfile]);

  const windows = availabilities as unknown as AvailabilityWindow[];
  const openDays = useMemo(() => computeAvailableWeekdays(windows), [windows]);
  const weekday = useMemo(() => (day ? weekdayForDateString(day) : null), [day]);
  const slots = useMemo(() => (weekday ? slotsForWeekday(windows, weekday) : []), [windows, weekday]);
  const noAvailability = !loadingAvailability && availabilities.length === 0;
  const today = toDateString(new Date());

  const submit = useCallback(
    async (agentId: number) => {
      try {
        // bid_id ties the viewing to the deal: the seller's card and both
        // timelines find it by bid. Without it the booking saved, but the deal
        // stayed on "waiting for buyer to book" forever.
        await bookAppointment({
          agent_id: agentId,
          property_id: Number(p.id),
          requested_time: `${day}T${time}`,
          ...(p.bidId ? { bid_id: Number(p.bidId) } : {}),
        });

        // Tell the seller's deal card, if this booking belongs to a bid.
        let sellerNotified = false;
        if (p.bidId && p.blockchainPropertyId) {
          try {
            await sendTransactionUpdate({
              transaction_id: String(p.bidId),
              event: "appointment_booked",
              recipient_user_id: agentId,
              property_id: Number(p.blockchainPropertyId),
              message: `A viewing has been requested for "${p.propertyTitle || "your property"}".`,
              metadata: {},
            });
            sellerNotified = true;
          } catch {
            /* reported below */
          }
          try {
            await updatePhase(Number(p.bidId), Number(p.blockchainPropertyId), TransactionPhase.APPOINTMENT_BOOKED);
          } catch {
            /* local phase only */
          }
        }

        addNotification(
          "appointment_booked",
          "Appointment Booked",
          `Your appointment for "${p.propertyTitle || "Property"}" has been sent to the seller for confirmation.`
        );

        if (!sellerNotified) {
          setFeedback({
            visible: true,
            type: "warning",
            title: "Booked, but the seller may not have been notified",
            message:
              "Your appointment was saved, but we couldn't reach the seller's deal feed. Message them in chat to confirm the time, or try booking again from your History tab.",
            actionLabel: "OK",
            onAction: () => router.replace("/history"),
          });
          return;
        }
        const q = new URLSearchParams({
          selectedDate: day,
          selectedTime: time,
          id: p.id || "",
          propertyTitle: p.propertyTitle || "Property",
        });
        router.push(`/appointment-booked?${q.toString()}`);
      } catch (error: any) {
        notify(
          "error",
          "Could Not Book Appointment",
          error?.message && !/^request failed$/i.test(error.message) ? error.message : "Failed to book appointment. Please try again."
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, time, p, bookAppointment, sendTransactionUpdate, updatePhase, addNotification, router]
  );

  const handleBook = async () => {
    if (!day) return notify("info", "Select Date", "Please select a date for the appointment.");
    if (!time) return notify("info", "Select Time", "Please select a time slot for the appointment.");
    const agentId = p.sellerId ? Number(p.sellerId) : null;
    if (!agentId) return notify("error", "Error", "Seller information is missing. Please go back and try again.");

    // Booking a viewing is a buyer action.
    if (isSeller || user?.account_type === "agent") {
      setFeedback({
        visible: true,
        type: "warning",
        title: "Switch to Buying View?",
        message:
          "Booking a viewing is a buyer action, and your account is currently in selling mode. Switch to buying view to continue?",
        actionLabel: "Switch and Book",
        onClose: close,
        onAction: async () => {
          close();
          setBooking(true);
          try {
            await toggleMode();
            await submit(agentId);
          } catch (err: any) {
            notify("error", "Could Not Switch", err?.message || "Could not switch to buying view. Switch from your profile and try again.");
          } finally {
            setBooking(false);
          }
        },
      });
      return;
    }
    setBooking(true);
    try {
      await submit(agentId);
    } finally {
      setBooking(false);
    }
  };

  return (
    <>
      <PageHeader title="Book Appointment" />
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-4">
        {p.propertyTitle && <p className="text-sm text-secondaryText">Schedule a viewing for &quot;{p.propertyTitle}&quot;</p>}

        {loadingAvailability ? (
          <div className="mt-10 flex flex-col items-center gap-2 text-sm text-secondaryText">
            <Spinner />
            Loading the seller&apos;s available times...
          </div>
        ) : noAvailability ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-1 text-sm font-semibold text-amber-900">No Viewing Times Available</p>
            <p className="text-sm text-amber-700">
              This seller hasn&apos;t published any viewing availability yet, so an appointment can&apos;t be booked automatically.
              Message them in the chat to arrange a time directly.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-1 mt-5 text-sm font-semibold">Select a Date</h2>
            <p className="mb-2 text-xs text-secondaryText">Only days the seller is available can be selected.</p>
            <Calendar
              value={day}
              minDate={today}
              isDisabled={(d) => openDays.size > 0 && !openDays.has(WEEKDAY_NAMES[d.getDay()])}
              onChange={(ds) => {
                setDay(ds);
                setTime(""); // slots differ per weekday
              }}
            />

            <h2 className="mb-3 mt-6 text-sm font-semibold">Select a Time Slot</h2>
            {!day ? (
              <p className="text-sm text-secondaryText">Pick a date to see the seller&apos;s available times.</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-secondaryText">The seller has no free times on this day. Please choose another date.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setTime(s.value)}
                    aria-pressed={time === s.value}
                    className={`rounded-lg border-[1.5px] px-4 py-2.5 text-[13px] ${
                      time === s.value ? "border-primary bg-red-50 font-semibold text-primary" : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {day && time && (
              <div className="mt-6 rounded-xl border border-borderColor bg-cardBackground p-4 text-sm">
                <p className="mb-1 font-semibold">Appointment Summary</p>
                <p className="text-secondaryText">
                  📅{" "}
                  {new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p className="mt-1 text-secondaryText">🕐 {slots.find((s) => s.value === time)?.label}</p>
              </div>
            )}

            <Button full className="mt-6" onClick={handleBook} loading={booking} disabled={!day || !time}>
              {booking ? "Booking..." : "Book Appointment"}
            </Button>
          </>
        )}
      </div>

      <FeedbackModal
        isVisible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        actionLabel={feedback.actionLabel}
        onAction={feedback.onAction}
        onClose={feedback.onClose}
      />
    </>
  );
}

export default function BookAppointmentPage() {
  return (
    <AuthGuard requireAuth>
      <BookAppointment />
    </AuthGuard>
  );
}

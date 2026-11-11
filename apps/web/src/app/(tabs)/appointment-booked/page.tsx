"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { getQueryParam } from "@/lib/navigation";
import { minutesToLabel, timeToMinutes } from "@/utilities/availability";

export default function AppointmentBookedPage() {
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    setDate(getQueryParam("selectedDate"));
    setTime(getQueryParam("selectedTime"));
    setTitle(getQueryParam("propertyTitle"));
  }, []);

  const formattedDate = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "Date not specified";
  // Minutes included: a 14:30 viewing is 2:30 PM, not 2:00 PM.
  const mins = timeToMinutes(time);
  const formattedTime = mins != null ? minutesToLabel(mins) : "Time not specified";

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#D8DADC26]">
        <CheckCircle2 size={40} className="text-green-600" />
      </div>
      <h1 className="mt-4 text-base font-semibold">Appointment Booked!</h1>
      <p className="mt-1 text-sm text-secondaryText">
        Your appointment request has been sent to the seller. They&apos;ll confirm the date and time shortly.
      </p>

      <div className="mt-6 w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
        {title && (
          <div className="mb-3">
            <p className="mb-1 text-xs text-secondaryText">Property</p>
            <p className="text-sm font-semibold">{title}</p>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <div>
            <p className="mb-1 text-xs text-secondaryText">📅 Date</p>
            <p className="text-sm font-semibold">{formattedDate}</p>
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs text-secondaryText">🕐 Time</p>
            <p className="text-sm font-semibold">{formattedTime}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 w-full rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">⏳ Waiting for seller confirmation</p>

      <div className="mt-6 flex w-full flex-col gap-3">
        <ButtonLink href="/history" full>
          View Transactions
        </ButtonLink>
        <ButtonLink href="/home" variant="outline" full>
          Back to Home
        </ButtonLink>
      </div>
    </div>
  );
}

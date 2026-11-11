"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { getQueryParam } from "@/lib/navigation";

export default function CommitmentSuccessfulPage() {
  const [id, setId] = useState("");
  useEffect(() => setId(getQueryParam("id") ?? ""), []);

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-5 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#D8DADC26]">
        <CheckCircle2 size={40} className="text-green-600" />
      </div>
      <h1 className="mt-4 text-base font-semibold">Commitment successful</h1>
      <p className="mt-1 text-sm text-secondaryText">
        Your funds will be locked with us until both you and the seller agree to release.
      </p>
      <ButtonLink href={`/book-appointment?id=${encodeURIComponent(id)}`} full className="mt-6">
        Book an appointment
      </ButtonLink>
    </div>
  );
}

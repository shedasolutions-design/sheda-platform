"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import { SUPPORT_EMAIL } from "@/config/support";

/**
 * Feedback. There is no feedback endpoint, so Submit opens the person's email
 * app addressed to support with their message filled in. (On mobile the
 * Submit button did nothing.)
 */
export default function FeedbackPage() {
  const [text, setText] = useState("");
  const send = () => {
    const body = encodeURIComponent(text.trim());
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Feedback on Sheda")}&body=${body}`;
  };
  return (
    <>
      <PageHeader title="Feedback" fallback="/profile" />
      <div className="mx-auto max-w-xl px-5 pb-16 pt-7">
        <h2 className="text-base font-medium">We&apos;re glad to receive your feedback</h2>
        <p className="mb-4 mt-3 text-sm text-secondaryText">
          Thank you for sharing your thoughts with us! While we may not be able to respond individually, your input will be
          looked into properly.
        </p>
        <p className="text-sm text-secondaryText">Need assistance or have an enquiry? Visit the help centre or contact us.</p>
        <label htmlFor="feedback" className="sr-only">
          Your feedback
        </label>
        <textarea
          id="feedback"
          rows={6}
          placeholder="Type your feedback here"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${inputClass} mt-10`}
        />
        <Button full className="mt-3" onClick={send} disabled={!text.trim()}>
          Submit
        </Button>
        <p className="mt-2 text-center text-xs text-secondaryText">Opens your email app, addressed to {SUPPORT_EMAIL}.</p>
      </div>
    </>
  );
}

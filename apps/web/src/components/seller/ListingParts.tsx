"use client";

import type { ReactNode } from "react";
import { Check, ChevronLeft, History } from "lucide-react";
import Button from "@/components/ui/Button";

/** The four-segment bar across the top of the listing steps. */
export function ProgressIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div
      className="mb-5 flex gap-1"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={totalSteps}
      aria-valuenow={currentStep}
      aria-label={`Step ${currentStep} of ${totalSteps}`}
    >
      {Array.from({ length: totalSteps }, (_, i) => (
        <span key={i} className={`h-1 flex-1 rounded-full ${i < currentStep ? "bg-primary" : "bg-gray-200"}`} />
      ))}
    </div>
  );
}

/**
 * The frame every listing step shares: back button and title on top, an
 * optional progress bar, the form, and the main action pinned at the bottom.
 */
export function StepFrame({
  title,
  onBack,
  step,
  children,
  footer,
}: {
  title: string;
  onBack?: () => void;
  step?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-5 pt-5">
      <div className="mb-5 flex items-center gap-2">
        {onBack && (
          <button type="button" aria-label="Back" onClick={onBack} className="-ml-2 rounded-lg p-2 hover:bg-cardBackground">
            <ChevronLeft size={22} />
          </button>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {step != null && <ProgressIndicator currentStep={step} totalSteps={4} />}
      <div className="flex-1 pb-6">{children}</div>
      {footer && <div className="sticky bottom-0 -mx-5 border-t border-borderColor/60 bg-white px-5 py-4">{footer}</div>}
    </div>
  );
}

const STEPS = [
  { title: "Describe your property", description: "Fill in the necessary information that best describes your property" },
  { title: "Add extras", description: "Tick the amenities that make your property stand out amidst others" },
  {
    title: "Upload quality photos",
    description: "Add photos of your property showing its selling points, and include a short, concise description.",
  },
  { title: "Set your price and list", description: "Set the price of your property, then approve your listing request." },
];

export function PropertyListingOverview({ onGetStarted, onHistoryPress }: { onGetStarted: () => void; onHistoryPress: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-5">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold">List a property</h1>
        <button type="button" onClick={onHistoryPress} className="flex items-center gap-1.5 text-primary hover:underline">
          <History size={18} />
          My Listings
        </button>
      </div>
      <ProgressIndicator currentStep={0} totalSteps={4} />
      <p className="my-8">Property listing made easy in 4 easy steps.</p>
      <ol className="mb-10 space-y-7">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white">{i + 1}</span>
            <div>
              <p className="mb-1 font-semibold">{s.title}</p>
              <p className="text-sm leading-5 text-secondaryText">{s.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button full onClick={onGetStarted}>
        Get started
      </Button>
    </div>
  );
}

export function ListingSuccessScreen({ onGoToHomepage, onViewListings }: { onGoToHomepage: () => void; onViewListings: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-16 text-center">
      <span className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-white">
        <Check size={40} strokeWidth={3} />
      </span>
      <h1 className="mb-3 text-xl font-semibold">Listing successful</h1>
      <p className="mb-8 text-secondaryText">
        Your property has been listed on our marketplace. You will get notified whenever you have a potential buyer. Cheers!
      </p>
      <div className="flex w-full flex-col gap-3">
        <Button full onClick={onGoToHomepage}>
          Go to homepage
        </Button>
        <Button full variant="outline" onClick={onViewListings}>
          View my listings
        </Button>
      </div>
    </div>
  );
}

/** A tick box with its label, for extras and the negotiable flag. */
export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-5 w-5 accent-primary" />
      <span>{label}</span>
    </label>
  );
}

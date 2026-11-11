import type { DealTimelineStep } from "@/utilities/dealTimeline";

/**
 * Where a deal stands, across both halves of the system. The bid, escrow and
 * agreement are on chain; appointments are in the backend. Every live step
 * names who it is waiting on, so a deal moving normally does not look stalled.
 */
export default function DealProgress({
  steps,
  viewingNotAgreed,
  role,
}: {
  steps: DealTimelineStep[];
  viewingNotAgreed: boolean;
  role: "buyer" | "seller";
}) {
  if (!steps.length) return null;
  return (
    <div className="mb-1 mt-2 rounded bg-gray-50 px-2 py-2">
      <p className="mb-1.5 text-[10px] font-semibold text-secondaryText">Progress</p>
      <ol>
        {steps.map((step) => {
          const done = step.state === "done";
          const current = step.state === "current";
          return (
            <li key={step.step} className="mb-1 flex items-start">
              <span className={`mr-1.5 text-[11px] ${done ? "text-green-600" : current ? "text-amber-600" : "text-gray-300"}`} aria-hidden="true">
                {done ? "●" : current ? "◐" : "○"}
              </span>
              <span className="flex-1">
                <span className={`block text-[11px] ${done ? "text-secondaryText" : current ? "text-black" : "text-gray-400"}`}>
                  {step.label}
                  <span className="sr-only">{done ? " (done)" : current ? " (current)" : " (upcoming)"}</span>
                </span>
                {current && step.detail && <span className="mt-0.5 block text-[10px] text-secondaryText">{step.detail}</span>}
                {current && step.waitingOn && step.waitingOn !== "both" && (
                  <span className="mt-0.5 block text-[10px] text-amber-700">
                    {step.waitingOn === role ? "Waiting on you" : `Waiting on the ${step.waitingOn}`}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {viewingNotAgreed && (
        <p className="mt-1 border-t border-gray-200 pt-1.5 text-[10px] text-red-600">
          {role === "buyer"
            ? "The viewing didn't end in an agreement. You can cancel and get your funds back."
            : "The viewing didn't end in an agreement. The buyer may cancel this deal."}
        </p>
      )}
    </div>
  );
}

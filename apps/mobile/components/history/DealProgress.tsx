import { View } from "react-native";
import InterRegular from "@/components/Text/InterRegular";
import InterSemiBold from "@/components/Text/InterSemiBold";
import type { DealTimelineStep } from "@/utilities/dealTimeline";

interface DealProgressProps {
  steps: DealTimelineStep[];
  /** The parties met and didn't agree. */
  viewingNotAgreed: boolean;
  role: "buyer" | "seller";
}

/**
 * Where a deal actually stands, across both halves of the system.
 *
 * The bid, escrow and agreement are on chain; the appointments are in the
 * backend. The buyer's money is locked from the moment their bid is accepted,
 * but the next on-chain step waits on a real-world meeting the chain can't
 * see — so a deal progressing normally looked identical to one that had
 * stalled, and the buyer could see only that their funds were gone.
 *
 * Every step names who it's waiting on. "In progress" with no owner is what
 * left both sides guessing.
 */
const DealProgress = ({ steps, viewingNotAgreed, role }: DealProgressProps) => {
  if (!steps.length) return null;

  return (
    <View className="mt-2 mb-1 px-2 py-2 bg-gray-50 rounded">
      <InterSemiBold className="text-[10px] text-secondaryText mb-1.5">
        Progress
      </InterSemiBold>

      {steps.map((step) => {
        const isCurrent = step.state === "current";
        const isDone = step.state === "done";

        return (
          <View key={step.step} className="flex-row items-start mb-1">
            <InterRegular
              className={`text-[11px] mr-1.5 ${
                isDone
                  ? "text-green-600"
                  : isCurrent
                  ? "text-amber-600"
                  : "text-gray-300"
              }`}
            >
              {isDone ? "●" : isCurrent ? "◐" : "○"}
            </InterRegular>

            <View className="flex-1">
              <InterRegular
                className={`text-[11px] ${
                  isDone
                    ? "text-secondaryText"
                    : isCurrent
                    ? "text-black"
                    : "text-gray-400"
                }`}
              >
                {step.label}
              </InterRegular>

              {/* Only the live step explains itself — repeating guidance on
                  finished steps buries the one thing that needs doing. */}
              {isCurrent && step.detail && (
                <InterRegular className="text-[10px] text-secondaryText mt-0.5">
                  {step.detail}
                </InterRegular>
              )}

              {isCurrent && step.waitingOn && step.waitingOn !== "both" && (
                <InterRegular className="text-[10px] text-amber-700 mt-0.5">
                  {step.waitingOn === role
                    ? "Waiting on you"
                    : `Waiting on the ${step.waitingOn}`}
                </InterRegular>
              )}
            </View>
          </View>
        );
      })}

      {/* Distinct from a cancelled appointment: the parties met and didn't
          agree. The buyer can walk away and be refunded, so say so rather
          than leaving them to work it out. */}
      {viewingNotAgreed && (
        <View className="mt-1 pt-1.5 border-t border-gray-200">
          <InterRegular className="text-[10px] text-red-600">
            {role === "buyer"
              ? "The viewing didn't end in an agreement. You can cancel and get your funds back."
              : "The viewing didn't end in an agreement. The buyer may cancel this deal."}
          </InterRegular>
        </View>
      )}
    </View>
  );
};

export default DealProgress;

import type React from "react";
import { View } from "react-native";
import OngoingCard from "./OngoingCard";
import ActiveCard from "./ActiveCard";
import ExpireCard from "./ExpireCard";
import CancelledCard from "./CancelledCard";
import type { Transaction, TransactionPhase } from "@/types/transaction";


export type HistoryCardType = "ongoing" | "active" | "expired" | "cancelled";

interface TransactionListProps {
  transactions: Transaction[];
  onPhaseUpdate: (
    bidId: number,
    propertyId: number,
    phase: TransactionPhase,
    extra?: any
  ) => Promise<void>;
  /** Which card renders each row — see the map below */
  cardType?: HistoryCardType;
}

const CARD_COMPONENTS = {
  ongoing: OngoingCard,
  active: ActiveCard,
  expired: ExpireCard,
  cancelled: CancelledCard,
} as const;

/**
 * Renders a list of transaction cards. OngoingCard covers the bid/escrow
 * pipeline, ActiveCard covers closed deals that are still live (a running
 * lease, or a completed purchase), ExpireCard covers leases whose end_time
 * has passed, CancelledCard covers transactions that ended without
 * completing (rejected, cancelled, disputed).
 *
 * Each tab gets its own card rather than one card branching on phase: a live
 * agreement, a closed-out record and a dead bid have different actions, and
 * folding them together is how the Cancelled tab ended up rendering closed
 * transactions through the live bid/escrow card.
 */
const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  onPhaseUpdate,
  cardType = "ongoing",
}) => {
  if (!transactions || transactions.length === 0) {
    return null;
  }

  const CardComponent = CARD_COMPONENTS[cardType] ?? OngoingCard;

  return (
    <View className="flex-1">
      <View className="gap-4">
        {transactions.map((tx) => (
          <View key={tx.key} className="w-full">
            <CardComponent
              transaction={tx}
              onPhaseUpdate={onPhaseUpdate}
            />
          </View>
        ))}
      </View>
    </View>
  );
};

export default TransactionList;

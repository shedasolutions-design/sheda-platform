import type React from "react";
import { View, TouchableOpacity } from "react-native";
import TransactionItem from "../molecules/TransactionItem";
import InterRegular from "../Text/InterRegular";
import InterMedium from "../Text/InterMedium";
import type { Transaction } from "../../types/wallet";
import { normalizeTimestamp } from "@/utilities/formatTimestamp";

interface TransactionsListProps {
  transactions: Transaction[];
  loading?: boolean;
  /** Set when the history couldn't be read — NOT the same as "none exist" */
  error?: string | null;
  onRetry?: () => void;
  onTransactionPress?: (transaction: Transaction) => void;
}

const TransactionsList: React.FC<TransactionsListProps> = ({
  transactions,
  loading = false,
  error = null,
  onRetry,
  onTransactionPress,
}) => {
  if (loading && transactions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <InterMedium className="text-base text-gray-500">
          Loading transactions...
        </InterMedium>
      </View>
    );
  }

  // A failed read must never render as an empty history — the user's
  // transactions are still on-chain, we just couldn't fetch them.
  if (error && transactions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8 px-6">
        <InterMedium className="text-base text-gray-700 mb-2 text-center">
          Couldn't load your transactions
        </InterMedium>
        <InterRegular className="text-sm text-gray-400 text-center mb-4">
          {error}
        </InterRegular>
        {onRetry && (
          <TouchableOpacity
            className="border border-gray-300 rounded-lg px-5 py-2"
            onPress={onRetry}
          >
            <InterMedium className="text-sm text-black">Try again</InterMedium>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <InterMedium className="text-base text-gray-500 mb-2">
          No transactions found
        </InterMedium>
        <InterRegular className="text-sm text-gray-400 text-center px-4">
          Your transaction history will appear here once you make transactions
        </InterRegular>
      </View>
    );
  }

  // Newest first. The indexer already returns desc order, but entries served
  // from cache can be interleaved with a fresh page, so sort explicitly.
  const sorted = [...transactions].sort(
    (a, b) =>
      (normalizeTimestamp(b.timestamp ?? b.date) ?? 0) -
      (normalizeTimestamp(a.timestamp ?? a.date) ?? 0)
  );

  return (
    <View className="flex-1">
      {/* Partial-failure banner: some history loaded, some didn't. */}
      {error && (
        <View className="bg-amber-50 px-4 py-2">
          <InterRegular className="text-xs text-amber-700">{error}</InterRegular>
        </View>
      )}
      {sorted.map((transaction) => (
        <TransactionItem
          key={transaction.id}
          transaction={transaction}
          onPress={onTransactionPress}
        />
      ))}
    </View>
  );
};

export default TransactionsList;

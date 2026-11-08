import type React from "react"
import { View, Image, TouchableOpacity } from "react-native"
import InterRegular from "../Text/InterRegular"
import InterMedium from "../Text/InterMedium"
import type { Transaction } from "../../types/wallet"
import { useCurrency } from "@/contexts/CurrencyContext"
import { getMethodLabel } from "@/services/nearIndexer"
import { formatTimestampLabel } from "@/utilities/formatTimestamp"
import { openTxOnExplorer } from "@/utilities/nearExplorer"

interface TransactionItemProps {
  transaction: Transaction
  onPress?: (transaction: Transaction) => void
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onPress }) => {
  const isIncoming = transaction.direction === "incoming"
  const isFailed = transaction.status === "failed"
  const isPending = transaction.status === "pending"
  const { formatPrice } = useCurrency()

  const truncateAddress = (addr?: string) => {
    if (!addr) return "Unknown"
    if (addr.length <= 20) return addr
    return `${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}`
  }

  // Show human-readable label for contract methods
  const displayType = getMethodLabel(transaction.methodName) || transaction.type

  const amountDisplay = typeof transaction.amount === 'string'
    ? transaction.amount
    : String(transaction.amount)

  const valueDisplay = typeof transaction.value === 'number'
    ? formatPrice(transaction.value)
    : formatPrice(parseFloat(String(transaction.value)) || 0)

  // Prefer the block timestamp; `date` is an ISO string and only a fallback
  // for entries cached before timestamps were carried through.
  const timeLabel = formatTimestampLabel(transaction.timestamp ?? transaction.date)

  return (
    <TouchableOpacity
      className="flex-row items-center justify-between py-4 px-4 border-b border-gray-100"
      onPress={() => onPress?.(transaction)}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View className="flex-row items-center flex-1">
        <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3">
          <Image
            source={
              isIncoming
                ? require("../../assets/images/incoming-arrow.png")
                : require("../../assets/images/outgoing-arrow.png")
            }
            className="w-5 h-5"
            resizeMode="contain"
          />
        </View>
        <View className="flex-1 mr-2">
          <View className="flex-row items-center gap-2">
            <InterMedium className="text-base text-black" numberOfLines={1}>
              {displayType}
            </InterMedium>
            {isFailed && (
              <View className="bg-red-100 rounded px-1.5 py-0.5">
                <InterRegular className="text-[10px] text-red-600">Failed</InterRegular>
              </View>
            )}
            {isPending && (
              <View className="bg-amber-100 rounded px-1.5 py-0.5">
                <InterRegular className="text-[10px] text-amber-700">Pending</InterRegular>
              </View>
            )}
          </View>
          <InterRegular className="text-sm text-gray-500" numberOfLines={1}>
            {isIncoming ? `From: ${truncateAddress(transaction.from)}` : `To: ${truncateAddress(transaction.to)}`}
          </InterRegular>
          {!!timeLabel && (
            <InterRegular className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
              {timeLabel}
            </InterRegular>
          )}
        </View>
      </View>
      <View className="items-end">
        <InterMedium
          className={`text-base ${isFailed ? 'text-gray-400 line-through' : isIncoming ? 'text-green-600' : 'text-black'}`}
        >
          {isIncoming ? '+' : '-'}{amountDisplay} {transaction.currency}
        </InterMedium>
        <InterRegular className="text-sm text-gray-500">{valueDisplay}</InterRegular>
        {!!transaction.hash && (
          <TouchableOpacity
            onPress={() => openTxOnExplorer(transaction.hash!)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <InterRegular className="text-xs text-blue-500 mt-0.5">
              {transaction.hash.substring(0, 8)}… ↗
            </InterRegular>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default TransactionItem

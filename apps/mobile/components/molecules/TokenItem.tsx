import type React from "react"
import { View, Image, TouchableOpacity } from "react-native"
import InterRegular from "../Text/InterRegular"
import InterMedium from "../Text/InterMedium"
import InterSemiBold from "../Text/InterSemiBold"
import type { Token } from "../../types/wallet"
import { useCurrency } from "@/contexts/CurrencyContext"
import { getTokenDisplay } from "@/utilities/tokenLogos"
import { useState } from "react"

interface TokenItemProps {
  token: Token
  onPress?: (token: Token) => void
}

const TokenItem: React.FC<TokenItemProps> = ({ token, onPress }) => {
  const { formatPrice } = useCurrency()
  const display = getTokenDisplay(token.symbol)
  const [imgError, setImgError] = useState(false)

  const showLogo = display.logoUrl && !imgError

  return (
    <TouchableOpacity
      className="flex-row items-center justify-between py-4 px-4 border-b border-gray-100"
      onPress={() => onPress?.(token)}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View className="flex-row items-center flex-1">
        {/* Token icon — try remote logo, fall back to colored circle with letter */}
        <View
          className="w-12 h-12 rounded-full items-center justify-center mr-3 overflow-hidden"
          style={{ backgroundColor: display.color }}
        >
          {showLogo ? (
            <Image
              source={{ uri: display.logoUrl }}
              style={{ width: 32, height: 32 }}
              resizeMode="contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <InterSemiBold style={{ color: "#fff", fontSize: 18 }}>
              {display.letter}
            </InterSemiBold>
          )}
        </View>

        <View className="flex-1">
          <InterMedium className="text-base text-black">{token.name}</InterMedium>
          <View className="flex-row items-center gap-1">
            <InterRegular className="text-xs text-gray-400">{token.symbol}</InterRegular>
            {token.contractAddress && token.contractAddress !== "near" && (
              <InterRegular className="text-xs text-gray-300">
                • {token.contractAddress.length > 18
                  ? token.contractAddress.substring(0, 18) + "…"
                  : token.contractAddress}
              </InterRegular>
            )}
          </View>
        </View>
      </View>

      <View className="items-end">
        <InterMedium className="text-base text-black">
          {token.amount.toFixed(token.amount < 1 ? 6 : 4)} {token.symbol}
        </InterMedium>
        {token.priceAvailable === false ? (
          <InterRegular className="text-xs text-amber-500">
            Price unavailable
          </InterRegular>
        ) : (
          <InterRegular className="text-sm text-gray-500">
            {formatPrice(token.totalValue)}
          </InterRegular>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default TokenItem

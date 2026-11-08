import type React from "react"
import { View, Image, TouchableOpacity } from "react-native"
import InterMedium from "../Text/InterMedium"
import InterRegular from "../Text/InterRegular"
import type { Asset, AssetState, AssetViewMode } from "../../types/wallet"
import { formatAmount } from "@/utilities/atomicAmount"
import { useCurrency } from "@/contexts/CurrencyContext"

interface AssetCardProps {
  asset: Asset
  viewMode?: AssetViewMode
  onPress?: (asset: Asset) => void
}

// Badge styling per on-chain state. "listed" is the only one that means the
// property is live on the marketplace right now.
const STATE_STYLES: Record<AssetState, { bg: string; text: string }> = {
  listed: { bg: "bg-green-100", text: "text-green-700" },
  unlisted: { bg: "bg-gray-100", text: "text-gray-600" },
  leased: { bg: "bg-blue-100", text: "text-blue-700" },
  sold: { bg: "bg-purple-100", text: "text-purple-700" },
  bid: { bg: "bg-amber-100", text: "text-amber-700" },
}

const StateBadge: React.FC<{ asset: Asset }> = ({ asset }) => {
  const style = STATE_STYLES[asset.state ?? "unlisted"] ?? STATE_STYLES.unlisted
  const label = asset.stateLabel ?? (asset.state === "listed" ? "Listed" : "Not listed")

  return (
    <View className={`${style.bg} rounded-full px-2 py-0.5 self-start`}>
      <InterRegular className={`text-[10px] ${style.text}`} numberOfLines={1}>
        {label}
      </InterRegular>
    </View>
  )
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, viewMode = "grid", onPress }) => {
  const { formatPrice } = useCurrency()

  const imageSource = asset.imageUri ? { uri: asset.imageUri } : asset.image

  // The property's real on-chain price, converted out of atomic units by the
  // wallet before it reaches here. Fiat line only when the price is in a
  // stablecoin — anything else has no rate to convert with.
  const priceLine =
    asset.priceAmount != null
      ? `${formatAmount(asset.priceAmount)} ${asset.priceSymbol ?? ""}`.trim()
      : null
  const fiatLine = asset.priceUsd != null ? formatPrice(asset.priceUsd) : null

  // Plain function, not a nested component — a component declared inside
  // render gets a new type identity every pass, which remounts the <Image>
  // and makes every thumbnail re-download on each re-render.
  const renderThumbnail = (size: string) => (
    <View className={`${size} rounded-lg overflow-hidden bg-gray-200`}>
      {imageSource ? (
        <Image source={imageSource} className="w-full h-full" resizeMode="cover" />
      ) : (
        <View className="w-full h-full items-center justify-center">
          <InterRegular className="text-xs text-gray-400">NFT</InterRegular>
        </View>
      )}
    </View>
  )

  if (viewMode === "list") {
    return (
      <TouchableOpacity
        className="flex-row items-center bg-cardBackground rounded-xl p-3 mb-3 border border-gray-200"
        onPress={() => onPress?.(asset)}
        activeOpacity={onPress ? 0.7 : 1}
      >
        {renderThumbnail("w-14 h-14 mr-3")}
        <View className="flex-1 mr-2">
          <InterMedium className="text-sm text-black mb-1" numberOfLines={1}>
            {asset.name}
          </InterMedium>
          <StateBadge asset={asset} />
        </View>
        <View className="items-end">
          {priceLine ? (
            <>
              <InterMedium className="text-sm text-black">{priceLine}</InterMedium>
              {fiatLine && (
                <InterRegular className="text-xs text-gray-500">{fiatLine}</InterRegular>
              )}
            </>
          ) : (
            <InterRegular className="text-xs text-gray-400">No price set</InterRegular>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity
      className="bg-cardBackground rounded-xl p-3 mb-3 border border-gray-200"
      style={{ width: "48%" }}
      onPress={() => onPress?.(asset)}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {renderThumbnail("w-full h-24 mb-3")}
      <InterMedium className="text-sm text-black mb-1" numberOfLines={1}>
        {asset.name}
      </InterMedium>
      {priceLine ? (
        <>
          <InterMedium className="text-sm text-black" numberOfLines={1}>
            {priceLine}
          </InterMedium>
          {fiatLine && (
            <InterRegular className="text-xs text-gray-500 mb-1" numberOfLines={1}>
              {fiatLine}
            </InterRegular>
          )}
        </>
      ) : (
        <InterRegular className="text-xs text-gray-400 mb-1">No price set</InterRegular>
      )}
      <StateBadge asset={asset} />
    </TouchableOpacity>
  )
}

export default AssetCard

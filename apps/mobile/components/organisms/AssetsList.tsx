import type React from "react"
import { useEffect, useState } from "react"
import { View, TouchableOpacity } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import AssetCard from "../molecules/AssetCard"
import InterMedium from "../Text/InterMedium"
import InterRegular from "../Text/InterRegular"
import type { Asset, AssetViewMode } from "../../types/wallet"

interface AssetsListProps {
  assets: Asset[]
  loading?: boolean
  /** Set when the on-chain read failed — NOT the same as "owns nothing" */
  error?: string | null
  onRetry?: () => void
  onAssetPress?: (asset: Asset) => void
}

const VIEW_MODE_KEY = "@sheda_wallet_asset_view_mode"

const ViewModeToggle: React.FC<{
  value: AssetViewMode
  onChange: (mode: AssetViewMode) => void
  count: number
}> = ({ value, onChange, count }) => (
  <View className="flex-row items-center justify-between px-4 py-3">
    <InterRegular className="text-xs text-gray-500">
      {count} {count === 1 ? "property" : "properties"}
    </InterRegular>
    <View className="flex-row border border-gray-200 rounded-lg overflow-hidden">
      {(["grid", "list"] as AssetViewMode[]).map((mode) => (
        <TouchableOpacity
          key={mode}
          className={`px-3 py-1.5 ${value === mode ? "bg-gray-200" : "bg-transparent"}`}
          onPress={() => onChange(mode)}
        >
          <InterMedium
            className={`text-xs ${value === mode ? "text-black" : "text-gray-500"}`}
          >
            {mode === "grid" ? "▦ Grid" : "☰ List"}
          </InterMedium>
        </TouchableOpacity>
      ))}
    </View>
  </View>
)

const AssetsList: React.FC<AssetsListProps> = ({
  assets,
  loading = false,
  error = null,
  onRetry,
  onAssetPress,
}) => {
  const [viewMode, setViewMode] = useState<AssetViewMode>("grid")

  // Remember the choice — it's a per-user preference, not a per-visit one.
  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((stored) => {
        if (stored === "grid" || stored === "list") setViewMode(stored)
      })
      .catch(() => {
        // Preference only — falling back to the grid default is harmless.
      })
  }, [])

  const handleViewModeChange = (mode: AssetViewMode) => {
    setViewMode(mode)
    AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => { })
  }

  if (loading && assets.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <InterMedium className="text-base text-gray-500">
          Loading properties...
        </InterMedium>
      </View>
    )
  }

  if (error && assets.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8 px-6">
        <InterMedium className="text-base text-gray-700 mb-2 text-center">
          Couldn't load your properties
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
    )
  }

  if (assets.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-8">
        <InterMedium className="text-base text-gray-500 mb-2">
          No properties found
        </InterMedium>
        <InterRegular className="text-sm text-gray-400 text-center px-4">
          Properties you own or have traded will appear here
        </InterRegular>
      </View>
    )
  }

  return (
    <View className="flex-1">
      <ViewModeToggle
        value={viewMode}
        onChange={handleViewModeChange}
        count={assets.length}
      />

      {error && (
        <View className="bg-amber-50 px-4 py-2 mb-2">
          <InterRegular className="text-xs text-amber-700">{error}</InterRegular>
        </View>
      )}

      {/* Grid wraps into two columns; list stacks full-width rows. Both scroll
          vertically with the page — the old horizontal strip hid every
          property past the second one behind an unbounded sideways drag. */}
      <View
        className="px-4 pb-4"
        style={
          viewMode === "grid"
            ? { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }
            : undefined
        }
      >
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            viewMode={viewMode}
            onPress={onAssetPress}
          />
        ))}
      </View>
    </View>
  )
}

export default AssetsList

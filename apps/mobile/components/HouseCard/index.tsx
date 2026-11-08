import { View, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import InterRegular from "../Text/InterRegular";
import InterMedium from "../Text/InterMedium";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import InterBold from "../Text/InterBold";
import { router } from "expo-router";
import { HouseProps } from "@/types";
import totalPayment from "@/utilities/totalPayment";
import { BED, BATH, LOCATION } from "@/assets/icons";
import Icon from "../common/Icon";
import Favorite from "../common/Favorite";
import getFullImageUrl from "@/utilities/imageUrl";
import PriceDisplay from "../common/PriceDisplay";
import { useCurrency } from "@/contexts/CurrencyContext";

const HouseCard = ({ house, onDelete, onDelist }: { house: HouseProps; onDelete?: (id: string) => void; onDelist?: (id: string) => void }) => {
  const isUnavailable = house.isUnavailable === true;

  return (
    <TouchableOpacity
      className="w-full rounded-lg bg-background"
      onPress={() => {
        if (isUnavailable) return;
        router.push({
          pathname: "/details/[id]",
          params: { id: house.id },
        });
      }}
      activeOpacity={isUnavailable ? 1 : 0.7}
      style={isUnavailable ? { opacity: 0.6 } : undefined}
    >
      <View className=" rounded-t-lg overflow-hidden relative">
        <Image
          source={
            house.image
              ? (typeof house.image === 'string' ? { uri: getFullImageUrl(house.image) } : house.image)
              : require("@/assets/images/apt-1.png")
          }
          contentFit="cover"
          transition={500}
          style={{
            width: "100%",
            height: 175,
            borderRadius: 8,
          }}
        />
        <View className="flex-row justify-between px-2 py-4 absolute top-0 left-0 right-0">
          {(onDelete || onDelist) ? (
            <View className="flex-row gap-2">
              {onDelist && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onDelist(house.id);
                  }}
                  className="bg-white/90 p-2 rounded-full shadow-sm"
                >
                  <MaterialCommunityIcons name="eye-off-outline" size={20} color="#F59E0B" />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onDelete(house.id);
                  }}
                  className="bg-white/90 p-2 rounded-full shadow-sm"
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#C1272D" />
                </TouchableOpacity>
              )}
            </View>
          ) : null}
          <View className={(onDelete || onDelist) ? "" : "flex-1 items-end"}>
            <Favorite propertyId={parseInt(house.id) || 0} className="border-0 w-8 h-8 bg-white/90" />
          </View>
        </View>

        {/* Unavailable overlay */}
        {isUnavailable && (
          <View
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.92)",
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 20,
              }}
            >
              <InterMedium style={{ fontSize: 13, color: "#991B1B", fontWeight: "600" }}>
                Unavailable
              </InterMedium>
            </View>
          </View>
        )}
      </View>

      <View className="px-3 py-2 w-full">
        <InterMedium className="text-sm/5">{house.title}</InterMedium>
        <InterRegular className="text-xs text-secondaryText capitalize">{house.type}</InterRegular>

        <View className="mt-2 w-full">
          {/* <View className="flex-row items-center border-r border-[#FFFFFF99]"> */}
          <View className="flex-row w-1/2 gap-2">
            <View className="flex-row items-center gap-1">
              <Icon icon={LOCATION} width={10} height={20} />
              <InterMedium className="text-[#878787BF] text-xs/[150%]">
                {house.location}
              </InterMedium>
            </View>

            <View className="flex-row items-center gap-1">
              <Icon icon={BED} width={20} height={20} />
              <InterMedium className="text-[#878787BF] text-xs/[150%]">
                {house.bedrooms} Bed
              </InterMedium>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon icon={BATH} width={15} height={15} />
              <InterMedium className="text-[#878787BF] text-xs/[150%]">
                {house.bathrooms} Bath
              </InterMedium>
            </View>
          </View>
        </View>

        <View className="flex-row justify-between items-center">
          <PriceDisplay
            amountFiat={parseFloat(String(house.price).replace(/[^0-9.-]/g, "")) || 0}
            fiatCode={house.priceCurrency || "NGN"}
            suffix={house.mode === "rent" ? "/year" : ""}
            size="md"
            compact
          />

          {isUnavailable ? (
            <InterRegular className="text-gray-400 text-xs">Sold / Rented</InterRegular>
          ) : (
            <TouchableOpacity
              className="flex-row items-center"
              onPress={(e) => {
                e.stopPropagation();
                router.push({
                  pathname: "/details/[id]",
                  params: { id: house.id },
                });
              }}
            >
              <InterRegular className="text-primary">View Details</InterRegular>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color="#C1272D"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default HouseCard;

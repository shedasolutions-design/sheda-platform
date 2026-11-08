import { SafeAreaView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Icon from "@/components/common/Icon";
import { SUCCESSFUL } from "@/assets/icons";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";

const AppointmentBooked = () => {
  const { id, selectedDate, selectedTime, propertyTitle } =
    useLocalSearchParams();

  // Format date nicely
  const formattedDate = selectedDate
    ? new Date(selectedDate as string).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : "Date not specified";

  // Format time for display
  const formatTime = (timeStr: string) => {
    const hour = parseInt(timeStr.split(":")[0]);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const formattedTime = selectedTime
    ? formatTime(selectedTime as string)
    : "Time not specified";

  return (
    <SafeAreaView
      className="container flex-1 max-w-2xl mx-auto"
      style={{ padding: 20 }}
    >
      <View className="flex-1 justify-center items-center">
        {/* Success Icon */}
        <View className="w-24 h-24 bg-[#D8DADC26] rounded-full justify-center items-center">
          <Icon icon={SUCCESSFUL} width={35} height={35} />
        </View>

        {/* Title */}
        <View className="mt-4">
          <InterSemiBold className="text-base/5 mb-1 text-center">
            Appointment Booked!
          </InterSemiBold>
          <InterRegular className="text-sm/5 text-center text-secondaryText px-4">
            Your appointment request has been sent to the seller. They'll
            confirm the date and time shortly.
          </InterRegular>
        </View>

        {/* Appointment Details */}
        <View
          className="w-full my-6 rounded-lg p-4"
          style={{
            backgroundColor: "#F9FAFB",
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          {propertyTitle ? (
            <View className="mb-3">
              <InterRegular className="text-xs text-secondaryText mb-1">
                Property
              </InterRegular>
              <InterSemiBold className="text-sm text-primaryText">
                {propertyTitle}
              </InterSemiBold>
            </View>
          ) : null}

          <View className="flex-row justify-between">
            <View className="flex-1">
              <InterRegular className="text-xs text-secondaryText mb-1">
                📅 Date
              </InterRegular>
              <InterSemiBold className="text-sm text-primaryText">
                {formattedDate}
              </InterSemiBold>
            </View>

            <View className="flex-1 items-end">
              <InterRegular className="text-xs text-secondaryText mb-1">
                🕐 Time
              </InterRegular>
              <InterSemiBold className="text-sm text-primaryText">
                {formattedTime}
              </InterSemiBold>
            </View>
          </View>
        </View>

        {/* Status */}
        <View
          className="w-full rounded-lg p-3 mb-6"
          style={{ backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA" }}
        >
          <InterRegular className="text-xs text-center" style={{ color: "#9A3412" }}>
            ⏳ Waiting for seller confirmation
          </InterRegular>
        </View>

        {/* Actions */}
        <View className="w-full gap-3">
          <Button
            onPress={() => router.push("/(tabs)/history")}
            isFull
            className="rounded-lg"
          >
            <InterSemiBold className="text-sm/5 text-white">
              View Transactions
            </InterSemiBold>
          </Button>

          <Button
            onPress={() => router.push("/(tabs)/home")}
            color=""
            isFull
            className="rounded-lg border border-borderColor"
          >
            <InterSemiBold className="text-sm/5 text-primaryText">
              Back to Home
            </InterSemiBold>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default AppointmentBooked;

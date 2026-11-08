/**
 * ViewingHoursForm
 *
 * The step that asks a first-time seller when buyers may come and look.
 *
 * Availability is stored per SELLER, not per property — `agent_availability`
 * has no property_id — so these hours apply across every listing they have.
 * That is why the step only appears when they have none yet: asking on each
 * listing would imply per-property hours, and with no delete endpoint on the
 * backend every duplicate window would be permanent.
 *
 * Skippable on purpose. The property is listed either way; without hours a
 * buyer is simply told to message the seller instead of being offered slots.
 */
import { View, TouchableOpacity, ScrollView } from "react-native";
import BackBtn from "../common/BackBtn";
import Button from "../common/Button";
import InterSemiBold from "../Text/InterSemiBold";
import InterMedium from "../Text/InterMedium";
import InterRegular from "../Text/InterRegular";
import SelectInput from "../input/selectInput";
import { WEEKDAY_NAMES, minutesToLabel } from "@/utilities/availability";

/** Shared shape with app/availability. */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  label: minutesToLabel(h * 60),
  value: `${String(h).padStart(2, "0")}:00`,
}));

interface ViewingHoursFormProps {
  selectedDays: string[];
  onToggleDay: (day: string) => void;
  start: string;
  end: string;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ViewingHoursForm({
  selectedDays,
  onToggleDay,
  start,
  end,
  onChangeStart,
  onChangeEnd,
  onNext,
  onBack,
}: ViewingHoursFormProps) {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
          <BackBtn onPress={onBack} />
          <View style={{ marginLeft: 15 }}>
            <InterSemiBold style={{ fontSize: 18 }}>When can buyers view?</InterSemiBold>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
        <InterRegular style={{ fontSize: 14, color: "#666", lineHeight: 20, marginBottom: 16 }}>
          Buyers can only book an inspection during the hours you publish.
          Without these, they will be told to message you instead.
        </InterRegular>

        <View
          style={{
            padding: 12,
            borderRadius: 8,
            backgroundColor: "#EFF6FF",
            borderWidth: 1,
            borderColor: "#BFDBFE",
            marginBottom: 20,
          }}
        >
          <InterRegular style={{ fontSize: 12, color: "#1E40AF", lineHeight: 18 }}>
            These hours apply to all of your listings, not just this one. You
            can change them any time from Profile → Viewing Hours.
          </InterRegular>
        </View>

        <InterMedium style={{ fontSize: 14, marginBottom: 8 }}>Available days</InterMedium>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {WEEKDAY_NAMES.map((day) => {
            const isSelected = selectedDays.includes(day);
            return (
              <TouchableOpacity
                key={day}
                onPress={() => onToggleDay(day)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: isSelected ? "#C1272D" : "#E5E7EB",
                  backgroundColor: isSelected ? "#FEF2F2" : "#FFFFFF",
                }}
              >
                <InterRegular
                  style={{
                    fontSize: 13,
                    color: isSelected ? "#C1272D" : "#4B5563",
                    fontWeight: isSelected ? "600" : "400",
                  }}
                >
                  {day.charAt(0) + day.slice(1, 3).toLowerCase()}
                </InterRegular>
              </TouchableOpacity>
            );
          })}
        </View>

        <SelectInput
          label="From"
          options={HOUR_OPTIONS}
          value={start}
          onValueChange={(v: string | number) => onChangeStart(String(v))}
        />
        <SelectInput
          label="Until"
          options={HOUR_OPTIONS}
          value={end}
          onValueChange={(v: string | number) => onChangeEnd(String(v))}
        />

        <InterRegular style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          The end time itself is not bookable — 9:00 AM to 5:00 PM offers slots
          from 9 through 4.
        </InterRegular>

        {selectedDays.length === 0 && (
          <InterRegular style={{ fontSize: 12, color: "#B45309", marginTop: 12, lineHeight: 18 }}>
            No days selected — you can skip this and set your hours later, but
            buyers will not be able to book a viewing until you do.
          </InterRegular>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 30, paddingTop: 10 }}>
        <Button onPress={onNext} style={{ paddingVertical: 16, borderRadius: 8 }}>
          <InterSemiBold style={{ color: "#fff" }}>
            {selectedDays.length === 0 ? "Skip for now" : "Continue"}
          </InterSemiBold>
        </Button>
      </View>
    </View>
  );
}

export default ViewingHoursForm;

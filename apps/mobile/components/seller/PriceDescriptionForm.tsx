import React, { useMemo, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import BackBtn from "../common/BackBtn";
import Button from "../common/Button";
import InterSemiBold from "../Text/InterSemiBold";
import InterMedium from "../Text/InterMedium";
import InterRegular from "../Text/InterRegular";
import CheckBox from "../input/checkbox";
import CurrencySelector from "../common/CurrencySelector";
import { ProgressIndicator } from "./ProgressIndicator";
import { theme } from "../../styles/theme";
import { useCurrency } from "@/contexts/CurrencyContext";
import { fiatToUsdGeneric } from "@/constants/exchangeRates";
import AntDesign from "@expo/vector-icons/AntDesign";

// ── Duration helpers ──
type DurationUnit = "days" | "months" | "years";

const PREDEFINED_DURATIONS = [
  { label: "Per Month", value: 1, unit: "months" as DurationUnit },
  { label: "Per Year", value: 12, unit: "months" as DurationUnit },
];

const DURATION_UNIT_OPTIONS: { label: string; value: DurationUnit }[] = [
  { label: "Days", value: "days" },
  { label: "Months", value: "months" },
  { label: "Years", value: "years" },
];

// ── Props ──
interface PriceDescriptionFormProps {
  formData: any;
  onConfirm: () => void;
  onBack: () => void;
  onUpdate: (data: any) => void;
}

export function PriceDescriptionForm({
  formData,
  onConfirm,
  onBack,
  onUpdate,
}: PriceDescriptionFormProps) {
  const {
    selectedCurrency,
    oracle,
    oracleLoading,
  } = useCurrency();

  // Local UI state for duration (only used for rent)
  const [durationMode, setDurationMode] = useState<"predefined" | "custom">("predefined");
  const [customDurationValue, setCustomDurationValue] = useState("1");
  const [customDurationUnit, setCustomDurationUnit] = useState<DurationUnit>("months");

  // ══════════════════════════════════════════════════════════════
  // DERIVED FROM SHARED STATE (read-only — no re-definition here)
  // ══════════════════════════════════════════════════════════════
  const isForRent =
    formData.status === "rent" || formData.status === "For rent";
  const isForSale = !isForRent;
  const isLand = (formData.propertyType || "").toLowerCase() === "land";

  // ── Oracle-based conversion ──
  const priceNumeric = useMemo(() => {
    const raw = String(formData.price || "0").replace(/,/g, "");
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
  }, [formData.price]);

  const fiatRate = oracle?.fiat?.[selectedCurrency] ?? null;

  const usdEquivalent = useMemo(() => {
    if (!fiatRate || fiatRate === 0 || priceNumeric === 0) return null;
    return fiatToUsdGeneric(priceNumeric, fiatRate);
  }, [priceNumeric, fiatRate]);

  const oracleUnavailable = !oracle || !fiatRate;

  // ── Rent duration, in days, which is what the contract stores ──
  //
  // This used to normalise everything to 30-day months, so every term the
  // seller could pick below a month collapsed into one: a seven-day let was
  // sent as thirty days, and a year was 360. Days are the finest unit offered
  // here, so days are what get sent, and each choice survives exactly.
  const rentDurationDays = useMemo(() => {
    if (!isForRent) return null;

    if (durationMode === "predefined") {
      return formData.rentDurationPreset === "year" ? 365 : 30;
    }

    const val = parseInt(customDurationValue) || 0;
    if (val <= 0) return null;

    switch (customDurationUnit) {
      case "days":
        return val;
      case "months":
        return val * 30;
      case "years":
        return val * 365;
      default:
        return val;
    }
  }, [isForRent, durationMode, formData.rentDurationPreset, customDurationValue, customDurationUnit]);

  // ── Validation ──
  const canConfirm = useMemo(() => {
    if (!formData.description || formData.description.trim().length < 10) return false;
    if (priceNumeric <= 0) return false;
    if (oracleUnavailable) return false;
    if (isForRent && (!rentDurationDays || rentDurationDays <= 0)) return false;
    return true;
  }, [formData.description, priceNumeric, oracleUnavailable, isForRent, rentDurationDays]);

  // ── Confirm handler — writes derived listing data to shared state ──
  const handleConfirm = () => {
    const extra: Record<string, any> = {
      listingCurrency: selectedCurrency,
    };

    if (isForRent) {
      extra.rentDurationValue =
        durationMode === "custom"
          ? parseInt(customDurationValue) || 1
          : formData.rentDurationPreset === "year"
            ? 12
            : 1;
      extra.rentDurationUnit = durationMode === "custom" ? customDurationUnit : "months";
      extra.rentDurationDays = rentDurationDays;
    } else {
      extra.rentDurationValue = null;
      extra.rentDurationUnit = null;
      extra.rentDurationDays = null;
    }

    onUpdate(extra);
    setTimeout(() => onConfirm(), 0);
  };

  // The deposit in USD, on the same oracle rate as the price, so a seller sees
  // both figures in the currency the chain will actually hold them in.
  const depositPreview = useMemo(() => {
    if (!isForRent) return null;
    const entered = parseFloat(String(formData.damageDeposit ?? "").replace(/[^0-9.]/g, "")) || 0;
    if (entered <= 0 || !fiatRate) return null;
    return fiatToUsdGeneric(entered, fiatRate);
  }, [isForRent, formData.damageDeposit, fiatRate]);

  // Says the term back in whatever unit reads naturally, without pretending a
  // count of days is a count of months. Exact multiples get the round word;
  // anything else stays in days rather than being rounded into a lie.
  const describeDays = (days: number) => {
    if (days % 365 === 0) {
      const years = days / 365;
      return `${years} year${years === 1 ? "" : "s"}`;
    }
    if (days % 30 === 0) {
      const months = days / 30;
      return `${months} month${months === 1 ? "" : "s"}`;
    }
    if (days % 7 === 0) {
      const weeks = days / 7;
      return `${weeks} week${weeks === 1 ? "" : "s"}`;
    }
    return `${days} day${days === 1 ? "" : "s"}`;
  };

  // Helper to build the duration label for the USD preview
  const getDurationLabel = () => {
    if (!isForRent || !rentDurationDays) return "";
    if (durationMode === "predefined") {
      return formData.rentDurationPreset === "year" ? " / year" : " / month";
    }
    return ` / ${customDurationValue} ${customDurationUnit}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
          <BackBtn onPress={onBack} />
          <View style={{ marginLeft: 15 }}>
            <InterSemiBold style={{ fontSize: 18, color: theme.colors.text }}>
              List a property
            </InterSemiBold>
          </View>
        </View>

        {/* Progress Indicator */}
        <ProgressIndicator currentStep={4} totalSteps={4} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          {/* ── Read-only listing type badge ──
              Shows what the user selected on the first screen.
              NOT editable here — avoids duplication. */}
          <View style={styles.statusBadgeRow}>
            <View
              style={[
                styles.statusBadge,
                isForRent ? styles.statusBadgeRent : styles.statusBadgeSale,
              ]}
            >
              <AntDesign
                name={isForRent ? "clock-circle" : "home"}
                size={13}
                color={isForRent ? "#1565C0" : "#2E7D32"}
              />
              <InterMedium
                style={[
                  styles.statusBadgeText,
                  isForRent ? { color: "#1565C0" } : { color: "#2E7D32" },
                ]}
              >
                {isForRent ? "For Rent" : "For Sale"}
              </InterMedium>
            </View>
            {isLand && (
              <View style={styles.statusBadgeLand}>
                <AntDesign name="environment" size={13} color="#795548" />
                <InterMedium style={{ fontSize: 13, color: "#795548" }}>Land</InterMedium>
              </View>
            )}
          </View>

          {/* ── Description ── */}
          <View style={{ marginBottom: 24 }}>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
              Add a description
            </InterSemiBold>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Your description goes here..."
              placeholderTextColor={theme.colors.secondaryText}
              multiline
              value={formData.description}
              onChangeText={(text) => onUpdate({ description: text })}
            />
          </View>

          {/* ── Set Price ── */}
          <View style={{ marginBottom: 8 }}>
            <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 8 }}>
              Set Price{isForRent && rentDurationDays ? getDurationLabel() : ""}
            </InterSemiBold>

            {/* Price input with inline currency selector */}
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInput}
                placeholder="500,000"
                placeholderTextColor={theme.colors.secondaryText}
                keyboardType="numeric"
                value={formData.price}
                onChangeText={(text) => onUpdate({ price: text })}
              />
              <View style={styles.currencyDropdown}>
                <CurrencySelector compact />
              </View>
            </View>

            {/* USD preview */}
            <View style={styles.usdPreviewRow}>
              {oracleLoading ? (
                <View style={styles.usdPreviewInner}>
                  <ActivityIndicator size="small" color="#999" />
                  <InterRegular style={styles.usdPreviewText}>
                    Fetching exchange rate…
                  </InterRegular>
                </View>
              ) : oracleUnavailable ? (
                <View style={styles.usdPreviewInner}>
                  <AntDesign name="exclamation-circle" size={13} color="#E53935" />
                  <InterRegular style={[styles.usdPreviewText, { color: "#E53935" }]}>
                    Oracle unavailable — cannot list until rate is loaded
                  </InterRegular>
                </View>
              ) : usdEquivalent !== null && priceNumeric > 0 ? (
                <View style={styles.usdPreviewInner}>
                  <AntDesign name="swap" size={13} color="#4CAF50" />
                  <InterRegular style={[styles.usdPreviewText, { color: "#4CAF50" }]}>
                    ≈ $
                    {usdEquivalent.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    USD
                  </InterRegular>
                  {isForRent && rentDurationDays && (
                    <InterRegular
                      style={[styles.usdPreviewText, { color: "#888", marginLeft: 4 }]}
                    >
                      {getDurationLabel()}
                    </InterRegular>
                  )}
                </View>
              ) : null}
            </View>
          </View>

          {/* ── Rent Duration (only if for rent) ── */}
          {isForRent && (
            <View style={styles.durationSection}>
              <InterSemiBold style={{ fontSize: 16, color: theme.colors.text, marginBottom: 12 }}>
                Rental Duration
              </InterSemiBold>

              {/* Mode toggle: Predefined | Custom */}
              <View style={styles.durationModeRow}>
                <TouchableOpacity
                  style={[
                    styles.durationModeBtn,
                    durationMode === "predefined" && styles.durationModeBtnActive,
                  ]}
                  onPress={() => setDurationMode("predefined")}
                  activeOpacity={0.7}
                >
                  <InterMedium
                    style={[
                      styles.durationModeText,
                      durationMode === "predefined" && styles.durationModeTextActive,
                    ]}
                  >
                    Predefined
                  </InterMedium>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.durationModeBtn,
                    durationMode === "custom" && styles.durationModeBtnActive,
                  ]}
                  onPress={() => setDurationMode("custom")}
                  activeOpacity={0.7}
                >
                  <InterMedium
                    style={[
                      styles.durationModeText,
                      durationMode === "custom" && styles.durationModeTextActive,
                    ]}
                  >
                    Custom
                  </InterMedium>
                </TouchableOpacity>
              </View>

              {durationMode === "predefined" ? (
                <View style={styles.predefinedRow}>
                  {PREDEFINED_DURATIONS.map((dur) => {
                    const isActive =
                      (dur.value === 1 && formData.rentDurationPreset !== "year") ||
                      (dur.value === 12 && formData.rentDurationPreset === "year");
                    return (
                      <TouchableOpacity
                        key={dur.label}
                        style={[styles.predefinedChip, isActive && styles.predefinedChipActive]}
                        onPress={() =>
                          onUpdate({
                            rentDurationPreset: dur.value === 12 ? "year" : "month",
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <InterMedium
                          style={[
                            styles.predefinedChipText,
                            isActive && styles.predefinedChipTextActive,
                          ]}
                        >
                          {dur.label}
                        </InterMedium>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.customDurationRow}>
                  <TextInput
                    style={styles.customDurInput}
                    keyboardType="numeric"
                    value={customDurationValue}
                    onChangeText={setCustomDurationValue}
                    placeholder="1"
                    placeholderTextColor="#999"
                  />

                  <View style={styles.customUnitRow}>
                    {DURATION_UNIT_OPTIONS.map((opt) => {
                      const active = customDurationUnit === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.unitChip, active && styles.unitChipActive]}
                          onPress={() => setCustomDurationUnit(opt.value)}
                          activeOpacity={0.7}
                        >
                          <InterMedium
                            style={[styles.unitChipText, active && styles.unitChipTextActive]}
                          >
                            {opt.label}
                          </InterMedium>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Duration summary */}
              {rentDurationDays !== null && rentDurationDays > 0 && (
                <View style={styles.durationSummary}>
                  <AntDesign name="clock-circle" size={13} color="#666" />
                  <InterRegular style={styles.durationSummaryText}>
                    Rental access:{" "}
                    {describeDays(rentDurationDays)}
                  </InterRegular>
                </View>
              )}
            </View>
          )}

          {/* ── Sale permanent label ── */}
          {isForSale && (
            <View style={styles.salePermanentRow}>
              <AntDesign name="check-circle" size={16} color="#4CAF50" />
              <InterRegular style={styles.salePermanentText}>
                Permanent Sale — ownership transfers to buyer permanently
              </InterRegular>
            </View>
          )}

          {/* ── Security deposit — rentals only ──
              A sale has no tenant to collect one from and nobody to return it
              to, and the contract refuses one on a sale listing, so the field
              is not offered there. */}
          {isForRent && (
            <View style={{ marginTop: 20 }}>
              <InterSemiBold style={{ fontSize: 15, color: theme.colors.text }}>
                Security deposit{" "}
                <InterRegular style={{ fontSize: 13, color: "#999" }}>(optional)</InterRegular>
              </InterSemiBold>
              <InterRegular
                style={{ fontSize: 13, color: "#666", lineHeight: 19, marginTop: 4, marginBottom: 10 }}
              >
                Held against damage for the length of the tenancy. Your tenant
                pays it with the rent and gets it back automatically when the
                lease ends, unless you raise a claim within 7 days.
              </InterRegular>
              <TextInput
                placeholder="Leave blank to charge none"
                placeholderTextColor="#aaa"
                value={formData.damageDeposit ?? ""}
                onChangeText={(text: string) => onUpdate({ damageDeposit: text })}
                keyboardType="numeric"
                style={styles.priceInput}
              />
              {depositPreview !== null && (
                <InterRegular style={{ fontSize: 12, color: "#047857", marginTop: 6 }}>
                  ≈ ${depositPreview.toFixed(2)} held in escrow — not paid to you
                </InterRegular>
              )}
            </View>
          )}

          {/* ── Negotiable Checkbox ── */}
          <View style={{ marginBottom: 40, marginTop: 8 }}>
            <CheckBox
              label="Is this price negotiable?"
              value={formData.isNegotiable}
              onChange={() => onUpdate({ isNegotiable: !formData.isNegotiable })}
            />
          </View>
        </View>
      </ScrollView>

      {/* ── Confirm Button ── */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 30 }}>
        <Button
          onPress={handleConfirm}
          disabled={!canConfirm}
          style={{
            backgroundColor: canConfirm ? theme.colors.primary : "#ccc",
            paddingVertical: 16,
            borderRadius: 8,
            opacity: canConfirm ? 1 : 0.6,
          }}
        >
          <InterSemiBold className="text-white text-[16px]">Confirm and List</InterSemiBold>
        </Button>
      </View>
    </View>
  );
}

// ═══════ Styles ═══════
const styles = StyleSheet.create({
  // ── Status badge (read-only) ──
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusBadgeRent: {
    backgroundColor: "#E3F2FD",
  },
  statusBadgeSale: {
    backgroundColor: "#E8F5E9",
  },
  statusBadgeLand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#EFEBE9",
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },

  descriptionInput: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    padding: 15,
    height: 120,
    textAlignVertical: "top",
    fontSize: 16,
    color: "#000",
  },

  // ── Price row ──
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    overflow: "hidden",
  },
  priceInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    color: "#000",
  },
  currencyDropdown: {
    paddingRight: 8,
  },

  // ── USD preview ──
  usdPreviewRow: {
    minHeight: 28,
    marginTop: 6,
    marginBottom: 10,
    paddingLeft: 4,
  },
  usdPreviewInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  usdPreviewText: {
    fontSize: 13,
    color: "#888",
  },

  // ── Duration section ──
  durationSection: {
    marginBottom: 16,
    paddingTop: 4,
  },
  durationModeRow: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 8,
  },
  durationModeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  durationModeBtnActive: {
    backgroundColor: "#C1272D",
  },
  durationModeText: {
    fontSize: 14,
    color: "#666",
  },
  durationModeTextActive: {
    color: "#fff",
    fontWeight: "600",
  },

  predefinedRow: {
    flexDirection: "row",
    gap: 10,
  },
  predefinedChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    alignItems: "center",
  },
  predefinedChipActive: {
    borderColor: "#C1272D",
    backgroundColor: "#FFF5F5",
  },
  predefinedChipText: {
    fontSize: 14,
    color: "#333",
  },
  predefinedChipTextActive: {
    color: "#C1272D",
    fontWeight: "600",
  },

  customDurationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  customDurInput: {
    width: 70,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#000",
    textAlign: "center",
  },
  customUnitRow: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  unitChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    alignItems: "center",
  },
  unitChipActive: {
    borderColor: "#C1272D",
    backgroundColor: "#FFF5F5",
  },
  unitChipText: {
    fontSize: 13,
    color: "#666",
  },
  unitChipTextActive: {
    color: "#C1272D",
    fontWeight: "600",
  },

  durationSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingLeft: 2,
  },
  durationSummaryText: {
    fontSize: 13,
    color: "#666",
  },

  // ── Sale permanent row ──
  salePermanentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8F5E9",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  salePermanentText: {
    fontSize: 13,
    color: "#388E3C",
    flex: 1,
  },
});

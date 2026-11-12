"use client";

import { useId, useMemo, useState } from "react";
import { AlertCircle, ArrowLeftRight, CheckCircle2, Clock, Home, MapPin } from "lucide-react";
import Button from "@/components/ui/Button";
import TextField, { inputClass } from "@/components/ui/TextField";
import Spinner from "@/components/ui/Spinner";
import { useCurrency } from "@/contexts/CurrencyContext";
import { SUPPORTED_FIATS } from "@/services/priceOracle";
import { fiatToUsdGeneric } from "@/constants/exchangeRates";
import { CheckRow, StepFrame } from "./ListingParts";
import { isLandForm, isRentStatus, numericOnly, type FormUpdate, type PropertyFormState } from "./listingForm";

type Unit = "days" | "months" | "years";
const UNIT_DAYS: Record<Unit, number> = { days: 1, months: 30, years: 365 };

const describeDays = (days: number) => {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (days % 365 === 0) return plural(days / 365, "year");
  if (days % 30 === 0) return plural(days / 30, "month");
  if (days % 7 === 0) return plural(days / 7, "week");
  return plural(days, "day");
};

const toNumber = (v: string) => {
  const n = parseFloat(String(v || "0").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
};

const chip = (active: boolean) =>
  `rounded-lg border px-4 py-2 text-sm font-medium ${active ? "border-primary bg-primary text-white" : "border-borderColor bg-white hover:bg-cardBackground"}`;

/** Step 4: description, price in the seller's currency, and the rental term. */
export function PriceDescriptionForm({
  formData,
  onConfirm,
  onBack,
  onUpdate,
}: {
  formData: PropertyFormState;
  onConfirm: () => void;
  onBack: () => void;
  onUpdate: FormUpdate;
}) {
  const { oracle, oracleLoading } = useCurrency();
  const descId = useId();
  const isForRent = isRentStatus(formData.status);
  const isLand = isLandForm(formData);
  const currency = formData.listingCurrency;
  const symbol = SUPPORTED_FIATS.find((f) => f.code === currency)?.symbol ?? "";

  const [mode, setMode] = useState<"predefined" | "custom">(
    formData.rentDurationUnit && formData.rentDurationUnit !== "months" ? "custom" : "predefined"
  );
  const [customValue, setCustomValue] = useState(String(formData.rentDurationValue ?? 1));
  const [customUnit, setCustomUnit] = useState<Unit>((formData.rentDurationUnit as Unit) || "months");

  const price = toNumber(formData.price);
  const rate = oracle?.fiat?.[currency] ?? null;
  const oracleUnavailable = !rate;
  const usd = rate && price > 0 ? fiatToUsdGeneric(price, rate) : null;

  const days = useMemo(() => {
    if (!isForRent) return null;
    if (mode === "predefined") return formData.rentDurationPreset === "year" ? 365 : 30;
    const v = parseInt(customValue, 10) || 0;
    return v > 0 ? v * UNIT_DAYS[customUnit] : null;
  }, [isForRent, mode, formData.rentDurationPreset, customValue, customUnit]);

  const durationLabel = !isForRent || !days ? "" : mode === "predefined" ? (days === 365 ? " / year" : " / month") : ` / ${customValue} ${customValue === "1" ? customUnit.replace(/s$/, "") : customUnit}`;
  const deposit = toNumber(formData.damageDeposit);
  const depositUsd = isForRent && deposit > 0 && rate ? fiatToUsdGeneric(deposit, rate) : null;

  const descriptionOk = formData.description.trim().length >= 10;
  const canConfirm = descriptionOk && price > 0 && !oracleUnavailable && (!isForRent || (days ?? 0) > 0);

  const confirm = () => {
    if (!canConfirm) return;
    onUpdate(
      isForRent
        ? {
            rentDurationValue: mode === "custom" ? parseInt(customValue, 10) || 1 : days === 365 ? 12 : 1,
            rentDurationUnit: mode === "custom" ? customUnit : "months",
            rentDurationDays: days,
          }
        : { rentDurationValue: null, rentDurationUnit: null, rentDurationDays: null, damageDeposit: "" }
    );
    // Let the update land before the next step reads the form.
    setTimeout(onConfirm, 0);
  };

  return (
    <StepFrame
      title="List a property"
      onBack={onBack}
      step={4}
      footer={
        <Button full onClick={confirm} disabled={!canConfirm}>
          Confirm and list
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2 text-xs font-medium">
        <span className={`flex items-center gap-1 rounded-full px-3 py-1 ${isForRent ? "bg-blue-50 text-blue-800" : "bg-green-50 text-green-800"}`}>
          {isForRent ? <Clock size={13} /> : <Home size={13} />}
          {isForRent ? "For Rent" : "For Sale"}
        </span>
        {isLand && (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-900">
            <MapPin size={13} /> Land
          </span>
        )}
      </div>

      <div className="mb-6">
        <label htmlFor={descId} className="mb-1 block text-sm">
          Add a description
        </label>
        <textarea
          id={descId}
          rows={5}
          value={formData.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Your description goes here..."
          className={`${inputClass} resize-y`}
          maxLength={2000}
        />
        {formData.description && !descriptionOk && <p className="mt-1 text-xs text-secondaryText">At least 10 characters.</p>}
      </div>

      <div className="mb-2">
        <span className="mb-1 block text-sm">Set price{durationLabel}</span>
        <div className="flex gap-2">
          <TextField
            aria-label="Price"
            className="flex-1"
            inputMode="decimal"
            value={formData.price}
            onChange={(e) => onUpdate({ price: numericOnly(e.target.value) })}
            placeholder="500,000"
            leading={symbol || undefined}
          />
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => onUpdate({ listingCurrency: e.target.value })}
            className={`${inputClass} w-28`}
          >
            {SUPPORTED_FIATS.map((f) => (
              <option key={f.code} value={f.code}>
                {f.flag} {f.code}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 flex min-h-5 items-center gap-1.5 text-sm" aria-live="polite">
          {oracleLoading && !rate ? (
            <>
              <Spinner size={14} /> <span className="text-secondaryText">Fetching exchange rate…</span>
            </>
          ) : oracleUnavailable ? (
            <span className="flex items-center gap-1.5 text-red-600">
              <AlertCircle size={14} /> Exchange rate unavailable, so this can&apos;t be listed until it loads
            </span>
          ) : usd !== null ? (
            <span className="flex items-center gap-1.5 text-green-600">
              <ArrowLeftRight size={14} />≈ ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              {durationLabel}
            </span>
          ) : null}
        </p>
      </div>

      {isForRent ? (
        <section className="mb-6 mt-4 rounded-xl border border-borderColor p-4">
          <h2 className="mb-3 font-semibold">Rental duration</h2>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button type="button" className={chip(mode === "predefined")} onClick={() => setMode("predefined")}>
              Predefined
            </button>
            <button type="button" className={chip(mode === "custom")} onClick={() => setMode("custom")}>
              Custom
            </button>
          </div>
          {mode === "predefined" ? (
            <div className="flex gap-2">
              {(["month", "year"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={chip((formData.rentDurationPreset === "year") === (p === "year"))}
                  onClick={() => onUpdate({ rentDurationPreset: p })}
                >
                  Per {p === "year" ? "Year" : "Month"}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Duration"
                inputMode="numeric"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={`${inputClass} w-24`}
              />
              {(Object.keys(UNIT_DAYS) as Unit[]).map((u) => (
                <button key={u} type="button" className={chip(customUnit === u)} onClick={() => setCustomUnit(u)}>
                  {u[0].toUpperCase() + u.slice(1)}
                </button>
              ))}
            </div>
          )}
          {!!days && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-secondaryText">
              <Clock size={13} /> Rental access: {describeDays(days)}
            </p>
          )}
        </section>
      ) : (
        <p className="mb-6 mt-4 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 size={16} /> Permanent sale: ownership transfers to the buyer permanently.
        </p>
      )}

      {/* The contract refuses a deposit on a sale, so it is offered for rentals only. */}
      {isForRent && (
        <div className="mb-6">
          <TextField
            label="Security deposit (optional)"
            inputMode="decimal"
            value={formData.damageDeposit}
            onChange={(e) => onUpdate({ damageDeposit: numericOnly(e.target.value) })}
            placeholder="Leave blank to charge none"
            leading={symbol || undefined}
            hint="Held against damage for the length of the tenancy. Your tenant pays it with the rent and gets it back automatically when the lease ends, unless you raise a claim within 7 days."
          />
          {depositUsd !== null && <p className="mt-1 text-xs text-emerald-700">≈ ${depositUsd.toFixed(2)} held in escrow, not paid to you</p>}
        </div>
      )}

      <CheckRow label="This price is negotiable" checked={formData.isNegotiable} onChange={() => onUpdate({ isNegotiable: !formData.isNegotiable })} />
    </StepFrame>
  );
}

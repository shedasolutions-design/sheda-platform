"use client";

/* eslint-disable @next/next/no-img-element -- uploaded photos come from arbitrary hosts */
import { CheckCircle2, MapPin } from "lucide-react";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";
import Spinner from "@/components/ui/Spinner";
import { useWallet } from "@/contexts/WalletContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { fiatToUsdGeneric } from "@/constants/exchangeRates";
import { SUPPORTED_FIATS } from "@/services/priceOracle";
import { WEEKDAY_NAMES, minutesToLabel, timeToMinutes } from "@/utilities/availability";
import { StepFrame } from "./ListingParts";
import { isRentStatus, type PropertyFormState } from "./listingForm";

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  label: minutesToLabel(h * 60),
  value: `${String(h).padStart(2, "0")}:00`,
}));

/**
 * Asked only of a seller with no viewing hours yet. Hours belong to the
 * seller, not the property, so they cover every listing. Skippable: without
 * them buyers are told to message the seller instead.
 */
export function ViewingHoursForm({
  selectedDays,
  onToggleDay,
  start,
  end,
  onChangeStart,
  onChangeEnd,
  onNext,
  onBack,
}: {
  selectedDays: string[];
  onToggleDay: (day: string) => void;
  start: string;
  end: string;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const badRange = selectedDays.length > 0 && (s == null || e == null || e <= s);
  return (
    <StepFrame
      title="When can buyers view?"
      onBack={onBack}
      footer={
        <Button full onClick={onNext} disabled={badRange}>
          {selectedDays.length === 0 ? "Skip for now" : "Continue"}
        </Button>
      }
    >
      <p className="mb-4 text-sm leading-5 text-secondaryText">
        Buyers can only book an inspection during the hours you publish. Without these, they will be told to message you instead.
      </p>
      <p className="mb-5 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
        These hours apply to all of your listings, not just this one. You can change them any time from Profile → Viewing Hours.
      </p>
      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium">Available days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_NAMES.map((day) => {
            const on = selectedDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleDay(day)}
                className={`rounded-full border px-4 py-1.5 text-sm ${on ? "border-primary bg-primary text-white" : "border-borderColor hover:bg-cardBackground"}`}
              >
                {day.charAt(0) + day.slice(1, 3).toLowerCase()}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <SelectField label="From" options={HOURS} value={start} onValueChange={onChangeStart} />
        <SelectField label="Until" options={HOURS} value={end} onValueChange={onChangeEnd} />
      </div>
      {badRange ? (
        <p className="mt-2 text-xs text-red-600">The end time must be after the start time.</p>
      ) : (
        <p className="mt-2 text-xs text-secondaryText">The end time itself is not bookable: 9:00 AM to 5:00 PM offers slots from 9 through 4.</p>
      )}
      {selectedDays.length === 0 && (
        <p className="mt-3 text-xs leading-5 text-amber-700">
          No days selected. You can skip this and set your hours later, but buyers will not be able to book a viewing until you do.
        </p>
      )}
    </StepFrame>
  );
}

/** Registers the property on-chain before it is published. */
export function MintNFTForm({
  onMint,
  onBack,
  busy,
  isRelist,
}: {
  onMint: () => void;
  onBack: () => void;
  busy: boolean;
  isRelist: boolean;
}) {
  const { walletState } = useWallet();
  const connected = walletState.isConnected;
  if (busy) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" aria-live="polite">
        <Spinner size={40} />
        <p className="font-semibold">{isRelist ? "Updating your listing on the blockchain…" : "Minting NFT on the blockchain…"}</p>
        <p className="text-sm text-secondaryText">Please keep this page open.</p>
      </div>
    );
  }
  return (
    <StepFrame
      title={isRelist ? "Relist your property" : "Mint property NFT"}
      onBack={onBack}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button full onClick={onMint} disabled={!connected}>
            {!connected ? "Connect wallet first" : isRelist ? "Update listing" : "Mint property NFT"}
          </Button>
          <Button full variant="outline" onClick={onBack}>
            Go back
          </Button>
        </div>
      }
    >
      <p className="mb-5 text-sm">
        {isRelist
          ? "This property is already yours on the blockchain, so it keeps its existing NFT. We'll set your new price and terms on it."
          : "Register your property on the blockchain by minting an NFT. This creates a verifiable record of ownership."}
      </p>
      {!isRelist && (
        <div className="mb-5 rounded-xl bg-cardBackground p-4">
          <p className="mb-2 text-sm font-semibold">Why mint?</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Generates a unique on-chain property ID</li>
            <li>Provides verifiable proof of ownership from day one</li>
            <li>Enables secure and transparent transactions</li>
            <li>Your listing will be linked to the blockchain record</li>
          </ul>
        </div>
      )}
      {!connected && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Connect your NEAR wallet to continue. Go to your profile to set one up.
        </p>
      )}
    </StepFrame>
  );
}

/** Review of the listing after it is on-chain, before it goes on the marketplace. */
export function AuthorizeListingForm({
  formData,
  onAuthorize,
  onCancel,
  busy,
  blockchainPropertyId,
  transactionHash,
}: {
  formData: PropertyFormState;
  onAuthorize: () => void;
  onCancel: () => void;
  busy: boolean;
  blockchainPropertyId: string | number | null;
  transactionHash: string | null;
}) {
  const { oracle, selectedCurrency, formatPrice } = useCurrency();
  if (busy) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" aria-live="polite">
        <Spinner size={40} />
        <p className="font-semibold">Publishing listing…</p>
      </div>
    );
  }
  // Shown in the viewer's preferred currency, with the stable-dollar amount
  // the contract actually holds beside it.
  const entered = Number(formData.price.replace(/,/g, "")) || 0;
  const listingRate = oracle?.fiat?.[formData.listingCurrency];
  const usd = listingRate ? fiatToUsdGeneric(entered, listingRate) : null;
  const dollars = usd == null ? "" : `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const priceText =
    usd == null
      ? `${SUPPORTED_FIATS.find((f) => f.code === formData.listingCurrency)?.symbol ?? ""}${entered.toLocaleString()}`
      : selectedCurrency === "USD"
        ? dollars
        : `${formatPrice(usd)} (≈ ${dollars})`;
  const term = isRentStatus(formData.status) && formData.rentDurationDays ? ` for ${formData.rentDurationDays} day${formData.rentDurationDays === 1 ? "" : "s"}` : "";
  const rows: [string, string][] = [
    ["Price", priceText + term],
    ["Negotiable", formData.isNegotiable ? "Yes" : "No"],
  ];
  return (
    <StepFrame
      title="Authorize listing"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button full onClick={onAuthorize}>
            Authorize &amp; publish
          </Button>
          <Button full variant="outline" onClick={onCancel}>
            Back to details
          </Button>
        </div>
      }
    >
      <img
        src={formData.photos[0] || "/images/apt-1.png"}
        alt=""
        className="mb-5 aspect-video w-full rounded-xl bg-cardBackground object-cover"
      />
      <h2 className="mb-1 text-lg font-semibold">{formData.title || "Property"}</h2>
      <p className="mb-5 flex items-center gap-1 text-sm text-secondaryText">
        <MapPin size={14} /> {formData.location}
      </p>
      <h3 className="mb-1 font-semibold">Description</h3>
      <p className="mb-5 whitespace-pre-line text-sm leading-6 text-secondaryText">{formData.description || "No description provided"}</p>
      <dl className="mb-6">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-borderColor py-3">
            <dt className="font-semibold">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <p className="mb-1 flex items-center gap-1.5 font-semibold">
          <CheckCircle2 size={16} /> On the blockchain
        </p>
        {blockchainPropertyId != null && <p className="text-xs">Property ID: #{String(blockchainPropertyId)}</p>}
        {transactionHash && <p className="truncate text-xs text-green-700">Tx: {transactionHash}</p>}
        <p className="mt-1 text-xs">Authorize below to publish it on the marketplace.</p>
      </div>
      <p className="rounded-lg bg-cardBackground p-3 text-sm text-secondaryText">
        You can upload property documents (C of O, lease agreements, etc.) after creating your listing. It&apos;s optional but helps
        verify ownership.
      </p>
    </StepFrame>
  );
}

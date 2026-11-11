"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth/AuthGuard";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import { ListingSuccessScreen, PropertyListingOverview, StepFrame } from "@/components/seller/ListingParts";
import { AuthorizeListingForm, MintNFTForm, ViewingHoursForm } from "@/components/seller/ListingFinalSteps";
import { PropertyDescriptionForm } from "@/components/seller/PropertyDescriptionForm";
import { PropertyExtrasForm } from "@/components/seller/PropertyExtrasForm";
import { PhotoUploadForm } from "@/components/seller/PhotoUploadForm";
import { PriceDescriptionForm } from "@/components/seller/PriceDescriptionForm";
import OwnedPropertyPicker from "@/components/seller/OwnedPropertyPicker";
import { MyListings } from "@/components/seller/MyListings";
import { createInitialFormState, isLandForm, isRentStatus, toBackendType, type PropertyFormState } from "@/components/seller/listingForm";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { useWallet } from "@/contexts/WalletContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useNearContract } from "@/hooks/useNearContract";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import type { PropertyBase } from "@/services/api";
import { fiatToStablecoinUnits, fiatToUsdGeneric } from "@/constants/exchangeRates";
import { timeToMinutes } from "@/utilities/availability";

interface Dialog {
  type: FeedbackType;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

type View = "overview" | "history" | "picker" | "describe" | "extras" | "photos" | "price" | "hours" | "mint" | "authorize" | "done";

const toNumber = (v: string) => Number(String(v).replace(/,/g, ""));

/**
 * The seller's "List a property" wizard: describe → extras → photos → price →
 * (viewing hours, first time only) → put it on-chain → publish to the
 * marketplace. The chain record comes first so the listing row can carry its
 * on-chain id.
 */
function ListingFlow() {
  const router = useRouter();
  const { listProperty, updateProperty, getMyListings, myListings, user, getSchedule, createAvailableTime } = useApi();
  const { isSeller } = useMode();
  const { walletState } = useWallet();
  const { mintProperty, updateListing } = useNearContract();
  const { run } = useTransactionToast();
  const { oracle, selectedCurrency } = useCurrency();

  const [view, setView] = useState<View>("overview");
  const [form, setForm] = useState<PropertyFormState>(() => createInitialFormState(selectedCurrency || "NGN"));
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [blockchainPropertyId, setBlockchainPropertyId] = useState<string | number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  /**
   * Set when listing a property already held on-chain, and after a mint, so
   * that going back and changing details updates that token rather than
   * minting a second one.
   */
  const [relistPropertyId, setRelistPropertyId] = useState<number | null>(null);

  // Viewing hours: asked only of a seller who has none yet.
  const [needsViewingHours, setNeedsViewingHours] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [viewingStart, setViewingStart] = useState("09:00");
  const [viewingEnd, setViewingEnd] = useState("17:00");

  // Needed when publishing to tell "relisting my own row" from "listing one I bought".
  useEffect(() => {
    getMyListings({ silent: true }).catch(() => {});
  }, [getMyListings]);

  useEffect(() => {
    let cancelled = false;
    // Decided once: a step must not appear or vanish part-way through.
    getSchedule()
      .then((s) => {
        if (!cancelled) setNeedsViewingHours(s.length === 0);
      })
      .catch(() => {
        if (!cancelled) setNeedsViewingHours(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each step starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  const update = (data: Partial<PropertyFormState>) => setForm((prev) => ({ ...prev, ...data }));
  const isForRent = isRentStatus(form.status);
  const isLand = isLandForm(form);

  const leaseDays = () => (form.rentDurationDays && form.rentDurationDays > 0 ? form.rentDurationDays : 30);
  const depositAtomic = (): string | null => {
    const entered = parseFloat(form.damageDeposit.replace(/[^0-9.]/g, "")) || 0;
    const rate = oracle?.fiat?.[form.listingCurrency];
    if (entered <= 0 || !rate) return null;
    return String(Math.round(fiatToUsdGeneric(entered, rate) * 1_000_000));
  };

  const resetAll = () => {
    setForm(createInitialFormState(selectedCurrency || "NGN"));
    setBlockchainPropertyId(null);
    setTxHash(null);
    setRelistPropertyId(null);
    setSelectedDays([]);
  };

  const sellerCheck = (): boolean => {
    if (isSeller && user?.account_type === "agent") return true;
    setDialog({
      type: "warning",
      title: "Seller mode required",
      message: "Switch to seller mode on your profile page to list properties.",
      actionLabel: "Go to profile",
      onAction: () => router.push("/profile"),
    });
    return false;
  };

  const validate = (): string | null => {
    if (form.title.trim().length < 3) return "Please provide a title of at least 3 characters.";
    if (form.description.trim().length < 10) return "Please provide a description of at least 10 characters.";
    if (form.photos.length === 0) return "Please upload at least one photo of the property.";
    const price = toNumber(form.price);
    if (isNaN(price) || price <= 0) return "Please enter a valid price greater than 0.";
    if (isLand && !(parseFloat(form.landSize) > 0)) return "Please enter a valid land size.";
    if (isForRent && !(form.rentDurationDays && form.rentDurationDays > 0)) return "Please specify a valid rental duration.";
    return null;
  };

  /** Best-effort: the property is listed either way, and hours can be set later. */
  const saveViewingHours = async () => {
    const s = timeToMinutes(viewingStart);
    const e = timeToMinutes(viewingEnd);
    if (selectedDays.length === 0 || s == null || e == null || e <= s) return;
    await Promise.all(
      selectedDays.map((weekday) =>
        createAvailableTime({ weekday, start_time: viewingStart, end_time: viewingEnd }).catch((err) =>
          console.warn(`Failed to save viewing hours for ${weekday}:`, err)
        )
      )
    );
    setNeedsViewingHours(false);
  };

  const handleMint = async () => {
    if (!sellerCheck()) return;
    if (!walletState.isConnected || !walletState.account?.accountId || !walletState.account?.privateKey) {
      setDialog({
        type: "warning",
        title: "Wallet not ready",
        message: "Your wallet needs to be set up and unlocked on this device to put the property on-chain.",
        actionLabel: "Go to wallet",
        onAction: () => router.push("/wallet"),
      });
      return;
    }
    const problem = validate();
    if (problem) {
      setDialog({ type: "error", title: "Check your listing", message: problem });
      return;
    }
    const currency = form.listingCurrency || selectedCurrency || "NGN";
    const rate = oracle?.fiat?.[currency];
    if (!rate) {
      setDialog({
        type: "error",
        title: "Exchange rate unavailable",
        message: `Could not fetch the ${currency}/USD exchange rate. Please check your connection and try again.`,
      });
      return;
    }

    const priceUnits = String(fiatToStablecoinUnits(toNumber(form.price), rate));
    const lease_duration_days = isForRent ? leaseDays() : undefined;
    const damage_deposit_required = isForRent ? depositAtomic() : undefined;

    setBusy(true);
    try {
      const result =
        relistPropertyId !== null
          ? await run({
              loadingMessage: "Updating your listing on-chain...",
              successMessage: "Listing updated on-chain.",
              notification: { type: "general", title: "Property Listed", message: `"${form.title}" is now listed.` },
              action: async () => {
                const r = await updateListing({
                  property_id: relistPropertyId,
                  price: priceUnits,
                  is_for_sale: true,
                  lease_duration_days: lease_duration_days ?? null,
                  damage_deposit_required: damage_deposit_required ?? null,
                });
                if (!r.success) throw new Error(r.error || "Failed to update the listing on the blockchain");
                return { ...r, data: relistPropertyId as number | string };
              },
            })
          : await run({
              loadingMessage: "Minting your property NFT on-chain...",
              successMessage: "Property NFT minted.",
              notification: { type: "general", title: "Property Minted", message: `"${form.title}" was minted on-chain.` },
              action: async () => {
                const r = await mintProperty({
                  title: form.title,
                  description: form.description,
                  media_uri: form.photos[0] || "",
                  price: priceUnits,
                  is_for_sale: !isForRent,
                  ...(isForRent ? { lease_duration_days, damage_deposit_required } : {}),
                });
                if (!r.success) throw new Error(r.error || "Failed to mint the NFT on the blockchain");
                return r;
              },
            });

      const id = (result.data ?? null) as string | number | null;
      setBlockchainPropertyId(id);
      setTxHash(result.transactionHash || null);
      // From here on, changes go to this token instead of minting another.
      if (id != null && !isNaN(Number(id))) setRelistPropertyId(Number(id));
      if (needsViewingHours && selectedDays.length > 0) saveViewingHours().catch(() => {});
      setView("authorize");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const lower = `${message} ${JSON.stringify(error)}`.toLowerCase();
      const noFunds = ["does not have enough balance", "insufficient", "not enough", "lackoffunds", "notenoughbalance"].some((k) =>
        lower.includes(k)
      );
      setDialog({
        type: "error",
        title: noFunds ? "Not enough NEAR" : "Couldn't put it on-chain",
        message: noFunds
          ? "Your wallet doesn't have enough NEAR to cover the network fee. Top it up from your wallet and try again."
          : message || "Failed to mint the NFT. Please try again.",
        actionLabel: "Retry",
        onAction: () => {
          setDialog(null);
          handleMint();
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAuthorize = async () => {
    setBusy(true);
    try {
      const rooms = (v: string) => (isLand ? 0 : parseInt(v, 10) || 0);
      const housing = (extra: string) => !isLand && form.extras.includes(extra);
      const payload: PropertyBase = {
        title: form.title.trim(),
        description: form.description,
        location: form.location,
        price: toNumber(form.price),
        property_type: toBackendType(form.propertyType) as PropertyBase["property_type"],
        listing_type: isForRent ? "rent" : "sale",
        status: "available",
        furnished: !isLand && form.furnishing !== "unfurnished",
        is_active: true,
        bathroom: rooms(form.bathrooms),
        bedroom: rooms(form.bedrooms),
        air_condition: housing("Air conditioner"),
        pop_ceiling: housing("Pop Ceiling"),
        floor_tiles: housing("Floor Tiles"),
        running_water: form.extras.includes("Running water"),
        furniture: housing("Furniture"),
        prepaid_meter: housing("Prepaid meter"),
        wifi: housing("Wi-Fi"),
        is_negotiable: form.isNegotiable,
        images: form.photos.map((image_url, i) => ({ image_url, is_primary: i === 0 })),
        blockchain_property_id: blockchainPropertyId != null ? String(blockchainPropertyId) : null,
        transaction_hash: txHash,
        is_nft_minted: blockchainPropertyId != null,
        blockchain_owner_id: walletState.account?.accountId || null,
        lease_duration_days: isForRent ? leaseDays() : null,
        damage_deposit_required: isForRent ? depositAtomic() : null,
      };

      // Our own existing row for this token is updated, not duplicated: a
      // duplicate shows deals twice in History. A property we bought has the
      // seller's row, so it still gets a new one.
      const existing =
        blockchainPropertyId != null ? myListings.find((p) => String(p.blockchain_property_id) === String(blockchainPropertyId)) : undefined;
      let savedId: number | undefined;
      if (existing?.id) {
        await updateProperty(existing.id, payload as never);
        savedId = existing.id;
      } else {
        savedId = (await listProperty(payload))?.id;
      }
      if (!savedId) throw new Error("Failed to create the property listing");
      getMyListings({ silent: true }).catch(() => {});
      resetAll();
      setView("done");
    } catch (error) {
      setDialog({
        type: "error",
        title: "Listing failed",
        message: error instanceof Error ? error.message : "Could not save your property listing. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  let content;
  switch (view) {
    case "overview":
      content = (
        <PropertyListingOverview
          onGetStarted={() => {
            if (sellerCheck()) setView("picker");
          }}
          onHistoryPress={() => setView("history")}
        />
      );
      break;
    case "history":
      content = (
        <div className="mx-auto max-w-5xl">
          <StepFrame title="My Listings" onBack={() => setView("overview")}>
            <MyListings />
          </StepFrame>
        </div>
      );
      break;
    case "picker":
      content = (
        <OwnedPropertyPicker
          onBack={() => setView("overview")}
          onSelect={(p) => {
            setRelistPropertyId(p.id);
            update({ title: form.title || p.description || "", description: form.description || p.description || "" });
            setView("describe");
          }}
          onCreateNew={() => {
            setRelistPropertyId(null);
            setView("describe");
          }}
        />
      );
      break;
    case "describe":
      content = <PropertyDescriptionForm formData={form} onUpdate={update} onBack={() => setView("overview")} onNext={() => setView("extras")} />;
      break;
    case "extras":
      content = <PropertyExtrasForm formData={form} onUpdate={update} onBack={() => setView("describe")} onNext={() => setView("photos")} />;
      break;
    case "photos":
      content = <PhotoUploadForm formData={form} onUpdate={update} onBack={() => setView("extras")} onNext={() => setView("price")} />;
      break;
    case "price":
      content = (
        <PriceDescriptionForm
          formData={form}
          onUpdate={update}
          onBack={() => setView("photos")}
          onConfirm={() => setView(needsViewingHours ? "hours" : "mint")}
        />
      );
      break;
    case "hours":
      content = (
        <ViewingHoursForm
          selectedDays={selectedDays}
          onToggleDay={(d) => setSelectedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
          start={viewingStart}
          end={viewingEnd}
          onChangeStart={setViewingStart}
          onChangeEnd={setViewingEnd}
          onBack={() => setView("price")}
          onNext={() => setView("mint")}
        />
      );
      break;
    case "mint":
      content = (
        <MintNFTForm
          busy={busy}
          isRelist={relistPropertyId !== null}
          onMint={handleMint}
          onBack={() => setView(needsViewingHours ? "hours" : "price")}
        />
      );
      break;
    case "authorize":
      content = (
        <AuthorizeListingForm
          formData={form}
          busy={busy}
          onAuthorize={handleAuthorize}
          onCancel={() => setView("price")}
          blockchainPropertyId={blockchainPropertyId}
          transactionHash={txHash}
        />
      );
      break;
    case "done":
      content = (
        <ListingSuccessScreen
          onGoToHomepage={() => {
            setView("overview");
            router.push("/home");
          }}
          onViewListings={() => setView("history")}
        />
      );
      break;
  }

  return (
    <>
      {content}
      <FeedbackModal
        isVisible={!!dialog}
        type={dialog?.type ?? "info"}
        title={dialog?.title ?? ""}
        message={dialog?.message}
        actionLabel={dialog?.actionLabel}
        onAction={dialog?.onAction}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

export default function ListPage() {
  return (
    <AuthGuard requireAuth>
      <ListingFlow />
    </AuthGuard>
  );
}

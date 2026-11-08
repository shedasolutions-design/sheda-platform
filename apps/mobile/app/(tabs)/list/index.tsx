"use client";

import { useState, useEffect } from "react";
import { SafeAreaView, View, ActivityIndicator } from "react-native";
import Alert from "@/utilities/alertPolyfill";
import { router } from "expo-router";
import { PropertyListingOverview } from "@/components/seller/PropertyListingOverview";
import OwnedPropertyPicker from "@/components/seller/OwnedPropertyPicker";
import nearContractService from "@/services/nearContract";
import { PropertyDescriptionForm } from "@/components/seller/PropertyDescriptionForm";
import { PropertyExtrasForm } from "@/components/seller/PropertyExtrasForm";
import { PhotoUploadForm } from "@/components/seller/PhotoUploadForm";
import { PriceDescriptionForm } from "@/components/seller/PriceDescriptionForm";
import { AuthorizeListingForm } from "@/components/seller/AuthorizeListingForm";
import { ViewingHoursForm } from "@/components/seller/ViewingHoursForm";
import { MintNFTForm } from "@/components/seller/MintNFTForm";
import { ListingSuccessScreen } from "@/components/seller/ListingSuccessScreen";
import { MyListings } from "@/components/seller/MyListings";
import BackBtn from "@/components/common/BackBtn";
import InterSemiBold from "@/components/Text/InterSemiBold";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import { useWallet } from "@/contexts/WalletContext";
import { useNearContract } from "@/hooks/useNearContract";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { PropertyBase } from "@/services/api";
import { fiatToStablecoinUnits, fiatToUsdGeneric } from "@/constants/exchangeRates";
import { timeToMinutes } from "@/utilities/availability";

import AuthGuard from "@/components/AuthGuard";

// ═══════════════════════════════════════════════════════════════
// Single Source of Truth — Form State Shape
// ═══════════════════════════════════════════════════════════════
interface PropertyFormState {
  // Step 1: Property details (single decision point)
  title: string;
  propertyType: string;       // "Apartment" | "Land" | "Shortlet" | "Shared Apartment"
  status: string;             // "For rent" | "For sale" — ONLY set on step 1
  location: string;

  // Housing-only fields (apartment / shared apartment / shortlet)
  furnishing: string;
  bedrooms: string;
  bathrooms: string;

  // Land-only fields
  landSize: string;
  plotType: string;

  // Step 2: Extras
  extras: string[];

  // Step 3: Photos
  photos: string[];

  // Step 4: Price & description
  description: string;
  price: string;
  isNegotiable: boolean;
  listingCurrency: string;

  // Rent duration (set on price screen, only for rent)
  rentDurationValue: number | null;
  rentDurationUnit: string | null;
  /**
   * The term in days, which is the unit the contract stores.
   *
   * Was months, which could not carry the short terms the price screen lets a
   * seller pick: anything under a month was rounded up, so a seven-day let
   * reached the chain as thirty days.
   */
  rentDurationDays: number | null;
  rentDurationPreset: string;
  /**
   * Security deposit, in the listing currency. Empty means none.
   * Rentals only — the contract refuses one on a sale listing.
   */
  damageDeposit: string;
}

const createInitialFormState = (defaultCurrency: string): PropertyFormState => ({
  title: "",
  propertyType: "Apartment",
  status: "For rent",
  location: "lekki",
  furnishing: "unfurnished",
  bedrooms: "1",
  bathrooms: "1",
  landSize: "",
  plotType: "residential",
  extras: [],
  photos: [],
  description: "",
  price: "",
  isNegotiable: false,
  listingCurrency: defaultCurrency,
  rentDurationValue: null,
  rentDurationUnit: null,
  rentDurationDays: null,
  rentDurationPreset: "month",
  damageDeposit: "",
});

const ListingFlow = () => {
  const { listProperty, updateProperty, getMyListings, myListings, user, getSchedule, schedule, createAvailableTime } = useApi();
  const { isSeller } = useMode();
  const { walletState, getAuthorizedPrivateKey } = useWallet();
  const { mintProperty, updateListing } = useNearContract();
  const { run: runTransaction } = useTransactionToast();
  const { oracle, oracleLoading, selectedCurrency } = useCurrency();

  // ── Single shared form state ──
  const [currentStep, setCurrentStep] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<PropertyFormState>(
    createInitialFormState(selectedCurrency || "NGN")
  );

  // Blockchain state (populated after minting in step 5)
  const [blockchainPropertyId, setBlockchainPropertyId] = useState<string | number | null>(null);
  const [mintTransactionHash, setMintTransactionHash] = useState<string | null>(null);

  // Set when the user chose a property they already own instead of adding a
  // new one. The contract mints a fresh NFT on every mint_property call with
  // no dedup, so listing something already in their wallet has to go through
  // update_listing instead — otherwise a resale creates a second token for a
  // property that already exists on-chain.
  const [relistPropertyId, setRelistPropertyId] = useState<number | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Needed at submit time to tell "relisting a property I already have a
  // listing row for" from "listing one I bought". Fetched up front so the
  // decision doesn't depend on whether some other screen happened to
  // populate it first — getting this wrong creates a duplicate backend row.
  useEffect(() => {
    getMyListings({ silent: true }).catch(() => { });
  }, [getMyListings]);

  // ── Derived booleans (never duplicated — single computation) ──
  const isForRent = formData.status === "rent" || formData.status === "For rent";
  const isLand = formData.propertyType.toLowerCase() === "land";

  const resetForm = () => {
    setFormData(createInitialFormState(selectedCurrency || "NGN"));
    setBlockchainPropertyId(null);
    setMintTransactionHash(null);
    // Hours just saved are no longer "needed", and the step must not reappear
    // on the next listing with the previous selection still in it.
    setViewingHoursDone(false);
    setSelectedDays([]);
    setNeedsViewingHours(false);
  };

  const handleUpdate = (data: Partial<PropertyFormState>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  // Both the mint call and the backend payload read these, so the two records
  // of the same listing are derived once rather than computed twice and left
  // to drift.
  const leaseDurationDaysForSubmit = (): number =>
    formData.rentDurationDays && formData.rentDurationDays > 0
      ? formData.rentDurationDays
      : 30;

  const damageDepositAtomic = (): string | null => {
    const entered =
      parseFloat(String(formData.damageDeposit ?? "").replace(/[^0-9.]/g, "")) || 0;
    if (entered <= 0) return null;
    const rate = oracle?.fiat?.[formData.listingCurrency];
    if (!rate) return null;
    return String(Math.round(fiatToUsdGeneric(entered, rate) * 1_000_000));
  };

  const handleNext = () => setCurrentStep((prev) => prev + 1);
  const handleBack = () => setCurrentStep((prev) => prev - 1);

  // ── Viewing hours ────────────────────────────────────────────────────────
  //
  // Availability is stored per SELLER — `agent_availability` has no
  // property_id — so these hours cover every listing they have. The step only
  // appears for a seller who has none yet: asking on each listing would imply
  // per-property hours, and with no delete endpoint every duplicate window
  // would be permanent.
  //
  // Without hours a buyer cannot book an inspection at all, so a first-time
  // seller who is never asked lists a property nobody can arrange to see.
  const [needsViewingHours, setNeedsViewingHours] = useState(false);
  const [viewingHoursDone, setViewingHoursDone] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [viewingStart, setViewingStart] = useState("09:00");
  const [viewingEnd, setViewingEnd] = useState("17:00");

  useEffect(() => {
    let cancelled = false;
    // Not knowing whether they have hours is the same as knowing they do: an
    // extra step is only worth injecting when we are sure it is needed. That
    // covers a failed read and an API surface that does not offer the call.
    if (typeof getSchedule !== "function") {
      setNeedsViewingHours(false);
      return;
    }
    getSchedule()
      .then(() => {
        if (!cancelled) setNeedsViewingHours((schedule?.length ?? 0) === 0);
      })
      .catch(() => {
        if (!cancelled) setNeedsViewingHours(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount-only: this decides whether the flow has an extra step, which must
    // not change under the seller part-way through listing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleViewingDay = (day: string) =>
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  /**
   * Persist the chosen windows. Best-effort by design: the property is already
   * listed by the time this runs, so a failure here must not read as the
   * listing having failed — it just leaves the seller to set hours from
   * Profile → Viewing Hours.
   */
  const saveViewingHours = async (): Promise<void> => {
    if (selectedDays.length === 0) return;
    const start = timeToMinutes(viewingStart);
    const end = timeToMinutes(viewingEnd);
    if (start == null || end == null || end <= start) return;

    await Promise.all(
      selectedDays.map((weekday) =>
        createAvailableTime({
          weekday,
          start_time: viewingStart,
          end_time: viewingEnd,
        }).catch((err) => {
          console.warn(`Failed to save viewing hours for ${weekday}:`, err);
        })
      )
    );
  };

  const handleHistoryPress = () => setShowHistory(true);
  const handleBackFromHistory = () => setShowHistory(false);

  // ══════════════════════════════════════════════════════════════
  // PAYLOAD VALIDATION — runs before mint & backend submission
  // ══════════════════════════════════════════════════════════════
  const validatePayload = (): string | null => {
    if (!formData.title || formData.title.trim().length < 3) {
      return "Please provide a title of at least 3 characters.";
    }
    if (!formData.description || formData.description.length < 10) {
      return "Please provide a description of at least 10 characters.";
    }
    if (formData.photos.length === 0) {
      return "Please upload at least one photo of the property.";
    }
    const priceValue = Number(formData.price.replace(/,/g, ""));
    if (isNaN(priceValue) || priceValue <= 0) {
      return "Please enter a valid price greater than 0.";
    }
    // Land-specific
    if (isLand) {
      const landSize = parseFloat(formData.landSize || "0");
      if (isNaN(landSize) || landSize <= 0) {
        return "Please enter a valid land size.";
      }
    }
    // Rent-specific
    if (isForRent) {
      const dur = formData.rentDurationDays;
      if (!dur || dur <= 0) {
        return "Please specify a valid rental duration.";
      }
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════
  // STEP 5 — Mint NFT on-chain FIRST (before backend listing)
  // ══════════════════════════════════════════════════════════════
  const handleMintNFT = async () => {
    // Validate seller mode
    if (!isSeller) {
      Alert.alert(
        "Seller Mode Required",
        "Please switch to seller mode in the profile page to list properties.",
        [
          { text: "Go to Profile", onPress: () => router.push("/profile") },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }

    if (user?.account_type !== "agent") {
      Alert.alert(
        "Agent Account Required",
        "Your account is currently set as a client. Please switch to agent/seller mode in the profile page to list properties.",
        [
          { text: "Go to Profile", onPress: () => router.push("/profile") },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }

    // Validate wallet
    if (!walletState.isConnected) {
      Alert.alert(
        "Wallet Not Connected",
        "Please connect your NEAR wallet to mint the property NFT.",
        [{ text: "OK", style: "cancel" }]
      );
      return;
    }

    if (!walletState.account?.accountId || !walletState.account?.privateKey) {
      Alert.alert(
        "Wallet Credentials Missing",
        "Your wallet is connected but the private key is not available. Please reconnect your wallet or import it again using your seed phrase.",
        [{ text: "OK", style: "cancel" }]
      );
      return;
    }

    // Form data validation
    const validationError = validatePayload();
    if (validationError) {
      Alert.alert("Validation Error", validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      console.log("🎨 Starting NFT minting (before backend listing)...");

      // ── Oracle-based multi-currency conversion ──
      const listingCurrency = formData.listingCurrency || selectedCurrency || "NGN";
      const fiatRate = oracle?.fiat?.[listingCurrency];

      if (!oracle || !fiatRate) {
        Alert.alert(
          "Exchange Rate Unavailable",
          `Could not fetch the ${listingCurrency}/USD exchange rate. Please check your connection and try again.`
        );
        setIsSubmitting(false);
        return;
      }

      const priceInFiat = Number(formData.price.replace(/,/g, ""));
      const priceInSmallestUnits = fiatToStablecoinUnits(priceInFiat, fiatRate);
      const priceInUsd = fiatToUsdGeneric(priceInFiat, fiatRate);
      console.log(
        `💰 Price: ${priceInFiat} ${listingCurrency} → $${priceInUsd.toFixed(2)} USD → ${priceInSmallestUnits} stablecoin units (rate: ${fiatRate} ${listingCurrency}/USD)`
      );

      // ── Build contract mint params ──
      // Contract ABI expects: title, description, media_uri, price (U128 string), is_for_sale, lease_duration_days?, damage_deposit_required?
      const mintParams: any = {
        title: formData.title,
        description: formData.description,
        media_uri: formData.photos[0] || "",
        price: String(priceInSmallestUnits), // U128 string for NEAR contract
        is_for_sale: !isForRent,
      };

      // Term in days, exactly as the seller chose it. The contract stores days
      // for this reason: months rounded every short let up to thirty.
      if (isForRent) {
        mintParams.lease_duration_days = leaseDurationDaysForSubmit();
        // Security deposit, rentals only — the contract refuses one on a sale.
        mintParams.damage_deposit_required = damageDepositAtomic();

        console.log(
          `🏠 Rental: ${mintParams.lease_duration_days} days, deposit ${mintParams.damage_deposit_required ?? "none"}`
        );
      }
      // Sale → no duration field sent (contract expects absence, not null)

      // ── Validate: land must NOT include housing fields in params ──
      // (contract doesn't use them, but log for debugging)
      if (isLand) {
        console.log(`🌍 Land listing: bedrooms/bathrooms/furnished omitted from contract payload`);
      }

      console.log("📝 Minting parameters:", mintParams);

      // Call the blockchain minting function. This screen also keeps its
      // own full-screen isSubmitting overlay (below) rather than relying on
      // the toast alone — unlike a single self-contained action (a bid,
      // accepting an offer), navigating away mid-mint would lose the rest
      // of this multi-step listing wizard's form state, so blocking
      // interaction here is intentional, not just a loading indicator.
      // Relisting a property the user already owns must NOT mint again —
      // update_listing reuses the existing token and just sets the new terms.
      const isRelist = relistPropertyId !== null;

      const result = isRelist
        ? await runTransaction({
          loadingMessage: "Updating your listing on-chain...",
          successMessage: "Property listed successfully.",
          notification: {
            type: "general",
            title: "Property Listed",
            message: `"${formData.title || "Your property"}" is now listed.`,
          },
          action: async () => {
            // Goes through the hook, not nearContractService directly: the
            // hook is what branches on the account's auth method. FastAuth
            // accounts have no locally held private key, so the key-based path
            // left them unable to relist anything they owned.
            const listResult = await updateListing({
              property_id: relistPropertyId,
              price: mintParams.price,
              is_for_sale: true,
              lease_duration_days: mintParams.lease_duration_days ?? null,
              damage_deposit_required: mintParams.damage_deposit_required ?? null,
            });
            if (!listResult.success) {
              throw new Error(listResult.error || "Failed to update listing on blockchain");
            }
            // update_listing returns nothing — the id is the one we relisted.
            return { ...listResult, data: relistPropertyId };
          },
        })
        : await runTransaction({
          loadingMessage: "Minting your property NFT on-chain...",
          successMessage: "Property NFT minted successfully.",
          notification: {
            type: "general",
            title: "Property Minted",
            message: `"${formData.title || "Your property"}" was minted on-chain successfully.`,
          },
          action: async () => {
            const mintResult = await mintProperty(mintParams);
            if (!mintResult.success) {
              throw new Error(mintResult.error || "Failed to mint NFT on blockchain");
            }
            return mintResult;
          },
        });

      console.log(
        isRelist ? "✅ Listing updated on blockchain" : "✅ NFT minted successfully on blockchain"
      );
      console.log("🔗 Transaction hash:", result.transactionHash);
      console.log("🆔 Blockchain property ID:", result.data);

      // Store blockchain data for the next step
      setBlockchainPropertyId(result.data ?? null);
      setMintTransactionHash(result.transactionHash || null);

      // Best-effort, and deliberately after the listing has succeeded: hours
      // are a convenience for booking, not part of the listing, so a failure
      // here must not read as the listing having failed. The seller can still
      // set them from Profile → Viewing Hours.
      if (needsViewingHours && selectedDays.length > 0) {
        saveViewingHours().catch((err) =>
          console.warn("Viewing hours could not be saved:", err)
        );
      }

      // Move to Authorize step (step 6)
      setCurrentStep(6);
    } catch (error: any) {
      console.error("❌ Minting failed:", error);

      const errorMessage = error?.message || "";
      const errorString = JSON.stringify(error).toLowerCase();

      const isInsufficientBalance =
        errorMessage.toLowerCase().includes("does not have enough balance") ||
        errorMessage.toLowerCase().includes("insufficient") ||
        errorMessage.toLowerCase().includes("not enough") ||
        errorString.includes("insufficient") ||
        errorString.includes("lackoffunds") ||
        errorString.includes("notenoughbalance");

      if (isInsufficientBalance) {
        const balanceMatch = errorMessage.match(/balance ([0-9.]+).*costing ([0-9.]+)/);

        let balanceMessage = "Your wallet doesn't have enough NEAR to mint the NFT.\n\n";

        if (balanceMatch) {
          const currentBalance = balanceMatch[1];
          const requiredAmount = balanceMatch[2];
          const shortfall = (parseFloat(requiredAmount) - parseFloat(currentBalance)).toFixed(4);

          balanceMessage =
            `Insufficient NEAR Balance\n\n` +
            `Current balance: ${currentBalance} NEAR\n` +
            `Required: ${requiredAmount} NEAR\n` +
            `You need: ${shortfall} NEAR more\n\n`;
        }

        Alert.alert(
          "Insufficient NEAR Balance",
          balanceMessage + "Get testnet NEAR at: https://near-faucet.io/",
          [{ text: "Retry", onPress: handleMintNFT }]
        );
      } else {
        Alert.alert(
          "Minting Failed",
          errorMessage || "Failed to mint NFT. Please try again.",
          [{ text: "Retry", onPress: handleMintNFT }]
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // STEP 6 — Authorize & Publish to backend (AFTER minting)
  // ══════════════════════════════════════════════════════════════
  const handleAuthorizeAndList = async () => {
    try {
      setIsSubmitting(true);
      console.log("📝 Authorizing listing and sending to backend...");
      console.log("🔗 Blockchain Property ID:", blockchainPropertyId);

      const getNumericValue = (val: string) => {
        const num = parseInt(val);
        return isNaN(num) ? 0 : num;
      };

      const propertyTitle = formData.title.trim() || `${formData.propertyType} in ${formData.location.charAt(0).toUpperCase() +
        formData.location.slice(1).replace("-", " ")
        }`;

      // ── Build backend payload ──
      // Adapts fields based on propertyType — no housing fields for land
      const propertyData: PropertyBase = {
        title: propertyTitle,
        description: formData.description,
        location: formData.location,
        price: Number(formData.price.replace(/,/g, "")),
        property_type: (["apartment", "land", "shortlet", "shared apartment"].includes(
          formData.propertyType.toLowerCase()
        )
          ? formData.propertyType.toLowerCase().replace(" ", "_")
          : "apartment") as any,
        listing_type: isForRent ? "rent" : "sale",
        status: "available",
        // Housing fields: only meaningful for non-land
        furnished: isLand
          ? false
          : formData.furnishing
            ? formData.furnishing.toLowerCase() !== "unfurnished"
            : false,
        is_active: true,
        bathroom: isLand ? 0 : getNumericValue(formData.bathrooms),
        bedroom: isLand ? 0 : getNumericValue(formData.bedrooms),
        // Extras: different set for land vs housing, but API fields are boolean flags
        air_condition: isLand ? false : formData.extras.includes("Air conditioner"),
        pop_ceiling: isLand ? false : formData.extras.includes("Pop Ceiling"),
        floor_tiles: isLand ? false : formData.extras.includes("Floor Tiles"),
        running_water: formData.extras.includes("Running water"),
        furniture: isLand ? false : formData.extras.includes("Furniture"),
        prepaid_meter: isLand ? false : formData.extras.includes("Prepaid meter"),
        wifi: isLand ? false : formData.extras.includes("Wi-Fi"),
        is_negotiable: formData.isNegotiable,
        images: formData.photos.map((photo) => ({
          image_url: photo,
          is_primary: formData.photos.indexOf(photo) === 0,
        })),
        // Blockchain integration
        blockchain_property_id: blockchainPropertyId ? String(blockchainPropertyId) : null,
        transaction_hash: mintTransactionHash || null,
        is_nft_minted: !!blockchainPropertyId,
        blockchain_owner_id: walletState.account?.accountId || null,
        // The same day count the chain gets, not a rounded copy: the backend
        // stores days now, so the two records agree about the length of a
        // tenancy instead of differing by up to three weeks on a short let.
        lease_duration_days: isForRent ? leaseDurationDaysForSubmit() : null,
        damage_deposit_required: isForRent ? damageDepositAtomic() : null,
      };

      console.log(
        "📤 Submitting property listing with blockchain data:",
        JSON.stringify(propertyData, null, 2)
      );

      // If this on-chain property already has a listing row of ours, update it
      // rather than adding a second one. `blockchain_property_id` has no unique
      // constraint backend-side, and several lookups resolve a transaction to
      // its property through that column — so a stray duplicate shows the
      // transaction twice in History, or 500s the feed outright
      // (Sheda-Backend#20). Relisting our own property is the common case and
      // should never create one.
      //
      // A property we *bought* is the exception: its existing row belongs to
      // the seller, so we genuinely need our own listing. That case still
      // POSTs, which is why the backend also has to tolerate duplicates.
      const existingListing =
        blockchainPropertyId != null
          ? myListings.find(
            (p) => String(p.blockchain_property_id) === String(blockchainPropertyId)
          )
          : undefined;

      let createdProperty;
      if (existingListing?.id) {
        console.log("♻️ Updating existing listing row:", existingListing.id);
        await updateProperty(existingListing.id, propertyData as any);
        createdProperty = { ...existingListing, ...propertyData, id: existingListing.id };
      } else {
        createdProperty = await listProperty(propertyData);
        console.log("📦 listProperty returned:", createdProperty);
      }

      if (!createdProperty || !createdProperty.id) {
        console.error("❌ Property creation failed - no ID returned");
        throw new Error("Failed to create property listing");
      }

      console.log("✅ Property listed with ID:", createdProperty.id);

      // Move to success screen
      resetForm();
      setCurrentStep(7);
    } catch (error: any) {
      console.error("Listing failed:", error);
      Alert.alert(
        "Listing Failed",
        error?.message ||
        "Could not save your property listing. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleGoToHomepage = () => {
    router.push("/(tabs)/home");
    setCurrentStep(0);
    setBlockchainPropertyId(null);
    setMintTransactionHash(null);
  };

  if (showHistory) {
    return (
      <AuthGuard requireAuth={true}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flex: 1, padding: 20 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <BackBtn onPress={handleBackFromHistory} />
              <InterSemiBold style={{ fontSize: 18, marginLeft: 15 }}>
                My Listings
              </InterSemiBold>
            </View>
            <MyListings scrollEnabled={true} />
          </View>
        </SafeAreaView>
      </AuthGuard>
    );
  }

  // Sits between the overview and the form: choose whether this listing is a
  // property already in the user's wallet (relist, no mint) or a new one.
  if (showAssetPicker) {
    return (
      <AuthGuard requireAuth={true}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <OwnedPropertyPicker
            onBack={() => setShowAssetPicker(false)}
            onSelect={(property) => {
              setRelistPropertyId(property.id);
              // Prefill what the chain already knows; the user edits price
              // and the rest through the normal steps.
              setFormData((prev) => ({
                ...prev,
                title: prev.title || property.description || "",
                description: prev.description || property.description || "",
              }));
              setShowAssetPicker(false);
              setCurrentStep(1);
            }}
            onCreateNew={() => {
              setRelistPropertyId(null);
              setShowAssetPicker(false);
              setCurrentStep(1);
            }}
          />
        </SafeAreaView>
      </AuthGuard>
    );
  }

  let content;
  switch (currentStep) {
    case 0:
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <PropertyListingOverview
            onGetStarted={() => setShowAssetPicker(true)}
            onHistoryPress={handleHistoryPress}
          />
        </SafeAreaView>
      );
      break;
    case 1:
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <PropertyDescriptionForm
            formData={formData}
            onNext={handleNext}
            onBack={() => setCurrentStep(0)}
            onUpdate={handleUpdate}
          />
        </SafeAreaView>
      );
      break;
    case 2:
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <PropertyExtrasForm
            formData={formData}
            onNext={handleNext}
            onBack={handleBack}
            onUpdate={handleUpdate}
          />
        </SafeAreaView>
      );
      break;
    case 3:
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <PhotoUploadForm
            formData={formData}
            onNext={handleNext}
            onBack={handleBack}
            onUpdate={handleUpdate}
          />
        </SafeAreaView>
      );
      break;
    case 4:
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <PriceDescriptionForm
            formData={formData}
            onConfirm={handleNext}
            onBack={handleBack}
            onUpdate={handleUpdate}
          />
        </SafeAreaView>
      );
      break;

    // ── STEP 5: Viewing hours, for a seller who has none yet ──
    //
    // Sits between pricing and minting rather than being its own numbered
    // step, so the rest of the flow does not shift under a seller who already
    // has hours set — most of them.
    case 5:
      if (needsViewingHours && !viewingHoursDone) {
        content = (
          <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <ViewingHoursForm
              selectedDays={selectedDays}
              onToggleDay={toggleViewingDay}
              start={viewingStart}
              end={viewingEnd}
              onChangeStart={setViewingStart}
              onChangeEnd={setViewingEnd}
              onNext={() => setViewingHoursDone(true)}
              onBack={handleBack}
            />
          </SafeAreaView>
        );
        break;
      }
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          {isSubmitting ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color="#C1272D" />
              <InterSemiBold style={{ marginTop: 10 }}>Minting NFT on blockchain...</InterSemiBold>
            </View>
          ) : (
            <MintNFTForm
              onMint={handleMintNFT}
              onBack={handleBack}
            />
          )}
        </SafeAreaView>
      );
      break;

    // ── STEP 6: Authorize & Publish to backend (after minting) ──
    case 6:
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          {isSubmitting ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color="#C1272D" />
              <InterSemiBold style={{ marginTop: 10 }}>Publishing listing...</InterSemiBold>
            </View>
          ) : (
            <AuthorizeListingForm
              formData={formData}
              onAuthorize={handleAuthorizeAndList}
              onCancel={handleBack}
              onUpdate={handleUpdate}
              blockchainPropertyId={blockchainPropertyId}
              transactionHash={mintTransactionHash}
            />
          )}
        </SafeAreaView>
      );
      break;

    case 7: // Success
      content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <ListingSuccessScreen onGoToHomepage={handleGoToHomepage} />
        </SafeAreaView>
      );
      break;
    default:
      content = null;
  }

  return <AuthGuard requireAuth={true}>{content}</AuthGuard>;
};

export default ListingFlow;

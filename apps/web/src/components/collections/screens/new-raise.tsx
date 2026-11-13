"use client";

import { InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useMemo, useState } from "react";
import { TouchableOpacity, View } from "@/components/collections/rn";
import { Stack, router } from "@/components/collections/nav";
import PhotoUpload from "@/components/seller/PhotoUpload";
import {
  Badge,
  C,
  Card,
  CollectionsButton,
  Divider,
  FinePrint,
  Meter,
  Note,
  PageTitle,
  Screen,
  Section,
  TYPE,
} from "@/components/collections/ui";
import { Field } from "./become-builder";
import { useMyCollectionProfiles } from "@/hooks/useCollections";
import { LocationPicker, ManagerPicker, ProjectTypePicker } from "@/components/collections/RaiseExtras";
import type { CollectionProjectType } from "@/services/api";
import apiService from "@/services/api";
import { describeApiError } from "@/services/collections/errors";
import { formatWithSymbol, parseAmount } from "@/services/collections/money";
import {
  scheduleBalances as scheduleAddsUp,
  schedulePercent,
  sharePrice,
  slugify,
  tranchesToBps,
} from "@/services/collections/raiseDraft";
import { DEFAULT_TOKEN } from "@/config/tokens";

/**
 * Opening a raise.
 *
 * Three things have to be right before anybody is asked for money, and the
 * form refuses to submit until they are.
 *
 * The phase schedule must release exactly the whole raise. Under it strands
 * money in escrow with no phase that would ever free it; over it promises
 * the builder money the raise never collected. Both only show up near
 * handover, long after the terms stopped being changeable, so the total is
 * shown live and the button stays disabled until it reads 100%.
 *
 * The flats have to add up to something a person can picture. Each one is
 * priced whole and divides into shares, and the screen says what a single
 * share costs, because that is the number that decides whether an ordinary
 * person can take part at all.
 *
 * And it is created as a draft. Publishing is a separate, deliberate step
 * that needs Sheda to have checked the documents and an escrow account to
 * exist on chain, so nothing here can put a raise in front of investors by
 * itself.
 */

interface PhaseDraft {
  name: string;
  tranche: string;
}

interface UnitDraft {
  code: string;
  label: string;
  bedrooms: string;
  price: string;
  shares: string;
  rentLow: string;
  rentHigh: string;
}

const DEFAULT_PHASES: PhaseDraft[] = [
  { name: "Foundation", tranche: "20" },
  { name: "Frame", tranche: "30" },
  { name: "Roofing and envelope", tranche: "30" },
  { name: "Handover", tranche: "20" },
];

export default function NewRaise() {
  const { builder, manager: ownManager, loading } = useMyCollectionProfiles();
  const token = DEFAULT_TOKEN;

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [units, setUnits] = useState("");
  const [description, setDescription] = useState("");
  const [returnPct, setReturnPct] = useState("");
  const [projectType, setProjectType] = useState<CollectionProjectType>("under_construction");
  const [place, setPlace] = useState<{ address: string; lat: number | null; lon: number | null }>({
    address: "",
    lat: null,
    lon: null,
  });
  const [minInvest, setMinInvest] = useState("");
  const [nominees, setNominees] = useState<number[]>([]);
  const [phases, setPhases] = useState<PhaseDraft[]>(DEFAULT_PHASES);
  const [unitList, setUnitList] = useState<UnitDraft[]>([
    { code: "1a", label: "Unit 1A", bedrooms: "2", price: "", shares: "10000", rentLow: "", rentHigh: "" },
  ]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both derived from the basis points that will actually be sent, so the
  // figure on screen is the figure the server validates.
  const trancheTotal = useMemo(() => schedulePercent(phases), [phases]);
  const scheduleBalances = useMemo(() => scheduleAddsUp(phases), [phases]);

  const unitsPriced = unitList.every((u) => parseAmount(u.price, token));
  // Expected rent is optional, but if given it needs both ends, low first.
  const rentProblem = (u: UnitDraft): string | null => {
    const lo = u.rentLow.trim();
    const hi = u.rentHigh.trim();
    if (!lo && !hi) return null;
    const a = parseAmount(lo, token);
    const b = parseAmount(hi, token);
    if (!a || !b) return "Give both a low and a high yearly rent, or leave both empty.";
    if (BigInt(a) > BigInt(b)) return "The low rent is more than the high rent.";
    return null;
  };
  const rentsValid = unitList.every((u) => rentProblem(u) === null);
  const ready =
    Boolean(builder) &&
    name.trim().length >= 2 &&
    location.trim().length >= 2 &&
    scheduleBalances &&
    phases.every((p) => p.name.trim()) &&
    unitList.length > 0 &&
    unitsPriced &&
    rentsValid &&
    !uploading;

  const submit = async () => {
    if (!builder) return;
    setBusy(true);
    setError(null);

    const slug = slugify(name);
    const response = await apiService.createCollectionProject({
      slug,
      name: name.trim(),
      location: location.trim(),
      units: parseInt(units, 10) || unitList.length,
      description: description.trim() || undefined,
      estimated_return_pct: returnPct ? parseInt(returnPct, 10) : undefined,
      project_type: projectType,
      address: place.address.trim() || undefined,
      latitude: place.lat ?? undefined,
      longitude: place.lon ?? undefined,
      min_investment_atomic: minInvest.trim() ? (parseAmount(minInvest, token) ?? undefined) : undefined,
      nominee_profile_ids: nominees,
      // The API works in basis points; the form works in percent, because
      // nobody describes a phase as "two thousand".
      phases: phases.map((p, i) => ({
        name: p.name.trim(),
        tranche_bps: tranchesToBps(phases)[i],
      })),
      unit_list: unitList.map((u) => ({
        code: u.code.trim().toLowerCase(),
        label: u.label.trim(),
        bedrooms: parseInt(u.bedrooms, 10) || 0,
        price_atomic: parseAmount(u.price, token) as string,
        total_shares: u.shares.trim() || "10000",
        ...(u.rentLow.trim() && u.rentHigh.trim()
          ? {
              rent_min_atomic: parseAmount(u.rentLow, token) as string,
              rent_max_atomic: parseAmount(u.rentHigh, token) as string,
            }
          : {}),
      })),
    });

    if (!response.ok) {
      setBusy(false);
      setError(describeApiError(response.error, "That raise could not be created."));
      return;
    }

    // Photographs are attached after the draft exists, because they hang
    // off the project. A failure here must not lose the raise, so each one
    // is reported rather than rolled back.
    const failed: number[] = [];
    for (let i = 0; i < photos.length; i++) {
      const attached = await apiService.addCollectionImage(slug, {
        image_url: photos[i],
        position: i,
      });
      if (!attached.ok) failed.push(i);
    }
    setBusy(false);

    if (failed.length > 0) {
      setError(
        `The raise was created, but ${failed.length} of ${photos.length} photographs did not attach. You can add them again from the draft.`
      );
      return;
    }
    router.replace(`/collections/project/${slug}`);
  };

  if (!loading && !builder) {
    return (
      <>
        <Stack.Screen options={{ title: "New raise" }} />
        <Screen>
          <PageTitle
            title="You need a builder profile first"
            subtitle="A raise belongs to a builder, and investors read that profile before they decide whether to back it."
          />
          <CollectionsButton
            label="Register as a builder"
            onPress={() => router.replace("/collections/become-builder")}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "New raise" }} />
      <Screen>
        <PageTitle
          title="Open a raise"
          subtitle="Describe what you are building, how the money is released, and which flats people are buying into."
        />

        <Section title="The development">
          <Field label="Name" value={name} onChangeText={setName} placeholder="M120 Apartments" />
          <Field
            label="Where"
            value={location}
            onChangeText={setLocation}
            placeholder="Lekki, Lagos"
          />
          <Field
            label="How many units in total"
            value={units}
            onChangeText={setUnits}
            placeholder="5"
            keyboardType="number-pad"
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What is being built, over how many floors, and what is included."
            multiline
          />
          <Field
            label="Estimated return, % a year"
            value={returnPct}
            onChangeText={setReturnPct}
            placeholder="30"
            keyboardType="number-pad"
            note="Shown to investors as your own estimate, always labelled as yours. Sheda does not verify it and does not stand behind it."
          />
        </Section>

        <Section title="What kind of project">
          <ProjectTypePicker
            value={projectType}
            onChange={(t) => {
              setProjectType(t);
              // A finished building has nothing left to build: one payment,
              // released once the manager has taken it over.
              if (t === "completed") setPhases([{ name: "Handover to the manager", tranche: "100" }]);
              else if (phases.length === 1 && phases[0].name === "Handover to the manager") setPhases(DEFAULT_PHASES);
            }}
          />
          <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
            {projectType === "completed"
              ? "Investors' money is paid to you once the manager confirms they have taken over the building and its papers."
              : "Investors' money is paid phase by phase, after the manager inspects and signs off each phase."}
          </InterRegular>
        </Section>

        <Section title="Location">
          <LocationPicker
            address={place.address}
            lat={place.lat}
            lon={place.lon}
            onChange={setPlace}
          />
        </Section>

        <Section title="Property manager">
          <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
            Suggest up to three managers near the project. The manager investors choose inspects each building phase
            and then runs the finished flats. Your own company counts only if no one else is available, and investors
            are told.
          </InterRegular>
          <ManagerPicker
            location={place.address || location}
            selected={nominees}
            onChange={setNominees}
            ownManager={ownManager}
          />
        </Section>

        <Section title="Minimum investment">
          <Field
            label="Smallest amount one person can put in (optional)"
            value={minInvest}
            onChangeText={setMinInvest}
            keyboardType="decimal-pad"
            placeholder="e.g. 50"
            note="Leave empty to allow a single share."
          />
        </Section>

        <Section title="Photographs">
          <PhotoUpload
            photos={photos}
            onPhotosChange={setPhotos}
            onUploadStarted={setUploading}
          />
          <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
            The first photograph becomes the cover. You can add more after the raise opens, and
            holders watching the building go up are exactly who those are for.
          </InterRegular>
        </Section>

        <Section
          title="How the money is released"
          action={
            <Badge
              label={`${trancheTotal.toFixed(trancheTotal % 1 === 0 ? 0 : 2)}%`}
              tone={scheduleBalances ? "positive" : "critical"}
            />
          }
        >
          <Card>
            <View style={{ gap: 13 }}>
              {phases.map((phase, i) => (
                <View key={i} style={{ gap: 9 }}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: "row", gap: 9, alignItems: "flex-end" }}>
                    <View style={{ flex: 3 }}>
                      <Field
                        label={`Phase ${i + 1}`}
                        value={phase.name}
                        onChangeText={(v) =>
                          setPhases(phases.map((p, j) => (j === i ? { ...p, name: v } : p)))
                        }
                        placeholder="Foundation"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="% of raise"
                        value={phase.tranche}
                        onChangeText={(v) =>
                          setPhases(phases.map((p, j) => (j === i ? { ...p, tranche: v } : p)))
                        }
                        keyboardType="decimal-pad"
                        placeholder="25"
                      />
                    </View>
                  </View>
                  {phases.length > 1 ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setPhases(phases.filter((_, j) => j !== i))}
                    >
                      <InterSemiBold style={{ ...TYPE.label, color: C.primary }}>
                        Remove this phase
                      </InterSemiBold>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          </Card>

          <Meter
            pct={Math.min(100, trancheTotal)}
            tone={scheduleBalances ? "positive" : "caution"}
          />

          <CollectionsButton
            label="Add a phase"
            variant="quiet"
            onPress={() => setPhases([...phases, { name: "", tranche: "" }])}
          />

          {scheduleBalances ? null : (
            <Note tone="critical">
              {trancheTotal < 100
                ? `This schedule releases ${trancheTotal.toFixed(0)}% of the raise. The rest would sit in escrow with no phase that ever frees it.`
                : `This schedule releases ${trancheTotal.toFixed(0)}% of the raise, which is more than it will ever collect. The last phases could not be paid.`}
            </Note>
          )}
        </Section>

        <Section title="The flats people are buying into">
          {unitList.map((unit, i) => {
            const atomic = parseAmount(unit.price, token);
            const perShare = sharePrice(atomic, unit.shares);

            return (
              <Card key={i}>
                <View style={{ gap: 11 }}>
                  <View style={{ flexDirection: "row", gap: 9 }}>
                    <View style={{ flex: 2 }}>
                      <Field
                        label="Name"
                        value={unit.label}
                        onChangeText={(v) =>
                          setUnitList(unitList.map((u, j) => (j === i ? { ...u, label: v } : u)))
                        }
                        placeholder="Unit 1A"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Beds"
                        value={unit.bedrooms}
                        onChangeText={(v) =>
                          setUnitList(
                            unitList.map((u, j) => (j === i ? { ...u, bedrooms: v } : u))
                          )
                        }
                        keyboardType="number-pad"
                        placeholder="2"
                      />
                    </View>
                  </View>

                  <Field
                    label="Price of the whole flat"
                    value={unit.price}
                    onChangeText={(v) =>
                      setUnitList(unitList.map((u, j) => (j === i ? { ...u, price: v } : u)))
                    }
                    keyboardType="decimal-pad"
                    placeholder="18000000"
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Expected rent a year, low"
                        value={unit.rentLow}
                        onChangeText={(v) =>
                          setUnitList(unitList.map((u, j) => (j === i ? { ...u, rentLow: v } : u)))
                        }
                        keyboardType="decimal-pad"
                        placeholder="Optional"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="High"
                        value={unit.rentHigh}
                        onChangeText={(v) =>
                          setUnitList(unitList.map((u, j) => (j === i ? { ...u, rentHigh: v } : u)))
                        }
                        keyboardType="decimal-pad"
                        placeholder="Optional"
                      />
                    </View>
                  </View>
                  {rentProblem(unit) ? (
                    <InterRegular style={{ ...TYPE.label, color: C.caution }}>{rentProblem(unit)}</InterRegular>
                  ) : (
                    <InterRegular style={{ ...TYPE.micro, color: C.textMuted }}>
                      For the whole flat, from rents nearby. Put your research in the raise documents.
                    </InterRegular>
                  )}

                  {perShare ? (
                    <InterRegular style={{ ...TYPE.label, color: C.textSecondary }}>
                      Divides into {unit.shares} shares, so one share costs{" "}
                      <InterSemiBold style={{ ...TYPE.label, color: C.text }}>
                        {formatWithSymbol(perShare, token)}
                      </InterSemiBold>
                      . That is the smallest amount anyone can put in.
                    </InterRegular>
                  ) : (
                    <InterRegular style={{ ...TYPE.label, color: C.caution }}>
                      Enter a price to see what a single share would cost.
                    </InterRegular>
                  )}

                  {unitList.length > 1 ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setUnitList(unitList.filter((_, j) => j !== i))}
                    >
                      <InterSemiBold style={{ ...TYPE.label, color: C.primary }}>
                        Remove this flat
                      </InterSemiBold>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </Card>
            );
          })}

          <CollectionsButton
            label="Add a flat"
            variant="quiet"
            onPress={() =>
              setUnitList([
                ...unitList,
                {
                  code: `u${unitList.length + 1}`,
                  label: "",
                  bedrooms: "2",
                  price: "",
                  rentLow: "",
                  rentHigh: "",
                  shares: "10000",
                },
              ])
            }
          />
        </Section>

        <Note>
          This creates a draft. Next, upload your project pack: one document with every agreement and
          term (title, approvals, costs, timeline, rent research, what investors own). Nobody can put money
          in until Sheda has checked it and published the raise, and once it is open these terms are
          frozen, because they are what people committed against.
        </Note>

        {error ? <Note tone="critical">{error}</Note> : null}

        <CollectionsButton
          label={uploading ? "Waiting for photographs" : "Create draft raise"}
          disabled={!ready}
          loading={busy}
          onPress={submit}
        />

        <FinePrint>
          Your name, your delivery record and the stake behind your promises are shown with this
          raise wherever it appears.
        </FinePrint>
      </Screen>
    </>
  );
}

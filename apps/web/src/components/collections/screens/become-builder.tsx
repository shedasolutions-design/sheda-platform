"use client";

import { InterRegular, InterSemiBold } from "@/components/collections/rn";
import { useState } from "react";
import { TextInput, View } from "@/components/collections/rn";
import { Stack, router } from "@/components/collections/nav";
import { useWallet } from "@/contexts/WalletContext";
import {
  C,
  Card,
  CollectionsButton,
  FinePrint,
  Note,
  PageTitle,
  RADIUS,
  Screen,
  Section,
  Segmented,
  TYPE,
} from "@/components/collections/ui";
import { useMyCollectionProfiles } from "@/hooks/useCollections";
import apiService, { type CollectionRole } from "@/services/api";
import { describeApiError } from "@/services/collections/errors";

/**
 * Registering as a builder or a property manager.
 *
 * Until this existed the builder side of Collections was a dead end: the
 * Invest tab said "you do not have a builder profile yet" and offered no
 * way to get one, so nothing past it could ever be reached.
 *
 * The page is blunt about what a profile costs you, because the whole
 * mechanism depends on it being public. A builder's delivery record, the
 * stake behind their promises and anything that was ever slashed are all
 * readable by anyone, permanently. Someone should know that before they
 * create one, not after their first late handover.
 */
export default function BecomeBuilder() {
  const { walletState } = useWallet();
  const { profiles, reload } = useMyCollectionProfiles();

  const [role, setRole] = useState<CollectionRole>("builder");
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [about, setAbout] = useState("");
  const [partOfGroup, setPartOfGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedAccount = walletState.account?.accountId ?? null;
  const already = profiles?.some((p) => p.role === role) ?? false;
  const ready = displayName.trim().length >= 2 && !already;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await apiService.createCollectionProfile({
      role,
      display_name: displayName.trim(),
      location: location.trim() || undefined,
      about: about.trim() || undefined,
      // Sent only when it is actually connected. A profile claiming an
      // account its owner cannot sign for would show stake that answers to
      // somebody else's keys.
      near_account_id: connectedAccount ?? undefined,
      part_of_group: role === "manager" && partOfGroup.trim() ? partOfGroup.trim() : undefined,
    });
    setBusy(false);

    if (!response.ok) {
      setError(describeApiError(response.error, "That profile could not be created."));
      return;
    }
    await reload();
    router.replace(`/collections/person/${response.data.id}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Register" }} />
      <Screen>
        <PageTitle
          title={role === "builder" ? "Raise for a building" : "Manage buildings"}
          subtitle={
            role === "builder"
              ? "Fund a development from many people at once, and hand them a share of the rent when it is let."
              : "Let the buildings, collect the rent, and sign off the phases a builder is paid for."
          }
        />

        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: "builder", label: "Builder" },
            { value: "manager", label: "Property manager" },
          ]}
        />

        <Note>
          Everything on this profile is public and permanent. Your delivery record, the stake
          behind your promises, and anything ever taken from you for a failure can be read by
          anyone deciding whether to back you.
        </Note>

        <Section title="Who you are">
          <Field
            label={role === "builder" ? "Builder or company name" : "Management company name"}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Minimalist & Co"
          />
          <Field
            label="Where you work"
            value={location}
            onChangeText={setLocation}
            placeholder="Lekki, Lagos"
          />
          <Field
            label="About"
            value={about}
            onChangeText={setAbout}
            placeholder="What you build, and where."
            multiline
          />
          {role === "manager" ? (
            <Field
              label="Part of a builder's group? Name them."
              value={partOfGroup}
              onChangeText={setPartOfGroup}
              placeholder="Leave empty if you are independent"
              note="Declaring this stops you signing off that builder's own phases. Nobody may approve their own work, and a sister company is not independent."
            />
          ) : null}
        </Section>

        <Section title="Your NEAR account">
          <Card>
            {connectedAccount ? (
              <View style={{ gap: 4 }}>
                <InterSemiBold style={{ ...TYPE.body, color: C.text }}>
                  {connectedAccount}
                </InterSemiBold>
                <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
                  Stake is held against this account and a slash is recorded against it. It is
                  linked to the profile when you register.
                </InterRegular>
              </View>
            ) : (
              <InterRegular style={{ ...TYPE.label, lineHeight: 17, color: C.textSecondary }}>
                No wallet connected. You can register now and link an account later, but a raise
                cannot advertise cover until one is linked, because there would be nothing behind
                the promise.
              </InterRegular>
            )}
          </Card>
        </Section>

        {already ? (
          <Note tone="caution">
            You already have a {role === "builder" ? "builder" : "manager"} profile. A company
            that does both holds two, and their records are kept apart rather than averaged
            together.
          </Note>
        ) : null}

        {error ? <Note tone="critical">{error}</Note> : null}

        <CollectionsButton
          label={role === "builder" ? "Create builder profile" : "Create manager profile"}
          disabled={!ready}
          loading={busy}
          onPress={submit}
        />

        <FinePrint>
          Registering does not list anything yet. A raise is created separately and only goes on
          chain once Sheda has checked the documents.
        </FinePrint>
      </Screen>
    </>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  note,
  multiline = false,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  note?: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}) {
  return (
    <View style={{ gap: 6 }}>
      <InterSemiBold style={{ ...TYPE.label, color: C.text }}>{label}</InterSemiBold>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: RADIUS,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontFamily: "Inter-Regular",
          fontSize: 15,
          color: C.text,
          minHeight: multiline ? 88 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {note ? (
        <InterRegular style={{ ...TYPE.label, lineHeight: 16, color: C.textSecondary }}>
          {note}
        </InterRegular>
      ) : null}
    </View>
  );
}

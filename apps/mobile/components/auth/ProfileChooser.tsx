"use client";

import { useRef, useState } from "react";
import {
    Animated,
    Modal,
    Pressable,
    View,
    useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import ProfilePreview from "./ProfilePreview";
import InterBold from "@/components/Text/InterBold";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import InterSemiBold from "@/components/Text/InterSemiBold";

export type Profile = "buyer" | "seller";

/**
 * Full-bleed backdrop per profile: a mock of the screen that choice lands on —
 * Home for buyers, Activities for sellers — so the decision is made against a
 * picture of where it goes rather than against a word.
 *
 * See ProfilePreview for why this is drawn rather than screenshotted. Short
 * version: a real capture would bake real listings and revenue figures into
 * the bundle and go stale silently, and rendering the actual screens would
 * mean two full screen renders plus their data fetches before the user has
 * chosen anything — on the sign-in path, which is exactly where the app can
 * least afford it.
 *
 * The tint sits *under* the mock at low opacity to give the two options a
 * distinct cast. Purple/blue keep the buyer↔seller association the deal cards
 * already use for their role badges, so the colour means the same thing here
 * as everywhere else in the app.
 */
const BACKDROPS: Record<Profile, { tint: [string, string] }> = {
    buyer: { tint: ["#4C1D95", "#1E1B4B"] },
    seller: { tint: ["#1E3A8A", "#0F172A"] },
};

const OPTIONS: {
    profile: Profile;
    label: string;
    blurb: string;
}[] = [
        { profile: "buyer", label: "Buyer", blurb: "Rent or buy" },
        { profile: "seller", label: "Seller", blurb: "List & manage" },
    ];

const BRAND = "#C1272D";

interface ProfileChooserProps {
    visible: boolean;
    /** Pre-selects an option — used for the one-time prompt, where the person
     *  already has a mode and we shouldn't pretend otherwise. */
    initialProfile?: Profile;
    submitting?: boolean;
    error?: string | null;
    onConfirm: (profile: Profile, remember: boolean) => void;
}

const ProfileChooser = ({
    visible,
    initialProfile,
    submitting = false,
    error = null,
    onConfirm,
}: ProfileChooserProps) => {
    const [selected, setSelected] = useState<Profile | null>(initialProfile ?? null);
    const [remember, setRemember] = useState(false);
    const { height } = useWindowDimensions();

    // One opacity drives both layers in opposite directions, so they can never
    // both be visible or both be blank mid-transition.
    const crossfade = useRef(new Animated.Value(initialProfile === "seller" ? 1 : 0)).current;

    const select = (profile: Profile) => {
        setSelected(profile);
        Animated.timing(crossfade, {
            toValue: profile === "seller" ? 1 : 0,
            duration: 220,
            useNativeDriver: true,
        }).start();
    };

    const renderBackdrop = (profile: Profile) => {
        const { tint } = BACKDROPS[profile];
        return (
            <Animated.View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity:
                        profile === "seller"
                            ? crossfade
                            : crossfade.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 0],
                            }),
                }}
            >
                <ProfilePreview profile={profile} />
                {/* Tint over the mock rather than under it: the mock is a light
                    surface, and the chooser's controls are white-on-dark. */}
                <LinearGradient
                    colors={tint}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: 0.55,
                    }}
                />
            </Animated.View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={false}
            // No dismissal path on purpose. Every route out of here needs a
            // profile, so a back gesture would have to invent one.
            onRequestClose={() => { }}
        >
            <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
                {renderBackdrop("buyer")}
                {renderBackdrop("seller")}

                {/* Scrim: the art is arbitrary, the text on top is not. */}
                <LinearGradient
                    colors={["rgba(15,23,42,0)", "rgba(15,23,42,0.75)", "rgba(15,23,42,0.96)"]}
                    locations={[0, 0.45, 1]}
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: height * 0.75,
                    }}
                />

                {/* Content sits low — this is a thumb decision, not a reading task. */}
                <View style={{ flex: 1, justifyContent: "flex-end", padding: 24, paddingBottom: 40 }}>
                    <InterBold style={{ color: "#fff", fontSize: 26, marginBottom: 4 }}>
                        Continue as
                    </InterBold>
                    <InterRegular style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 20 }}>
                        You can switch anytime.
                    </InterRegular>

                    <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                        {OPTIONS.map(({ profile, label, blurb }) => {
                            const isSelected = selected === profile;
                            return (
                                <Pressable
                                    key={profile}
                                    onPress={() => select(profile)}
                                    disabled={submitting}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: isSelected, disabled: submitting }}
                                    accessibilityLabel={`${label}. ${blurb}`}
                                    style={{
                                        flex: 1,
                                        borderRadius: 16,
                                        paddingVertical: 18,
                                        paddingHorizontal: 16,
                                        borderWidth: 2,
                                        borderColor: isSelected ? BRAND : "rgba(255,255,255,0.25)",
                                        backgroundColor: isSelected
                                            ? "rgba(193,39,45,0.22)"
                                            : "rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <InterSemiBold style={{ color: "#fff", fontSize: 17 }}>
                                        {label}
                                    </InterSemiBold>
                                    <InterRegular
                                        style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}
                                    >
                                        {blurb}
                                    </InterRegular>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Pressable
                        onPress={() => setRemember((value) => !value)}
                        disabled={submitting}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: remember, disabled: submitting }}
                        accessibilityLabel="Remember on this device"
                        style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}
                    >
                        <View
                            style={{
                                width: 20,
                                height: 20,
                                borderRadius: 5,
                                borderWidth: 2,
                                borderColor: remember ? BRAND : "rgba(255,255,255,0.45)",
                                backgroundColor: remember ? BRAND : "transparent",
                                alignItems: "center",
                                justifyContent: "center",
                                marginRight: 10,
                            }}
                        >
                            {remember ? (
                                <InterBold style={{ color: "#fff", fontSize: 12, lineHeight: 14 }}>✓</InterBold>
                            ) : null}
                        </View>
                        <InterRegular style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                            Remember on this device
                        </InterRegular>
                    </Pressable>

                    {error ? (
                        <InterRegular style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 12 }}>
                            {error}
                        </InterRegular>
                    ) : null}

                    <Pressable
                        onPress={() => selected && onConfirm(selected, remember)}
                        // Disabled until a choice exists: defaulting the button
                        // to buyer would make "Continue" a decision the user
                        // never actually made.
                        disabled={!selected || submitting}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !selected || submitting }}
                        style={{
                            backgroundColor: selected ? BRAND : "rgba(255,255,255,0.18)",
                            borderRadius: 14,
                            paddingVertical: 16,
                            alignItems: "center",
                            opacity: submitting ? 0.7 : 1,
                        }}
                    >
                        <InterMedium style={{ color: "#fff", fontSize: 15 }}>
                            {submitting ? "Setting up…" : "Continue"}
                        </InterMedium>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

export default ProfileChooser;

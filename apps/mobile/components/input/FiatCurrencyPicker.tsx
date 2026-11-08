/**
 * FiatCurrencyPicker
 *
 * Used in property listing to let the seller pick which fiat currency
 * they are pricing their property in (NGN, USD, EUR, etc.)
 *
 * Different from CurrencySelector which is for DISPLAY preference.
 * This one is for DATA INPUT — "what currency is this price in?"
 *
 * Supports a `compact` mode for embedding inline with a text input.
 */

import React, { useState, useCallback } from "react";
import {
    View,
    TouchableOpacity,
    Modal,
    FlatList,
    SafeAreaView,
    StyleSheet,
} from "react-native";
import AntDesign from "@expo/vector-icons/AntDesign";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import InterSemiBold from "@/components/Text/InterSemiBold";
import { SUPPORTED_FIATS, type FiatCurrencyInfo } from "@/services/priceOracle";

interface FiatCurrencyPickerProps {
    label?: string;
    value: string; // currency code e.g. "NGN"
    onValueChange: (code: string) => void;
    compact?: boolean; // if true, renders as an inline prefix button
}

const FiatCurrencyPicker: React.FC<FiatCurrencyPickerProps> = ({
    label,
    value,
    onValueChange,
    compact = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const selected = SUPPORTED_FIATS.find((f) => f.code === value) || SUPPORTED_FIATS[0];

    const handleSelect = useCallback(
        (fiat: FiatCurrencyInfo) => {
            onValueChange(fiat.code);
            setIsOpen(false);
        },
        [onValueChange]
    );

    const renderModal = () => (
        <Modal
            visible={isOpen}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setIsOpen(false)}
        >
            <SafeAreaView style={styles.modal}>
                <View style={styles.modalHeader}>
                    <InterSemiBold style={styles.title}>Select Price Currency</InterSemiBold>
                    <TouchableOpacity onPress={() => setIsOpen(false)}>
                        <AntDesign name="close" size={22} color="#333" />
                    </TouchableOpacity>
                </View>
                <InterRegular style={styles.subtitle}>
                    Choose the currency your property is priced in
                </InterRegular>
                <FlatList
                    data={SUPPORTED_FIATS}
                    keyExtractor={(item) => item.code}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.item, item.code === value && styles.itemActive]}
                            onPress={() => handleSelect(item)}
                        >
                            <InterRegular style={styles.itemFlag}>{item.flag}</InterRegular>
                            <View style={{ flex: 1 }}>
                                <InterMedium style={styles.itemCode}>
                                    {item.code} — {item.symbol}
                                </InterMedium>
                                <InterRegular style={styles.itemName}>{item.name}</InterRegular>
                            </View>
                            {item.code === value && (
                                <AntDesign name="check" size={16} color="#C1272D" />
                            )}
                        </TouchableOpacity>
                    )}
                />
            </SafeAreaView>
        </Modal>
    );

    // ── Compact mode: inline prefix button ──
    if (compact) {
        return (
            <>
                <TouchableOpacity
                    style={styles.compactTrigger}
                    onPress={() => setIsOpen(true)}
                    activeOpacity={0.7}
                >
                    <InterRegular style={{ fontSize: 16 }}>{selected.flag}</InterRegular>
                    <InterSemiBold style={{ fontSize: 14, color: "#333" }}>
                        {selected.code}
                    </InterSemiBold>
                    <AntDesign name="caret-down" size={8} color="#999" />
                </TouchableOpacity>
                {renderModal()}
            </>
        );
    }

    // ── Full-width mode ──
    return (
        <View style={styles.container}>
            {label && <InterMedium style={styles.label}>{label}</InterMedium>}
            <TouchableOpacity
                style={styles.trigger}
                onPress={() => setIsOpen(true)}
                activeOpacity={0.7}
            >
                <InterRegular style={styles.flag}>{selected.flag}</InterRegular>
                <InterMedium style={styles.code}>{selected.code}</InterMedium>
                <InterRegular style={styles.symbol}>({selected.symbol})</InterRegular>
                <View style={{ flex: 1 }} />
                <AntDesign name="down" size={14} color="#999" />
            </TouchableOpacity>
            {renderModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { width: "100%", marginBottom: 8 },
    label: { fontSize: 14, color: "#333", marginBottom: 4 },
    trigger: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#e0e0e0",
        borderRadius: 8,
        paddingHorizontal: 14,
        height: 48,
        gap: 8,
    },
    flag: { fontSize: 18 },
    code: { fontSize: 14, color: "#333" },
    symbol: { fontSize: 13, color: "#999" },

    // Compact inline trigger
    compactTrigger: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        height: 48,
        gap: 6,
        borderRightWidth: 1,
        borderRightColor: "#e0e0e0",
        backgroundColor: "#FAFAFA",
    },

    modal: { flex: 1, backgroundColor: "#fff" },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    title: { fontSize: 18, color: "#333" },
    subtitle: {
        fontSize: 13,
        color: "#999",
        paddingHorizontal: 20,
        paddingVertical: 10,
    },

    item: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5",
        gap: 12,
    },
    itemActive: { backgroundColor: "#FFF5F5" },
    itemFlag: { fontSize: 22 },
    itemCode: { fontSize: 15, color: "#333" },
    itemName: { fontSize: 12, color: "#999" },
});

export default FiatCurrencyPicker;

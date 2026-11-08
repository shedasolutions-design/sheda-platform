/**
 * CurrencySelector
 *
 * A compact dropdown that lets users toggle their preferred display currency.
 * Shows the country flag + currency code. Opens a modal with all supported fiats.
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
import { useCurrency } from "@/contexts/CurrencyContext";
import type { FiatCurrencyInfo } from "@/services/priceOracle";

interface CurrencySelectorProps {
    /** Compact mode shows just flag + code; full shows in a larger row */
    compact?: boolean;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({ compact = true }) => {
    const { selectedCurrency, setSelectedCurrency, currencyInfo, supportedFiats } =
        useCurrency();

    const [isOpen, setIsOpen] = useState(false);

    const handleSelect = useCallback(
        (fiat: FiatCurrencyInfo) => {
            setSelectedCurrency(fiat.code);
            setIsOpen(false);
        },
        [setSelectedCurrency]
    );

    return (
        <>
            <TouchableOpacity
                style={[styles.trigger, compact && styles.triggerCompact]}
                onPress={() => setIsOpen(true)}
                activeOpacity={0.7}
            >
                <InterRegular style={styles.flag}>{currencyInfo.flag}</InterRegular>
                <InterMedium style={styles.triggerText}>{selectedCurrency}</InterMedium>
                <AntDesign name="caret-down" size={10} color="#666" />
            </TouchableOpacity>

            <Modal
                visible={isOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setIsOpen(false)}
            >
                <SafeAreaView style={styles.modal}>
                    <View style={styles.modalHeader}>
                        <InterSemiBold style={styles.modalTitle}>Display Currency</InterSemiBold>
                        <TouchableOpacity onPress={() => setIsOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <AntDesign name="close" size={22} color="#333" />
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={supportedFiats}
                        keyExtractor={(item) => item.code}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[
                                    styles.item,
                                    item.code === selectedCurrency && styles.itemActive,
                                ]}
                                onPress={() => handleSelect(item)}
                            >
                                <InterRegular style={styles.itemFlag}>{item.flag}</InterRegular>
                                <View style={{ flex: 1 }}>
                                    <InterMedium style={styles.itemCode}>{item.code}</InterMedium>
                                    <InterRegular style={styles.itemName}>{item.name}</InterRegular>
                                </View>
                                <InterRegular style={styles.itemSymbol}>{item.symbol}</InterRegular>
                                {item.code === selectedCurrency && (
                                    <AntDesign name="check" size={16} color="#C1272D" style={{ marginLeft: 8 }} />
                                )}
                            </TouchableOpacity>
                        )}
                    />
                </SafeAreaView>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    trigger: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: "#f5f5f5",
        gap: 5,
    },
    triggerCompact: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    flag: { fontSize: 16 },
    triggerText: { fontSize: 13, color: "#333" },

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
    modalTitle: { fontSize: 18, color: "#333" },

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
    itemSymbol: { fontSize: 14, color: "#666" },
});

export default CurrencySelector;

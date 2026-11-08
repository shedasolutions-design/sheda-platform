import React, { useState, useMemo, useCallback } from "react";
import {
    View,
    TextInput,
    TouchableOpacity,
    FlatList,
    Modal,
    StyleSheet,
    SafeAreaView,
    Keyboard,
} from "react-native";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";
import InterSemiBold from "@/components/Text/InterSemiBold";
import AntDesign from "@expo/vector-icons/AntDesign";

interface LocationPickerProps {
    label?: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
}

/**
 * Worldwide cities organized by region / country.
 * The value sent to the backend is the label itself (human-readable).
 */
const WORLD_LOCATIONS: string[] = [
    // ── Nigeria (popular first) ──
    "Lekki, Lagos, Nigeria",
    "Victoria Island, Lagos, Nigeria",
    "Ikoyi, Lagos, Nigeria",
    "Ikeja, Lagos, Nigeria",
    "Ajah, Lagos, Nigeria",
    "Yaba, Lagos, Nigeria",
    "Surulere, Lagos, Nigeria",
    "Gbagada, Lagos, Nigeria",
    "Ikorodu, Lagos, Nigeria",
    "Banana Island, Lagos, Nigeria",
    "Festac, Lagos, Nigeria",
    "Magodo, Lagos, Nigeria",
    "Abuja, Nigeria",
    "Asokoro, Abuja, Nigeria",
    "Maitama, Abuja, Nigeria",
    "Wuse, Abuja, Nigeria",
    "Gwarinpa, Abuja, Nigeria",
    "Kubwa, Abuja, Nigeria",
    "Lugbe, Abuja, Nigeria",
    "Port Harcourt, Nigeria",
    "Ibadan, Nigeria",
    "Enugu, Nigeria",
    "Kano, Nigeria",
    "Kaduna, Nigeria",
    "Benin City, Nigeria",
    "Calabar, Nigeria",
    "Uyo, Nigeria",
    "Owerri, Nigeria",
    "Warri, Nigeria",
    "Abeokuta, Nigeria",

    // ── Ghana ──
    "Accra, Ghana",
    "Kumasi, Ghana",
    "Tamale, Ghana",
    "East Legon, Accra, Ghana",

    // ── Kenya ──
    "Nairobi, Kenya",
    "Mombasa, Kenya",
    "Kisumu, Kenya",
    "Westlands, Nairobi, Kenya",

    // ── South Africa ──
    "Johannesburg, South Africa",
    "Cape Town, South Africa",
    "Durban, South Africa",
    "Pretoria, South Africa",
    "Sandton, Johannesburg, South Africa",

    // ── Egypt ──
    "Cairo, Egypt",
    "Alexandria, Egypt",
    "Giza, Egypt",

    // ── Rwanda ──
    "Kigali, Rwanda",

    // ── Tanzania ──
    "Dar es Salaam, Tanzania",

    // ── Morocco ──
    "Casablanca, Morocco",
    "Marrakech, Morocco",

    // ── United States ──
    "New York, NY, USA",
    "Los Angeles, CA, USA",
    "Chicago, IL, USA",
    "Houston, TX, USA",
    "Miami, FL, USA",
    "San Francisco, CA, USA",
    "Seattle, WA, USA",
    "Atlanta, GA, USA",
    "Dallas, TX, USA",
    "Boston, MA, USA",
    "Washington, DC, USA",
    "Denver, CO, USA",
    "Las Vegas, NV, USA",
    "Phoenix, AZ, USA",
    "San Diego, CA, USA",
    "Austin, TX, USA",

    // ── United Kingdom ──
    "London, UK",
    "Manchester, UK",
    "Birmingham, UK",
    "Edinburgh, UK",
    "Glasgow, UK",
    "Liverpool, UK",
    "Bristol, UK",
    "Leeds, UK",

    // ── Canada ──
    "Toronto, Canada",
    "Vancouver, Canada",
    "Montreal, Canada",
    "Calgary, Canada",
    "Ottawa, Canada",

    // ── UAE ──
    "Dubai, UAE",
    "Abu Dhabi, UAE",
    "Sharjah, UAE",

    // ── India ──
    "Mumbai, India",
    "Delhi, India",
    "Bangalore, India",
    "Hyderabad, India",
    "Chennai, India",
    "Pune, India",
    "Gurgaon, India",

    // ── China ──
    "Shanghai, China",
    "Beijing, China",
    "Shenzhen, China",
    "Guangzhou, China",

    // ── Singapore ──
    "Singapore",

    // ── Japan ──
    "Tokyo, Japan",
    "Osaka, Japan",

    // ── South Korea ──
    "Seoul, South Korea",
    "Busan, South Korea",

    // ── Australia ──
    "Sydney, Australia",
    "Melbourne, Australia",
    "Brisbane, Australia",
    "Perth, Australia",

    // ── Germany ──
    "Berlin, Germany",
    "Munich, Germany",
    "Frankfurt, Germany",
    "Hamburg, Germany",

    // ── France ──
    "Paris, France",
    "Lyon, France",
    "Marseille, France",
    "Nice, France",

    // ── Spain ──
    "Madrid, Spain",
    "Barcelona, Spain",
    "Valencia, Spain",

    // ── Italy ──
    "Rome, Italy",
    "Milan, Italy",
    "Florence, Italy",

    // ── Netherlands ──
    "Amsterdam, Netherlands",
    "Rotterdam, Netherlands",

    // ── Portugal ──
    "Lisbon, Portugal",
    "Porto, Portugal",

    // ── Turkey ──
    "Istanbul, Turkey",
    "Ankara, Turkey",

    // ── Brazil ──
    "São Paulo, Brazil",
    "Rio de Janeiro, Brazil",

    // ── Mexico ──
    "Mexico City, Mexico",
    "Cancún, Mexico",

    // ── Caribbean ──
    "Kingston, Jamaica",
    "Nassau, Bahamas",
    "Port of Spain, Trinidad & Tobago",
];

const LocationPicker: React.FC<LocationPickerProps> = ({
    label,
    value,
    onValueChange,
    placeholder = "Search or type a location",
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchText, setSearchText] = useState("");

    const filteredLocations = useMemo(() => {
        if (!searchText.trim()) return WORLD_LOCATIONS.slice(0, 30); // Show top 30
        const q = searchText.toLowerCase();
        return WORLD_LOCATIONS.filter((loc) => loc.toLowerCase().includes(q));
    }, [searchText]);

    const handleSelect = useCallback(
        (loc: string) => {
            onValueChange(loc);
            setIsOpen(false);
            setSearchText("");
        },
        [onValueChange]
    );

    const handleUseCustom = useCallback(() => {
        if (searchText.trim()) {
            onValueChange(searchText.trim());
            setIsOpen(false);
            setSearchText("");
        }
    }, [searchText, onValueChange]);

    const displayValue = value || "";

    return (
        <View style={styles.container}>
            {label && (
                <InterMedium style={styles.label}>{label}</InterMedium>
            )}

            <TouchableOpacity
                style={styles.inputBox}
                onPress={() => setIsOpen(true)}
                activeOpacity={0.7}
            >
                <InterRegular
                    style={[styles.inputText, !displayValue && styles.placeholderText]}
                    numberOfLines={1}
                >
                    {displayValue || placeholder}
                </InterRegular>
                <AntDesign name="search" size={18} color="#999" />
            </TouchableOpacity>

            <Modal
                visible={isOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => { setIsOpen(false); setSearchText(""); }}
            >
                <SafeAreaView style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <InterSemiBold style={styles.modalTitle}>
                            Select Location
                        </InterSemiBold>
                        <TouchableOpacity
                            onPress={() => { setIsOpen(false); setSearchText(""); }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <AntDesign name="close" size={22} color="#333" />
                        </TouchableOpacity>
                    </View>

                    {/* Search bar */}
                    <View style={styles.searchBar}>
                        <AntDesign
                            name="search"
                            size={18}
                            color="#999"
                            style={{ marginRight: 8 }}
                        />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search city, country..."
                            placeholderTextColor="#999"
                            value={searchText}
                            onChangeText={setSearchText}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={() => {
                                Keyboard.dismiss();
                                if (filteredLocations.length > 0) {
                                    handleSelect(filteredLocations[0]);
                                } else if (searchText.trim()) {
                                    handleUseCustom();
                                }
                            }}
                        />
                        {searchText.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchText("")}>
                                <AntDesign name="close-circle" size={16} color="#ccc" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Custom location button */}
                    {searchText.trim().length > 0 &&
                        filteredLocations.length === 0 && (
                            <TouchableOpacity
                                style={styles.customBtn}
                                onPress={handleUseCustom}
                            >
                                <AntDesign name="plus" size={16} color="#C1272D" />
                                <InterMedium style={styles.customBtnText}>
                                    Use "{searchText.trim()}" as location
                                </InterMedium>
                            </TouchableOpacity>
                        )}

                    {searchText.trim().length > 0 &&
                        filteredLocations.length > 0 && (
                            <TouchableOpacity
                                style={styles.customBtn}
                                onPress={handleUseCustom}
                            >
                                <AntDesign name="edit" size={14} color="#C1272D" />
                                <InterRegular style={styles.customBtnText}>
                                    Use custom: "{searchText.trim()}"
                                </InterRegular>
                            </TouchableOpacity>
                        )}

                    {/* Results */}
                    <FlatList
                        data={filteredLocations}
                        keyExtractor={(item) => item}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[
                                    styles.resultItem,
                                    item === value && styles.resultItemActive,
                                ]}
                                onPress={() => handleSelect(item)}
                            >
                                <AntDesign
                                    name="environment"
                                    size={16}
                                    color={item === value ? "#C1272D" : "#666"}
                                    style={{ marginRight: 10 }}
                                />
                                <InterRegular
                                    style={[
                                        styles.resultText,
                                        item === value && styles.resultTextActive,
                                    ]}
                                >
                                    {item}
                                </InterRegular>
                                {item === value && (
                                    <AntDesign name="check" size={16} color="#C1272D" />
                                )}
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            searchText.trim().length > 0 ? (
                                <View style={styles.emptyContainer}>
                                    <InterRegular style={styles.emptyText}>
                                        No matching locations found.{"\n"}
                                        Use the button above to add your own.
                                    </InterRegular>
                                </View>
                            ) : null
                        }
                    />
                </SafeAreaView>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { width: "100%", marginBottom: 8 },
    label: { fontSize: 14, marginBottom: 4, color: "#333" },
    inputBox: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: "#e0e0e0",
        borderRadius: 8,
        paddingHorizontal: 14,
        height: 48,
    },
    inputText: { fontSize: 14, color: "#333", flex: 1 },
    placeholderText: { color: "#999" },

    modalContainer: { flex: 1, backgroundColor: "#fff" },
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

    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 16,
        marginVertical: 12,
        paddingHorizontal: 12,
        height: 44,
        borderWidth: 1,
        borderColor: "#e0e0e0",
        borderRadius: 10,
        backgroundColor: "#fafafa",
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: "Inter-Regular",
        color: "#333",
        paddingVertical: 0,
    },

    customBtn: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 16,
        marginBottom: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: "#FFF5F5",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#FECDD3",
    },
    customBtnText: { fontSize: 13, color: "#C1272D", marginLeft: 8 },

    resultItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5",
    },
    resultItemActive: { backgroundColor: "#FFF5F5" },
    resultText: { fontSize: 14, color: "#333", flex: 1 },
    resultTextActive: { color: "#C1272D", fontWeight: "600" },

    emptyContainer: { padding: 40, alignItems: "center" },
    emptyText: { textAlign: "center", color: "#999", lineHeight: 20 },
});

export default LocationPicker;

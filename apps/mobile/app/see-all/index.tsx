import React, { useCallback } from "react";
import {
    View,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { useApi } from "@/contexts/ApiContext";
import { categories } from "@/constants/categories-mock";
import InterBold from "@/components/Text/InterBold";
import InterRegular from "@/components/Text/InterRegular";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterMedium from "@/components/Text/InterMedium";
import BackBtn from "@/components/common/BackBtn";
import { MaterialIcons } from "@expo/vector-icons";

const CategoriesScreen = () => {
    const { setSelectedCategory } = useApi();

    const handleCategoryPress = useCallback(
        (categoryName: string) => {
            setSelectedCategory(categoryName);
            router.back();
        },
        [setSelectedCategory]
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, flex: 1 }}>
                {/* Header */}
                <View style={styles.header}>
                    <BackBtn />
                    <InterSemiBold style={{ fontSize: 18 }}>
                        Browse Categories
                    </InterSemiBold>
                    <View style={{ width: 40 }} />
                </View>

                <InterRegular style={styles.subtitle}>
                    Tap a category to find properties that match
                </InterRegular>

                {/* Categories Grid */}
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 40 }}
                >
                    <View style={styles.grid}>
                        {categories.map((category) => (
                            <TouchableOpacity
                                key={category.id}
                                style={styles.card}
                                onPress={() => handleCategoryPress(category.name)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.iconContainer}>
                                    <MaterialIcons
                                        name={category.icon as any}
                                        size={28}
                                        color="#C1272D"
                                    />
                                </View>
                                <InterMedium style={styles.cardTitle} numberOfLines={2}>
                                    {category.name}
                                </InterMedium>
                                <InterRegular style={styles.cardDesc} numberOfLines={2}>
                                    {category.description}
                                </InterRegular>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 13,
        color: "#6B7280",
        marginBottom: 20,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
    },
    card: {
        width: "47%",
        backgroundColor: "#FAFAFA",
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: "#F0F0F0",
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: "#C1272D0D",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    cardTitle: {
        fontSize: 14,
        color: "#1F2937",
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: 11,
        color: "#9CA3AF",
        lineHeight: 15,
    },
});

export default CategoriesScreen;

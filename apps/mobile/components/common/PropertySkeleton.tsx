import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions, Animated } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 40;

/** Animated shimmer block — pure RN, no native deps */
const SkeletonBlock: React.FC<{ style?: any }> = ({ style }) => {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [opacity]);

    return <Animated.View style={[{ backgroundColor: "#E1E9EE", borderRadius: 4 }, style, { opacity }]} />;
};

export const PropertySkeleton: React.FC = () => (
    <View style={styles.card}>
        <SkeletonBlock style={styles.image} />
        <SkeletonBlock style={styles.title} />
        <SkeletonBlock style={styles.location} />
        <View style={styles.row}>
            <SkeletonBlock style={styles.price} />
            <SkeletonBlock style={styles.badge} />
            <SkeletonBlock style={styles.badge} />
        </View>
    </View>
);

export const PropertySkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => (
    <View>
        {Array.from({ length: count }).map((_, i) => (
            <View key={i} style={{ marginBottom: 16 }}>
                <PropertySkeleton />
            </View>
        ))}
    </View>
);

const styles = StyleSheet.create({
    card: { width: CARD_WIDTH, marginBottom: 16, padding: 12 },
    image: { width: "100%", height: 160, borderRadius: 12 },
    title: { width: "70%", height: 18, marginTop: 12 },
    location: { width: "50%", height: 14, marginTop: 8 },
    row: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
    price: { width: 80, height: 16 },
    badge: { width: 50, height: 24, borderRadius: 8 },
});

export default PropertySkeleton;

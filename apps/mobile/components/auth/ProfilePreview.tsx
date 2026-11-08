import { View } from "react-native";

/**
 * A mock of the screen each profile lands on — Home for buyers, Activities for
 * sellers — drawn behind the chooser so the choice is made against a picture
 * of where it goes rather than against a word.
 *
 * Shapes, not a screenshot, and not the real screens:
 *
 *   - A captured screenshot would bake real listings, real prices and a real
 *     seller's revenue figures into the bundle, shipped to every user forever.
 *   - It would go stale the first time either screen changes, and nothing
 *     would fail to tell us.
 *   - Rendering the *actual* Home and Activities components here would mean
 *     two full screen renders — with their data fetches — before the user has
 *     even chosen. This screen sits directly on the sign-in path.
 *
 * Plain Views cost nothing to composite: no image decode, no blur (blur is
 * among the most expensive things to composite on web), no network. The
 * layouts below deliberately mirror the real ones closely enough to be
 * recognisable — search bar over a property grid vs. a revenue donut over
 * stat rows — which is the entire job.
 *
 * Decorative only: no text anywhere, so a screen reader has no fake content
 * to announce, and the whole subtree is hidden from accessibility regardless.
 */

const SURFACE = "#FFFFFF";
const PAGE = "#F2F2F3";
const LINE = "#E3E3E6";
const MUTED = "#D8D8DC";
const BRAND = "#C1272D";
const TEAL = "#00BCD4";
const AMBER = "#FFC107";

/** A neutral filled block — stands in for text, images and controls alike. */
const Block = ({
    w,
    h,
    r = 6,
    color = MUTED,
    style,
}: {
    w: number | `${number}%`;
    h: number;
    r?: number;
    color?: string;
    style?: object;
}) => (
    <View
        style={[{ width: w, height: h, borderRadius: r, backgroundColor: color }, style]}
    />
);

const Card = ({ children, style }: { children?: React.ReactNode; style?: object }) => (
    <View
        style={[
            {
                backgroundColor: SURFACE,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: LINE,
                padding: 12,
            },
            style,
        ]}
    >
        {children}
    </View>
);

/** Home: search, filter chips, a grid of property cards. */
const BuyerPreview = () => (
    <View style={{ flex: 1, backgroundColor: PAGE, paddingHorizontal: 16, paddingTop: 56 }}>
        {/* Search bar */}
        <View
            style={{
                height: 42,
                borderRadius: 21,
                backgroundColor: SURFACE,
                borderWidth: 1,
                borderColor: LINE,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                gap: 10,
            }}
        >
            <Block w={16} h={16} r={8} />
            <Block w="55%" h={9} />
        </View>

        {/* Filter chips */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Block w={68} h={28} r={14} color={BRAND} />
            <Block w={58} h={28} r={14} color={SURFACE} />
            <Block w={72} h={28} r={14} color={SURFACE} />
            <Block w={50} h={28} r={14} color={SURFACE} />
        </View>

        {/* Property cards */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 18 }}>
            {[0, 1].map((i) => (
                <Card key={i} style={{ flex: 1, padding: 0, overflow: "hidden" }}>
                    <Block w="100%" h={92} r={0} color="#C9CBD1" />
                    <View style={{ padding: 10, gap: 7 }}>
                        <Block w="80%" h={9} />
                        <Block w="55%" h={7} />
                        <Block w="45%" h={10} color={BRAND} />
                    </View>
                </Card>
            ))}
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            {[0, 1].map((i) => (
                <Card key={i} style={{ flex: 1, padding: 0, overflow: "hidden" }}>
                    <Block w="100%" h={92} r={0} color="#C9CBD1" />
                    <View style={{ padding: 10, gap: 7 }}>
                        <Block w="70%" h={9} />
                        <Block w="50%" h={7} />
                        <Block w="45%" h={10} color={BRAND} />
                    </View>
                </Card>
            ))}
        </View>
    </View>
);

/** One legend row: colour dot, label, value. */
const LegendRow = ({ color, labelWidth }: { color: string; labelWidth: `${number}%` }) => (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
        <Block w={12} h={12} r={3} color={color} />
        <View style={{ marginLeft: 10, flex: 1 }}>
            <Block w={labelWidth} h={8} />
        </View>
        <Block w={44} h={9} color="#B9BBC1" />
    </View>
);

/** Activities: revenue donut, properties breakdown, transaction tabs. */
const SellerPreview = () => (
    <View style={{ flex: 1, backgroundColor: PAGE, paddingHorizontal: 16, paddingTop: 56 }}>
        {/* Revenue */}
        <Card>
            <Block w={68} h={9} />
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
                <View
                    style={{
                        width: 74,
                        height: 74,
                        borderRadius: 37,
                        borderWidth: 11,
                        borderColor: AMBER,
                        marginRight: 16,
                    }}
                />
                <View style={{ flex: 1 }}>
                    <LegendRow color={BRAND} labelWidth="62%" />
                    <LegendRow color={TEAL} labelWidth="52%" />
                    <LegendRow color={AMBER} labelWidth="46%" />
                </View>
            </View>
        </Card>

        {/* Properties */}
        <Card style={{ marginTop: 12 }}>
            <Block w={72} h={9} />
            <LegendRow color={BRAND} labelWidth="50%" />
            <LegendRow color={TEAL} labelWidth="58%" />
        </Card>

        {/* Transaction history tabs */}
        <Card style={{ marginTop: 12 }}>
            <Block w={110} h={10} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Block w={66} h={30} r={8} color={BRAND} />
                <Block w={56} h={30} r={8} color="#FBEAEA" />
                <Block w={68} h={30} r={8} color="#FBEAEA" />
            </View>
        </Card>
    </View>
);

const ProfilePreview = ({ profile }: { profile: "buyer" | "seller" }) => (
    <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flex: 1 }}
    >
        {profile === "buyer" ? <BuyerPreview /> : <SellerPreview />}
    </View>
);

export default ProfilePreview;

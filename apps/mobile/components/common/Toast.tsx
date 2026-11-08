import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, XCircle } from "lucide-react-native";
import { useToast } from "@/contexts/ToastContext";
import InterMedium from "@/components/Text/InterMedium";
import InterRegular from "@/components/Text/InterRegular";

/**
 * Global, non-blocking status banner — mounted once at the app root
 * (app/_layout.tsx) so it survives navigation between screens instead of being
 * tied to whichever screen started the operation it reports on.
 *
 * ── Why it sits at the TOP ──
 * It used to be anchored to the bottom at `insets.bottom + 16`. That inset is
 * the system gesture bar, not the app's tab bar, so the banner landed directly
 * on top of Home / Saved / History / Inbox / Portfolio and covered the primary
 * navigation for the whole of a transaction — which for an on-chain write can
 * be half a minute. Moving it to the top clears the tab bar entirely and puts
 * it where transient status is conventionally looked for.
 *
 * ── Why it reports elapsed time ──
 * A blockchain write can legitimately take 30s+ on a slow connection. A static
 * "Cancelling deal…" for that long is indistinguishable from a frozen app, so
 * a running counter appears once the wait stops being brief. It says nothing
 * new about the work, but it does say the app is still alive, which is the
 * question the user actually has.
 */

/** When a wait stops being brief enough to leave unexplained. */
const SLOW_AFTER_MS = 6000;

const Toast: React.FC = () => {
  const { toast, dismissToast } = useToast();
  const insets = useSafeAreaInsets();

  const [elapsed, setElapsed] = useState(0);
  const slide = useRef(new Animated.Value(-120)).current;

  const isLoading = toast?.type === "loading";
  const toastId = toast?.id;

  // Restart the clock for each new operation, not on every render.
  useEffect(() => {
    if (!isLoading) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [toastId, isLoading]);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: toast ? 0 : -120,
      duration: 220,
      // Layout-independent, so it can run off the JS thread.
      useNativeDriver: true,
    }).start();
  }, [toast, slide]);

  if (!toast) return null;

  const showElapsed = isLoading && elapsed * 1000 >= SLOW_AFTER_MS;

  return (
    <Animated.View
      // box-none so only the banner itself takes touches; the screen behind
      // stays fully usable while a transaction runs.
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { top: insets.top + 8, transform: [{ translateY: slide }] },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        // Dismissible on purpose: a banner the user cannot get rid of is a
        // banner that can obstruct something. Loading stays put — dismissing
        // it would hide the only sign the work is still running.
        onPress={() => !isLoading && dismissToast(toast.id)}
        style={styles.banner}
        accessibilityRole={isLoading ? "progressbar" : "alert"}
        accessibilityLiveRegion="polite"
      >
        {isLoading && <ActivityIndicator size="small" color="#ffffff" />}
        {toast.type === "success" && <CheckCircle2 size={18} color="#4ADE80" />}
        {toast.type === "error" && <XCircle size={18} color="#F87171" />}

        <View style={styles.textColumn}>
          <InterMedium style={styles.message} numberOfLines={2}>
            {toast.message}
          </InterMedium>
          {showElapsed && (
            <InterRegular style={styles.subtext}>
              Still working — {elapsed}s. Blockchain confirmations can take a
              moment.
            </InterRegular>
          )}
          {!isLoading && (
            <InterRegular style={styles.subtext}>Tap to dismiss</InterRegular>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    // Above screen content, below nothing that matters. Modals render in their
    // own layer and are unaffected.
    zIndex: 1000,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 480,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    // Web has no elevation; without this the banner blends into the page.
    ...Platform.select({
      web: { boxShadow: "0 4px 16px rgba(0,0,0,0.22)" } as any,
      default: {},
    }),
  },
  textColumn: {
    flex: 1,
  },
  message: {
    color: "#ffffff",
    fontSize: 13,
  },
  subtext: {
    color: "#9CA3AF",
    fontSize: 11,
    marginTop: 2,
  },
});

export default Toast;

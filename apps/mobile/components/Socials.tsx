import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from './common/Icon';
import { GOOGLEICON } from '@/assets/icons';

interface SocialsProps {
  onGooglePress?: () => void;
  /** Shown under the button while a sign-in is in flight. */
  statusText?: string;
  /**
   * True only while a sign-in is genuinely in flight.
   *
   * Do NOT pass "the auth request hasn't finished building yet" here. Callers
   * used to pass `isGoogleLoading || !isGoogleReady`, which put a spinner on
   * the button before the user had touched anything and disabled it at the
   * same time — so it looked busy, swallowed the tap, and explained nothing.
   * Readiness is handled inside useGoogleAuth's signInWithGoogle(), which
   * waits for the request rather than dropping the press.
   */
  isGoogleLoading?: boolean;
}

// Only Google is wired up — Facebook/Apple sign-in have no backend
// verification support yet (Sheda-Backend's SocialLoginRequest.provider only
// accepts "google" today) and were previously just decorative icons with no
// onPress at all.
export default function Socials({ onGooglePress, isGoogleLoading, statusText }: SocialsProps) {
  return (
    <View>
      <View style={styles.container}>
      <TouchableOpacity
        onPress={onGooglePress}
        disabled={!onGooglePress || !!isGoogleLoading}
        // Without this the press has no visual response at all on the first
        // tap, which on a slow start is indistinguishable from a dead button.
        activeOpacity={0.6}
        style={isGoogleLoading ? styles.busy : undefined}
        className="border border-borderColor py-4 px-11 rounded-lg"
        accessibilityLabel="Sign in with Google"
        accessibilityRole="button"
        accessibilityState={{ disabled: !onGooglePress, busy: !!isGoogleLoading }}
        // Small but real on mobile: the icon is a modest target, and a missed
        // tap near its edge reads as an unresponsive button.
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isGoogleLoading ? (
          <ActivityIndicator size="small" color="#C1272D" />
        ) : (
          <Icon icon={GOOGLEICON} />
        )}
      </TouchableOpacity>
      </View>

      {/*
        A spinner alone, held for the seconds a redirect to Google takes, is
        indistinguishable from a stuck button — which is exactly what led
        people to press again. Saying what is happening turns the same wait
        into visible progress.
      */}
      {isGoogleLoading && !!statusText && (
        <Text style={styles.status}>{statusText}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  busy: {
    opacity: 0.7,
  },
  status: {
    marginTop: 10,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});

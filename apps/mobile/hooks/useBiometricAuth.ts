import { useState, useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

interface BiometricAuthResult {
    success: boolean;
    error?: string;
}

export type AuthMethod = "biometric" | "device_passcode" | "none";

/**
 * Hook for device authentication (biometrics / device PIN / passcode).
 * Supports Face ID, Touch ID, fingerprint, AND device passcode/PIN as a fallback.
 * Use to guard sensitive operations like wallet access.
 *
 * - If biometrics are enrolled → prompts Face ID / fingerprint with PIN fallback.
 * - If biometrics are NOT enrolled but device has a PIN/passcode → prompts device passcode.
 * - If device has no security → allows access with a warning (dev/emulator only).
 *
 * Example:
 * ```tsx
 * const { authenticate, isAvailable, isAuthenticating, authMethod } = useBiometricAuth();
 * const proceed = await authenticate();
 * if (proceed.success) { ... }
 * ```
 */
export function useBiometricAuth() {
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authMethod, setAuthMethod] = useState<AuthMethod>("none");

    /**
     * Check if ANY device authentication is available
     * (biometrics OR device passcode/PIN).
     */
    const isAvailable = useCallback(async (): Promise<boolean> => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            // Biometrics available and enrolled
            if (hasHardware && isEnrolled) {
                setAuthMethod("biometric");
                return true;
            }

            // No biometrics, but device might still have a PIN/passcode.
            // expo-local-authentication with disableDeviceFallback=false
            // will still prompt the device passcode even without biometrics.
            // On Android, SecurityLevel check tells us if any device security exists.
            const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
            if (securityLevel !== LocalAuthentication.SecurityLevel.NONE) {
                setAuthMethod("device_passcode");
                return true;
            }

            setAuthMethod("none");
            return false;
        } catch {
            setAuthMethod("none");
            return false;
        }
    }, []);

    const getSupportedTypes = useCallback(async () => {
        try {
            return await LocalAuthentication.supportedAuthenticationTypesAsync();
        } catch {
            return [];
        }
    }, []);

    /**
     * Authenticate the user. Will try biometrics first, falls back to
     * device PIN/passcode if biometrics are unavailable.
     * Only passes through without auth if the device has NO security at all.
     */
    const authenticate = useCallback(
        async (
            promptMessage = "Authenticate to access your wallet"
        ): Promise<BiometricAuthResult> => {
            try {
                setIsAuthenticating(true);

                const available = await isAvailable();

                if (!available) {
                    // Device has no security at all (no biometrics, no PIN).
                    // This typically only happens on emulators or very old devices.
                    // Allow access with a one-time warning.
                    if (Platform.OS !== "web") {
                        console.warn(
                            "useBiometricAuth: No device security detected. " +
                            "Consider setting up a PIN or biometric lock on your device."
                        );
                    }
                    return { success: true };
                }

                // Attempt authentication — biometrics with device passcode fallback
                const result = await LocalAuthentication.authenticateAsync({
                    promptMessage,
                    fallbackLabel: "Use PIN",
                    // CRITICAL: disableDeviceFallback must be false so the OS
                    // offers the device PIN/passcode when biometrics fail or
                    // are unavailable.
                    disableDeviceFallback: false,
                    cancelLabel: "Cancel",
                });

                if (result.success) {
                    return { success: true };
                }

                return {
                    success: false,
                    error: result.error || "Authentication failed",
                };
            } catch (err: any) {
                return {
                    success: false,
                    error: err.message || "Authentication error",
                };
            } finally {
                setIsAuthenticating(false);
            }
        },
        [isAvailable]
    );

    return {
        authenticate,
        isAvailable,
        getSupportedTypes,
        isAuthenticating,
        /** Current auth method: "biometric" | "device_passcode" | "none" */
        authMethod,
    };
}

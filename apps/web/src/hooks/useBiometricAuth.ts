import { useCallback, useState } from "react";

interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export type AuthMethod = "biometric" | "device_passcode" | "none";

/**
 * Device authentication before sensitive wallet actions.
 *
 * On a phone this prompted Face ID, a fingerprint or the device passcode. A
 * browser has no general equivalent that can gate local data (WebAuthn proves
 * who you are to a server; it does not unlock anything on this device), so
 * the web app behaves as the mobile app did on a device with no lock set: it
 * lets the action through. The wallet secret itself stays encrypted at rest
 * in IndexedDB under a non-extractable key (services/webSecretStore.ts).
 *
 * Kept with the same shape so screens carried over from mobile need no change.
 */
export function useBiometricAuth() {
  const [isAuthenticating] = useState(false);
  const authMethod: AuthMethod = "none";

  const isAvailable = useCallback(async () => false, []);
  const getSupportedTypes = useCallback(async () => [] as number[], []);
  const authenticate = useCallback(
    async (_promptMessage?: string): Promise<BiometricAuthResult> => ({ success: true }),
    []
  );

  return { authenticate, isAvailable, getSupportedTypes, isAuthenticating, authMethod };
}

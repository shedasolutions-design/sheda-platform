// ============================================================================
// The phone keychain does not exist on the web.
// ============================================================================
// services/secureStorage.ts was shared with the Expo app and still contains
// its keychain branches. On the web those branches are unreachable: the
// service always takes the encrypted IndexedDB path (services/webSecretStore).
// This module only lets that file compile unchanged. If anything ever reaches
// it, it fails loudly rather than pretending a secret was stored.
// ============================================================================

const unavailable = (): never => {
  throw new Error("The device keychain is not available in the web app.");
};

export type SetOptions = Record<string, unknown>;
export const ACCESS_CONTROL = { BIOMETRY_ANY_OR_DEVICE_PASSCODE: "" } as const;
export const ACCESSIBLE = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "" } as const;
export const SECURITY_LEVEL = { SECURE_HARDWARE: "" } as const;

export const setInternetCredentials = async (..._a: unknown[]): Promise<false> => unavailable();
export const getInternetCredentials = async (
  ..._a: unknown[]
): Promise<false | { username: string; password: string }> => unavailable();
export const resetInternetCredentials = async (..._a: unknown[]): Promise<void> => unavailable();
export const hasInternetCredentials = async (..._a: unknown[]): Promise<boolean> => unavailable();
export const getSupportedBiometryType = async (): Promise<string | null> => null;

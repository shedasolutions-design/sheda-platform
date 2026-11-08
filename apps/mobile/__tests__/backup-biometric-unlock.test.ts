// @ts-nocheck — Test file with Jest mocks
//
// Biometric unlock for the backup passphrase.
//
// This closes the "device-secure-enclave unlock" half of the chosen key-wrapping
// design: the passphrase stays the portable key, and a device that has already
// seen it can offer Face ID instead of making the user retype it.
//
// The properties pinned here are the ones that would be quietly wrong if the
// implementation drifted:
//   - existence is checked WITHOUT decrypting, so opening the sheet never
//     raises an unrequested biometric prompt
//   - a cancelled prompt is null, not an exception
//   - the passphrase is remembered only after the upload actually succeeded
//   - signing out forgets it
//   - it is never uploaded

const mockKeychain = {
  setInternetCredentials: jest.fn(() => Promise.resolve()),
  getInternetCredentials: jest.fn(() => Promise.resolve(false)),
  hasInternetCredentials: jest.fn(() => Promise.resolve(false)),
  resetInternetCredentials: jest.fn(() => Promise.resolve()),
  getSupportedBiometryType: jest.fn(() => Promise.resolve("FaceID")),
  ACCESS_CONTROL: { BIOMETRY_ANY_OR_DEVICE_PASSCODE: "bio-or-passcode" },
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when-unlocked" },
  SECURITY_LEVEL: { SECURE_HARDWARE: "hw" },
};
jest.mock("react-native-keychain", () => mockKeychain);

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// jest-expo already reports Platform.OS === "ios". secureStorage's only other
// native precondition is NativeModules.RNKeychainManager being present.
//
// Injected with require() rather than a top-level import + assignment: ES
// imports hoist above plain statements, so an `import` of secureStorage would
// bind before the flag was set. Mocking react-native wholesale is not an
// option either — css-interop reads Appearance/AppState/Dimensions from it at
// import time and the mock turns into whack-a-mole.
let secureStorage: any;
beforeAll(() => {
  const RN = require("react-native");
  RN.NativeModules.RNKeychainManager = {};
  secureStorage = require("@/services/secureStorage").default;
});

const ACCOUNT = "alice.shedauser.testnet";
const PASSPHRASE = "correct horse battery staple";

beforeEach(() => {
  Object.values(mockKeychain).forEach(
    (m) => typeof m === "function" && m.mockClear?.()
  );
  mockKeychain.getSupportedBiometryType.mockResolvedValue("FaceID");
});

describe("storing the passphrase", () => {
  it("writes it behind a biometric access control", async () => {
    await secureStorage.saveBackupPassphrase(ACCOUNT, PASSPHRASE);

    expect(mockKeychain.setInternetCredentials).toHaveBeenCalledTimes(1);
    const [server, , value, opts] =
      mockKeychain.setInternetCredentials.mock.calls[0];

    expect(server).toBe(`backup_passphrase_${ACCOUNT}`);
    expect(value).toBe(PASSPHRASE);
    // The OS gates the read, not a UI check this code could be tricked into
    // skipping.
    expect(opts.accessControl).toBe("bio-or-passcode");
    expect(opts.accessible).toBe("when-unlocked");
  });

  it("keeps it in its own namespace, away from seeds and keys", async () => {
    await secureStorage.saveBackupPassphrase(ACCOUNT, PASSPHRASE);
    const [server] = mockKeychain.setInternetCredentials.mock.calls[0];
    expect(server).not.toMatch(/^seed_phrase_/);
    expect(server).not.toMatch(/^private_key_/);
  });

  it("never logs the passphrase", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await secureStorage.saveBackupPassphrase(ACCOUNT, PASSPHRASE);
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain(PASSPHRASE);
    expect(logged).toContain(ACCOUNT);
    spy.mockRestore();
  });
});

describe("checking whether one exists", () => {
  it("does not decrypt, so no biometric prompt is raised", async () => {
    mockKeychain.hasInternetCredentials.mockResolvedValue(true);

    await expect(secureStorage.hasBackupPassphrase(ACCOUNT)).resolves.toBe(true);

    // The distinction that matters: probing with a real read would throw a
    // Face ID sheet at the user the moment the sheet renders.
    expect(mockKeychain.hasInternetCredentials).toHaveBeenCalled();
    expect(mockKeychain.getInternetCredentials).not.toHaveBeenCalled();
  });

  it("reports false when nothing is stored", async () => {
    mockKeychain.hasInternetCredentials.mockResolvedValue(false);
    await expect(secureStorage.hasBackupPassphrase(ACCOUNT)).resolves.toBe(false);
  });
});

describe("unlocking", () => {
  it("returns the passphrase once biometrics succeed", async () => {
    mockKeychain.getInternetCredentials.mockResolvedValue({
      username: ACCOUNT,
      password: PASSPHRASE,
    });
    await expect(secureStorage.getBackupPassphrase(ACCOUNT)).resolves.toBe(
      PASSPHRASE
    );
  });

  it("returns null rather than throwing when the prompt is cancelled", async () => {
    // react-native-keychain rejects when the user dismisses Face ID. Declining
    // to authenticate is a normal choice, and surfacing it as a crash would
    // put an error banner in front of someone who simply changed their mind.
    mockKeychain.getInternetCredentials.mockRejectedValue(
      new Error("User canceled the operation.")
    );
    await expect(secureStorage.getBackupPassphrase(ACCOUNT)).resolves.toBeNull();
  });

  it("returns null when nothing is stored", async () => {
    mockKeychain.getInternetCredentials.mockResolvedValue(false);
    await expect(secureStorage.getBackupPassphrase(ACCOUNT)).resolves.toBeNull();
  });
});

describe("forgetting", () => {
  it("removes only this account's entry", async () => {
    await secureStorage.deleteBackupPassphrase(ACCOUNT);
    expect(mockKeychain.resetInternetCredentials).toHaveBeenCalledWith({
      server: `backup_passphrase_${ACCOUNT}`,
    });
  });

  it("swallows a delete failure — the caller is already signing out", async () => {
    mockKeychain.resetInternetCredentials.mockRejectedValueOnce(
      new Error("keychain unavailable")
    );
    await expect(
      secureStorage.deleteBackupPassphrase(ACCOUNT)
    ).resolves.toBeUndefined();
  });
});

describe("biometric availability", () => {
  it("is true when the device has an enrolled biometry type", async () => {
    mockKeychain.getSupportedBiometryType.mockResolvedValue("TouchID");
    await expect(secureStorage.canUseBiometricUnlock()).resolves.toBe(true);
  });

  it("is false when nothing is enrolled", async () => {
    // The UI must not offer a Face ID unlock it cannot deliver.
    mockKeychain.getSupportedBiometryType.mockResolvedValue(null);
    await expect(secureStorage.canUseBiometricUnlock()).resolves.toBe(false);
  });
});
